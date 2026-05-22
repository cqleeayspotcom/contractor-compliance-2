/**
 * run-cypress-real.js — lance Cypress en mode real-backend.
 *
 * POURQUOI un wrapper Node et pas une simple ligne npm :
 *  1. ENV `ELECTRON_RUN_AS_NODE` : si cette variable est positionnée dans
 *     l'environnement (cas observé sur le poste Windows), le binaire Electron
 *     de Cypress démarre en « run as node » et rejette ses propres options
 *     (`bad option: --smoke-test`). On la SUPPRIME avant de lancer Cypress.
 *  2. On force `CYPRESS_realBackend=1` pour activer le toggle real-backend.
 *  3. On laisse passer les args supplémentaires (ex: --spec "...").
 *
 * PRÉREQUIS (cf. README cypress) :
 *  - backend PHP up sur :8060 (docker-compose up -d) ;
 *  - `ng serve --proxy-config proxy.conf.js` sur :4200 ;
 *  - base seedée : `npm run cypress:seed`.
 *
 * USAGE :
 *   npm run cypress:real-backend
 *   npm run cypress:real-backend -- --spec cypress/e2e/contractor-flow.cy.ts
 */

const { spawnSync } = require('child_process');
const path = require('path');

// 1. Environnement nettoyé : ELECTRON_RUN_AS_NODE casse le binaire Cypress.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

// 2. Active le toggle real-backend côté Cypress.
env.CYPRESS_realBackend = '1';

// 3. Args : par défaut on cible les 6 specs « convertible direct » (les seules
//    pensées pour tourner contre le vrai backend). L'utilisateur peut passer
//    son propre --spec pour surcharger.
const passthrough = process.argv.slice(2);
const hasSpec = passthrough.some((a) => a === '--spec' || a.startsWith('--spec='));

const CONVERTIBLE_SPECS = [
  'cypress/e2e/contractor-flow.cy.ts',
  'cypress/e2e/contractor-journey.cy.ts',
  'cypress/e2e/contractor-demo.cy.ts',
  'cypress/e2e/contractor-mission-invoice-detail.cy.ts',
  'cypress/e2e/contractor-pro-flow.cy.ts',
  'cypress/e2e/contractor-document-upload-validation.cy.ts',
].join(',');

const args = ['cypress', 'run', '--browser', 'electron'];
if (!hasSpec) {
  args.push('--spec', CONVERTIBLE_SPECS);
}
args.push(...passthrough);

console.log('[real-backend] ELECTRON_RUN_AS_NODE supprimé, CYPRESS_realBackend=1');
console.log('[real-backend] npx ' + args.join(' '));

const result = spawnSync('npx', args, {
  stdio: 'inherit',
  env,
  cwd: path.resolve(__dirname, '..'),
  shell: process.platform === 'win32', // npx.cmd sur Windows
});

process.exit(result.status === null ? 1 : result.status);
