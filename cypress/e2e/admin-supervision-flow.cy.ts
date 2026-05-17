/// <reference types="cypress" />

/**
 * FLOW ADMIN TUITA — Supervision, deblocage, incidents
 *
 * Scenarios :
 *  1. Connexion admin avec cle API
 *  2. Dashboard nominal : tout est vert
 *  3. Incident : OCR down, circuit breakers ouverts, jobs echoues
 *  4. Actions admin : retry jobs, replay webhooks, force close circuits
 *  5. Surveillance compliance : stats contractors
 */

const PAUSE = 3000;
const ADMIN_KEY = 'test-admin-api-key-cypress';

/** Pre-authenticate by setting sessionStorage before visit */
function preAuth() {
  cy.visit('/admin');
  cy.window().then(win => win.sessionStorage.setItem('tuita_admin_key', ADMIN_KEY));
  cy.visit('/admin');
}

describe('Admin Tuita — Supervision microservice', () => {

  // ═══════════════════════════════════════════
  // CONNEXION ADMIN
  // ═══════════════════════════════════════════

  describe('Authentification admin', () => {

    it('affiche le formulaire de connexion par cle API', () => {
      cy.visit('/admin');

      cy.contains('Supervision Tuita').should('be.visible');
      cy.contains("cle d'administration").should('be.visible');
      cy.get('input[type="password"]').should('exist');
      cy.contains('Acceder').should('be.visible');

      cy.wait(PAUSE);
    });

    it('se connecte avec la cle API et voit le dashboard', () => {
      cy.mockAdminApi();
      cy.visit('/admin');

      // Type in the password field (force because mat-label covers it)
      cy.get('input[type="password"]').type(ADMIN_KEY, { force: true });
      cy.contains('Acceder').click();

      cy.wait('@getHealth');

      cy.contains('Sante du systeme').should('be.visible');
      cy.contains('Actualiser').should('be.visible');
      cy.contains('Deconnexion').should('be.visible');

      cy.wait(PAUSE);
    });
  });

  // ═══════════════════════════════════════════
  // DASHBOARD NOMINAL
  // ═══════════════════════════════════════════

  describe('Dashboard nominal — tout est operationnel', () => {

    beforeEach(() => {
      cy.mockAdminApi();
      preAuth();
    });

    it('affiche la sante systeme — 4 services OK', () => {
      cy.wait('@getHealth');

      cy.contains('Sante du systeme').should('be.visible');
      cy.contains('database').should('be.visible');
      cy.contains('redis').should('be.visible');
      cy.contains('storage').should('be.visible');
      cy.contains('ocr').should('be.visible');
      cy.contains('OK').should('be.visible');

      cy.wait(PAUSE);
    });

    it('affiche les files d\'attente avec jobs echoues', () => {
      cy.wait('@getQueues');

      cy.contains("Files d'attente").should('be.visible');
      cy.contains('En attente').should('be.visible');
      cy.contains('12').should('be.visible');
      cy.contains('Echoues').should('be.visible');
      cy.contains('5').should('be.visible');
      cy.contains('Relancer tous les echoues').should('be.visible');

      cy.wait(PAUSE);
    });

    it('affiche les webhooks avec differents statuts', () => {
      cy.wait('@getWebhooks');

      cy.contains('Webhooks').should('be.visible');
      cy.contains('contractor.compliance.validated').should('be.visible');
      cy.contains('contractor.kyc.rejected').should('be.visible');
      // Status labels in the table
      cy.contains('Envoye').should('be.visible');
      cy.contains('Echoue').should('be.visible');

      cy.wait(PAUSE);
    });

    it('affiche les circuit breakers — tous fermes', () => {
      cy.wait('@getCircuits');

      cy.contains('Circuit Breakers').should('be.visible');
      cy.contains('mistral').should('be.visible');
      cy.contains('deepface').should('be.visible');
      cy.contains('pappers').should('be.visible');
      // All closed = no "Forcer la fermeture" buttons
      cy.contains('Forcer la fermeture').should('not.exist');

      cy.wait(PAUSE);
    });

    it('affiche les statistiques compliance', () => {
      cy.wait('@getComplianceStats');

      cy.contains('Statistiques Compliance').should('be.visible');
      cy.contains('247').should('be.visible');
      cy.contains('68.4%').should('be.visible');
      cy.contains('1182').should('be.visible');
      cy.contains('Prestataires').should('be.visible');
      cy.contains('Conformes').should('be.visible');
      cy.contains('Repartition par etat').should('be.visible');

      cy.wait(PAUSE);
    });
  });

  // ═══════════════════════════════════════════
  // INCIDENT — Services down, circuits ouverts
  // ═══════════════════════════════════════════

  describe('Incident — OCR down, tuita.fr unreachable', () => {

    beforeEach(() => {
      cy.mockAdminApi({
        health: 'admin-health-degraded.json',
        circuits: 'admin-circuits-incident.json',
      });
      preAuth();
    });

    it('affiche les services degrades et down', () => {
      cy.wait('@getHealth');

      cy.contains('Degrade').should('be.visible');
      cy.contains('Hors ligne').should('be.visible');

      cy.wait(PAUSE);
    });

    it('affiche les circuit breakers ouverts avec bouton fermeture', () => {
      cy.wait('@getCircuits');

      cy.contains('OUVERT').should('be.visible');
      cy.contains('DEMI-OUVERT').should('be.visible');
      cy.contains('7 echecs').should('be.visible');
      cy.contains('12 echecs').should('be.visible');
      cy.contains('Forcer la fermeture').should('be.visible');

      cy.wait(PAUSE);
    });

    it('clique "Forcer la fermeture" rafraichit les circuits', () => {
      cy.wait('@getCircuits');

      // Le bouton existe (mais le backend n'a pas d'endpoint /close,
      // il rafraichit simplement l'etat)
      cy.contains('Forcer la fermeture').first().click();
      // Le clic declenche un reload des circuits
      cy.wait('@getCircuits');

      cy.wait(PAUSE);
    });
  });

  // ═══════════════════════════════════════════
  // ACTIONS ADMIN — Retry, Replay
  // ═══════════════════════════════════════════

  describe('Actions admin — deblocage', () => {

    beforeEach(() => {
      cy.mockAdminApi();
      preAuth();
    });

    it('le bouton "Relancer tous les echoues" est visible et cliquable', () => {
      cy.wait('@getQueues');

      // Le bouton est visible quand il y a des echecs (5 dans la fixture)
      cy.contains('Relancer tous les echoues').should('be.visible');
      cy.contains('Relancer tous les echoues').click();

      // Le composant tente de retry chaque failed task individuellement
      // via POST /admin/tasks/{id}/retry (pas de bulk endpoint)

      cy.wait(PAUSE);
    });

    it('rejoue un webhook echoue via le bouton replay', () => {
      cy.wait('@getWebhooks');

      // Click replay button (matTooltip="Rejouer") on failed/dead webhook
      cy.get('button[mattooltip="Rejouer"]').first().click({ force: true });
      cy.wait('@replayWebhook');

      cy.wait(PAUSE);
    });

    it('actualise le dashboard admin', () => {
      cy.wait('@getHealth');

      cy.contains('Actualiser').click();
      cy.wait('@getHealth');

      cy.wait(PAUSE);
    });
  });

  // ═══════════════════════════════════════════
  // FILTRES WEBHOOKS
  // ═══════════════════════════════════════════

  describe('Filtres webhooks', () => {

    beforeEach(() => {
      cy.mockAdminApi();
      preAuth();
    });

    it('filtre les webhooks par statut echoue', () => {
      cy.wait('@getWebhooks');

      cy.contains('Echoue').first().click();
      cy.wait(500);

      // Only failed webhooks should be visible
      cy.contains('contractor.kyc.rejected').should('be.visible');

      cy.wait(PAUSE);
    });
  });

  // ═══════════════════════════════════════════
  // DECONNEXION
  // ═══════════════════════════════════════════

  describe('Deconnexion', () => {

    it('se deconnecte et revient au formulaire', () => {
      cy.mockAdminApi();
      preAuth();
      cy.wait('@getHealth');

      cy.contains('Deconnexion').click();

      cy.get('input[type="password"]').should('exist');
      cy.contains("cle d'administration").should('be.visible');

      cy.wait(PAUSE);
    });
  });
});
