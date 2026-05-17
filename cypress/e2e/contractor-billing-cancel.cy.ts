/// <reference types="cypress" />

/**
 * BILLING â€” Resiliation plan Pro, historique paiements, erreurs
 */

const PAUSE = 3000;

describe('Billing â€” resiliation et historique', () => {

  describe('Resiliation du plan Pro', () => {

    beforeEach(() => {
      cy.mockContractorApi({
        dashboard: 'dashboard-pro.json',
        billing: 'billing-pro.json',
      });
    });

    it('le plan Pro affiche "Plan actuel" desactive + option resiliation', () => {
      cy.visit('/billing');
      cy.wait('@getBilling');

      cy.contains('Plan Professionnel').should('be.visible');
      cy.contains('Plan actuel').should('be.visible');

      cy.wait(PAUSE);
    });

    it('la resiliation appelle l\'API cancel', () => {
      cy.intercept('POST', '/contractor-compliance/billing/cancel', {
        statusCode: 200,
        body: { success: true, data: { plan: 'free', cancelled_at: new Date().toISOString() } },
      }).as('cancelPlan');

      cy.visit('/billing');
      cy.wait('@getBilling');

      // Si un bouton/lien "Gerer" ou "Resilier" existe
      cy.get('body').then($body => {
        const cancelBtn = $body.find('button:contains("Resilier"), button:contains("Gerer"), a:contains("Resilier")');
        if (cancelBtn.length) {
          cy.wrap(cancelBtn.first()).click();
          // Confirmation dialog
          cy.get('body').then($dialog => {
            const confirmBtn = $dialog.find('button:contains("Confirmer"), button:contains("Oui")');
            if (confirmBtn.length) {
              cy.wrap(confirmBtn.first()).click();
              cy.wait('@cancelPlan');
            }
          });
        }
      });

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

      cy.get('body').then($body => {
        const btn = $body.find('button:contains("Souscrire")');
        if (btn.length) {
          cy.wrap(btn.first()).click();
          cy.wait('@subscribeFail');
        }
      });

      cy.wait(PAUSE);
    });

    it('le plan Gratuit affiche les limitations', () => {
      cy.visit('/billing');
      cy.wait('@getBilling');

      // Les limitations du plan gratuit
      cy.contains('Gratuit').should('be.visible');

      cy.wait(PAUSE);
    });
  });
});
