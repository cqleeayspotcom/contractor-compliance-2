/// <reference types="cypress" />

/**
 * DEMO VISUELLE — Parcours contractor au ralenti
 *
 * Ce spec est concu pour etre lance dans Cypress GUI.
 * Chaque page reste affichee 3 secondes pour que l'utilisateur
 * puisse voir le rendu complet avant de passer a la suivante.
 */

const PAUSE = 3000; // 3 secondes par page

describe('DEMO — Parcours contractor au ralenti', () => {

  beforeEach(() => {
    cy.mockContractorApi();
  });

  it('Etape 1 — Dashboard a 45%', () => {
    cy.visit('/dashboard');
    cy.wait('@getDashboard');
    cy.contains('Bienvenue LUCIAN').should('be.visible');
    cy.contains('45% complete').should('be.visible');
    cy.contains('2/6').should('be.visible');
    cy.wait(PAUSE);
  });

  it('Etape 2 — Liste des documents', () => {
    cy.visit('/documents');
    cy.wait('@getDocuments');
    cy.contains('kbis_2026.pdf').should('be.visible');
    cy.contains('attestation_rc_pro.pdf').should('be.visible');
    cy.wait(PAUSE);
  });

  it('Etape 3 — Upload document', () => {
    cy.visit('/documents/upload');
    cy.wait('@getDashboard');
    cy.get('input[type="file"]').selectFile(
      {
        contents: Cypress.Buffer.from('%PDF-1.4 fake content'),
        fileName: 'rib_entreprise.pdf',
        mimeType: 'application/pdf',
      },
      { force: true }
    );
    cy.wait(PAUSE);
  });

  it('Etape 4 — Statut document verifie', () => {
    cy.visit('/documents/doc-kbis-uuid-001');
    cy.wait('@getDocumentStatus');
    cy.contains('Document verifie').should('be.visible');
    cy.contains('Extrait KBIS').should('be.visible');
    cy.contains('95%').should('be.visible');
    cy.wait(PAUSE);
  });

  it('Etape 5 — Page KYC', () => {
    cy.visit('/kyc');
    cy.wait('@getDashboard');
    cy.url().should('include', '/kyc');
    cy.wait(PAUSE);
  });

  it('Etape 6 — Missions', () => {
    cy.visit('/missions');
    cy.wait('@getMissions');
    cy.contains('Diagnostic amiante avant travaux').should('be.visible');
    cy.contains('Paris').should('be.visible');
    cy.contains('1250,00').should('be.visible');
    cy.contains('1250,00').should('be.visible');
    cy.wait(PAUSE);
  });

  it('Etape 7 — Facturation', () => {
    cy.visit('/billing');
    cy.wait('@getBilling');
    cy.contains('Gratuit').should('be.visible');
    cy.wait(PAUSE);
  });

  it('Etape 8 — Factures', () => {
    cy.visit('/invoices');
    cy.wait('@getInvoices');
    cy.contains('FAC-2026-001').should('be.visible');
    cy.contains('FAC-2026-002').should('be.visible');
    cy.contains('Mes factures').should('be.visible');
    cy.wait(PAUSE);
  });

  it('Etape 9 — Certification', () => {
    cy.visit('/certification');
    cy.wait('@getDashboard');
    cy.url().should('include', '/certification');
    cy.wait(PAUSE);
  });

  it('Etape 11 — Dashboard 100% verifie', () => {
    cy.mockContractorApi('dashboard-100.json');
    cy.visit('/dashboard');
    cy.wait('@getDashboard');
    cy.contains('Votre compte est verifie').should('be.visible');
    cy.contains('Complet').should('be.visible');
    cy.wait(PAUSE);
  });

  it('Etape 12 — Page 404', () => {
    cy.visit('/page-inexistante', { failOnStatusCode: false });
    cy.url().should('include', '/page-inexistante');
    cy.wait(PAUSE);
  });
});
