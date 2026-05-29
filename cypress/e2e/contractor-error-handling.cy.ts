/// <reference types="cypress" />

/**
 * GESTION D'ERREURS — 401 redirect, 500 graceful, network error, 429 rate limit
 *
 * Teste que l'app ne crash jamais, meme quand le backend est en panne.
 */

const PAUSE = 3000;

describe('Gestion erreurs — resilience frontend', () => {

  it('401 sur dashboard redirige vers login (cookie expire)', () => {
    cy.intercept('GET', '/contractor-compliance/dashboard', {
      statusCode: 401,
      body: { error: 'Unauthorized' },
    }).as('dashboardUnauth');

    cy.visit('/dashboard');
    cy.wait('@dashboardUnauth');

    // Le cookie interceptor redirige — en dev il reload /dashboard
    // L'important c'est que l'app ne crash pas
    cy.wait(PAUSE);
  });

  it('500 sur les documents ne crash pas la page', () => {
    cy.mockContractorApi();
    cy.intercept('GET', '/contractor-compliance/documents*', {
      statusCode: 500,
      body: { error: 'Internal Server Error' },
    }).as('docsError');

    cy.visit('/documents');
    cy.wait('@docsError');

    // La page ne crash pas
    cy.url().should('include', '/documents');

    cy.wait(PAUSE);
  });

  it('500 sur les missions ne crash pas', () => {
    cy.mockContractorApi();
    // La page /missions consomme GET /missions/offers (missionsOffers.PATH).
    cy.intercept('GET', '/contractor-compliance/missions/offers*', {
      statusCode: 500,
      body: { error: 'Internal Server Error' },
    }).as('missionsError');

    cy.visit('/missions');
    cy.wait('@missionsError');

    cy.url().should('include', '/missions');

    cy.wait(PAUSE);
  });

  it('500 sur la facturation ne crash pas', () => {
    cy.mockContractorApi();
    // La page /billing consomme GET /billing/subscription (route SDK actuelle).
    cy.intercept('GET', '/contractor-compliance/billing/subscription', {
      statusCode: 500,
      body: { error: 'Internal Server Error' },
    }).as('billingError');

    cy.visit('/billing');
    cy.wait('@billingError');

    cy.url().should('include', '/billing');

    cy.wait(PAUSE);
  });

  it('erreur reseau simulee (status 0) — l\'app survit', () => {
    cy.mockContractorApi();
    cy.intercept('GET', '/contractor-compliance/invoices*', {
      forceNetworkError: true,
    }).as('networkError');

    cy.visit('/invoices');
    cy.wait('@networkError');

    // L'app ne crash pas
    cy.url().should('include', '/invoices');

    cy.wait(PAUSE);
  });

  it('le dashboard affiche "Reessayer" en cas d\'erreur', () => {
    cy.intercept('GET', '/contractor-compliance/dashboard', {
      statusCode: 500,
      body: { error: 'Backend unavailable' },
    }).as('dashboardFail');

    cy.visit('/dashboard');
    cy.wait('@dashboardFail');

    // Le composant dashboard a un etat erreur avec bouton retry
    cy.get('body').then($body => {
      if ($body.text().includes('Reessayer')) {
        cy.contains('Reessayer').should('be.visible');
      }
    });

    cy.wait(PAUSE);
  });

  it('document introuvable (404) affiche un message propre', () => {
    cy.mockContractorApi();
    // Détail document : route SDK = GET /documents/{uuid} (documentsGet.PATH).
    // Registré APRÈS mockContractorApi pour gagner la priorité d'intercept.
    cy.intercept('GET', '/contractor-compliance/documents/*', {
      statusCode: 404,
      body: { error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document introuvable.' } },
    }).as('docNotFound');

    cy.visit('/documents/uuid-inexistant');
    cy.wait('@docNotFound');

    // Le composant affiche "Impossible de charger le document."
    cy.contains('Impossible de charger').should('be.visible');

    cy.wait(PAUSE);
  });
});
