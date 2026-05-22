/// <reference types="cypress" />

/**
 * DEMO VISUELLE — Parcours contractor au ralenti
 *
 * Spec « convertible direct » (cf. WS3-CYPRESS.md). Conçu pour être lancé
 * dans Cypress GUI : chaque page reste affichée quelques secondes.
 *
 *  - mode mock (défaut)  : pages stubées via cy.mockContractorApi().
 *  - mode real-backend   : CYPRESS_realBackend=1 → auth réelle + backend :8060.
 *    Les pauses sont raccourcies et les assertions portent sur des landmarks
 *    structurels (l'état métier réel n'est pas déterministe).
 */

import { REAL_BACKEND } from '../support/commands';

// En real-backend on raccourcit la pause (le but démo passe au second plan,
// on veut surtout un run vert raisonnablement rapide).
const PAUSE = REAL_BACKEND ? 300 : 3000;

// Téléphone FACTICE du contractor de test (06 00 00 00 99).
const FAKE_PHONE = 'P33600000099';

describe('DEMO — Parcours contractor au ralenti', () => {

  beforeEach(() => {
    if (REAL_BACKEND) {
      cy.loginContractor(FAKE_PHONE);
    }
    cy.mockContractorApi();
  });

  it('Etape 1 — Dashboard', () => {
    cy.visit('/dashboard');
    cy.waitApi('@getDashboard');
    if (REAL_BACKEND) {
      cy.assertAppShell();
      cy.url().should('include', '/dashboard');
    } else {
      cy.contains('Bonjour LUCIAN').should('be.visible');
      cy.contains('Bienvenue LUCIAN').should('be.visible');
      cy.contains('Mes chantiers').should('be.visible');
    }
    cy.wait(PAUSE);
  });

  it('Etape 2 — Liste des documents', () => {
    cy.visit('/documents');
    cy.waitApi('@getDocuments');
    if (REAL_BACKEND) {
      cy.assertAppShell();
      cy.url().should('include', '/documents');
    } else {
      cy.contains('kbis_2026.pdf').should('be.visible');
      cy.contains('attestation_rc_pro.pdf').should('be.visible');
    }
    cy.wait(PAUSE);
  });

  it('Etape 3 — Upload document', function () {
    // L'upload réel déclenche une analyse OCR synchrone — réservé au mock.
    if (REAL_BACKEND) {
      cy.visit('/documents/upload');
      cy.waitApi('@getDashboard');
      cy.url().should('include', '/documents/upload');
      cy.wait(PAUSE);
      return;
    }
    cy.visit('/documents/upload');
    cy.wait('@getDashboard');
    cy.dismissStepperVideo();
    // Étape 1 = identité : choisir la variante CNI pour révéler les zones de dépôt.
    cy.get('[data-testid="identity-variant-cni"]', { timeout: 15000 }).click();
    cy.get('input[type="file"]', { timeout: 15000 }).last().selectFile(
      {
        contents: Cypress.Buffer.from('%PDF-1.4 fake content'),
        fileName: 'rib_entreprise.pdf',
        mimeType: 'application/pdf',
      },
      { force: true }
    );
    cy.wait('@uploadDocument');
    cy.wait(PAUSE);
  });

  it('Etape 4 — Statut document verifie', function () {
    // Le statut d'un document précis dépend d'un uuid de fixture figé.
    if (REAL_BACKEND) {
      this.skip();
    }
    cy.visit('/documents/doc-kbis-uuid-001');
    cy.wait('@getDocumentStatus');
    cy.contains('Document vérifié').should('be.visible');
    cy.contains('KBIS').should('be.visible');
    cy.contains('95%').should('be.visible');
    cy.wait(PAUSE);
  });

  it('Etape 5 — Page KYC', () => {
    cy.visit('/kyc');
    cy.waitApi('@getDashboard');
    cy.url().should('include', '/kyc');
    cy.wait(PAUSE);
  });

  it('Etape 6 — Offres disponibles', () => {
    cy.visit('/missions');
    if (REAL_BACKEND) {
      cy.url().should('include', '/missions');
      cy.assertAppShell();
    } else {
      cy.waitApi('@getMissionOffers');
      cy.contains('Offres disponibles').should('be.visible');
      cy.contains('Diagnostic amiante avant travaux').should('be.visible');
      cy.contains('Paris').should('be.visible');
    }
    cy.wait(PAUSE);
  });

  it('Etape 7 — Facturation', function () {
    // /billing real-backend reste bloquée (endpoint billing/plan 404).
    if (REAL_BACKEND) {
      this.skip();
    }
    cy.visit('/billing');
    cy.wait('@getBilling');
    cy.contains('Passer en Pro').should('be.visible');
    cy.wait(PAUSE);
  });

  it('Etape 8 — Factures', () => {
    cy.visit('/invoices');
    cy.waitApi('@getInvoices');
    if (REAL_BACKEND) {
      cy.assertAppShell();
      cy.url().should('include', '/invoices');
    } else {
      cy.contains('FAC-2026-001').should('be.visible');
      cy.contains('FAC-2026-002').should('be.visible');
      cy.contains('Mes factures').should('be.visible');
      cy.contains('Payées').should('be.visible');
    }
    cy.wait(PAUSE);
  });

  it('Etape 9 — Certification', () => {
    cy.visit('/certification', { failOnStatusCode: false });
    if (REAL_BACKEND) {
      cy.assertAppShell();
      cy.url().should('match', /\/certification/);
    } else {
      cy.wait('@getDashboard');
      cy.url().should('include', '/certification');
    }
    cy.wait(PAUSE);
  });

  it('Etape 11 — Dashboard 100% verifie', function () {
    // État figé de fixture, non garantissable en real-backend.
    if (REAL_BACKEND) {
      this.skip();
    }
    cy.mockContractorApi('dashboard-100.json');
    cy.visit('/dashboard');
    cy.wait('@getDashboard');
    cy.contains('Bonjour LUCIAN').should('be.visible');
    cy.contains('Conforme').should('be.visible');
    cy.wait(PAUSE);
  });

  it('Etape 12 — Page 404', () => {
    cy.visit('/page-inexistante', { failOnStatusCode: false });
    cy.url().should('include', '/page-inexistante');
    cy.wait(PAUSE);
  });
});
