/// <reference types="cypress" />

/**
 * FLOW PLAN GRATUIT — Upload factures, rejet, correction, souscription
 *
 * Teste le parcours d'un artisan en plan Gratuit :
 *  - Upload manuel de facture (drag & drop, formulaire)
 *  - Facture rejetée → correction
 *  - Filtres par statut
 *  - Banner "Passez au plan Pro"
 *  - Souscription Stripe
 *  - Missions avec factures manquantes
 */

const PAUSE = 3000;

describe('Plan Gratuit — Flow factures et souscription', () => {

  // ═══════════════════════════════════════════════
  // FACTURES FREE — Upload manuel
  // ═══════════════════════════════════════════════

  describe('Factures — upload manuel', () => {

    beforeEach(() => {
      cy.mockContractorApi({
        dashboard: 'dashboard.json',
        invoices: 'invoices.json',
        billing: 'billing.json',
      });
    });

    it('affiche le formulaire d\'upload et la banner Pro', () => {
      cy.visit('/invoices');
      cy.wait('@getInvoices');

      // Header plan gratuit + sous-titre du composant factures.
      cy.contains('Mes factures').should('be.visible');
      cy.contains('Gère tes factures pour chaque mission terminée').should('be.visible');

      // Banner upsell Pro visible (pro-banner du plan gratuit).
      cy.contains('Passez au plan Pro').should('be.visible');
      cy.contains('Plus besoin d\'uploader').should('be.visible');

      // Bouton "Ajouter une facture" present
      cy.contains('Ajouter une facture').should('be.visible');

      cy.wait(PAUSE);
    });

    it('ouvre le formulaire d\'upload et selectionne un fichier', () => {
      cy.visit('/invoices');
      cy.wait('@getInvoices');

      // Ouvrir le formulaire
      cy.contains('Ajouter une facture').click();

      // Formulaire visible
      cy.contains('Envoyer une facture').should('be.visible');
      cy.contains('Glissez votre facture PDF ici').should('be.visible');
      cy.get('input[type="file"]').should('exist');

      // Selectionner un fichier (input PDF du formulaire d'upload).
      cy.get('input[type="file"]').first().selectFile(
        {
          contents: Cypress.Buffer.from('%PDF-1.4 facture test'),
          fileName: 'facture_mission_042.pdf',
          mimeType: 'application/pdf',
        },
        { force: true }
      );

      // File name preview visible
      cy.contains('facture_mission_042.pdf').should('be.visible');

      cy.wait(PAUSE);
    });
  });

  // ═══════════════════════════════════════════════
  // FACTURES FREE — Rejet et correction
  // ═══════════════════════════════════════════════

  describe('Factures — rejet et correction', () => {

    beforeEach(() => {
      cy.mockContractorApi({
        dashboard: 'dashboard.json',
        invoices: 'invoices-free-rejected.json',
        billing: 'billing.json',
      });
    });

    it('affiche une facture rejetee avec bouton Corriger', () => {
      cy.visit('/invoices');
      cy.wait('@getInvoices');

      // Facture rejetée visible (badge accentué « Rejetée »).
      cy.contains('FAC-2026-M002').should('be.visible');
      cy.contains('Rejetée').should('be.visible');

      // Chip de filtre « Rejetées » présent (stats.rejected > 0).
      cy.contains('.chip', 'Rejetées').should('be.visible');

      // Copy de rejet (rejection_reason=low_confidence → « Facture illisible »).
      cy.contains('Facture illisible').should('be.visible');

      // Bouton de correction (actionLabel low_confidence).
      cy.contains('Re-uploader le PDF original').should('be.visible');

      cy.wait(PAUSE);
    });

    it('ouvre le formulaire de correction pour une facture rejetee', () => {
      cy.visit('/invoices');
      cy.wait('@getInvoices');

      // Cliquer sur le bouton de correction de la facture rejetée.
      cy.contains('Re-uploader le PDF original').click();

      // Formulaire de correction ouvert
      cy.contains('Corriger la facture').should('be.visible');

      // Guide banner d'aide (« n'a pas passé la vérification »).
      cy.contains('n\'a pas passé la vérification').should('be.visible');

      // Le mission-picker verrouillé rend un input readonly « Réf. mission »
      // dont la value porte la référence de la facture rejetée.
      cy.get('input[readonly]').first().should('have.value', 'CASE-2026-043');

      // Zone d'upload
      cy.contains('Glissez votre facture PDF ici').should('be.visible');

      // Bouton soumettre la correction
      cy.contains('Soumettre la correction').should('be.visible');

      cy.wait(PAUSE);
    });

    it('filtre les factures par statut rejetees', () => {
      cy.visit('/invoices');
      cy.wait('@getInvoices');

      // Cliquer sur le chip de filtre « Rejetées ».
      cy.contains('.chip', 'Rejetées').click();
      cy.wait(500);

      // Seule la facture rejetée visible.
      cy.contains('FAC-2026-M002').should('be.visible');
      // Les autres sont cachées.
      cy.contains('FAC-2026-M001').should('not.exist');
      cy.contains('FAC-2026-M003').should('not.exist');

      cy.wait(PAUSE);
    });

    it('filtre les factures par statut payees', () => {
      cy.visit('/invoices');
      cy.wait('@getInvoices');

      cy.contains('.chip', 'Payées').click();
      cy.wait(500);

      cy.contains('FAC-2026-M001').should('be.visible');
      cy.contains('FAC-2026-M002').should('not.exist');

      cy.wait(PAUSE);
    });
  });

  // ═══════════════════════════════════════════════
  // MISSIONS FREE — Factures manquantes
  // ═══════════════════════════════════════════════

  describe('Missions — offres et detail intervention', () => {

    beforeEach(() => {
      cy.mockContractorApi({
        dashboard: 'dashboard.json',
        missions: 'missions.json',
        billing: 'billing.json',
      });
    });

    it('affiche la page des offres disponibles', () => {
      cy.visit('/missions');
      cy.waitApi('@getMissionOffers');

      cy.contains('Offres disponibles').should('be.visible');
      cy.contains('Diagnostic plomb').should('be.visible');
      cy.contains('Diagnostic amiante avant travaux').should('be.visible');

      cy.wait(PAUSE);
    });

    it('ouvre le detail d\'une intervention → "Envoyer ma facture"', () => {
      cy.visit('/interventions/MIS-2026-043');
      cy.wait('@getMissionDetail');

      cy.contains('Diagnostic plomb').should('be.visible');
      cy.contains('Facture manquante').should('be.visible');
      cy.contains('Envoyer ma facture').should('be.visible');

      // Clique → redirige vers /invoices
      cy.contains('Envoyer ma facture').click();
      cy.url().should('include', '/invoices');
      cy.url().should('include', 'mission_ref=');

      cy.wait(PAUSE);
    });
  });

  // ═══════════════════════════════════════════════
  // BILLING FREE — Souscription
  // ═══════════════════════════════════════════════

  describe('Billing — souscription plan Pro', () => {

    beforeEach(() => {
      cy.mockContractorApi({
        dashboard: 'dashboard.json',
        billing: 'billing.json',
      });
    });

    it('affiche la carte d\'upsell Pro avec le prix', () => {
      cy.visit('/billing');
      cy.wait('@getBilling');

      // Plan gratuit : page facturation avec la carte « Tuita Pro ».
      cy.contains('Facturation').should('be.visible');
      cy.contains('Tuita Pro').should('be.visible');

      // Prix Pro 99 €/mois + CTA « Passer en Pro ».
      cy.contains('99').should('be.visible');
      cy.contains('Passer en Pro').should('be.visible');

      cy.wait(PAUSE);
    });

    it('cliquer sur le CTA Pro appelle l\'API de souscription', () => {
      // Intercepter le redirect Stripe pour eviter le page load timeout
      cy.intercept('POST', '/contractor-compliance/billing/subscribe', {
        statusCode: 200,
        body: { data: { checkout_url: '' } },
      }).as('subscribePlan');

      cy.visit('/billing');
      cy.wait('@getBilling');

      // CTA d'abonnement du plan gratuit : « Passer en Pro - X €/mois ».
      cy.contains('button', 'Passer en Pro').click();
      cy.wait('@subscribePlan').its('request.body').should('have.property', 'plan');

      cy.wait(PAUSE);
    });
  });
});
