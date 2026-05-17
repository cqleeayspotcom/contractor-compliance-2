/// <reference types="cypress" />

/**
 * FLOW PLAN PROFESSIONNEL (99 EUR/mois)
 *
 * Teste le parcours d'un artisan abonne au plan Pro :
 *  - Dashboard 100% verifie
 *  - 5 missions completees, toutes facturees automatiquement
 *  - Factures auto-generees avec tag "Auto"
 *  - Telechargement PDF
 *  - Pas de formulaire d'upload (plan payant)
 *  - Pas de banner "Passez au plan Pro"
 *  - Billing affiche "Plan actuel" (disabled)
 */

const PAUSE = 3000;

describe('Plan Professionnel — Flow complet', () => {

  beforeEach(() => {
    cy.mockContractorApi({
      dashboard: 'dashboard-pro.json',
      invoices: 'invoices-pro.json',
      missions: 'missions-pro.json',
      billing: 'billing-pro.json',
    });
  });

  // ═══════════════════════════════════════════
  // DASHBOARD PRO
  // ═══════════════════════════════════════════

  it('Dashboard — compte verifie, pas de banner upgrade', () => {
    cy.visit('/dashboard');
    cy.wait('@getDashboard');

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

    cy.wait(PAUSE);
  });

  // ═══════════════════════════════════════════
  // MISSIONS PRO
  // ═══════════════════════════════════════════

  it('Missions — 5 missions terminees et facturees', () => {
    cy.visit('/missions');
    cy.wait('@getMissions');

    cy.contains('Mes missions').should('be.visible');
    cy.contains('Missions terminees').should('be.visible');
    // Mission cards
    cy.contains('Diagnostic amiante avant travaux').should('be.visible');
    cy.contains('DPE appartement T3').should('be.visible');
    cy.contains('Mesurage loi Carrez').should('be.visible');
    // Prices
    cy.contains('1250,00').should('be.visible');
    cy.contains('500,00').should('be.visible');
    // Cities
    cy.contains('Paris').should('be.visible');
    cy.contains('Toulouse').should('be.visible');
    cy.contains('Bordeaux').should('be.visible');

    cy.wait(PAUSE);
  });

  // ═══════════════════════════════════════════
  // FACTURES AUTO-GENEREES
  // ═══════════════════════════════════════════

  it('Factures — auto-generees avec tag Auto et telechargement', () => {
    cy.visit('/invoices');
    cy.wait('@getInvoices');

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
    cy.contains('Payee').should('be.visible');        // paid
    cy.contains('Envoyee').should('be.visible');       // sent
    cy.contains('Validation...').should('be.visible'); // validating
    cy.contains('Brouillon').should('be.visible');     // draft

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

    cy.wait(PAUSE);
  });

  it('Factures — filtre par statut Payees', () => {
    cy.visit('/invoices');
    cy.wait('@getInvoices');

    // Click "Payees" filter
    cy.contains('Payees').click();
    cy.wait(500);

    // Only paid invoices visible
    cy.contains('FAC-2026-A001').should('be.visible');
    cy.contains('FAC-2026-A002').should('be.visible');
    // Validating/draft should not be visible
    cy.contains('FAC-2026-A004').should('not.exist');
    cy.contains('FAC-2026-A005').should('not.exist');

    cy.wait(PAUSE);
  });

  it('Factures — telechargement PDF', () => {
    cy.visit('/invoices');
    cy.wait('@getInvoices');

    // Click download on first invoice (paid = has download button)
    cy.get('.download-btn').first().click();
    cy.wait('@downloadInvoicePdf');

    cy.wait(PAUSE);
  });

  // ═══════════════════════════════════════════
  // BILLING PRO
  // ═══════════════════════════════════════════

  it('Billing — Plan Professionnel actif, bouton desactive', () => {
    cy.visit('/billing');
    cy.wait('@getBilling');

    cy.contains('Facturation').should('be.visible');
    // Deux plans affiches
    cy.contains('Plan Gratuit').should('be.visible');
    cy.contains('Plan Professionnel').should('be.visible');
    // Features du plan Pro
    cy.contains('Generation auto de factures').should('be.visible');
    cy.contains('Rappels automatiques').should('be.visible');
    // "Plan actuel" button (disabled)
    cy.contains('Plan actuel').should('be.visible');

    cy.wait(PAUSE);
  });
});
