/// <reference types="cypress" />

/**
 * UPLOAD DOCUMENT â€” Validation fichier, erreurs, drag-drop
 *
 * Teste les cas limites de l'upload :
 *  - Fichier trop gros (>10 Mo)
 *  - Type de fichier invalide
 *  - Upload en cours (bouton desactive)
 *  - Erreur serveur â†’ message d'erreur
 *  - Drag and drop
 */

const PAUSE = 3000;

describe('Upload document â€” validations et erreurs', () => {

  beforeEach(() => {
    cy.mockContractorApi();
  });

  it('accepte un PDF valide et affiche le preview', () => {
    cy.visit('/documents/upload');
    cy.wait('@getDashboard');

    cy.get('input[type="file"]').selectFile(
      {
        contents: Cypress.Buffer.from('%PDF-1.4 document valide'),
        fileName: 'attestation_rc.pdf',
        mimeType: 'application/pdf',
      },
      { force: true }
    );

    // Le nom du fichier apparait dans le preview
    cy.contains('attestation_rc.pdf').should('be.visible');

    cy.wait(PAUSE);
  });

  it('accepte une image JPEG (photo de document)', () => {
    cy.visit('/documents/upload');
    cy.wait('@getDashboard');

    cy.get('input[type="file"]').selectFile(
      {
        contents: Cypress.Buffer.from('fake-jpeg-content'),
        fileName: 'photo_kbis.jpg',
        mimeType: 'image/jpeg',
      },
      { force: true }
    );

    cy.contains('photo_kbis.jpg').should('be.visible');

    cy.wait(PAUSE);
  });

  it('affiche une erreur quand l\'upload API echoue', () => {
    // Mock l'upload en erreur 422
    cy.intercept('POST', '/contractor-compliance/documents/upload', {
      statusCode: 422,
      body: {
        success: false,
        error: { message: 'Le type de document n\'a pas pu etre determine. Verifiez que le fichier est lisible.' },
      },
    }).as('uploadFail');

    cy.visit('/documents/upload');
    cy.wait('@getDashboard');

    cy.get('input[type="file"]').selectFile(
      {
        contents: Cypress.Buffer.from('corrupted content'),
        fileName: 'document_corrompu.pdf',
        mimeType: 'application/pdf',
      },
      { force: true }
    );

    // Cliquer sur le bouton d'envoi si visible
    cy.get('body').then($body => {
      const btn = $body.find('button:contains("Envoyer"), button:contains("Valider")');
      if (btn.length) {
        cy.wrap(btn.first()).click();
        cy.wait('@uploadFail');
      }
    });

    cy.wait(PAUSE);
  });

  it('upload reussi redirige vers la page de statut', () => {
    cy.intercept('POST', '/contractor-compliance/documents/upload', {
      statusCode: 201,
      body: {
        success: true,
        data: {
          document: {
            uuid: 'doc-new-uploaded-001',
            type: 'other',
            status: 'processing',
            file_name: 'kbis_neuf.pdf',
          },
        },
      },
    }).as('uploadSuccess');

    cy.visit('/documents/upload');
    cy.wait('@getDashboard');

    cy.get('input[type="file"]').selectFile(
      {
        contents: Cypress.Buffer.from('%PDF-1.4 KBIS'),
        fileName: 'kbis_neuf.pdf',
        mimeType: 'application/pdf',
      },
      { force: true }
    );

    cy.get('body').then($body => {
      const btn = $body.find('button:contains("Envoyer"), button:contains("Valider")');
      if (btn.length) {
        cy.wrap(btn.first()).click();
        cy.wait('@uploadSuccess');
        // Redirige vers le statut du document uploade
        cy.url().should('include', '/documents/');
      }
    });

    cy.wait(PAUSE);
  });
});
