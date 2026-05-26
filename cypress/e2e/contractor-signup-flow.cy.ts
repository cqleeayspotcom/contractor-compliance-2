/// <reference types="cypress" />

/**
 * FLOW SIGNUP CONTRACTOR — /signup
 *
 * Couvre le flow 4-étapes mis en place le 2026-05-26 :
 *   1. Code d'invitation
 *   2. Identité (prénom + nom + téléphone + email)
 *   3. OTP (PIN reçu par SMS)
 *   4. Succès
 *
 * Tous les appels backend sont STUBBÉS via `cy.intercept` — aucun SMS réel
 * n'est envoyé, le test peut tourner offline. Le numéro utilisé est un
 * numéro BIDON (`06 11 22 33 44` → P33611223344) clairement synthétique
 * pour éviter toute confusion avec un vrai contractor.
 *
 * Objectifs couverts :
 *   - flow heureux end-to-end (code → identité → OTP → succès)
 *   - UX feedback : clic sur "Recevoir le code par SMS" avec form vide
 *     → message d'erreur global + icônes rouges + hints par champ
 *   - validation backend : 401 SIGNUP_PIN_MISMATCH au signup → erreur
 *     affichée, l'utilisateur revient à l'étape OTP pour ressaisir
 *
 * Important : le test bidon ne couvre PAS le cas où le user tape un
 * numéro mal formaté (déjà couvert par les validateurs `isPhoneValid`)
 * ni les rate-limits backend (testés en intégration côté backend).
 */

const FAKE_PHONE_UI = '0611223344';          // ce que l'artisan tape
const FAKE_PHONE_P33 = 'P33611223344';        // ce que le backend reçoit
const FAKE_EMAIL = 'jean.test@example.invalid';
const FAKE_FIRSTNAME = 'Jean';
const FAKE_LASTNAME = 'Test';
const VALID_CODE = 'AB23';                    // 4 chars [A-HJ-NP-Z2-9]
const FAKE_PIN = '123456';

const EP = {
  check:      '/contractor-compliance/invitation-codes/check*',
  requestPin: '/contractor-compliance/signup/request-pin',
  signup:     '/contractor-compliance/signup',
};

// Le backend renvoie toujours l'enveloppe `{ success, data }` (cf. ApiEnvelope
// concern). On factorise pour éviter les divergences silencieuses entre tests.
const ok = (data: unknown) => ({ statusCode: 200, body: { success: true, data } });
const created = (data: unknown) => ({ statusCode: 201, body: { success: true, data } });
const err = (status: number, code: string, message: string) => ({
  statusCode: status,
  body: { success: false, error: { code, message } },
});

describe('Signup contractor — flow complet avec numéro bidon', () => {
  beforeEach(() => {
    // /invitation-codes/check : pré-validation du code, le frontend en a
    // besoin avant de passer à l'étape identité.
    cy.intercept('GET', EP.check, ok({ valid: true })).as('checkCode');
  });

  it('réussit le flow end-to-end (code → identité → OTP → succès)', () => {
    // Stubs des deux POST signup. On utilise des stubs DIFFÉRENTS pour
    // chaque appel afin de pouvoir asserter le body envoyé.
    cy.intercept('POST', EP.requestPin, created({ sent: true })).as('requestPin');
    cy.intercept('POST', EP.signup, created({
      session_id: 'cypress-fake-session-uid',
      contractor: { uuid: 'cypress-fake-uuid', phone: FAKE_PHONE_P33, first_name: FAKE_FIRSTNAME, last_name: FAKE_LASTNAME },
      invitation: { code_used: VALID_CODE },
      next: 'upload_missing_documents',
    })).as('signup');

    cy.visit('/signup');

    // ── Étape 1 : code ─────────────────────────────────────────────────
    cy.contains('Bienvenue chez Tuita').should('be.visible');
    cy.get('#signup-code').type(VALID_CODE);
    cy.contains('button', 'Vérifier mon code').click();
    cy.wait('@checkCode');
    cy.contains('Ton code').should('contain.text', VALID_CODE);

    // ── Étape 2 : identité ─────────────────────────────────────────────
    cy.contains('Ton numéro et ton email').should('be.visible');
    cy.get('input[autocomplete="given-name"]').type(FAKE_FIRSTNAME);
    cy.get('input[autocomplete="family-name"]').type(FAKE_LASTNAME);
    cy.get('input[autocomplete="tel"]').type(FAKE_PHONE_UI);
    cy.get('input[autocomplete="email"]').type(FAKE_EMAIL);
    cy.contains('button', 'Recevoir le code par SMS').click();

    // Vérifie que le frontend envoie bien le payload aligné backend.
    cy.wait('@requestPin').its('request.body').should((body) => {
      expect(body.code).to.eq(VALID_CODE);
      expect(body.phone).to.eq(FAKE_PHONE_P33);
      expect(body.email).to.eq(FAKE_EMAIL);
      expect(body.first_name).to.eq(FAKE_FIRSTNAME);
      expect(body.last_name).to.eq(FAKE_LASTNAME);
    });

    // ── Étape 3 : OTP ──────────────────────────────────────────────────
    cy.contains('Ton code par SMS').should('be.visible');
    cy.contains(`Code envoyé au`).should('be.visible');
    cy.get('#signup-pincode').type(FAKE_PIN);
    cy.contains('button', 'Créer mon compte').click();

    // Le backend reçoit le PIN saisi en plus du reste.
    cy.wait('@signup').its('request.body').should((body) => {
      expect(body.pincode).to.eq(FAKE_PIN);
      expect(body.phone).to.eq(FAKE_PHONE_P33);
      expect(body.code).to.eq(VALID_CODE);
      expect(body.first_name).to.eq(FAKE_FIRSTNAME);
      expect(body.last_name).to.eq(FAKE_LASTNAME);
    });

    // ── Étape 4 : succès ───────────────────────────────────────────────
    cy.contains("C'est bon, bienvenue").should('be.visible');
  });

  it('UX : clic sur "Recevoir le code par SMS" avec form vide → erreurs explicites, aucun appel backend', () => {
    // Spy pour vérifier qu'AUCUN POST request-pin ne part en l'absence
    // de complétude form (anti-régression UX).
    cy.intercept('POST', EP.requestPin, cy.spy().as('requestPinSpy'));

    cy.visit('/signup');
    cy.get('#signup-code').type(VALID_CODE);
    cy.contains('button', 'Vérifier mon code').click();
    cy.wait('@checkCode');

    // Clic sans rien remplir.
    cy.contains('button', 'Recevoir le code par SMS').click();

    // Messages d'erreur explicites (par champ + global).
    cy.contains('Ton prénom est obligatoire.').should('be.visible');
    cy.contains('Ton nom est obligatoire.').should('be.visible');
    cy.contains('Ton numéro est obligatoire.').should('be.visible');
    cy.contains('Ton email est obligatoire.').should('be.visible');
    cy.contains('Remplis tous les champs').should('be.visible');

    // L'appel backend n'a PAS été déclenché — le clic affiche les
    // erreurs sans rien envoyer.
    cy.get('@requestPinSpy').should('not.have.been.called');
  });

  it('PIN incorrect : 401 SIGNUP_PIN_MISMATCH → erreur visible, user reste sur l\'étape OTP', () => {
    cy.intercept('POST', EP.requestPin, created({ sent: true })).as('requestPin');
    cy.intercept('POST', EP.signup, err(401, 'SIGNUP_PIN_MISMATCH', 'Code SMS incorrect.')).as('signupFail');

    cy.visit('/signup');
    cy.get('#signup-code').type(VALID_CODE);
    cy.contains('button', 'Vérifier mon code').click();
    cy.wait('@checkCode');

    cy.get('input[autocomplete="given-name"]').type(FAKE_FIRSTNAME);
    cy.get('input[autocomplete="family-name"]').type(FAKE_LASTNAME);
    cy.get('input[autocomplete="tel"]').type(FAKE_PHONE_UI);
    cy.get('input[autocomplete="email"]').type(FAKE_EMAIL);
    cy.contains('button', 'Recevoir le code par SMS').click();
    cy.wait('@requestPin');

    cy.get('#signup-pincode').type('000000'); // PIN bidon faux
    cy.contains('button', 'Créer mon compte').click();
    cy.wait('@signupFail');

    // Le message d'erreur backend remonte tel quel via fallbackMessageFor.
    cy.contains('Code SMS incorrect').should('be.visible');
    // L'utilisateur reste sur l'étape OTP (pas de redirect vers /dashboard).
    cy.contains('Ton code par SMS').should('be.visible');
  });
});
