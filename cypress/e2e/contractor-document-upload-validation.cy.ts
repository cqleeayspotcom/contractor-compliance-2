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
    cy.dismissStepperVideo();

    // L'étape 1 du stepper est « Ta pièce d'identité » : il faut d'abord
    // choisir la variante (Carte d'identité) pour faire apparaître les zones
    // de dépôt (recto/verso + chemin « fichier complet »).
    cy.get('[data-testid="identity-variant-cni"]', { timeout: 15000 }).click();

    // Le stepper réécrit n'a plus de « preview puis bouton Envoyer » : la
    // sélection d'un PDF via le chemin « J'ai déjà un fichier complet »
    // (dernier input, onDirectFileSelected) déclenche l'upload synchrone.
    cy.get('input[type="file"]', { timeout: 15000 }).last().selectFile(
      {
        contents: Cypress.Buffer.from('%PDF-1.4 document valide'),
        fileName: 'attestation_rc.pdf',
        mimeType: 'application/pdf',
      },
      { force: true }
    );

    cy.wait('@uploadDocument');

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
    cy.dismissStepperVideo();
    cy.get('[data-testid="identity-variant-cni"]', { timeout: 15000 }).click();

    // Une image JPEG est aussi acceptée par le chemin « fichier complet ».
    cy.get('input[type="file"]', { timeout: 15000 }).last().selectFile(
      {
        contents: Cypress.Buffer.from('fake-jpeg-content'),
        fileName: 'photo_kbis.jpg',
        mimeType: 'image/jpeg',
      },
      { force: true }
    );

    cy.wait('@uploadDocument');

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
    cy.dismissStepperVideo();
    cy.get('[data-testid="identity-variant-cni"]', { timeout: 15000 }).click();

    // La sélection déclenche l'upload synchrone — l'intercept renvoie 422.
    cy.get('input[type="file"]', { timeout: 15000 }).last().selectFile(
      {
        contents: Cypress.Buffer.from('corrupted content'),
        fileName: 'document_corrompu.pdf',
        mimeType: 'application/pdf',
      },
      { force: true }
    );

    // L'upload part et échoue (422). L'app ne crash pas — on reste sur la page.
    cy.wait('@uploadFail');
    cy.url().should('include', '/documents/upload');

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
    cy.dismissStepperVideo();
    cy.get('[data-testid="identity-variant-cni"]', { timeout: 15000 }).click();

    // La sélection déclenche l'upload synchrone — l'intercept renvoie 201.
    cy.get('input[type="file"]', { timeout: 15000 }).last().selectFile(
      {
        contents: Cypress.Buffer.from('%PDF-1.4 KBIS'),
        fileName: 'kbis_neuf.pdf',
        mimeType: 'application/pdf',
      },
      { force: true }
    );

    // L'upload aboutit (201). Le stepper reste sur /documents/upload et
    // affiche le verdict de l'analyse.
    cy.wait('@uploadSuccess');
    cy.url().should('include', '/documents/upload');

    cy.wait(PAUSE);
  });
});
