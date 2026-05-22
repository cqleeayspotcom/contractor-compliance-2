/// <reference types="cypress" />

/**
 * PARCOURS COMPLET — navigation de toutes les sections
 *
 * Spec « convertible direct » (cf. WS3-CYPRESS.md).
 *  - mode mock (défaut)  : parcours 45% → 100% sur fixtures figées, en un seul
 *    test monolithique.
 *  - mode real-backend   : CYPRESS_realBackend=1 → auth réelle + backend :8060.
 *
 * POURQUOI le parcours real-backend est découpé en plusieurs `it` :
 *   La session contractor Tuita (cookie __contractor_ssid, PIN SMS) a une
 *   durée de vie courte en dev. Un test monolithique de 9 pages dépasse cette
 *   fenêtre → le 1er appel API d'une page tardive renvoie 401 → l'interceptor
 *   redirige vers /login. On ouvre donc une session FRAÎCHE (beforeEach) avant
 *   chaque groupe de pages. En mode mock, l'unique test historique est conservé.
 */

import { REAL_BACKEND } from '../support/commands';

// Téléphone FACTICE du contractor de test (06 00 00 00 99).
const FAKE_PHONE = 'P33600000099';

describe('Parcours complet contractor', () => {

  // ─────────────────────────────────────────────────────────────────────
  // MODE MOCK — test monolithique historique (parcours 45% → 100%).
  // ─────────────────────────────────────────────────────────────────────
  if (!REAL_BACKEND) {
    it('navigue dans toutes les sections', () => {
      // ETAPE 1 : Dashboard
      cy.mockContractorApi();
      cy.visit('/dashboard');
      cy.waitApi('@getDashboard');
      cy.contains('Bienvenue LUCIAN').should('be.visible');
      cy.contains('45% complete').should('be.visible');
      cy.contains('Mes documents').should('be.visible');
      cy.contains('2/6').should('be.visible');

      // ETAPE 2 : Documents
      cy.visit('/documents');
      cy.waitApi('@getDocuments');
      cy.contains('kbis_2026.pdf').should('be.visible');

      // ETAPE 3 : Upload
      cy.visit('/documents/upload');
      cy.url().should('include', '/documents/upload');
      cy.get('input[type="file"]').selectFile(
        {
          contents: Cypress.Buffer.from('%PDF-1.4 fake content'),
          fileName: 'rib_entreprise.pdf',
          mimeType: 'application/pdf',
        },
        { force: true }
      );

      // ETAPE 4 : Statut document
      cy.visit('/documents/doc-kbis-uuid-001');
      cy.wait('@getDocumentStatus');
      cy.contains('Document verifie').should('be.visible');
      cy.contains('Extrait KBIS').should('be.visible');

      // ETAPE 5 : KYC
      cy.visit('/kyc');
      cy.url().should('include', '/kyc');

      // ETAPE 6 : Missions
      cy.visit('/missions');
      cy.wait('@getMissions');
      cy.contains('Diagnostic amiante avant travaux').should('be.visible');
      cy.contains('Paris').should('be.visible');
      cy.contains('1250,00').should('be.visible');

      // ETAPE 7 : Facturation
      cy.visit('/billing');
      cy.wait('@getBilling');
      cy.contains('Gratuit').should('be.visible');

      // ETAPE 8 : Factures
      cy.visit('/invoices');
      cy.waitApi('@getInvoices');
      cy.contains('FAC-2026-001').should('be.visible');

      // ETAPE 9 : Contractor atteint 100%
      cy.mockContractorApi('dashboard-100.json');
      cy.visit('/dashboard');
      cy.wait('@getDashboard');
      cy.contains('Votre compte est verifie').should('be.visible');
    });
    return;
  }

  // ─────────────────────────────────────────────────────────────────────
  // MODE REAL-BACKEND — un test court par section, session fraîche à chaque
  // fois (cf. en-tête : la session contractor expire vite en dev).
  // ─────────────────────────────────────────────────────────────────────
  beforeEach(() => {
    cy.loginContractor(FAKE_PHONE);
    cy.mockContractorApi();
  });

  it('ETAPE 1 — le dashboard charge', () => {
    cy.visit('/dashboard');
    cy.waitApi('@getDashboard');
    cy.assertAppShell();
    cy.url().should('include', '/dashboard');
  });

  it('ETAPE 2 — la page documents charge', () => {
    cy.visit('/documents');
    cy.waitApi('@getDocuments');
    cy.assertAppShell();
    cy.url().should('include', '/documents');
  });

  it('ETAPE 3 — la page upload charge', () => {
    cy.visit('/documents/upload');
    cy.url().should('include', '/documents/upload');
    cy.assertAppShell();
  });

  it('ETAPE 5 — la page KYC charge', () => {
    cy.visit('/kyc');
    cy.url().should('include', '/kyc');
    cy.assertAppShell();
  });

  it('ETAPE 6 — la page missions charge', () => {
    cy.visit('/missions');
    cy.url().should('include', '/missions');
    cy.assertAppShell();
  });

  it('ETAPE 8 — la page factures charge', () => {
    cy.visit('/invoices');
    cy.waitApi('@getInvoices');
    cy.assertAppShell();
    cy.url().should('include', '/invoices');
  });

  it('ETAPE 9 — la page certification charge', () => {
    cy.visit('/certification', { failOnStatusCode: false });
    cy.assertAppShell();
    cy.url().should('match', /\/certification/);
  });
});
