# Tests Cypress — ContractorCompliance

Les tests end-to-end de ce module fonctionnent en **deux modes**. Le mode est
piloté par la variable Cypress `realBackend`.

| Mode | Activation | Ce qui est testé |
|---|---|---|
| **mock** (défaut) | rien à faire | Le rendu UI sur des fixtures JSON figées. Aucun backend requis. |
| **real-backend** | `CYPRESS_realBackend=1` | Le parcours réel contre le backend PHP Tuita (`:8060`) à travers le proxy `ng serve`. |

---

## Mode mock (par défaut)

```bash
npm run cy:run          # headless
npm run cy:open         # interactif
```

Tous les endpoints sont interceptés par `cy.mockContractorApi()` /
`cy.mockAdminValidationApi()` (voir `cypress/support/commands.ts`) et répondent
depuis `cypress/fixtures/*.json`. C'est le mode utilisé en CI : rapide,
déterministe, sans dépendance.

Les **16 specs** tournent en mode mock. 10 d'entre elles (6 « stub partiel » +
4 « non convertible ») ne tournent QUE dans ce mode — elles forcent des états
ou des erreurs (`401/500/429`, score QCM, état « 6 mois plus tard »…)
impossibles à reproduire contre un vrai backend.

---

## Mode real-backend

Active le toggle `realBackend` : `cy.mockContractorApi()` cesse de stuber et
pose à la place des **spy-intercepts** (les requêtes partent réellement vers
`:8060`, mais les alias `@getDashboard`… restent disponibles pour `cy.waitApi`).

### Prérequis

1. **Backend up** : `docker-compose up -d` dans `platform-backend/`.
   Vérifier `IS_PROD=false` (le mode real-backend ne doit JAMAIS tourner en prod).
2. **`ng serve`** sur `:4200` AVEC le proxy :
   ```bash
   npm start    # = ng serve --proxy-config proxy.conf.js
   ```
   Le proxy est **obligatoire** : il strip les flags `Secure`/`SameSite=None`
   du cookie `__contractor_ssid`, sans quoi la session ne survit pas sur
   `localhost`.
3. **Base seedée** :
   ```bash
   npm run cypress:seed
   ```
   (purge les `cc_users` de test puis charge les 2 seeds idempotents du module).

### Lancer les tests real-backend

```bash
npm run cypress:real-backend
# ou une spec précise :
npm run cypress:real-backend -- --spec cypress/e2e/contractor-flow.cy.ts
```

Par défaut, `cypress:real-backend` cible les **6 specs « convertible direct »** :
`contractor-flow`, `contractor-journey`, `contractor-demo`,
`contractor-mission-invoice-detail`, `contractor-pro-flow`,
`contractor-document-upload-validation`.

> **Windows** : si Cypress échoue avec `bad option: --smoke-test`, c'est que
> la variable d'environnement `ELECTRON_RUN_AS_NODE` est positionnée. Le script
> `run-cypress-real.js` la supprime automatiquement ; en lançant `cypress run`
> à la main, faire `set ELECTRON_RUN_AS_NODE=` (cmd) au préalable.

---

## Helpers du mode real-backend

Définis dans `cypress/support/commands.ts` :

| Helper | Rôle |
|---|---|
| `cy.loginContractor(phonePlus)` | Auth contractor via PIN SMS Tuita (pose `__contractor_ssid`). **Numéro factice uniquement.** |
| `cy.loginAdmin(email)` | Auth staff Tuita via OAuth2 (PIN dans le log → `/signin` → token en `sessionStorage`). |
| `cy.waitApi('@alias')` | Attente d'un appel API tolérante aux 2 modes (résout le « Piège #1 »). |

Lecture des PIN via `cy.task` (`cypress/support/tasks.js`) :

- `readContractorPin` : lit `cft_contractor_oauth.sms_password` (PIN clair en dev).
- `readAdminPin` : lit `ADMIN PINCODE: <pin>` dans le log applicatif.

### Garde-fou SMS / e-mail

Les comptes de test n'utilisent QUE des **téléphones factices**
(`06 00 00 00 9x`). Le seed contient de vrais numéros de contractors :
ne jamais appeler `cy.loginContractor` avec un vrai numéro — un `request-pin`
tenterait un envoi SMS.

---

## Limites connues du mode real-backend

- L'état métier d'un contractor real-backend est piloté par la **synchro
  smith Tuita** : score, nom, plan changent d'un run à l'autre. Les assertions
  real-backend portent donc sur des **landmarks structurels** (titres de page,
  navigation), pas sur des valeurs métier figées.
- La page `/billing` reste sur son spinner : l'endpoint
  `/contractor-compliance/billing/plan` n'est pas servi par ce backend (404).
  Les tests billing sont sautés en real-backend, couverts en mode mock.
- Les tests de **détail** d'une mission/facture précise (uuid de fixture) et
  les scénarios d'**erreur forcée** sont sautés en real-backend (`this.skip()`)
  — ils restent couverts en mode mock.
