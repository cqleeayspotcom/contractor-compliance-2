import { defineConfig } from 'cypress';

// Tâches Node du mode real-backend (lecture des PIN). CommonJS car exécuté
// dans le process Node de Cypress (setupNodeEvents), pas dans le navigateur.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerTasks } = require('./cypress/support/tasks');

export default defineConfig({
  // env.realBackend : 0 = mode mock (défaut, fixtures figées),
  //                   1 = mode real-backend (vrai backend PHP via proxy).
  // Surcharge à l'exécution : CYPRESS_realBackend=1 npx cypress run ...
  env: {
    realBackend: 0,
  },
  e2e: {
    baseUrl: 'http://localhost:4200',
    viewportWidth: 1440,
    viewportHeight: 900,
    defaultCommandTimeout: 10000,
    video: false,
    screenshotOnRunFailure: true,
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    fixturesFolder: 'cypress/fixtures',
    setupNodeEvents(on, config) {
      // Tâches real-backend : cy.task('readContractorPin'/'readAdminPin').
      // Inertes en mode mock (aucune spec mock ne les appelle).
      registerTasks(on);
      return config;
    },
  },
});
