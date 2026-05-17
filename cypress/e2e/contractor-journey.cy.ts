/// <reference types="cypress" />

/**
 * PARCOURS COMPLET — de 45% a 100% conformite
 *
 * Simule le vrai parcours d'un artisan qui arrive sur le portail,
 * consulte chaque section, upload un document, et finit a 100%.
 */

describe('Parcours complet contractor — de 45% a 100%', () => {
  it('navigue dans toutes les sections puis atteint 100%', () => {
    // ── ETAPE 1 : Dashboard a 45% ──
    cy.mockContractorApi();
    cy.visit('/dashboard');
    cy.wait('@getDashboard');

    cy.contains('Bienvenue LUCIAN').should('be.visible');
    cy.contains('45% complete').should('be.visible');
    cy.contains('Mes documents').should('be.visible');
    cy.contains('2/6').should('be.visible');

    // ── ETAPE 2 : Consulter les documents ──
    cy.visit('/documents');
    cy.wait('@getDocuments');
    cy.contains('kbis_2026.pdf').should('be.visible');

    // ── ETAPE 3 : Upload un nouveau document ──
    cy.visit('/documents/upload');
    cy.get('input[type="file"]').selectFile(
      {
        contents: Cypress.Buffer.from('%PDF-1.4 fake content'),
        fileName: 'rib_entreprise.pdf',
        mimeType: 'application/pdf',
      },
      { force: true }
    );

    // ── ETAPE 4 : Voir le statut d'un document verifie ──
    cy.visit('/documents/doc-kbis-uuid-001');
    cy.wait('@getDocumentStatus');
    cy.contains('Document verifie').should('be.visible');
    cy.contains('Extrait KBIS').should('be.visible');

    // ── ETAPE 5 : Page KYC ──
    cy.visit('/kyc');
    cy.url().should('include', '/kyc');

    // ── ETAPE 6 : Missions ──
    cy.visit('/missions');
    cy.wait('@getMissions');
    cy.contains('Diagnostic amiante avant travaux').should('be.visible');
    cy.contains('Paris').should('be.visible');
    cy.contains('1250,00').should('be.visible');

    // ── ETAPE 7 : Facturation ──
    cy.visit('/billing');
    cy.wait('@getBilling');
    cy.contains('Gratuit').should('be.visible');

    // ── ETAPE 8 : Factures ──
    cy.visit('/invoices');
    cy.wait('@getInvoices');
    cy.contains('FAC-2026-001').should('be.visible');

    // ── ETAPE 9 : Contractor atteint 100% ──
    cy.mockContractorApi('dashboard-100.json');
    cy.visit('/dashboard');
    cy.wait('@getDashboard');
    cy.contains('Votre compte est verifie').should('be.visible');
  });
});
