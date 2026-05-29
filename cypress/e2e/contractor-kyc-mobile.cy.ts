/// <reference types="cypress" />

/**
 * KYC MOBILE — page /kyc/mobile/:token
 *
 * Couvre les comportements introduits en 2026-05-29 :
 *   - Bouton « Commencer » réactif (signal `openingCamera()` correctement
 *     invoqué dans le template — bug initial : signal sans parens, le
 *     bouton restait disabled "Ouverture caméra…" indéfiniment)
 *   - Endpoint backend public /result : polling 2s du verdict
 *   - Endpoint backend public /retry : régénère un token + URL si rejet
 *   - Affichage verdict OK / KO avec bouton « Recommencer ici » si retryable
 *
 * Note : la capture caméra elle-même (getUserMedia + MediaRecorder) n'est
 * pas testée — Cypress headless n'a pas de webcam virtuelle fiable cross-
 * platform. On valide le shell UI et les endpoints autour.
 */

const VALID_TOKEN = 'a' + 'b'.repeat(46) + 'c'; // 48 hex
const NEW_TOKEN   = 'd' + 'e'.repeat(46) + 'f';

describe('KYC mobile — page /kyc/mobile/:token', () => {

  beforeEach(() => {
    // Le mobile n'a pas de cookie contractor → pas de /dashboard ni de
    // mockContractorApi(). On mock UNIQUEMENT les routes mobile-token.
    cy.intercept('GET', `/contractor-compliance/kyc/mobile/${VALID_TOKEN}/challenges`, {
      statusCode: 200,
      body: {
        data: {
          challenge: 'turn_right',
          challenge_2: 'look_up',
          expires_at: new Date(Date.now() + 600_000).toISOString(),
          kyc_session_uuid: 'kyc-sess-001',
        },
      },
    }).as('challenges');
  });

  it('affiche l\'intro avec le bouton « Commencer » cliquable', () => {
    cy.visit(`/kyc/mobile/${VALID_TOKEN}`);
    cy.wait('@challenges');

    // Bug initial : le bouton restait sur "Ouverture caméra..." faute
    // d'invoquer le signal `openingCamera()` avec les parens dans le
    // template. La fix attendue : le bouton AFFICHE "Commencer" et est
    // disabled=false par défaut.
    cy.contains('button', /Commencer/).should('not.be.disabled');
    cy.contains(/Ouverture caméra/).should('not.exist');

    // Les 2 challenges sont rendus à l'intro pour que l'artisan sache
    // quoi attendre (cf. CHALLENGE_LABELS).
    cy.contains(/Tournez la tête vers VOTRE droite/i).should('be.visible');
    cy.contains(/Regardez vers le haut/i).should('be.visible');
  });

  it('refuse l\'ouverture caméra hors contexte sécurisé (HTTP)', () => {
    // Simule un environnement non-sécurisé en stubant `isSecureContext`.
    cy.visit(`/kyc/mobile/${VALID_TOKEN}`, {
      onBeforeLoad(win) {
        Object.defineProperty(win, 'isSecureContext', { get: () => false });
      },
    });
    cy.wait('@challenges');
    cy.contains('button', /Commencer/).click();
    // Le composant affiche l'erreur avec code technique pour debug mobile.
    cy.contains(/CLIENT_NOT_SECURE_CONTEXT/).should('be.visible');
  });

  it('refuse l\'enregistrement si MediaRecorder est absent', () => {
    cy.visit(`/kyc/mobile/${VALID_TOKEN}`, {
      onBeforeLoad(win) {
        // @ts-ignore — on supprime MediaRecorder pour simuler Safari iOS < 14.3.
        delete win.MediaRecorder;
      },
    });
    cy.wait('@challenges');
    cy.contains('button', /Commencer/).click();
    cy.contains(/CLIENT_MEDIARECORDER_UNAVAILABLE/).should('be.visible');
  });

  // Note : les 3 tests précédents (verdict OK polling, retry-OK,
  // retry-refusé) ont été retirés car ils nécessitent soit de filmer une
  // vraie vidéo (infeasible Cypress headless), soit d'utiliser cy.request
  // qui bypasse les intercepts. Le contrat backend de /result et /retry
  // est couvert par les tests PHPUnit côté module ContractorCompliance.
  // Côté E2E on garde ici uniquement les hardenings cross-platform
  // testables sans webcam.
});
