/// <reference types="cypress" />

/**
 * SMOKE real-backend — valide l'infrastructure du mode real-backend.
 *
 * Ce spec ne teste PAS l'UI : il vérifie que le toggle, cy.task (lecture PIN)
 * et cy.loginContractor fonctionnent contre le vrai backend. À lancer
 * uniquement en mode real-backend (CYPRESS_realBackend=1). En mode mock il
 * est sauté (les tâches/back-end ne sont pas requis).
 *
 * Préfixe `_` : trié en tête, sert de garde avant les specs métier.
 */

// Normalisation identique à REAL_BACKEND (commands.ts) — couvre string/number/bool.
const REAL = ['1', 'true'].includes(String(Cypress.env('realBackend')).toLowerCase());

// Téléphone FACTICE du contractor seed Anthony Imbert (06 00 00 00 99).
const FAKE_PHONE = 'P33600000099';

describe('Smoke real-backend — infrastructure', () => {
  it('lit le PIN contractor via cy.task', function () {
    if (!REAL) {
      this.skip();
    }
    // request-pin d'abord pour garantir qu'un PIN frais existe en DB.
    cy.request('POST', '/contractor/auth/pin', { smsphone: FAKE_PHONE })
      .its('status')
      .should('eq', 200);
    cy.task<string>('readContractorPin', FAKE_PHONE).should('match', /^\d{4,8}$/);
  });

  it('authentifie le contractor et accède au dashboard', function () {
    if (!REAL) {
      this.skip();
    }
    cy.loginContractor(FAKE_PHONE);
    // Le dashboard real-backend répond 200 avec une enveloppe { data: {...} }.
    cy.request('/contractor-compliance/dashboard').then((r) => {
      expect(r.status).to.eq(200);
      expect(r.body).to.have.property('data');
      expect(r.body.data).to.have.property('compliance');
    });
  });
});
