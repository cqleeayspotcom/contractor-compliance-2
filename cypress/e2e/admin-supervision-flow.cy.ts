/// <reference types="cypress" />

/**
 * FLOW ADMIN TUITA — Tableau de bord supervision (/admin)
 *
 * Réécrit le 2026-05-20. POURQUOI cette réécriture complète :
 * l'ancienne version testait une page qui n'existe plus —
 *   - une auth par « clé API » (écran « Supervision Tuita » + champ
 *     password) : remplacée par l'auth OAuth2 mysession Tuita, gardée
 *     par `adminAuthGuard` (présence de `sessionStorage.tuita_admin_token`).
 *     Il n'y a plus de formulaire DANS /admin : le login vit sur
 *     /admin/login.
 *   - des sections « Files d'attente », « Webhooks », « Circuit Breakers »
 *     supprimées : le /admin actuel (`ContractorAdminComponent`) expose
 *     KPIs « Aujourd'hui », alertes, inscriptions récentes, « À contacter »
 *     et un bloc Infrastructure repliable (santé services + stats compliance).
 *
 * Les intercepts sont définis LOCALEMENT (et non via `cy.mockAdminApi`,
 * dont les routes queues/webhooks/circuits n'existent plus côté backend)
 * pour que ce fichier reste autonome et fidèle aux 5 endpoints réellement
 * appelés par `ContractorAdminComponent.loadAll()`.
 */

const PAUSE = 1200;
const ADMIN_TOKEN = 'cypress-fake-admin-token';

// Les 5 endpoints réellement consommés par le tableau de bord admin.
const EP = {
  overview:   '/contractor-compliance/admin/dashboard/overview',
  health:     '/contractor-compliance/admin/health',
  compliance: '/contractor-compliance/admin/compliance/stats',
  signups:    '/contractor-compliance/admin/signup-attempts*',
  outreach:   '/contractor-compliance/admin/dashboard/outreach',
};

// ─── Corps de réponse (enveloppe SuccessEnvelope du SDK : { success, data }) ───

function bucket(count: number, amount: number) {
  return { count, total_amount: amount, currency: 'EUR' };
}

function overviewBody(withAlerts = false) {
  return {
    success: true,
    data: {
      pipeline: {
        validating:                 bucket(4, 3200),
        draft:                      bucket(2, 1500),
        pending_payment_validation: { ...bucket(7, 9800), aging_buckets: { '0_3d': 4, '3_7d': 2, '7_plus': 1 } },
        ready_to_pay:               bucket(3, 5400),
        payment_in_progress:        bucket(2, 3100),
        paid_today:                 bucket(9, 14200),
        rejected_today:             bucket(1, 800),
      },
      alerts: {
        stuck_pending_validation_critical:  withAlerts ? 2 : 0,
        stuck_ready_to_pay_critical:        0,
        stuck_payment_in_progress_critical: 0,
        failed_jobs_count:                  withAlerts ? 3 : 0,
        webhooks_dead_count:                0,
        open_circuit_breakers:              withAlerts ? [{ service: 'mistral', opened_at: '2026-05-20T08:00:00+00:00' }] : [],
        paid_disputed_open_count:           0,
      },
      today_to_pay: {
        count: 3, total_amount: 5400, currency: 'EUR',
        oldest_ready_since: '2026-05-17T09:00:00+00:00',
      },
    },
  };
}

function healthBody(degraded = false) {
  return {
    success: true,
    data: {
      overall: degraded ? 'degraded' : 'healthy',
      // Services réels exposés par AdminSupervisionController::healthAction :
      // db / cache / amqp (Redis a été retiré du module — règle d'or).
      services: degraded
        ? {
            db:    { status: 'ok',       latency_ms: 15 },
            cache: { status: 'degraded', latency_ms: 210 },
            amqp:  { status: 'down',     latency_ms: null },
          }
        : {
            db:    { status: 'ok', latency_ms: 12 },
            cache: { status: 'ok', latency_ms: 3 },
            amqp:  { status: 'ok', latency_ms: 1 },
          },
      checked_at: '2026-05-20T16:00:00+00:00',
    },
  };
}

const complianceBody = {
  success: true,
  data: {
    contractors: { total: 247, by_state: { new: 12, documents_pending: 35, kyc_pending: 18, fully_verified: 169, suspended: 13 } },
    documents:   { by_status: { verified: 1182, pending: 40, rejected: 15 } },
    performance: { avg_validation_seconds: 185 },
  },
};

const signupsBody = {
  success: true,
  data: [
    { uuid: 'sa-1', created_at: '2026-05-20T14:30:00+00:00', phone_input: '+33612345678', first_name: 'Jean', last_name: 'Dupont', status: 'success' },
    { uuid: 'sa-2', created_at: '2026-05-20T13:05:00+00:00', phone_input: '+33700000000', status: 'siren_not_found', failure_detail: 'SIREN 000000000 introuvable' },
  ],
};

const outreachBody = {
  success: true,
  data: {
    top_invitation_codes: [
      { code: 'TUITA2026', generated_by_label: 'Maxime', generated_by_admin_id: 1, uses_count: 12, max_uses: 50, status: 'active' },
    ],
    qcm_blocked: [
      { user_id: 'u-1', name: 'Paul Martin', phone: '+33611111111', attempts: 3, last_score: 40, last_attempt_at: '2026-05-20T10:00:00+00:00' },
    ],
    qcm_certified: [
      { user_id: 'u-2', name: 'Marie Bernard', phone: '+33622222222', attempts_to_pass: 1, certified_at: '2026-05-19T16:00:00+00:00', last_score: 90 },
    ],
    last_signup: { name: 'Jean Dupont', phone: '+33612345678', created_at: '2026-05-20T14:30:00+00:00', code_input: 'TUITA2026' },
  },
};

/** Branche les 5 intercepts du tableau de bord. */
function mockDashboard(opts: { degraded?: boolean; alerts?: boolean } = {}) {
  // POURQUOI ce stub du dashboard contractor : le layout applicatif partagé
  // déclenche un GET /contractor-compliance/dashboard. Non mocké, il part au
  // vrai backend → 401 → l'intercepteur d'auth rabat sur /admin/login, ce qui
  // faisait échouer toute la page admin. On le neutralise par un 200 vide.
  cy.intercept('GET', '/contractor-compliance/dashboard*', {
    statusCode: 200,
    body: { data: {} },
  }).as('getContractorDashboard');

  cy.intercept('GET', EP.overview,   overviewBody(opts.alerts)).as('getOverview');
  cy.intercept('GET', EP.health,     healthBody(opts.degraded)).as('getHealth');
  cy.intercept('GET', EP.compliance, complianceBody).as('getCompliance');
  cy.intercept('GET', EP.signups,    signupsBody).as('getSignups');
  cy.intercept('GET', EP.outreach,   outreachBody).as('getOutreach');
}

/** Visite /admin en posant le token admin (contourne `adminAuthGuard`). */
function visitAdmin() {
  cy.visit('/admin', {
    onBeforeLoad(win) {
      win.sessionStorage.setItem('tuita_admin_token', ADMIN_TOKEN);
    },
  });
}

describe('Admin Tuita — Tableau de bord supervision', () => {

  // ═══════════════════════════════════════════
  // GARDE D'AUTHENTIFICATION
  // ═══════════════════════════════════════════

  describe("Garde d'authentification", () => {

    it('redirige vers /admin/login sans token', () => {
      cy.visit('/admin', {
        onBeforeLoad(win) {
          win.sessionStorage.clear();
        },
      });

      // adminAuthGuard renvoie une UrlTree vers /admin/login.
      cy.url().should('include', '/admin/login');

      cy.wait(PAUSE);
    });

    it('affiche le tableau de bord avec un token valide', () => {
      mockDashboard();
      visitAdmin();

      cy.contains('Tableau de bord Tuita').should('be.visible');
      cy.contains('Actualiser').should('be.visible');
      cy.contains('Déconnexion').should('be.visible');

      // Navigation rapide vers les pages opérationnelles.
      cy.get('.cadmin__quicknav').should('be.visible');
      cy.get('.cadmin__quicknav').contains('Prestataires').should('be.visible');

      cy.wait(PAUSE);
    });
  });

  // ═══════════════════════════════════════════
  // DASHBOARD NOMINAL
  // ═══════════════════════════════════════════

  describe('Dashboard nominal', () => {

    beforeEach(() => {
      mockDashboard();
      visitAdmin();
    });

    it('affiche les KPIs de productivité du jour', () => {
      cy.wait('@getOverview');

      cy.contains("Aujourd'hui").should('be.visible');
      cy.contains('1. À valider').should('be.visible');
      cy.contains('2. Bon Pour Paiement').should('be.visible');
      cy.contains('3. Virements en cours').should('be.visible');
      cy.contains("4. Payées aujourd'hui").should('be.visible');

      cy.wait(PAUSE);
    });

    it('affiche les inscriptions récentes', () => {
      cy.wait('@getSignups');

      cy.contains('Inscriptions récentes').should('be.visible');
      cy.contains('Jean Dupont').should('be.visible');
      cy.contains('Réussie').should('be.visible');
      cy.contains('SIREN introuvable').should('be.visible');

      cy.wait(PAUSE);
    });

    it('affiche les widgets « À contacter »', () => {
      cy.wait('@getOutreach');

      cy.contains('À contacter').should('be.visible');
      cy.contains("Top codes d'invitation").should('be.visible');
      cy.contains('TUITA2026').should('be.visible');
      cy.contains('Bloqués').should('be.visible');
      cy.contains('Paul Martin').should('be.visible');
      cy.contains('Certifiés').should('be.visible');
      cy.contains('Marie Bernard').should('be.visible');

      cy.wait(PAUSE);
    });

    it('déploie le bloc infrastructure et affiche la santé système', () => {
      cy.wait('@getHealth');

      // Le bloc Infrastructure est replié par défaut (infraCollapsed = true).
      cy.contains('Santé du système').should('not.exist');

      cy.contains('Infrastructure').click();

      cy.contains('Santé du système').should('be.visible');
      cy.get('.health-card__name').should('contain', 'db');
      cy.get('.health-card__name').should('contain', 'cache');
      cy.get('.health-card__name').should('contain', 'amqp');
      cy.contains('.health-card__status', 'OK').should('be.visible');

      cy.wait(PAUSE);
    });

    it('affiche les statistiques compliance après déploiement', () => {
      cy.wait('@getCompliance');

      cy.contains('Infrastructure').click();

      cy.contains('Statistiques Compliance').should('be.visible');
      cy.contains('Prestataires').should('be.visible');
      cy.contains('247').should('be.visible');
      cy.contains('Répartition par état').should('be.visible');

      cy.wait(PAUSE);
    });
  });

  // ═══════════════════════════════════════════
  // INCIDENT — Service down, alertes
  // ═══════════════════════════════════════════

  describe('Incident — service dégradé et alertes', () => {

    it('affiche un service dégradé et un service hors ligne', () => {
      mockDashboard({ degraded: true });
      visitAdmin();
      cy.wait('@getHealth');

      cy.contains('Infrastructure').click();

      cy.contains('.health-card__status', 'Dégradé').should('be.visible');
      cy.contains('.health-card__status', 'Hors ligne').should('be.visible');

      cy.wait(PAUSE);
    });

    it('affiche la section « Actions nécessaires » quand des alertes existent', () => {
      mockDashboard({ alerts: true });
      visitAdmin();
      cy.wait('@getOverview');

      cy.contains('Actions nécessaires').should('be.visible');
      cy.contains('Validation bloquée').should('be.visible');
      // open_circuit_breakers → carte « Service hors ligne : mistral ».
      cy.contains('mistral').should('be.visible');

      cy.wait(PAUSE);
    });
  });

  // ═══════════════════════════════════════════
  // ACTIONS ADMIN
  // ═══════════════════════════════════════════

  describe('Actions admin', () => {

    beforeEach(() => {
      mockDashboard();
      visitAdmin();
    });

    it('le bouton « Actualiser » relance les appels backend', () => {
      cy.wait('@getHealth');

      cy.contains('Actualiser').click();

      // loadAll() est rejoué → l'endpoint health est rappelé.
      cy.wait('@getHealth');

      cy.wait(PAUSE);
    });

    it('« Déconnexion » purge la session et renvoie vers /admin/login', () => {
      cy.wait('@getOverview');

      cy.contains('Déconnexion').click();

      cy.url().should('include', '/admin/login');
      cy.window().then((win) => {
        expect(win.sessionStorage.getItem('tuita_admin_token')).to.be.null;
      });

      cy.wait(PAUSE);
    });
  });
});
