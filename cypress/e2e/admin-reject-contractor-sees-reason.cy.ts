/// <reference types="cypress" />

/**
 * PARCOURS COMPLET REJET → CONTRACTOR VOIT LE MOTIF → CORRECTION
 *
 * Ce que l'artisan voit quand l'admin rejete son document :
 *
 *  1. L'admin rejete la RC Pro de PIERRE MARTIN
 *     → motif : "Document illisible - scan de mauvaise qualite..."
 *
 *  2. Le contractor PIERRE MARTIN se connecte
 *     → Dashboard affiche le rejet
 *     → Page document affiche le motif EXACT de l'admin
 *     → Bouton "Renvoyer un document"
 *
 *  3. Le contractor re-uploade un nouveau scan
 *
 *  4. Apres verification → document approuve
 */

const PAUSE = 3000;

describe('Rejet admin → le contractor voit le motif exact', () => {

  it('Etape 1 — Le contractor voit "Document refuse" avec le motif de l\'admin', () => {
    cy.mockContractorApi();

    // Override le statut du document pour montrer le rejet
    cy.intercept('GET', '/contractor-compliance/documents/*', {
      fixture: 'document-status-rejected.json',
    }).as('getDocumentStatus');

    cy.visit('/documents/doc-rc-uuid-004');
    cy.wait('@getDocumentStatus');

    // Titre — libellé accentué « Document refusé » (code de rejet
    // manual_review_rejected non mappé → fallback titre générique +
    // failure_detail affiché en sous-titre).
    cy.contains('Document refusé').should('be.visible');

    // LE MOTIF DE L'ADMIN EST AFFICHE AU CONTRACTOR
    cy.contains('Document illisible').should('be.visible');
    cy.contains('scan de mauvaise qualite').should('be.visible');
    cy.contains('renvoyer un PDF net').should('be.visible');

    // Nom du fichier rejete
    cy.contains('rc_pro_martin.pdf').should('be.visible');

    // Type
    cy.contains('RC Pro').should('be.visible');

    // Confidence OCR basse
    cy.contains('45%').should('be.visible');

    // Bouton pour corriger
    cy.contains('Renvoyer un document').should('be.visible');

    cy.wait(PAUSE);
  });

  it('Etape 2 — Le contractor clique "Renvoyer" et uploade un nouveau scan', () => {
    cy.mockContractorApi();

    cy.intercept('GET', '/contractor-compliance/documents/*', {
      fixture: 'document-status-rejected.json',
    }).as('getDocumentStatus');

    cy.visit('/documents/doc-rc-uuid-004');
    cy.wait('@getDocumentStatus');

    // Cliquer sur "Renvoyer un document" → retour a la liste documents
    cy.contains('Renvoyer un document').click();
    cy.url().should('include', '/documents');

    cy.wait(PAUSE);
  });

  it('Etape 3 — Le contractor uploade le nouveau scan corrige', () => {
    cy.mockContractorApi();
    cy.visit('/documents/upload');
    cy.dismissStepperVideo();
    cy.openStepperUploadZone();

    cy.get('input[type="file"]', { timeout: 15000 }).last().selectFile(
      {
        contents: Cypress.Buffer.from('%PDF-1.4 RC PRO\nATTESTATION RC PROFESSIONNELLE\nMARTIN PLOMBERIE\nSIRET: 55566677700012\nValide du 01/01/2026 au 31/12/2026'),
        fileName: 'rc_pro_martin_corrige.pdf',
        mimeType: 'application/pdf',
      },
      { force: true }
    );

    cy.wait('@uploadDocument');
    cy.wait(PAUSE);
  });

  it('Etape 4 — Le document est maintenant verifie', () => {
    cy.mockContractorApi();

    // Le document est passe en "verified" apres le re-upload
    cy.intercept('GET', '/contractor-compliance/documents/*', {
      fixture: 'document-status.json', // kbis verified (on reutilise)
    }).as('getDocumentStatus');

    cy.visit('/documents/doc-rc-uuid-004');
    cy.wait('@getDocumentStatus');

    cy.contains('Document vérifié').should('be.visible');
    cy.contains('Retour au tableau de bord').should('be.visible');

    cy.wait(PAUSE);
  });
});
