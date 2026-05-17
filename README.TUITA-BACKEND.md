# tuita-verify â€” adaptation pour backend Laminas Tuita

Cette copie de `tuita-verify/frontend` est branchÃ©e sur le **backend
Laminas Tuita monolithe** (module `ContractorCompliance` dans
`platform-backend`) au lieu du backend Laravel standalone d'origine.

Pour la doc fonctionnelle du frontend (design, composants, structure),
voir [`README.md`](README.md). Ce fichier-ci ne couvre que les **diffÃ©rences
d'intÃ©gration**.

## SDK auto-généré — utiliser celui-ci en priorité

Ce frontend **utilise un SDK TypeScript généré automatiquement** depuis les
routes Laminas réelles du backend Tuita. Le SDK vit dans `src/app/api/` et
contient 23 services + 4 modèles (118 opérations couvrant tout le périmètre
contractor + admin + KYC mobile + paiement public).

- **Source de vérité** : `openapi/contractor-compliance.openapi.yaml` (commité)
- **Outil** : [`ng-openapi-gen`](https://github.com/cyclosproject/ng-openapi-gen) v1.0.5
- **Régénérer** : `npm run generate-api`
- **Doc détaillée** : [`SDK-GENERATION.md`](SDK-GENERATION.md)

**Règle de développement** : pour toute nouvelle feature ou refactor, importer
les fonctions/services depuis `src/app/api/` (ex. `import { kycChallenge } from
'../api/fn/kyc/kyc-challenge'`) au lieu d'ajouter une nouvelle méthode dans un
service hand-written. Les services hand-written existants (`src/app/services/*`)
restent en place tant qu'ils fonctionnent — adoption progressive.

**Quand une route backend change** : éditer le YAML, lancer `npm run
generate-api`, commiter le diff `src/app/api/` dans le même PR que le backend.
Le YAML committé est le contrat figé entre back et front, revu en PR.

## Surfaces backend ciblÃ©es

| Surface                                            | Port  | Auth                                                          |
| -------------------------------------------------- | ----- | ------------------------------------------------------------- |
| `/contractor-compliance/*`                                | 8060  | Cookie `__contractor_ssid` (auth SMS Tuita)                   |
| `/contractor-compliance/admin/*`               | 8060  | Bearer OAuth2 staff (`CLEARANCE_STAFF_ONLY`)                  |
| `/contractor-compliance/kyc/mobile/:token`                           | 8060  | Public (token signÃ©)                                          |
| `/contractor-compliance/pay/free-invoice/*`    | 8060  | Public (token signÃ©)                                          |

## Modifications appliquÃ©es vs l'original

- **`proxy.conf.json`** : `target` â†’ `http://localhost:8060` (au lieu de `:8000`)
  + `cookieDomainRewrite: "localhost"` pour que le cookie Tuita soit
  rÃ©injectÃ© cÃ´tÃ© `localhost:4200`.
- **Endpoints admin** : 19 fichiers TS migrÃ©s de `/contractor-compliance/admin/*`
  vers `/contractor-compliance/admin/*`. Concerne tous les services
  admin (`admin-contractor`, `admin-invoice`, `admin-kyc`, `admin-mission`,
  `admin-document`, `admin-settings`, `admin-invitation-code`,
  `admin-free-invoice`, `admin-contractor-compliance`) + leurs `.spec.ts`
  et les composants `admin-contractor`, `admin-purchases`,
  `contractor-admin`, `admin-mission-dialog`, `contractor-compliance-summary`.
- **Routes `/signup` et `/login`** : dÃ©sactivÃ©es dans
  `src/app/app.routes.ts` (redirect vers `/dashboard`). L'auth contractor
  est exclusivement gÃ©rÃ©e par Tuita (`ContractorAuthAction` + SMS).
  Les composants `contractor-signup` et `contractor-login` restent sur
  disque pour rÃ©fÃ©rence mais ne sont plus routÃ©s.
- **Interceptors 401** (`api.interceptor.ts` + `contractor-cookie.interceptor.ts`) :
  redirection vers `http://localhost:8060/contractor/login` en dev ou
  `https://tuita.fr/contractor/login` en prod, au lieu d'un `/login` local.
- **`environment.ts` / `environment.prod.ts`** : ajout d'un champ
  `tuitaBackendUrl` pour les composants qui doivent former une URL absolue
  (download blobs, redirect externes). En prod le frontend est servi sur
  le mÃªme domaine que le backend â†’ URL relative.

## DÃ©marrage local

```bash
# 1. Backend Tuita (depuis platform-backend/)
docker-compose up
# Attendre que http://localhost:8060 rÃ©ponde.

# 2. Frontend (depuis ce rÃ©pertoire)
npm install     # ~5 min, dont canvas natif (build C++ Windows)
npm start       # http://localhost:4200 avec proxy /api â†’ :8060
```

## Comment se connecter en local

### Contractor

L'auth SMS Tuita gÃ¨re le cookie `__contractor_ssid`. Deux options :

1. **Via le portail Tuita** : aller sur
   `http://localhost:8060/contractor/login` et suivre le flow SMS.
   En dev (`IS_PROD=false`), Tuita court-circuite les SMS rÃ©els et Ã©crit
   le code OTP dans les logs nginx. Une fois le cookie posÃ©, revenir sur
   `http://localhost:4200/dashboard` â€” le proxy Angular rÃ©injecte le cookie.
2. **Cookie injectÃ© Ã  la main** : si on a dÃ©jÃ  un SSID valide en base
   `cft_contractor_session`, le poser via les devtools sur `localhost`.

### Admin

RÃ©cupÃ©rer un access token OAuth2 staff Tuita via
`POST /oauth/token` (grant_type=password sur un user `role=staff`) puis le
stocker dans `localStorage` selon la clÃ© attendue par les services admin
(voir `contractor-admin.component.ts`).

## Build

```bash
npm run build           # production, sortie dans dist/frontend/browser/
npm run build:dev       # dev (source maps)
```

## Tests

```bash
npm run test            # unit (vitest)
npm run cy:open         # e2e (Cypress + fixtures JSON)
```

## Origine

Copie au 2026-05-17 de `C:/Users/MSA/Desktop/code/tuita-verify/frontend/`.
Le `.git` source n'a pas Ã©tÃ© repris (repo sÃ©parÃ©). `node_modules/` non
copiÃ© â€” relancer `npm install`.
