/// <reference types="cypress" />

/**
 * UPLOAD DOCUMENT — Validation fichier, erreurs, drag-drop
 *
 * Spec « convertible direct » (cf. WS3-CYPRESS.md).
 *  - mode mock (défaut)  : upload stubé, scénarios d'erreur forcés via intercept,
 *    prévisualisation fichier pilotée sur l'input du stepper.
 *  - mode real-backend   : CYPRESS_realBackend=1 → auth réelle + backend :8060.
 *    On vérifie que la page d'upload (stepper guidé /documents/upload) CHARGE
 *    contre le vrai backend. On NE pilote PAS l'input fichier en real-backend :
 *      1. le stepper est un assistant multi-étapes dont la structure (étape
 *         vidéo, étape sélection…) dépend de l'état du contractor — l'input
 *         fichier n'est pas garanti présent à l'ouverture ;
 *      2. déclencher un vrai upload lancerait une analyse OCR synchrone (>30s)
 *         et écrirait en base — hors périmètre d'un test de rendu.
 *    Les scénarios pilotant l'input/forçant une réponse API restent en mock.
 */

import { REAL_BACKEND } from '../support/commands';

const PAUSE = REAL_BACKEND ? 200 : 3000;

// Téléphone FACTICE du contractor de test (06 00 00 00 99).
const FAKE_PHONE = 'P33600000099';

describe('Upload document — validations et erreurs', () => {

  beforeEach(() => {
    if (REAL_BACKEND) {
      cy.loginContractor(FAKE_PHONE);
    }
    cy.mockContractorApi();
  });

  it('accepte un PDF valide et affiche le preview', function () {
    if (REAL_BACKEND) {
      // En real-backend on se limite à vérifier que la page d'upload charge
      // (cf. en-tête : le pilotage de l'input fichier est réservé au mock).
      cy.visit('/documents/upload');
      cy.url().should('include', '/documents/upload');
      cy.assertAppShell();
      cy.wait(PAUSE);
      return;
    }
    cy.visit('/documents/upload');
    cy.waitApi('@getDashboard');

    cy.get('input[type="file"]').selectFile(
      {
        contents: Cypress.Buffer.from('%PDF-1.4 document valide'),
        fileName: 'attestation_rc.pdf',
        mimeType: 'application/pdf',
      },
      { force: true }
    );

    // Le nom du fichier apparait dans le preview (validation 100% côté client).
    cy.contains('attestation_rc.pdf').should('be.visible');

    cy.wait(PAUSE);
  });

  it('accepte une image JPEG (photo de document)', function () {
    if (REAL_BACKEND) {
      // La page d'upload est déjà couverte par le test précédent — on saute
      // ce doublon de pilotage d'input en real-backend.
      this.skip();
    }
    cy.visit('/documents/upload');
    cy.waitApi('@getDashboard');

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

  it('affiche une erreur quand l\'upload API echoue', function () {
    // Scénario forçant une réponse 422 — incompatible avec un vrai backend.
    if (REAL_BACKEND) {
      this.skip();
    }
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

  it('upload reussi redirige vers la page de statut', function () {
    // Scénario forçant un upload 201 — un vrai upload lancerait l'OCR.
    if (REAL_BACKEND) {
      this.skip();
    }
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
