# Handoff — Test E2E ContractorCompliance (à coller dans une nouvelle session Cowork)

## Contexte
Le user (Moussa, ingénieur, Paris) veut un test exhaustif du module
`ContractorCompliance` du backend Tuita (+ `ContractorComplianceBridge`), côté
**contractor** ET côté **admin**. Détecter erreurs (routes, 4xx/5xx, UX) et
les corriger progressivement.

## Surfaces backend
| Surface | Port | Auth |
|---|---|---|
| `/contractor-compliance/*` | 8060 | Cookie `__contractor_ssid` (SMS Tuita) |
| `/contractor-compliance/admin/*` | 8060 | Bearer OAuth2 staff (`CLEARANCE_STAFF_ONLY`) |
| `/contractor-compliance/kyc/mobile/:token` | 8060 | Public (token signé) |
| `/contractor-compliance/pay/free-invoice/*` | 8060 | Public (token signé) |

Frontend Angular sur `http://localhost:4200` avec proxy → `:8060`.
Login contractor : `http://localhost:8060/contractor/login` (SMS dev → loggué).
Login admin : `POST /signin` → token OAuth2.

## Accès disponibles dans la nouvelle session
1. **Frontend monté** : `C:\Users\MSA\Desktop\code\frontend-tuita-contractor-compliance`
   (read+write, Angular 21, SDK auto-gen dans `src/app/api/`)
2. **Backend à monter** : `C:\Users\MSA\Desktop\code\platform-backend`
   → User doit ajouter ce dossier au workspace Cowork de la session fraîche.
   Modules cibles : `module/ContractorCompliance/`, `module/ContractorComplianceBridge/`
3. **MCP tuita-logs installé** dans WSL (`~/mcp-tuita-logs/server.py`), exposé
   à Claude Desktop. **7 outils** :
   - `docker_ps`
   - `docker_logs(container, tail, since?)`
   - `tail_file(path, tail)`
   - `find_otp(container='tuita-nginx', tail=500, since='10m')`
   - `find_otp_by_phone(phone, container?, tail?, since?)`
   - `exec_in_container(container, cmd)` (whitelist : cat/ls/head/tail/grep/find/awk/sed/wc)
   - `frontend_log(...)` ← ajouté par le user, lit les logs `ng serve` redirigés
4. **Claude in Chrome** : doit être appairé. Si `list_connected_browsers`
   retourne `[]`, demander au user d'ouvrir l'extension et de l'appairer
   à cette session.

## Plan d'attaque
### Phase 1 — Reco
- [ ] Lister les controllers du module : `ls module/ContractorCompliance/src/V1/Rpc/` + `Rest/`
- [ ] Lire `module/ContractorCompliance/config/module.config.php` →
      tableau exhaustif (route, controller, méthodes HTTP, clearance)
- [ ] Lire `module/ContractorComplianceBridge/config/module.config.php` →
      idem (et identifier le rôle du bridge : probable adapter entre l'ancien
      module Tuita et le nouveau ContractorCompliance)
- [ ] Lire `src/app/app.routes.ts` côté Angular → mapper chaque route UI à
      ses endpoints API consommés (via `src/app/api/` et `src/app/services/`)
- [ ] Lire `openapi/contractor-compliance.openapi.yaml` → vérifier que tous
      les controllers backend y figurent (diff manuel)

### Phase 2 — Contractor (parcours fonctionnel)
1. Connecter Chrome, ouvrir `http://localhost:4200/`
2. Si redirect login → `http://localhost:8060/contractor/login`, entrer un
   numéro de téléphone d'un contractor de test (demander au user lequel)
3. `find_otp_by_phone(<4 derniers chiffres>)` → entrer le PIN
4. Une fois `__contractor_ssid` posé, retour sur `localhost:4200/dashboard`
5. Parcourir toutes les routes : dashboard, profil, docs (kbis, urssaf, RC pro,
   assurance décennale), missions, factures, KYC, paramètres
6. Pour chaque écran :
   - Tenter toutes les actions (upload, soumission, modif, suppression, retry)
   - `read_network_requests('localhost:4200')` après chaque action → noter
     les 4xx/5xx
   - `read_console_messages('error|warning')` → noter erreurs JS
   - `docker_logs('c_platform_webserver', tail=50)` après actions backend →
     stack trace PHP s'il y en a
   - Noter problèmes UX (loaders manquants, labels confus, dead-ends)

### Phase 3 — Admin
1. Login via `POST /signin` (besoin d'un staff user — demander credentials)
2. Stocker l'access_token où le frontend l'attend (`localStorage` clé selon
   `contractor-admin.component.ts`)
3. Parcourir `/admin/*` : liste contractors, fiche détaillée, validation
   documents, conformité, KYC, factures, paramètres
4. Pour chaque action de validation/refus/edit → vérifier la réponse backend
   et l'impact côté DB (`exec_in_container('c_platform_webserver',
   'cat /tmp/...')` ou query SQL via outil dédié si dispo)

### Phase 4 — Fix
Pour chaque bug confirmé :
- Backend : éditer dans `module/ContractorCompliance/...` en respectant
  les 4 blocs `module.config.php` (controllers, router, api-tools,
  api-tools-content-validation) — sinon API Tools UI se casse globalement.
- Frontend : éditer `src/app/...`, regénérer le SDK si endpoint change
  (`npm run generate-api`)
- Après chaque fix backend → re-test l'endpoint qui plantait + vérifier
  qu'API Tools UI ne renvoie pas "Unable to fetch RPC services"
- Après chaque fix touchant le schéma DB → `docker exec c_platform_webserver
  /var/www/bin/doctrine-update.sh` (jamais d'ALTER manuel, cf. CLAUDE.md)

### Phase 5 — Rapport
- Tableau récapitulatif : route, type d'erreur, cause, fix appliqué,
  retest OK ?
- PR séparée si le user veut un commit propre

## Conventions à respecter (extraits du CLAUDE.md backend)
- **JAMAIS** d'ALTER TABLE manuel, tout passe par annotations Doctrine +
  `doctrine-update.sh`
- **JAMAIS** toucher `Application/src/` ou `CommonLibrary/` sans demande explicite
- **Compatibilité Laminas API Tools obligatoire** : tout controller RPC/REST
  doit être déclaré dans les 4 blocs ; un seul oubli casse toute l'UI admin
- **Cache Laminas** : après modif de module, supprimer
  `platform-backend/data/cache/module-*.cache.php` (sans `rm -rf`, le hook bloque)
- **Réfléchir avant de coder** : module concerné, route exacte, service Angular
  qui consomme, zone fragile ?
- **Changements chirurgicaux** : ne pas refactorer ce qu'on touche en passant
- Pour chaque endpoint sécurisé : choisir la bonne classe de base
  (`MainAbstractController` / `SuperDispatchController` / `AbstractActionController`
  ou `AbstractResourceListener`) + bon `$userRoleConstraint` selon la cible
  (staff / fom / contractor / user / public)

## Ce qui a déjà été fait dans la session précédente
- Architecture cartographiée (proxy.conf.js, README.TUITA-BACKEND.md lus)
- MCP `tuita-logs` créé et installé en WSL, user a ajouté `frontend_log`
- Pas encore de test E2E réel (Chrome pas encore appairé dans la précédente)

## Question à reposer au user au démarrage
1. Confirmer que Chrome est appairé (`list_connected_browsers`)
2. Confirmer que `platform-backend` est monté (essayer un Read sur
   `C:\Users\MSA\Desktop\code\platform-backend\module\ContractorCompliance\config\module.config.php`)
3. Demander : un numéro de contractor de test + un user staff pour l'admin
4. Demander : le nom exact des containers (probable `c_platform_webserver`,
   `tuita-nginx`, etc. — à vérifier via `docker_ps`)
