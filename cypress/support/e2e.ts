/// <reference types="cypress" />

import './commands';

// ── Mode ralenti (slow-motion) ────────────────────────────────────────────
// Par défaut les commandes s'enchaînent instantanément : impossible de voir
// l'état des pages quand on regarde le run. Avec --env commandDelay=600 chaque
// commande visible attend 600 ms, le temps d'observer chaque écran.
//   Observer le run :  npx cypress run --headed --no-exit --env commandDelay=600
//   Mode open      :   CYPRESS_commandDelay=600 npx cypress open
// Zéro impact en CI : sans la variable, le délai est 0.
const commandDelay = Number(Cypress.env('commandDelay')) || 0;
if (commandDelay > 0) {
  const slowed = ['visit', 'click', 'trigger', 'type', 'clear', 'reload', 'contains', 'select', 'check', 'uncheck'];
  for (const command of slowed) {
    Cypress.Commands.overwrite(command, (originalFn: any, ...args: any[]) => {
      const result = originalFn(...args);
      return new Promise((resolve) => setTimeout(() => resolve(result), commandDelay));
    });
  }
}

// Prevent uncaught exceptions from failing tests (Angular zone errors, etc.)
Cypress.on('uncaught:exception', (err) => {
  // Angular sometimes throws navigation/zone errors during test teardown
  if (
    err.message.includes('Cannot match any routes') ||
    err.message.includes('ExpressionChangedAfterItHasBeenChecked') ||
    err.message.includes('NG0100') ||
    err.message.includes('HttpErrorResponse') ||
    err.name === 'HttpErrorResponse'
  ) {
    return false;
  }
  // Let other errors fail the test
  return true;
});
