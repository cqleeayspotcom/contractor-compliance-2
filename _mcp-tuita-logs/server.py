#!/usr/bin/env python3
"""
=============================================================================
SERVEUR MCP "tuita-logs" — donne à Claude un accès LECTURE aux logs de Tuita.
=============================================================================

A QUOI CA SERT
--------------
Pendant un test de l'app de bout en bout, Claude a besoin de voir ce qui se
passe côté serveur, des DEUX côtés :
  - BACKEND  : erreurs PHP, routes appelées, et surtout le code OTP envoyé par
               SMS (le backend le logge en clair hors production).
  - FRONTEND : erreurs de compilation / warnings du serveur de dev `ng serve`.
Sans ce serveur, il faut copier-coller ces logs à la main. Avec, Claude va les
chercher tout seul → par exemple récupérer l'OTP d'un SMS pour finir une
inscription sans intervention humaine.

NB : les logs DU NAVIGATEUR (console JS, réseau de la page web) ne passent PAS
par ici — c'est le rôle de "Claude in Chrome". Ce serveur lit les logs SERVEUR.

COMMENT CA MARCHE
-----------------
Le backend tourne en containers Docker dans WSL Ubuntu ; ce script tourne donc
dans WSL aussi, pour parler au démon Docker. Le frontend tourne via `ng serve`
sur Windows ; on redirige sa sortie dans un fichier que ce script lit ensuite.

  Claude (Windows) ⇄ stdio ⇄ wsl.exe ⇄ python server.py (Ubuntu)
                                              ├─ docker logs ...  (backend)
                                              └─ tail ng-serve.log (frontend)

OUTILS EXPOSES A CLAUDE
-----------------------
  BACKEND (containers Docker du monolithe Laminas) :
  - docker_ps                      : liste les containers en cours (id, name, image, status)
  - docker_logs(container, tail)   : N dernières lignes brutes d'un container
  - tail_file(path, tail)          : N dernières lignes d'un fichier (ex: /var/log/nginx/access.log)
  - find_otp(container, since)     : extrait le dernier code OTP / SMS Tuita des logs récents
                                     (regex sur "otp", "code", "verification" + 4-6 chiffres)
  - find_otp_by_phone(phone)       : variante filtrée par numéro de téléphone
  - exec_in_container(c, cmd)      : (optionnel) exec readonly dans un container ; whitelist
                                     stricte de commandes (cat, ls, head, tail, grep)
  - backend_errors(since)          : filtre rapide des erreurs récentes (ERROR /
                                     FATAL / Exception / Parse error) du webserver.

  CODES DE CONNEXION (le plus utile pour tester l'app) :
  - contractor_login_pin(phone)    : code SMS de connexion CONTRACTOR ("Espace
                                     Intervenant"). Lu EN BASE (table
                                     cft_contractor_oauth, colonne sms_password)
                                     car il n'apparaît PAS dans les logs.
  - admin_login_pin(email)         : code PIN de connexion ADMIN. Lu dans les LOGS
                                     du webserver ("ADMIN PINCODE: <code> for ...").
  - contractor_invitation_code()   : un code d'invitation valide pour tester le
                                     signup contractor (table cc_invitation_codes).

  BASE DE DONNÉES & EMAILS (inspecter l'état pendant un test) :
  - db_query(sql)                  : requête SQL EN LECTURE SEULE sur yplatformdb
                                     (SELECT/SHOW/DESCRIBE/EXPLAIN/WITH only).
                                     Ex. état d'un contractor, factures, KYC...
  - latest_email(to)               : dernier email reçu dans MailHog (liens de
                                     vérification, notifs) ; extrait liens + codes.

  FRONTEND (serveur de dev Angular `ng serve`) :
  - frontend_log(tail)             : N dernières lignes du log du serveur `ng serve`
                                     (compilation, erreurs TypeScript, HMR).
                                     Le fichier est défini par $TUITA_FRONTEND_LOG
                                     ou, par défaut, <repo-frontend>/ng-serve.log.
                                     Pour l'alimenter, lancer `ng serve` en
                                     redirigeant la sortie vers ce fichier, ex. :
                                       npm start 2>&1 | Tee-Object ng-serve.log

COMMENT L'INSTALLER / L'UTILISER
--------------------------------
1) Installer (une fois), dans un terminal Ubuntu :
       cd .../_mcp-tuita-logs && bash install.sh
   → copie ce fichier dans ~/mcp-tuita-logs/ et crée un venv avec le SDK MCP.

2) Tester que tout répond :
       ~/mcp-tuita-logs/.venv/bin/python ~/mcp-tuita-logs/server.py --self-test

3) Déclarer le serveur dans le client (Claude Desktop ou Claude Code), en
   pointant sur le python DU VENV (pas /usr/bin/python3 qui n'a pas le SDK) :
       "tuita-logs": {
         "command": "wsl.exe",
         "args": ["-d", "Ubuntu", "--exec",
                  "/home/msa/mcp-tuita-logs/.venv/bin/python",
                  "/home/msa/mcp-tuita-logs/server.py"]
       }

4) Redémarrer le client (un MCP n'est chargé qu'au démarrage) et ouvrir une
   NOUVELLE conversation. Détails complets : voir README.md du même dossier.

SECURITE
--------
  - Lecture seule : aucune écriture disque, aucune destruction de container.
  - exec_in_container refuse tout sauf cat/ls/head/tail/grep/find/awk/sed/wc.
  - `tail` est borné à 5000 lignes pour ne pas saturer le canal stdio.
  - Aucun port réseau ouvert : tout passe par stdio entre le client et WSL.
=============================================================================
"""

from __future__ import annotations

import argparse
import json
import os
import quopri
import re
import shlex
import subprocess
import sys
import urllib.request
from typing import Optional

try:
    from mcp.server.fastmcp import FastMCP
except ImportError:
    sys.stderr.write(
        "Le paquet 'mcp' n'est pas installé. Dans WSL :\n"
        "    pip install --user 'mcp[cli]'\n"
    )
    sys.exit(1)


MAX_TAIL = 5000
ALLOWED_EXEC = {"cat", "ls", "head", "tail", "grep", "find", "awk", "sed", "wc"}

# Containers du backend Tuita (cf. docker ps — noms avec underscore).
DEFAULT_NGINX     = "tuita_nginx"
DEFAULT_WEBSERVER = "c_platform_webserver"   # PHP-FPM du monolithe (logs applicatifs)

# Accès MySQL du backend (le code SMS contractor y est stocké en clair).
# Tout est surchargeable par variable d'environnement.
MYSQL_CONTAINER = os.environ.get("TUITA_MYSQL_CONTAINER", "c_platform_mysql")
MYSQL_USER      = os.environ.get("TUITA_MYSQL_USER", "root")
MYSQL_PASSWORD  = os.environ.get("TUITA_MYSQL_PASSWORD", "docker")
MYSQL_DB        = os.environ.get("TUITA_MYSQL_DB", "yplatformdb")

# API HTTP de MailHog (boîte mail de dev — emails de vérification, notifs...).
MAILHOG_API = os.environ.get("TUITA_MAILHOG_API", "http://localhost:8025")

# Log du serveur de dev Angular. Surchageable par variable d'environnement.
# Chemin vu depuis WSL : le repo Windows est monté sous /mnt/c/...
FRONTEND_LOG = os.environ.get(
    "TUITA_FRONTEND_LOG",
    "/mnt/c/Users/MSA/Desktop/code/frontend-tuita-contractor-compliance/ng-serve.log",
)

# Supprime les codes couleur ANSI des logs (ex. \x1b[33m ... \x1b[39m).
_ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")

# db_query n'autorise QUE ces verbes en tête de requête (lecture seule stricte).
SQL_READONLY_PREFIXES = ("select", "show", "describe", "desc", "explain", "with")

OTP_PATTERNS = [
    re.compile(r"(?:otp|code|verif(?:ication)?|sms|pin)[^\d]{0,12}(\d{4,8})", re.I),
    re.compile(r"\b(\d{6})\b\s*(?:est|is|=|→).{0,40}(?:otp|code|sms)", re.I),
    re.compile(r"smsCode[\"':=\s]+([\"']?)(\d{4,8})\1", re.I),
]


mcp = FastMCP("tuita-logs")


def _run(cmd: list[str], timeout: int = 15) -> tuple[int, str, str]:
    """Exécute une commande subprocess et renvoie (rc, stdout, stderr)."""
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        return proc.returncode, proc.stdout, proc.stderr
    except subprocess.TimeoutExpired:
        return 124, "", f"timeout after {timeout}s"
    except FileNotFoundError as exc:
        return 127, "", str(exc)


def _strip_ansi(text: str) -> str:
    """Retire les codes couleur ANSI d'une chaîne de log."""
    return _ANSI_RE.sub("", text)


def _mysql(sql: str, timeout: int = 15, table: bool = False) -> tuple[int, str, str]:
    """
    Exécute une requête SQL (lecture) sur la base Tuita via `docker exec`.
    Le SQL est passé en argument séparé (-e) : aucun shell n'est invoqué,
    donc pas d'injection possible via la commande elle-même.

    table=False : sortie brute tabulée sans en-tête (-N -B), pour le parsing.
    table=True  : tableau ASCII avec noms de colonnes (-t), pour l'affichage.
    """
    fmt = ["-t"] if table else ["-N", "-B"]
    cmd = [
        "docker", "exec", "-i", MYSQL_CONTAINER,
        "mysql", f"-u{MYSQL_USER}", f"-p{MYSQL_PASSWORD}",
        *fmt, MYSQL_DB, "-e", sql,
    ]
    return _run(cmd, timeout=timeout)


def _normalize_phone(phone: str) -> tuple[str, str]:
    """
    Renvoie (format_interne_tuita, format_brut) pour un numéro saisi.

    Tuita stocke les numéros en 'P33XXXXXXXXX'. Le frontend peut envoyer
    '+33600000099', '06 00 00 00 99', 'P33600000099'... On nettoie tout
    caractère non significatif et on déduit les deux écritures possibles.
    On ne garde que [0-9P+] : impossible d'injecter un guillemet dans le SQL.
    """
    raw = re.sub(r"[^0-9P+]", "", phone.strip())
    if raw.startswith("+"):
        internal = "P" + raw[1:]
    elif raw.startswith("00"):
        internal = "P" + raw[2:]
    elif raw.startswith("0") and not raw.startswith("0P"):
        internal = "P33" + raw[1:]          # 0600000099 -> P33600000099
    else:
        internal = raw
    return internal, raw


def _http_get_json(url: str, timeout: int = 10):
    """GET une URL et renvoie le JSON décodé (ou lève une exception)."""
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (URL interne)
        return json.loads(resp.read().decode("utf-8", "replace"))


def _decode_qp(body: str) -> str:
    """Décode un corps d'email quoted-printable si besoin (best-effort)."""
    if "=\n" in body or "=\r\n" in body or re.search(r"=[0-9A-Fa-f]{2}", body):
        try:
            return quopri.decodestring(
                body.encode("utf-8", "replace")
            ).decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            return body
    return body


@mcp.tool()
def docker_ps() -> str:
    """Liste les containers Docker en cours d'exécution (id court, nom, image, statut)."""
    rc, out, err = _run([
        "docker", "ps",
        "--format", "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}",
    ])
    if rc != 0:
        return f"[error rc={rc}] {err.strip()}"
    return out.strip() or "(aucun container actif)"


@mcp.tool()
def docker_logs(container: str, tail: int = 200, since: Optional[str] = None) -> str:
    """
    Renvoie les N dernières lignes de logs d'un container.

    Args:
        container : nom ou ID du container (ex. 'tuita-nginx', 'platform-backend-app-1')
        tail      : nombre de lignes (défaut 200, max 5000)
        since     : facultatif, ex. '5m', '1h', '2024-05-20T10:00:00'
    """
    tail = max(1, min(int(tail), MAX_TAIL))
    cmd = ["docker", "logs", "--tail", str(tail), container]
    if since:
        cmd.extend(["--since", since])
    rc, out, err = _run(cmd, timeout=20)
    if rc != 0:
        return f"[error rc={rc}] {err.strip()}"
    return (out + err).strip() or "(logs vides)"


@mcp.tool()
def tail_file(path: str, tail: int = 200) -> str:
    """
    Renvoie les N dernières lignes d'un fichier en lecture seule.
    Utile pour les logs nginx montés en volume.
    """
    tail = max(1, min(int(tail), MAX_TAIL))
    rc, out, err = _run(["tail", "-n", str(tail), path], timeout=10)
    if rc != 0:
        return f"[error rc={rc}] {err.strip()}"
    return out


def _scan_otp(text: str) -> list[tuple[str, str]]:
    """
    Retourne la liste des (code_otp, ligne_contexte) trouvés.
    Ordre chronologique (plus ancien d'abord), donc le dernier est le plus récent.
    """
    found: list[tuple[str, str]] = []
    for line in text.splitlines():
        for pat in OTP_PATTERNS:
            m = pat.search(line)
            if m:
                code = m.group(len(m.groups()))
                if code and code.isdigit() and 4 <= len(code) <= 8:
                    found.append((code, line.strip()))
                    break
    return found


@mcp.tool()
def frontend_log(tail: int = 200, errors_only: bool = False) -> str:
    """
    Renvoie les N dernières lignes du log du serveur de dev Angular (`ng serve`).

    Args:
        tail        : nombre de lignes (défaut 200, max 5000)
        errors_only : si True, ne garde que les lignes d'erreur / warning
                      (Error, ERROR, TS####, Failed, Warning).

    Le fichier lu est $TUITA_FRONTEND_LOG (défaut <repo-frontend>/ng-serve.log).
    Si le fichier n'existe pas, c'est que `ng serve` n'a pas été lancé avec
    redirection vers ce fichier — voir le README du MCP.
    """
    tail = max(1, min(int(tail), MAX_TAIL))
    if not os.path.exists(FRONTEND_LOG):
        return (
            f"(fichier introuvable : {FRONTEND_LOG})\n"
            "Lance le serveur de dev en redirigeant sa sortie, ex. en PowerShell :\n"
            "    ng serve 2>&1 | Tee-Object -FilePath ng-serve.log"
        )
    rc, out, err = _run(["tail", "-n", str(tail), FRONTEND_LOG], timeout=10)
    if rc != 0:
        return f"[error rc={rc}] {err.strip()}"
    if errors_only:
        keep = re.compile(r"\b(error|failed|warning|TS\d{3,5})\b", re.I)
        lines = [l for l in out.splitlines() if keep.search(l)]
        return "\n".join(lines) if lines else "(aucune erreur / warning détecté)"
    return out or "(log vide)"


@mcp.tool()
def contractor_login_pin(phone: str = "") -> str:
    """
    Renvoie le CODE SMS de connexion CONTRACTOR (page "Espace Intervenant").

    ⚠ Ce code n'est PAS dans les logs. Le backend Tuita le stocke EN CLAIR
    dans la base : table `cft_contractor_oauth`, colonne `sms_password`.
    Cet outil va donc le lire directement en base.

    Args:
        phone : numéro du contractor, tel qu'affiché ou saisi — ex.
                '+33600000099', '06 00 00 00 99', 'P33600000099'.
                Si vide : renvoie le code le plus récent, tous numéros
                confondus (pratique quand un seul test est en cours).
    """
    if phone.strip():
        internal, raw = _normalize_phone(phone)
        candidates = "', '".join(sorted({internal, raw, "P" + raw.lstrip("+")}))
        sql = (
            "SELECT sms_phone, sms_password, pincode_sent, updatedAt "
            f"FROM cft_contractor_oauth WHERE sms_phone IN ('{candidates}') "
            "ORDER BY updatedAt DESC LIMIT 1"
        )
    else:
        sql = (
            "SELECT sms_phone, sms_password, pincode_sent, updatedAt "
            "FROM cft_contractor_oauth "
            "WHERE sms_password IS NOT NULL AND sms_password <> '' "
            "ORDER BY updatedAt DESC LIMIT 1"
        )
    rc, out, err = _mysql(sql)
    if rc != 0:
        return f"[error rc={rc}] {err.strip()}"
    out = out.strip()
    if not out:
        return ("(aucune ligne — le code n'a peut-être pas encore été demandé ; "
                "clique sur « Renvoyer le code » côté app)")
    parts = out.split("\t")
    sms_phone = parts[0] if len(parts) > 0 else "?"
    pin       = parts[1] if len(parts) > 1 else ""
    sent      = parts[2] if len(parts) > 2 else "?"
    if not pin or pin.upper() == "NULL":
        return (f"(numéro {sms_phone} trouvé mais `sms_password` vide — "
                "le code n'a pas encore été généré, clique sur « Renvoyer le code »)")
    return f"CODE={pin}\nphone={sms_phone}\npincode_sent={sent}"


@mcp.tool()
def admin_login_pin(email: str = "", since: str = "1h") -> str:
    """
    Renvoie le CODE PIN de connexion ADMIN.

    Contrairement au contractor, le PIN admin EST écrit en clair dans les
    logs applicatifs par AdminAuthRequestPinController, sous la forme :
        ADMIN PINCODE: <code> for <email>

    Args:
        email : si fourni, ne garde que les PIN émis pour cet email.
        since : fenêtre de recherche dans les logs (défaut 1h).
    """
    rc, out, err = _run(
        ["docker", "logs", "--since", since, DEFAULT_WEBSERVER],
        timeout=20,
    )
    if rc != 0:
        return f"[error rc={rc}] {err.strip()}"
    pat = re.compile(r"ADMIN PINCODE:\s*(\d{4,8})\s+for\s+(\S+)", re.I)
    hits: list[tuple[str, str]] = []
    for line in _strip_ansi(out + err).splitlines():
        m = pat.search(line)
        if m:
            hits.append((m.group(1), m.group(2)))
    if email.strip():
        hits = [h for h in hits if h[1].lower() == email.strip().lower()]
    if not hits:
        return "(aucun PIN admin trouvé sur la fenêtre demandée)"
    code, mail = hits[-1]
    return f"CODE={code}\nemail={mail}\ntotal_candidats={len(hits)}"


@mcp.tool()
def contractor_invitation_code() -> str:
    """
    Renvoie un code d'invitation VALIDE pour tester le signup contractor.

    Le signup (POST /contractor-compliance/signup) exige un code à 4 chars.
    Cet outil lit `cc_invitation_codes` et renvoie un code non révoqué,
    non expiré et pas encore épuisé (uses_count < max_uses).
    """
    sql = (
        "SELECT code, uses_count, max_uses, COALESCE(expires_at,'') "
        "FROM cc_invitation_codes "
        "WHERE revoked_at IS NULL "
        "AND (expires_at IS NULL OR expires_at > NOW()) "
        "AND (max_uses IS NULL OR uses_count < max_uses) "
        "ORDER BY created_at DESC LIMIT 1"
    )
    rc, out, err = _mysql(sql)
    if rc != 0:
        return f"[error rc={rc}] {err.strip()}"
    out = out.strip()
    if not out:
        return ("(aucun code d'invitation disponible — il faut en générer un "
                "côté admin, page /admin/invitation-codes)")
    p = out.split("\t")
    used = p[1] if len(p) > 1 else "?"
    mx   = p[2] if len(p) > 2 else "?"
    mx_disp = "illimité" if mx in ("NULL", "", "0") else mx
    exp  = p[3] if len(p) > 3 and p[3] else "(jamais)"
    return f"CODE={p[0]}\nuses={used}/{mx_disp}\nexpires_at={exp}"


@mcp.tool()
def db_query(sql: str, limit: int = 50) -> str:
    """
    Exécute une requête SQL EN LECTURE SEULE sur la base backend (yplatformdb).

    Sécurité : seules les requêtes commençant par SELECT / SHOW / DESCRIBE /
    EXPLAIN / WITH sont acceptées. INSERT, UPDATE, DELETE, DROP, ... et tout
    enchaînement de requêtes (';' interne) sont refusés.

    Utile pour inspecter l'état du backend pendant un test : un contractor
    (cc_users), sa session (cc_contractor_sessions), ses documents
    (cc_documents), ses factures (cc_invoices), son KYC (cc_kyc_sessions),
    la certification QCM (cc_qcm_attempts), etc.

    Args:
        sql   : la requête. Le ';' final est optionnel.
        limit : LIMIT ajouté automatiquement si la requête n'en a pas (défaut 50).
    """
    clean = sql.strip().rstrip(";").strip()
    if not clean:
        return "[refused] requête vide"
    if ";" in clean:
        return "[refused] une seule requête à la fois (pas de ';' interne)"
    first = clean.split(None, 1)[0].lower()
    if first not in SQL_READONLY_PREFIXES:
        return (f"[refused] verbe '{first}' interdit — lecture seule "
                f"(autorisés : {', '.join(SQL_READONLY_PREFIXES)})")
    if first in ("select", "with") and not re.search(r"\blimit\b", clean, re.I):
        clean += f" LIMIT {max(1, min(int(limit), 1000))}"
    rc, out, err = _mysql(clean, timeout=20, table=True)
    if rc != 0:
        return f"[error rc={rc}] {err.strip()}"
    return out.strip() or "(0 ligne)"


@mcp.tool()
def latest_email(to: str = "", limit: int = 1) -> str:
    """
    Renvoie le(s) dernier(s) email(s) reçu(s) dans MailHog (boîte mail de dev).

    Utile pour récupérer un lien de vérification, un email de notification ou
    un code envoyé par email pendant un test. Extrait automatiquement les
    liens et les suites de 4-8 chiffres présents dans le corps.

    Args:
        to    : si fourni, ne garde que les emails adressés à cette adresse.
        limit : nombre d'emails à renvoyer (défaut 1, le plus récent).
    """
    try:
        data = _http_get_json(f"{MAILHOG_API}/api/v2/messages?limit=50")
    except Exception as exc:  # noqa: BLE001
        return f"[error] MailHog injoignable ({MAILHOG_API}) : {exc}"
    items = data.get("items", []) or []
    if to.strip():
        needle = to.strip().lower()
        items = [
            m for m in items
            if any(needle in f"{r.get('Mailbox','')}@{r.get('Domain','')}".lower()
                   for r in (m.get("To") or []))
        ]
    if not items:
        return "(aucun email)"
    blocks: list[str] = []
    for m in items[:max(1, min(int(limit), 10))]:
        hdr  = (m.get("Content") or {}).get("Headers") or {}
        subj = (hdr.get("Subject") or ["(sans objet)"])[0]
        frm  = (hdr.get("From") or ["?"])[0]
        tos  = ", ".join(hdr.get("To") or [])
        body = _decode_qp((m.get("Content") or {}).get("Body") or "")
        urls  = re.findall(r"https?://[^\s\"'<>]+", body)
        codes = re.findall(r"\b\d{4,8}\b", body)
        blocks.append(
            "--- email ---\n"
            f"from: {frm}\nto: {tos}\nsubject: {subj}\n"
            f"liens: {urls[:5] or '(aucun)'}\n"
            f"codes_possibles: {codes[:5] or '(aucun)'}\n"
            f"body[:600]: {body[:600]}"
        )
    return "\n".join(blocks)


@mcp.tool()
def backend_errors(since: str = "30m", tail: int = 2000) -> str:
    """
    Renvoie les erreurs récentes du backend : lignes ERROR / FATAL / Exception
    / Parse error des logs du webserver (PHP-FPM + nginx).

    Args:
        since : fenêtre de temps (défaut 30m).
        tail  : nb max de lignes brutes scannées (défaut 2000, max 5000).
    """
    rc, out, err = _run(
        ["docker", "logs", "--since", since,
         "--tail", str(min(int(tail), MAX_TAIL)), DEFAULT_WEBSERVER],
        timeout=20,
    )
    if rc != 0:
        return f"[error rc={rc}] {err.strip()}"
    keep = re.compile(r"(ERROR|E_FATAL|FATAL|Exception|\[error\]|Parse error)", re.I)
    lines = [_strip_ansi(l) for l in (out + err).splitlines() if keep.search(l)]
    if not lines:
        return "(aucune erreur sur la fenêtre demandée)"
    return "\n".join(lines[-40:])


@mcp.tool()
def find_otp(container: str = DEFAULT_WEBSERVER, tail: int = 500, since: str = "10m") -> str:
    """
    Cherche le dernier code OTP / SMS dans les logs récents d'un container.
    Retourne le code seul si trouvé, ou la liste contextualisée des candidats.
    """
    rc, out, err = _run(
        ["docker", "logs", "--tail", str(min(int(tail), MAX_TAIL)),
         "--since", since, container],
        timeout=20,
    )
    if rc != 0:
        return f"[error rc={rc}] {err.strip()}"
    hits = _scan_otp(out + err)
    if not hits:
        return "(aucun OTP détecté sur la fenêtre demandée)"
    last_code, last_line = hits[-1]
    return f"OTP={last_code}\ncontext: {last_line}\ntotal_candidates={len(hits)}"


@mcp.tool()
def find_otp_by_phone(phone: str, container: str = DEFAULT_NGINX,
                      tail: int = 1000, since: str = "30m") -> str:
    """
    Cherche un OTP émis pour un numéro précis (les 4 derniers chiffres suffisent).
    """
    needle = re.sub(r"\D", "", phone)[-4:]
    if not needle:
        return "phone invalide"
    rc, out, err = _run(
        ["docker", "logs", "--tail", str(min(int(tail), MAX_TAIL)),
         "--since", since, container],
        timeout=20,
    )
    if rc != 0:
        return f"[error rc={rc}] {err.strip()}"
    matching_lines = [l for l in (out + err).splitlines() if needle in l]
    if not matching_lines:
        return f"(aucune ligne pour ...{needle})"
    hits = _scan_otp("\n".join(matching_lines))
    if not hits:
        return f"(lignes trouvées pour ...{needle} mais aucun OTP extrait)\n" + \
               "\n".join(matching_lines[-5:])
    code, ctx = hits[-1]
    return f"OTP={code}\ncontext: {ctx}"


@mcp.tool()
def exec_in_container(container: str, cmd: str) -> str:
    """
    Exécute une commande readonly à l'intérieur d'un container.
    Whitelist : cat, ls, head, tail, grep, find, awk, sed, wc.
    """
    parts = shlex.split(cmd)
    if not parts or parts[0] not in ALLOWED_EXEC:
        return f"[refused] commande non autorisée ; whitelist = {sorted(ALLOWED_EXEC)}"
    rc, out, err = _run(["docker", "exec", container, *parts], timeout=15)
    if rc != 0:
        return f"[error rc={rc}] {err.strip()}\n{out}"
    return out


def _self_test() -> int:
    """Vérifie d'un coup que chaque dépendance (Docker, MySQL, MailHog, log
    frontend) répond. À lancer après installation."""
    checks = [
        ("docker_ps",                 docker_ps),
        ("contractor_login_pin()",    contractor_login_pin),
        ("admin_login_pin()",         admin_login_pin),
        ("contractor_invitation_code()", contractor_invitation_code),
        ("db_query(SELECT 1)",        lambda: db_query("SELECT 1 AS ping")),
        ("latest_email()",            latest_email),
        ("backend_errors()",          backend_errors),
        ("frontend_log()",            lambda: frontend_log(tail=5)),
    ]
    for name, fn in checks:
        print(f"\n=== {name} ===")
        try:
            print(fn())
        except Exception as exc:  # noqa: BLE001
            print(f"[EXCEPTION] {exc}")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        sys.exit(_self_test())
    mcp.run()
