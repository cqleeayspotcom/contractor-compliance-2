/// <reference types="cypress" />

import './commands';

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
