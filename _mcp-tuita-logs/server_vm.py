#!/usr/bin/env python3
"""
=============================================================================
SERVEUR MCP "tuita-logs-vm" — version BARE-METAL pour la VM GCP `tuita-cc-test`.
=============================================================================

POURQUOI une 2e version
-----------------------
Le `server.py` d'origine cible la stack WSL Ubuntu locale avec **tout** en
containers Docker (`c_platform_webserver`, `tuita_nginx`, `c_platform_mysql`,
MailHog). Sur la VM GCP `tuita-cc-test` on est BARE-METAL :

  - nginx       = service systemd, logs dans `/var/log/nginx/*`
  - php-fpm 7.4 = service systemd, logs dans `/var/log/php7.4-fpm.log`
  - rabbitmq    = service systemd
  - app Laminas = logge dans `/var/log/nginx/application.log` (Monolog)
  - mysql       = container Docker `c_mysql_local` (port 13306)
  - MailHog     = ABSENT (pas de mail dev sur cette VM)
  - ng serve    = ABSENT (frontend en build prod statique dans /var/www/cc-frontend)

Conséquences sur l'API :
  - `docker_logs(container)` n'a plus de sens pour le webserver ; remplacé par
    `app_log(tail)` qui lit `/var/log/nginx/application.log`.
  - `tail_file(path, tail)` reste utile pour lire n'importe quel log.
  - `backend_errors`, `find_otp`, `admin_login_pin` cherchent dans les fichiers
    de logs nginx + php-fpm au lieu de `docker logs`.
  - `latest_email` renvoie "non disponible sur cette VM" (pas de MailHog).
  - `frontend_log` renvoie "non disponible sur cette VM" (build statique).
  - Le reste (`contractor_login_pin`, `admin_login_pin`, `db_query`,
    `contractor_invitation_code`) reste fonctionnel via `docker exec
    c_mysql_local mysql ...`.

LANCEMENT DEPUIS WINDOWS / CLAUDE DESKTOP
-----------------------------------------
Claude Desktop sur Windows lance le serveur via `gcloud compute ssh` :

  {
    "mcpServers": {
      "tuita-logs-vm": {
        "command": "gcloud.cmd",
        "args": [
          "compute", "ssh", "tuita-cc-test",
          "--zone=europe-west1-b",
          "--quiet",
          "--",
          "/home/moussa_tuita_fr/mcp-tuita-logs-vm/.venv/bin/python",
          "/home/moussa_tuita_fr/mcp-tuita-logs-vm/server.py"
        ]
      }
    }
  }

Le stdio Claude ⇄ python passe par le tunnel SSH GCP.

SÉCURITÉ
--------
Identique à la version originale : lecture seule, whitelist stricte des verbes
SQL et des commandes shell, pas d'écriture disque, pas de destruction de
container, pas d'ouverture de port.
=============================================================================
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import subprocess
import sys
from typing import Optional

try:
    from mcp.server.fastmcp import FastMCP
except ImportError:
    sys.stderr.write(
        "Le paquet 'mcp' n'est pas installé. Sur la VM :\n"
        "    /home/moussa_tuita_fr/mcp-tuita-logs-vm/.venv/bin/pip install 'mcp[cli]'\n"
    )
    sys.exit(1)


MAX_TAIL = 5000
ALLOWED_EXEC = {"cat", "ls", "head", "tail", "grep", "find", "awk", "sed", "wc"}

# --- Stack bare-metal -------------------------------------------------------
# Logs nginx + app (Monolog applicatif loggue ici via monolog.global.php).
NGINX_ACCESS_LOG = os.environ.get("TUITA_NGINX_ACCESS", "/var/log/nginx/access.log")
NGINX_ERROR_LOG  = os.environ.get("TUITA_NGINX_ERROR",  "/var/log/nginx/error.log")
APP_LOG          = os.environ.get("TUITA_APP_LOG",      "/var/log/nginx/application.log")
PHP_FPM_LOG      = os.environ.get("TUITA_PHP_FPM_LOG",  "/var/log/php7.4-fpm.log")

# MySQL container (seul Docker restant sur la VM).
MYSQL_CONTAINER = os.environ.get("TUITA_MYSQL_CONTAINER", "c_mysql_local")
MYSQL_USER      = os.environ.get("TUITA_MYSQL_USER",      "root")
MYSQL_PASSWORD  = os.environ.get("TUITA_MYSQL_PASSWORD",  "docker")
MYSQL_DB        = os.environ.get("TUITA_MYSQL_DB",        "yplatformdb")

# Services systemd à surveiller via `systemctl is-active`.
SYSTEMD_SERVICES = ("nginx", "php7.4-fpm", "rabbitmq-server")

# Codes couleur ANSI à nettoyer dans les logs.
_ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")

SQL_READONLY_PREFIXES = ("select", "show", "describe", "desc", "explain", "with")

OTP_PATTERNS = [
    re.compile(r"(?:otp|code|verif(?:ication)?|sms|pin)[^\d]{0,12}(\d{4,8})", re.I),
    re.compile(r"\b(\d{6})\b\s*(?:est|is|=|→).{0,40}(?:otp|code|sms)", re.I),
    re.compile(r"smsCode[\"':=\s]+([\"']?)(\d{4,8})\1", re.I),
]


mcp = FastMCP("tuita-logs-vm")


# ---------------------------------------------------------------------------
# Helpers — exécution shell / MySQL / lecture fichiers
# ---------------------------------------------------------------------------

def _run(cmd: list[str], timeout: int = 15) -> tuple[int, str, str]:
    """Exécute une commande subprocess et renvoie (rc, stdout, stderr)."""
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, check=False,
        )
        return proc.returncode, proc.stdout, proc.stderr
    except subprocess.TimeoutExpired:
        return 124, "", f"timeout after {timeout}s"
    except FileNotFoundError as exc:
        return 127, "", str(exc)


def _strip_ansi(text: str) -> str:
    return _ANSI_RE.sub("", text)


def _sudo_tail(path: str, tail: int) -> tuple[int, str, str]:
    """`tail -n N` avec sudo (logs nginx sont root:adm). Sudo NOPASSWD requis."""
    tail = max(1, min(int(tail), MAX_TAIL))
    return _run(["sudo", "-n", "tail", "-n", str(tail), path], timeout=10)


def _mysql(sql: str, timeout: int = 15, table: bool = False) -> tuple[int, str, str]:
    fmt = ["-t"] if table else ["-N", "-B"]
    cmd = [
        "sudo", "-n", "docker", "exec", "-i", MYSQL_CONTAINER,
        "mysql", f"-u{MYSQL_USER}", f"-p{MYSQL_PASSWORD}",
        *fmt, MYSQL_DB, "-e", sql,
    ]
    return _run(cmd, timeout=timeout)


def _normalize_phone(phone: str) -> tuple[str, str]:
    """Tuita stocke en P33XXXXXXXXX. On normalise pour matcher."""
    raw = re.sub(r"[^0-9P+]", "", phone.strip())
    if raw.startswith("+"):
        internal = "P" + raw[1:]
    elif raw.startswith("00"):
        internal = "P" + raw[2:]
    elif raw.startswith("0") and not raw.startswith("0P"):
        internal = "P33" + raw[1:]
    else:
        internal = raw
    return internal, raw


def _scan_otp(text: str) -> list[tuple[str, str]]:
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


# ---------------------------------------------------------------------------
# Outils MCP — état de l'infra
# ---------------------------------------------------------------------------

@mcp.tool()
def docker_ps() -> str:
    """État de la stack bare-metal : systemd services + MySQL container.

    Sur la VM `tuita-cc-test` il n'y a qu'un seul container Docker
    (c_mysql_local). Tout le reste (nginx, php-fpm, rabbitmq) est systemd.
    """
    lines = ["=== systemd services ==="]
    for svc in SYSTEMD_SERVICES:
        rc, out, _ = _run(["systemctl", "is-active", svc])
        lines.append(f"  {svc}: {out.strip() or 'unknown'}")
    lines.append("")
    lines.append("=== docker containers ===")
    rc, out, err = _run([
        "sudo", "-n", "docker", "ps",
        "--format", "{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}",
    ])
    lines.append(out.strip() if rc == 0 else f"[error rc={rc}] {err.strip()}")
    return "\n".join(lines)


@mcp.tool()
def app_log(tail: int = 200, errors_only: bool = False) -> str:
    """Lit /var/log/nginx/application.log (Monolog applicatif Laminas).

    C'est LE log où apparaissent :
      - les routes matchées (`Matched route name: ...`)
      - les erreurs PHP non fatales catchées par l'app
      - les logs métier via `Mylog::*`

    Args:
        tail        : N dernières lignes (défaut 200, max 5000).
        errors_only : ne garder que les lignes ERROR/Exception/Fatal.
    """
    rc, out, err = _sudo_tail(APP_LOG, tail)
    if rc != 0:
        return f"[error rc={rc}] {err.strip()}"
    if errors_only:
        keep = re.compile(r"(ERROR|FATAL|Exception|Parse error|\[error\])", re.I)
        out = "\n".join(l for l in out.splitlines() if keep.search(l))
    return _strip_ansi(out) or "(log vide)"


@mcp.tool()
def nginx_access_log(tail: int = 100, grep: str = "") -> str:
    """Lit /var/log/nginx/access.log — utile pour voir quelles URLs sont
    appelées, avec quel code HTTP et payload size.

    Args:
        tail : N dernières lignes (défaut 100).
        grep : filtre regex POSIX (ex. 'signup', 'contractor-compliance', '500').
    """
    rc, out, err = _sudo_tail(NGINX_ACCESS_LOG, tail)
    if rc != 0:
        return f"[error rc={rc}] {err.strip()}"
    if grep:
        try:
            pat = re.compile(grep, re.I)
            out = "\n".join(l for l in out.splitlines() if pat.search(l))
        except re.error as exc:
            return f"[refused] regex invalide : {exc}"
    return out or "(aucune ligne ne matche)"


@mcp.tool()
def nginx_error_log(tail: int = 100) -> str:
    """Lit /var/log/nginx/error.log — erreurs nginx (502, FastCGI, upstream...).
    Capture aussi les Fatal PHP qui crashent avant l'app handler."""
    rc, out, err = _sudo_tail(NGINX_ERROR_LOG, tail)
    if rc != 0:
        return f"[error rc={rc}] {err.strip()}"
    return out or "(log vide)"


@mcp.tool()
def tail_file(path: str, tail: int = 200) -> str:
    """Renvoie les N dernières lignes d'un fichier arbitraire (lecture seule).

    Args:
        path : chemin absolu sur la VM. Utiliser sudo si root-only.
        tail : N lignes (défaut 200, max 5000).
    """
    return _sudo_tail(path, tail)[1] or "(vide)"


@mcp.tool()
def backend_errors(tail: int = 2000) -> str:
    """Filtre les erreurs récentes des 3 sources : application.log,
    nginx error.log, php7.4-fpm.log.

    Args:
        tail : N lignes scannées par source (défaut 2000, max 5000).
    """
    out_all: list[str] = []
    keep = re.compile(r"(ERROR|FATAL|Exception|Parse error|\[error\])", re.I)
    for source in (APP_LOG, NGINX_ERROR_LOG, PHP_FPM_LOG):
        rc, out, _ = _sudo_tail(source, tail)
        if rc != 0:
            continue
        for line in _strip_ansi(out).splitlines():
            if keep.search(line):
                out_all.append(f"[{os.path.basename(source)}] {line}")
    if not out_all:
        return "(aucune erreur récente)"
    return "\n".join(out_all[-40:])


# ---------------------------------------------------------------------------
# Outils MCP — codes de connexion / signup
# ---------------------------------------------------------------------------

@mcp.tool()
def contractor_login_pin(phone: str = "") -> str:
    """Code SMS contractor — lu dans cft_contractor_oauth.sms_password.

    Args:
        phone : ex. '+33600000099', '06 00 00 00 99', 'P33600000099'.
                Si vide : renvoie le code le plus récent toutes phones confondues.
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
                "clique sur « Renvoyer le code » côté SPA)")
    parts = out.split("\t")
    sms_phone = parts[0] if len(parts) > 0 else "?"
    pin       = parts[1] if len(parts) > 1 else ""
    sent      = parts[2] if len(parts) > 2 else "?"
    if not pin or pin.upper() == "NULL":
        return (f"(numéro {sms_phone} trouvé mais `sms_password` vide — "
                "le code a été consommé ou n'a pas encore été généré)")
    return f"CODE={pin}\nphone={sms_phone}\npincode_sent={sent}"


@mcp.tool()
def admin_login_pin(email: str = "") -> str:
    """Code PIN admin — pattern `ADMIN PINCODE: <code> for <email>` dans application.log.

    Args:
        email : si fourni, filtre par email.
    """
    rc, out, err = _sudo_tail(APP_LOG, 5000)
    if rc != 0:
        return f"[error rc={rc}] {err.strip()}"
    pat = re.compile(r"ADMIN PINCODE:\s*(\d{4,8})\s+for\s+(\S+)", re.I)
    hits = [(m.group(1), m.group(2)) for line in _strip_ansi(out).splitlines()
            if (m := pat.search(line)) is not None]
    if email.strip():
        hits = [h for h in hits if h[1].lower() == email.strip().lower()]
    if not hits:
        return "(aucun PIN admin trouvé)"
    code, mail = hits[-1]
    return f"CODE={code}\nemail={mail}\ntotal_candidats={len(hits)}"


@mcp.tool()
def contractor_invitation_code() -> str:
    """Renvoie un code d'invitation VALIDE (cc_invitation_codes)."""
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
                "côté admin via /contractor-compliance/admin/invitation-codes ou SQL)")
    p = out.split("\t")
    used = p[1] if len(p) > 1 else "?"
    mx   = p[2] if len(p) > 2 else "?"
    mx_disp = "illimité" if mx in ("NULL", "", "0") else mx
    exp  = p[3] if len(p) > 3 and p[3] else "(jamais)"
    return f"CODE={p[0]}\nuses={used}/{mx_disp}\nexpires_at={exp}"


# ---------------------------------------------------------------------------
# Outils MCP — exploration DB
# ---------------------------------------------------------------------------

@mcp.tool()
def db_query(sql: str, limit: int = 50) -> str:
    """SQL lecture seule sur yplatformdb (SELECT/SHOW/DESCRIBE/EXPLAIN/WITH).

    Args:
        sql   : requête sans ';' interne.
        limit : LIMIT appliqué automatiquement si absent (défaut 50, max 1000).
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


# ---------------------------------------------------------------------------
# Outils MCP — recherche OTP
# ---------------------------------------------------------------------------

@mcp.tool()
def find_otp(tail: int = 1000) -> str:
    """Cherche un OTP dans application.log + nginx error.log."""
    chunks = []
    for src in (APP_LOG, NGINX_ERROR_LOG):
        rc, out, _ = _sudo_tail(src, tail)
        if rc == 0:
            chunks.append(out)
    hits = _scan_otp(_strip_ansi("\n".join(chunks)))
    if not hits:
        return "(aucun OTP détecté)"
    last_code, last_line = hits[-1]
    return f"OTP={last_code}\ncontext: {last_line}\ntotal_candidates={len(hits)}"


@mcp.tool()
def find_otp_by_phone(phone: str, tail: int = 2000) -> str:
    """Cherche un OTP émis pour un numéro précis (4 derniers chiffres suffisent)."""
    needle = re.sub(r"\D", "", phone)[-4:]
    if not needle:
        return "phone invalide"
    chunks = []
    for src in (APP_LOG, NGINX_ERROR_LOG):
        rc, out, _ = _sudo_tail(src, tail)
        if rc == 0:
            chunks.append(out)
    matching = [l for l in "\n".join(chunks).splitlines() if needle in l]
    if not matching:
        return f"(aucune ligne pour ...{needle})"
    hits = _scan_otp("\n".join(matching))
    if not hits:
        return f"(lignes trouvées pour ...{needle} mais aucun OTP extrait)\n" + \
               "\n".join(matching[-5:])
    code, ctx = hits[-1]
    return f"OTP={code}\ncontext: {ctx}"


# ---------------------------------------------------------------------------
# Outils MCP — emails / frontend (absents sur cette VM)
# ---------------------------------------------------------------------------

@mcp.tool()
def latest_email(to: str = "", limit: int = 1) -> str:
    """MailHog absent sur cette VM. Pour activer : `docker run -d -p 1025:1025
    -p 8025:8025 mailhog/mailhog` puis configurer le backend sur SMTP localhost:1025."""
    return ("(non disponible sur cette VM — pas de MailHog installé. "
            "Lance `docker run -d --name mailhog -p 1025:1025 -p 8025:8025 "
            "mailhog/mailhog` puis configure le SMTP du backend.)")


@mcp.tool()
def frontend_log(tail: int = 200, errors_only: bool = False) -> str:
    """`ng serve` absent sur cette VM (frontend en build statique /var/www/cc-frontend).
    Pour les erreurs frontend, utiliser plutôt la console DevTools du navigateur."""
    return ("(non disponible sur cette VM — frontend en build prod statique servi "
            "par nginx depuis /var/www/cc-frontend, pas de ng serve dev. "
            "Pour debug : utilise la console DevTools du navigateur côté client.)")


# ---------------------------------------------------------------------------
# Outils MCP — exec arbitraire (whitelist)
# ---------------------------------------------------------------------------

@mcp.tool()
def exec_in_mysql(cmd: str) -> str:
    """Exécute une commande readonly dans le container MySQL c_mysql_local.
    Whitelist : cat, ls, head, tail, grep, find, awk, sed, wc."""
    parts = shlex.split(cmd)
    if not parts or parts[0] not in ALLOWED_EXEC:
        return f"[refused] commande non autorisée ; whitelist = {sorted(ALLOWED_EXEC)}"
    rc, out, err = _run(["sudo", "-n", "docker", "exec", MYSQL_CONTAINER, *parts], timeout=15)
    if rc != 0:
        return f"[error rc={rc}] {err.strip()}\n{out}"
    return out


# ---------------------------------------------------------------------------
# Self-test (smoke des outils principaux)
# ---------------------------------------------------------------------------

def _self_test() -> int:
    checks = [
        ("docker_ps",                    docker_ps),
        ("app_log(tail=5)",              lambda: app_log(tail=5)),
        ("nginx_access_log(tail=5)",     lambda: nginx_access_log(tail=5)),
        ("backend_errors()",             backend_errors),
        ("contractor_login_pin()",       contractor_login_pin),
        ("admin_login_pin()",            admin_login_pin),
        ("contractor_invitation_code()", contractor_invitation_code),
        ("db_query(SELECT 1)",           lambda: db_query("SELECT 1 AS ping")),
        ("latest_email()",               latest_email),
        ("frontend_log()",               frontend_log),
    ]
    for name, fn in checks:
        print(f"\n=== {name} ===")
        try:
            print(fn())
        except Exception as exc:
            print(f"[EXCEPTION] {exc}")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        sys.exit(_self_test())
    mcp.run()
