# MCP `tuita-logs` — lire les logs backend + frontend depuis Claude

## 1. À quoi ça sert (le pourquoi)

Quand on teste l'app Tuita de bout en bout, on a besoin de **voir ce qui se passe
sous le capot**, sans copier-coller à la main :

- **Codes de connexion** : le PIN admin (écrit dans les logs) et le code SMS
  contractor (stocké en base) — voir le détail §6.
- **Backend** : erreurs PHP, routes appelées, jobs (OCR, KYC, URSSAF).
- **Base de données** : l'état réel d'un contractor, ses documents, ses factures…
- **Emails** : les messages envoyés (vérification, notifs) via MailHog.
- **Frontend** : erreurs de compilation Angular, warnings, plantages de `ng serve`.

Sans ce MCP, il faut aller chercher tout ça à la main. **Avec** ce MCP, Claude le
fait seul → un test d'inscription / connexion complet devient **automatique**.

> ⚠ Les deux logins n'exposent pas le code pareil :
> - **Admin** → le PIN est loggué en clair (`ADMIN PINCODE: …`).
> - **Contractor** → le code n'est **jamais loggué** ; il est mis en base
>   (`cft_contractor_oauth.sms_password`) et **effacé après un login réussi**.
>
> C'est pour ça qu'il y a un outil dédié à chaque cas.

> Note : les logs **du navigateur** (console JS, requêtes réseau de la page web)
> ne passent **pas** par ce MCP. Ça, c'est le rôle de « Claude in Chrome ».
> Ce MCP lit les logs **serveur** des deux côtés.

## 2. Comment c'est branché (l'architecture)

```
Claude (Windows)  ⇄ stdio ⇄  wsl.exe  ⇄  python server.py (Ubuntu)
                                              │
                          ┌───────────────────┴───────────────────┐
                          ▼                                       ▼
                 demon Docker WSL                        fichier ng-serve.log
            (logs backend platform-backend)            (logs frontend ng serve)
```

- Le serveur MCP est un petit script Python qui tourne **dans WSL Ubuntu**.
- Le **backend** (`platform-backend`) tourne en containers Docker dans WSL → le
  script lit ses logs avec `docker logs`.
- Le **frontend** (ce repo) tourne via `ng serve` sur Windows → on redirige sa
  sortie dans le fichier `ng-serve.log`, que le script lit ensuite.

## 3. Les fichiers de ce dossier

| Fichier | Rôle |
|---|---|
| `server.py` | Le serveur MCP (les 7 outils exposés à Claude). |
| `install.sh` | Installe `server.py` + le SDK MCP dans WSL (`~/mcp-tuita-logs/`). |
| `claude_desktop_config.snippet.json` | Le bout de config à coller dans le client. |
| `README.md` | Ce fichier. |

## 4. Installation (à faire une seule fois)

### a) Le serveur dans WSL Ubuntu

Dans un terminal **Ubuntu** :

```bash
cd /mnt/c/Users/MSA/Desktop/code/frontend-tuita-contractor-compliance/_mcp-tuita-logs
bash install.sh
```

Le script :
1. copie `server.py` dans `~/mcp-tuita-logs/` ;
2. crée un environnement Python isolé (`~/mcp-tuita-logs/.venv`) — obligatoire car
   Ubuntu 24.04 interdit le `pip install` global ;
3. installe le SDK MCP officiel dedans ;
4. vérifie que ton utilisateur est dans le groupe `docker`.

Test que tout répond :

```bash
~/mcp-tuita-logs/.venv/bin/python ~/mcp-tuita-logs/server.py --self-test
```

Tu dois voir la liste de tes containers (`c_platform_webserver`, `tuita_nginx`, …).

### b) Déclarer le MCP dans le client

**Claude Desktop** — éditer
`C:\Users\MSA\AppData\Roaming\Claude\claude_desktop_config.json`
et fusionner le contenu de `claude_desktop_config.snippet.json` dans `mcpServers`.

**Claude Code (extension VSCode)** — déjà fait : un fichier `.mcp.json` est présent
à la racine de ce repo.

> Les deux pointent vers `~/mcp-tuita-logs/.venv/bin/python` (le venv), **pas**
> `/usr/bin/python3` (qui n'a pas le SDK MCP installé).

### c) Redémarrer

Un MCP n'est chargé **qu'au démarrage** du client. Donc :
- **Claude Desktop** : clic droit sur l'icône systray → Quit, puis relancer.
- **Claude Code** : recharger la fenêtre VSCode (`Ctrl+Shift+P` → *Reload Window*).

Puis ouvrir une **nouvelle conversation** — l'ancienne ne verra pas le nouveau MCP.

## 5. Démarrer le frontend pour que ses logs soient lisibles

Le MCP lit le fichier `ng-serve.log` à la racine de ce repo. Pour l'alimenter, il
faut lancer `ng serve` en **redirigeant sa sortie** vers ce fichier.

Le simple `npm start` lancé dans un terminal **ne suffit pas** : sa sortie reste
dans le terminal et le MCP ne la voit pas.

### Option recommandée — lancement détaché (survit à la fermeture du terminal)

En PowerShell, à la racine du repo :

```powershell
Start-Process cmd.exe -ArgumentList '/c','npm start > ng-serve.log 2>&1' `
  -WorkingDirectory (Get-Location) -WindowStyle Hidden
```

### Option simple — dans un terminal que tu gardes ouvert

```powershell
npm start 2>&1 | Tee-Object -FilePath ng-serve.log
```

`Tee-Object` affiche les logs **et** les écrit dans le fichier en même temps.

> Le chemin du fichier est surchargeable côté serveur via la variable
> d'environnement `TUITA_FRONTEND_LOG` (voir l'entête de `server.py`).

## 6. Les 13 outils exposés à Claude

### 🔑 Codes de connexion — le plus utile pour tester l'app
| Outil | Ce qu'il fait |
|---|---|
| `contractor_login_pin(phone)` | **Code SMS de connexion contractor.** Lu **en base** (`cft_contractor_oauth.sms_password`) car il n'est **pas** dans les logs. Le code est effacé après un login réussi : si vide, redemander un code côté app. |
| `admin_login_pin(email)` | **Code PIN de connexion admin.** Lu **dans les logs** du webserver (`ADMIN PINCODE: <code> for <email>`). |
| `contractor_invitation_code()` | Un code d'invitation valide pour tester le signup contractor (`cc_invitation_codes`). |

> **Pourquoi deux mécanismes différents ?** Le backend ne les expose pas pareil :
> le PIN admin est écrit en clair dans les logs applicatifs, alors que le code
> contractor n'est stocké qu'en base. D'où un outil dédié pour chacun.

### Base de données & emails
| Outil | Ce qu'il fait |
|---|---|
| `db_query(sql)` | Requête SQL **en lecture seule** sur `yplatformdb` (SELECT/SHOW/DESCRIBE/EXPLAIN/WITH uniquement). Pour inspecter l'état : `cc_users`, `cc_contractor_sessions`, `cc_documents`, `cc_invoices`, `cc_kyc_sessions`, `cc_qcm_attempts`… |
| `latest_email(to)` | Dernier email reçu dans MailHog (liens de vérification, notifs). Extrait les liens et les codes du corps. |

### Backend (containers Docker)
| Outil | Ce qu'il fait |
|---|---|
| `docker_ps` | Liste les containers en cours (nom, image, statut). |
| `docker_logs(container, tail, since)` | N dernières lignes de logs d'un container. |
| `backend_errors(since)` | Filtre rapide des erreurs récentes (ERROR / FATAL / Exception / Parse error) du webserver. |
| `tail_file(path, tail)` | N dernières lignes d'un fichier (ex. log nginx monté). |
| `find_otp(container, since)` | Extrait le dernier code à 4-8 chiffres des logs récents (générique). |
| `find_otp_by_phone(phone)` | Idem, filtré sur un numéro (4 derniers chiffres). |
| `exec_in_container(container, cmd)` | Commande lecture seule dans un container (whitelist : `cat ls head tail grep find awk sed wc`). |

Containers backend : webserver = **`c_platform_webserver`**, MySQL = **`c_platform_mysql`**, nginx Tuita = **`tuita_nginx`** (tous avec underscore).

### Frontend (serveur `ng serve`)
| Outil | Ce qu'il fait |
|---|---|
| `frontend_log(tail, errors_only)` | N dernières lignes du log `ng serve`. Avec `errors_only=true`, ne garde que les erreurs/warnings. |

## 7. Sécurité

- **Lecture seule** : aucun outil n'écrit sur disque, en base, ni ne détruit de container.
- `db_query` n'accepte que SELECT/SHOW/DESCRIBE/EXPLAIN/WITH, une seule requête à la fois (pas de `;` interne) — donc pas d'INSERT/UPDATE/DELETE/DROP.
- `exec_in_container` refuse tout sauf une whitelist de commandes inoffensives.
- `tail` est borné à 5000 lignes pour ne pas saturer le canal.
- Accès MySQL et MailHog : surchargeables par variables d'environnement (`TUITA_MYSQL_*`, `TUITA_MAILHOG_API`) — voir l'entête de `server.py`.
- Aucun port réseau ouvert par le MCP : tout passe par stdio entre le client et WSL.

## 8. En cas de pépin

| Symptôme | Cause / solution |
|---|---|
| `No module named pip` | Ubuntu 24.04 : relancer `install.sh` (il crée un venv). |
| `EACCES /var/run/docker.sock` | `sudo usermod -aG docker $USER && newgrp docker`. |
| `No such container: tuita-nginx` | C'est `tuita_nginx` (underscore). Déjà corrigé dans `server.py`. |
| `frontend_log` → « fichier introuvable » | `ng serve` n'a pas été lancé avec redirection vers `ng-serve.log` (voir §5). |
| Le MCP n'apparaît pas | Client pas redémarré, ou conversation pas neuve (voir §4c). |
