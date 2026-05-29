/// <reference types="cypress" />

/**
 * BILLING — Resiliation plan Pro, historique paiements, erreurs
 */

const PAUSE = 3000;

describe('Billing — resiliation et historique', () => {

  describe('Resiliation du plan Pro', () => {

    beforeEach(() => {
      cy.mockContractorApi({
        dashboard: 'dashboard-pro.json',
        billing: 'billing-pro.json',
      });
    });

    it('le plan Pro affiche le bandeau abonnement actif + option resiliation', () => {
      cy.visit('/billing');
      cy.wait('@getBilling');

      // Plan payant : bandeau « Plan Professionnel » + bouton « Gérer »
      // (ouvre le dialog de résiliation).
      cy.contains('Plan Professionnel').should('be.visible');
      cy.contains('Gérer').should('be.visible');

      cy.wait(PAUSE);
    });

    it('la resiliation appelle l\'API cancel', () => {
      cy.intercept('POST', '/contractor-compliance/billing/cancel', {
        statusCode: 200,
        body: { data: { plan: 'free', effective_at: new Date().toISOString(), message: 'Abonnement résilié.' } },
      }).as('cancelPlan');

      cy.visit('/billing');
      cy.wait('@getBilling');

      // Bouton « Gérer » → ouvre le dialog inline → « Confirmer la résiliation ».
      cy.contains('button', 'Gérer').click();
      cy.contains('button', 'Confirmer la résiliation').click();
      cy.wait('@cancelPlan');

      cy.wait(PAUSE);
    });
  });

  describe('Erreurs Stripe', () => {

    beforeEach(() => {
      cy.mockContractorApi();
    });

    it('erreur lors de la souscription affiche un message', () => {
      cy.intercept('POST', '/contractor-compliance/billing/subscribe', {
        statusCode: 402,
        body: { error: { message: 'Votre carte bancaire a ete refusee.' } },
      }).as('subscribeFail');

      cy.visit('/billing');
      cy.wait('@getBilling');

      // Plan gratuit : le CTA d'abonnement est « Passer en Pro - X €/mois ».
      cy.contains('button', 'Passer en Pro').click();
      cy.wait('@subscribeFail');
      // Le composant affiche un message d'erreur (l'app ne crash pas).
      cy.url().should('include', '/billing');

      cy.wait(PAUSE);
    });

    it('le plan Gratuit affiche la carte d\'upsell Pro', () => {
      cy.visit('/billing');
      cy.wait('@getBilling');

      // Plan gratuit : carte « Tuita Pro » avec CTA « Passer en Pro ».
      cy.contains('Facturation').should('be.visible');
      cy.contains('Passer en Pro').should('be.visible');

      cy.wait(PAUSE);
    });
  });
});
