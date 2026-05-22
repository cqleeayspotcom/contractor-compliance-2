/// <reference types="cypress" />

/**
 * FLOW PLAN PROFESSIONNEL (99 EUR/mois)
 *
 * Spec « convertible direct » (cf. WS3-CYPRESS.md).
 *  - mode mock (défaut)  : parcours Pro complet sur fixtures dédiées
 *    (dashboard-pro / invoices-pro / missions-pro / billing-pro).
 *  - mode real-backend   : CYPRESS_realBackend=1 → auth réelle + backend :8060.
 *    Le plan d'un contractor real-backend dépend de la synchro smith Tuita
 *    et n'est pas garanti « pro » → en real-backend on vérifie le RENDU des
 *    pages (factures, dashboard) sans présumer du plan. Les tests qui exigent
 *    spécifiquement l'état Pro (factures auto, billing « Plan actuel ») sont
 *    sautés en real-backend et restent couverts en mode mock.
 */

import { REAL_BACKEND } from '../support/commands';

// En real-backend on raccourcit la pause d'affichage.
const PAUSE = REAL_BACKEND ? 200 : 3000;

// Téléphone FACTICE du contractor de test (06 00 00 00 99).
const FAKE_PHONE = 'P33600000099';

describe('Plan Professionnel — Flow complet', () => {

  beforeEach(() => {
    if (REAL_BACKEND) {
      cy.loginContractor(FAKE_PHONE);
      // En real-backend : spy-intercepts seuls, pas de fixtures Pro.
      cy.mockContractorApi();
    } else {
      cy.mockContractorApi({
        dashboard: 'dashboard-pro.json',
        invoices: 'invoices-pro.json',
        missions: 'missions-pro.json',
        billing: 'billing-pro.json',
      });
    }
  });

  // ═══════════════════════════════════════════
  // DASHBOARD PRO
  // ═══════════════════════════════════════════

  it('Dashboard — rendu', () => {
    cy.visit('/dashboard');
    cy.waitApi('@getDashboard');

    if (REAL_BACKEND) {
      // Shell + URL : le dashboard a chargé, sans présumer du plan/état.
      cy.assertAppShell();
      cy.url().should('include', '/dashboard');
    } else {
      // Fully verified
      cy.contains('Votre compte est verifie').should('be.visible');
      // All docs done
      cy.contains('Complet').should('be.visible');
      // KYC approved
      cy.contains('Identite verifiee').should('be.visible');
      // Certification done
      cy.contains('Certifie').should('be.visible');
      // No plan upgrade banner (can_upgrade = false)
      cy.contains('99 EUR/mois').should('not.exist');
    }

    cy.wait(PAUSE);
  });

  // ═══════════════════════════════════════════
  // MISSIONS
  // ═══════════════════════════════════════════

  it('Missions — rendu', () => {
    cy.visit('/missions');

    if (REAL_BACKEND) {
      cy.url().should('include', '/missions');
      cy.assertAppShell();
    } else {
      cy.wait('@getMissions');
      cy.contains('Mes missions').should('be.visible');
      cy.contains('Missions terminees').should('be.visible');
      cy.contains('Diagnostic amiante avant travaux').should('be.visible');
      cy.contains('DPE appartement T3').should('be.visible');
      cy.contains('Mesurage loi Carrez').should('be.visible');
      cy.contains('1250,00').should('be.visible');
      cy.contains('500,00').should('be.visible');
      cy.contains('Paris').should('be.visible');
      cy.contains('Toulouse').should('be.visible');
      cy.contains('Bordeaux').should('be.visible');
    }

    cy.wait(PAUSE);
  });

  // ═══════════════════════════════════════════
  // FACTURES
  // ═══════════════════════════════════════════

  it('Factures — rendu de la page', () => {
    cy.visit('/invoices');
    cy.waitApi('@getInvoices');

    if (REAL_BACKEND) {
      // Shell + URL : la page factures a chargé, sans présumer du contenu.
      cy.assertAppShell();
      cy.url().should('include', '/invoices');
    } else {
      // Header pour plan payant
      cy.contains('Mes factures').should('be.visible');
      cy.contains('generees automatiquement').should('be.visible');

      // 5 factures auto
      cy.contains('FAC-2026-A001').should('be.visible');
      cy.contains('FAC-2026-A002').should('be.visible');
      cy.contains('FAC-2026-A003').should('be.visible');
      cy.contains('FAC-2026-A004').should('be.visible');
      cy.contains('FAC-2026-A005').should('be.visible');

      // Tag "Auto" present sur toutes les factures
      cy.get('.source-tag').should('have.length.at.least', 1);
      cy.get('.source-tag').first().should('contain', 'Auto');

      // Statuts corrects
      cy.contains('Payee').should('be.visible');
      cy.contains('Envoyee').should('be.visible');
      cy.contains('Validation...').should('be.visible');
      cy.contains('Brouillon').should('be.visible');

      // Montants
      cy.contains('1250,00').should('be.visible');
      cy.contains('890,00').should('be.visible');
      cy.contains('700,00').should('be.visible');

      // Stats bar
      cy.contains('Total').should('be.visible');
      cy.contains('Payees').should('be.visible');
      cy.contains('En cours').should('be.visible');

      // Total banner
      cy.contains('3740,00').should('be.visible');
      cy.contains('TTC').should('be.visible');

      // Pas de formulaire upload (plan payant)
      cy.contains('Ajouter une facture').should('not.exist');
      cy.contains('Glissez votre facture').should('not.exist');

      // Pas de banner upsell Pro
      cy.contains('Passez au plan Pro').should('not.exist');
    }

    cy.wait(PAUSE);
  });

  it('Factures — filtre par statut Payees', function () {
    // Le filtrage s'appuie sur les statuts précis des fixtures Pro.
    if (REAL_BACKEND) {
      this.skip();
    }
    cy.visit('/invoices');
    cy.wait('@getInvoices');

    cy.contains('Payees').click();
    cy.wait(500);

    cy.contains('FAC-2026-A001').should('be.visible');
    cy.contains('FAC-2026-A002').should('be.visible');
    cy.contains('FAC-2026-A004').should('not.exist');
    cy.contains('FAC-2026-A005').should('not.exist');

    cy.wait(PAUSE);
  });

  it('Factures — telechargement PDF', function () {
    // Le bouton download n'apparaît que sur une facture seedée payée précise.
    if (REAL_BACKEND) {
      this.skip();
    }
    cy.visit('/invoices');
    cy.wait('@getInvoices');

    cy.get('.download-btn').first().click();
    cy.wait('@downloadInvoicePdf');

    cy.wait(PAUSE);
  });

  // ═══════════════════════════════════════════
  // BILLING PRO
  // ═══════════════════════════════════════════

  it('Billing — Plan Professionnel actif', function () {
    // /billing real-backend reste bloquée (endpoint billing/plan 404) ET
    // l'état « Plan actuel » suppose un abonnement Pro figé.
    if (REAL_BACKEND) {
      this.skip();
    }
    cy.visit('/billing');
    cy.wait('@getBilling');

    cy.contains('Facturation').should('be.visible');
    cy.contains('Plan Gratuit').should('be.visible');
    cy.contains('Plan Professionnel').should('be.visible');
    cy.contains('Generation auto de factures').should('be.visible');
    cy.contains('Rappels automatiques').should('be.visible');
    cy.contains('Plan actuel').should('be.visible');

    cy.wait(PAUSE);
  });
});
