/// <reference types="cypress" />

/**
 * FLOW PLAN GRATUIT â€” Upload factures, rejet, correction, souscription
 *
 * Teste le parcours d'un artisan en plan Gratuit :
 *  - Upload manuel de facture (drag & drop, formulaire)
 *  - Facture rejetee â†’ correction
 *  - Filtres par statut
 *  - Banner "Passez au plan Pro"
 *  - Souscription Stripe
 *  - Missions avec factures manquantes
 */

const PAUSE = 3000;

describe('Plan Gratuit â€” Flow factures et souscription', () => {

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // FACTURES FREE â€” Upload manuel
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  describe('Factures â€” upload manuel', () => {

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

      // Header plan gratuit
      cy.contains('Mes factures').should('be.visible');
      cy.contains('Gerez vos factures').should('be.visible');

      // Banner upsell Pro visible
      cy.contains('Passez au plan Pro').should('be.visible');
      cy.contains('Plus besoin').should('be.visible');

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

      // Champs mission ref et montant
      cy.contains('Ref. mission').should('be.visible');
      cy.contains('Montant TTC').should('be.visible');

      // Selectionner un fichier
      cy.get('input[type="file"]').selectFile(
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

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // FACTURES FREE â€” Rejet et correction
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  describe('Factures â€” rejet et correction', () => {

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

      // Facture rejetee visible
      cy.contains('FAC-2026-M002').should('be.visible');
      cy.contains('Rejetee').should('be.visible');

      // Badge compteur rejetees dans stats
      cy.contains('Rejetees').should('be.visible');

      // Message de verification echouee
      cy.contains('Verification echouee').should('be.visible');

      // Bouton Corriger
      cy.contains('Corriger').should('be.visible');

      cy.wait(PAUSE);
    });

    it('ouvre le formulaire de correction pour une facture rejetee', () => {
      cy.visit('/invoices');
      cy.wait('@getInvoices');

      // Cliquer sur Corriger
      cy.contains('Corriger').click();

      // Formulaire de correction ouvert
      cy.contains('Corriger la facture').should('be.visible');

      // Guide banner d'aide
      cy.contains('pas passe la verification').should('be.visible');

      // Champs pre-remplis (ref mission visible dans le input)
      cy.get('input[matinput]').first().should('have.value', 'CASE-2026-043');

      // Zone d'upload
      cy.contains('Glissez votre facture PDF ici').should('be.visible');

      // Bouton soumettre la correction
      cy.contains('Soumettre la correction').should('be.visible');

      cy.wait(PAUSE);
    });

    it('filtre les factures par statut rejetees', () => {
      cy.visit('/invoices');
      cy.wait('@getInvoices');

      // Cliquer sur le filtre "Rejetees"
      cy.contains('Rejetees').click();
      cy.wait(500);

      // Seule la facture rejetee visible
      cy.contains('FAC-2026-M002').should('be.visible');
      // Les autres sont cachees
      cy.contains('FAC-2026-M001').should('not.exist');
      cy.contains('FAC-2026-M003').should('not.exist');

      cy.wait(PAUSE);
    });

    it('filtre les factures par statut payees', () => {
      cy.visit('/invoices');
      cy.wait('@getInvoices');

      cy.contains('Payees').click();
      cy.wait(500);

      cy.contains('FAC-2026-M001').should('be.visible');
      cy.contains('FAC-2026-M002').should('not.exist');

      cy.wait(PAUSE);
    });
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // MISSIONS FREE â€” Factures manquantes
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  describe('Missions â€” cartes cliquables vers detail', () => {

    beforeEach(() => {
      cy.mockContractorApi({
        dashboard: 'dashboard.json',
        missions: 'missions.json',
        billing: 'billing.json',
      });
    });

    it('affiche les missions avec badges statut (pas de boutons upload)', () => {
      cy.visit('/missions');
      cy.wait('@getMissions');

      cy.contains('Missions terminees').should('be.visible');
      cy.contains('Diagnostic plomb').should('be.visible');
      cy.contains('Diagnostic amiante avant travaux').should('be.visible');
      // Pas de bouton upload sur la liste simplifiee
      cy.contains('Uploader ma facture').should('not.exist');

      cy.wait(PAUSE);
    });

    it('clique sur une mission â†’ detail avec "Envoyer ma facture"', () => {
      cy.visit('/missions/MIS-2026-043');
      cy.wait('@getMissionDetail');

      cy.contains('Diagnostic plomb').should('be.visible');
      cy.contains('Facture manquante').should('be.visible');
      cy.contains('Envoyer ma facture').should('be.visible');

      // Clique â†’ redirige vers /invoices
      cy.contains('Envoyer ma facture').click();
      cy.url().should('include', '/invoices');
      cy.url().should('include', 'mission_ref=');

      cy.wait(PAUSE);
    });
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // BILLING FREE â€” Souscription
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  describe('Billing â€” souscription plan Pro', () => {

    beforeEach(() => {
      cy.mockContractorApi({
        dashboard: 'dashboard.json',
        billing: 'billing.json',
      });
    });

    it('affiche les deux plans avec bouton Souscrire sur le Pro', () => {
      cy.visit('/billing');
      cy.wait('@getBilling');

      cy.contains('Facturation').should('be.visible');

      // Plan Gratuit avec badge "Plan actuel"
      cy.contains('Gratuit').should('be.visible');
      cy.contains('Plan actuel').should('be.visible');

      // Plan Pro avec prix et bouton Souscrire
      cy.contains('Pro').should('be.visible');
      cy.contains('99').should('be.visible');
      cy.contains('Souscrire').should('be.visible');

      // Lien vers missions
      cy.contains('Mes missions').should('be.visible');

      cy.wait(PAUSE);
    });

    it('cliquer sur Souscrire appelle l\'API de souscription', () => {
      // Intercepter le redirect Stripe pour eviter le page load timeout
      cy.intercept('POST', '/contractor-compliance/billing/subscribe', {
        statusCode: 200,
        body: { data: { checkout_url: '' } },
      }).as('subscribePlan');

      cy.visit('/billing');
      cy.wait('@getBilling');

      cy.contains('Souscrire').click();
      cy.wait('@subscribePlan').its('request.body').should('have.property', 'plan');

      cy.wait(PAUSE);
    });
  });
});
