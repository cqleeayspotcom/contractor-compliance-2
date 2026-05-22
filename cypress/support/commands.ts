/// <reference types="cypress" />

// ───────────────────────────────────────────────────────────────────────
// Custom Cypress commands for contractor compliance E2E tests
//
// DEUX MODES (cf. README cypress) :
//  - mode mock (défaut)        : tous les endpoints sont interceptés via
//    cy.intercept() vers des fixtures JSON figées (cypress/fixtures/).
//  - mode real-backend         : activé par CYPRESS_realBackend=1. Les mocks
//    deviennent des no-op, les requêtes partent vers le vrai backend PHP
//    (:8060) à travers le proxy `ng serve`. Voir le toggle REAL_BACKEND.
//
// SYNC CHECK: All endpoints verified against backend/routes/contractor.php
// and backend/routes/api.php on 2026-04-16.
//
// NB (2026-05-20) : la commande `mockAdminApi` a été supprimée — elle
// mockait les panneaux queues/webhooks/circuit-breakers de l'ancien
// /admin (page remplacée par ContractorAdminComponent). Le spec
// `admin-supervision-flow.cy.ts` réécrit définit désormais ses propres
// intercepts localement. Les routes backend correspondantes existent
// toujours mais aucune page Angular ne les consomme.
// ───────────────────────────────────────────────────────────────────────

// ── Toggle real-backend ────────────────────────────────────────────────
// POURQUOI un toggle et pas deux jeux de specs : les specs « convertible
// direct » testent les mêmes pages dans les deux modes. Le toggle évite la
// duplication — seul le comportement des helpers (mocks, attentes) change.

/**
 * Vrai quand on tape le vrai backend PHP (8060) au lieu des fixtures.
 *
 * POURQUOI le `String(...)` : selon le canal d'activation, Cypress fournit la
 * valeur sous des types différents — `CYPRESS_realBackend=1` (var d'env) la
 * passe en string `'1'`, tandis que `--env realBackend=1` (CLI) la passe en
 * number `1`. On normalise pour couvrir les deux ainsi que le booléen `true`.
 */
export const REAL_BACKEND = ['1', 'true'].includes(
  String(Cypress.env('realBackend')).toLowerCase()
);

/**
 * En mode real-backend, les mocks deviennent des no-op : les vraies requêtes
 * passent. Retourne `true` quand le corps du mock doit être court-circuité.
 */
function skipIfRealBackend(): boolean {
  if (REAL_BACKEND) {
    cy.log('🌐 REAL BACKEND — mocks désactivés, requêtes réelles vers :8060');
    return true;
  }
  return false;
}

/**
 * Pose les intercepts contractor en mode SPY (real-backend) : `cy.intercept`
 * SANS objet de réponse → la requête part réellement vers le backend, mais
 * l'alias est enregistré.
 *
 * POURQUOI un spy et pas un no-op : c'est ce qui résout le « Piège #1 ».
 *   - un no-op laisserait `cy.wait('@getDashboard')` sans alias → throw.
 *   - un spy garde l'alias ET fait taper le vrai backend → `cy.waitApi`
 *     attend la VRAIE requête (utile : certains endpoints, ex. /documents
 *     avec ses gros payloads OCR, mettent plusieurs secondes — un délai fixe
 *     serait soit trop court soit du gaspillage).
 */
function spyContractorApi(): void {
  cy.intercept('GET', '/contractor-compliance/dashboard*').as('getDashboard');
  cy.intercept('GET', '/contractor-compliance/documents*').as('getDocuments');
  // Détail document : le SDK ng-openapi-gen appelle GET /documents/{uuid}
  // (documentsGet.PATH) — l'ancien `/documents/*/status` n'existe plus.
  cy.intercept('GET', '/contractor-compliance/documents/*').as('getDocumentStatus');
  // Plan courant : route SDK = /billing/subscription (billingSubscription.PATH),
  // l'ancien /billing/plan a été renommé côté backend Tuita.
  cy.intercept('GET', '/contractor-compliance/billing/subscription*').as('getBilling');
  cy.intercept('GET', '/contractor-compliance/invoices*').as('getInvoices');
  // Missions : pas de route agrégée `/missions` — le SDK route sur
  // /missions/active, /missions/history et /missions/offers.
  cy.intercept('GET', '/contractor-compliance/missions/*').as('getMissions');
  cy.intercept('GET', '/contractor-compliance/kyc/status*').as('getKycStatus');
  cy.intercept('GET', '/contractor-compliance/certification/status*').as('getCertificationStatus');
}

interface MockFixtures {
  dashboard?: string;
  invoices?: string;
  missions?: string;
  billing?: string;
}

Cypress.Commands.add('mockContractorApi', (fixtures?: string | MockFixtures) => {
  // En mode real-backend : pas de stub, juste des SPY-intercepts pour que les
  // alias existent (cf. spyContractorApi). Les vraies requêtes partent vers
  // le backend à travers le proxy ng serve.
  if (skipIfRealBackend()) {
    spyContractorApi();
    return;
  }

  const f: MockFixtures = typeof fixtures === 'string'
    ? { dashboard: fixtures }
    : fixtures ?? {};

  // ── Dashboard ──
  // Backend: GET /dashboard (contractor.php:54)
  cy.intercept('GET', '/contractor-compliance/dashboard', {
    fixture: f.dashboard ?? 'dashboard.json',
  }).as('getDashboard');

  // ── Documents ──
  // Backend: GET /documents (contractor.php:58)
  cy.intercept('GET', '/contractor-compliance/documents*', { fixture: 'documents.json' }).as('getDocuments');

  // Backend: POST /documents/upload (contractor.php:59)
  cy.intercept('POST', '/contractor-compliance/documents/upload', {
    statusCode: 201,
    body: {
      success: true,
      data: {
        document: {
          uuid: 'doc-new-uuid-001', type: 'other', status: 'processing',
          file_name: 'document.pdf', file_size: 245000, mime_type: 'application/pdf',
          uploaded_at: new Date().toISOString(),
        },
      },
    },
  }).as('uploadDocument');

  // Détail d'un document. Le SDK ng-openapi-gen appelle GET /documents/{uuid}
  // (documentsGet.PATH = /contractor-compliance/documents/{uuid}). L'ancienne
  // route `/documents/{uuid}/status` n'existe plus côté backend ni dans le SDK.
  // L'intercept `/documents/*` ne capture que les sous-chemins (un segment) :
  // il ne chevauche donc PAS l'intercept liste `/documents*` ci-dessus.
  cy.intercept('GET', '/contractor-compliance/documents/*', { fixture: 'document-status.json' }).as('getDocumentStatus');

  // Backend: POST /documents/purchase-kbis (contractor.php:72) — NB: hyphen, not slash
  cy.intercept('POST', '/contractor-compliance/documents/purchase-kbis', {
    statusCode: 200,
    body: { success: true, data: { purchase_uuid: 'purchase-uuid-001', status: 'completed', document_type: 'kbis', price_eur: 3.90 } },
  }).as('purchaseKbis');

  // ── KYC ──
  // Backend: POST /kyc/challenge (contractor.php:78)
  cy.intercept('POST', '/contractor-compliance/kyc/challenge', {
    statusCode: 200,
    body: {
      data: {
        session_uuid: 'kyc-session-uuid-001', challenge_token: 'challenge-token-abc123',
        challenge: 'turn_left', challenge_2: 'blink',
        expires_at: new Date(Date.now() + 300000).toISOString(),
        expires_in: 300, device_type: 'desktop', video_max_duration_seconds: 10,
      },
    },
  }).as('generateChallenge');

  // Backend: POST /kyc/video (contractor.php:79)
  cy.intercept('POST', '/contractor-compliance/kyc/video', {
    statusCode: 200,
    body: {
      success: true,
      data: {
        session: { uuid: 'kyc-session-uuid-001', status: 'processing', created_at: new Date().toISOString() },
        message: 'Video soumise avec succes.',
      },
    },
  }).as('submitVideo');

  // Backend: GET /kyc/status (contractor.php:80)
  cy.intercept('GET', '/contractor-compliance/kyc/status', {
    statusCode: 200,
    body: { data: { status: 'not_started', liveness_passed: false, face_match_score: null, completed_at: null } },
  }).as('getKycStatus');

  // ── Billing ──
  // Plan courant. Route SDK = GET /billing/subscription (billingSubscription.PATH).
  // L'ancien /billing/plan a été renommé côté backend Tuita — la page
  // /billing (ContractorBillingComponent) consomme désormais /subscription.
  cy.intercept('GET', '/contractor-compliance/billing/subscription', {
    fixture: f.billing ?? 'billing.json',
  }).as('getBilling');

  // Historique de paiements abonnement. La page /billing appelle aussi
  // getPaymentHistory() → /billing/payment-history. Sans ce stub, l'appel
  // partirait au vrai backend (404) et laisserait la page en erreur.
  cy.intercept('GET', '/contractor-compliance/billing/payment-history', {
    statusCode: 200,
    body: {
      data: {
        payments: [],
        summary: {
          total_spent_eur: 0,
          subscriptions_eur: 0,
          purchases_eur: 0,
          current_plan: 'free',
        },
      },
    },
  }).as('getPaymentHistory');

  // Backend: POST /billing/subscribe (contractor.php:87)
  cy.intercept('POST', '/contractor-compliance/billing/subscribe', {
    statusCode: 200,
    body: { data: { checkout_url: '' } },
  }).as('subscribePlan');

  // Backend: POST /billing/cancel — résiliation abonnement Pro.
  cy.intercept('POST', '/contractor-compliance/billing/cancel', {
    statusCode: 200,
    body: { data: { plan: 'free', effective_at: new Date().toISOString(), message: 'Abonnement résilié.' } },
  }).as('cancelPlan');

  // ── Invoices ──
  // Liste paginée. Backend: GET /invoices (invoicesList.PATH).
  // NB : `/invoices*` capture aussi `/invoices/{uuid}` — l'intercept détail
  // ci-dessous est registré APRÈS pour gagner la priorité (Cypress applique
  // le dernier intercept correspondant).
  cy.intercept('GET', '/contractor-compliance/invoices', {
    fixture: f.invoices ?? 'invoices.json',
  }).as('getInvoices');
  // Variante avec query string (?page=&per_page=&status=) — le composant
  // factures pagine, l'URL porte donc toujours des paramètres.
  cy.intercept('GET', '/contractor-compliance/invoices?*', {
    fixture: f.invoices ?? 'invoices.json',
  }).as('getInvoices');

  // Backend: POST /invoices/upload (contractor.php:100)
  cy.intercept('POST', '/contractor-compliance/invoices/upload', {
    statusCode: 201,
    body: { success: true, data: { uuid: 'inv-new-uuid', invoice_number: 'FAC-2026-NEW', status: 'validating' } },
  }).as('uploadInvoice');

  // Backend: POST /invoices/{invoice}/reupload (contractor.php:101)
  cy.intercept('POST', '/contractor-compliance/invoices/*/reupload', {
    statusCode: 200,
    body: { success: true, data: { uuid: 'inv-manual-002', status: 'validating' } },
  }).as('reuploadInvoice');

  // Backend: GET /invoices/{invoice}/pdf (invoicesPdf.PATH)
  cy.intercept('GET', '/contractor-compliance/invoices/*/pdf', {
    statusCode: 200,
    headers: { 'content-type': 'application/pdf' },
    body: new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' }),
  }).as('downloadInvoicePdf');

  // Timeline d'une facture (invoicesTimeline.PATH) — relue par les écrans
  // de détail après navigation. Stub minimal pour éviter un 404 réel.
  cy.intercept('GET', '/contractor-compliance/invoices/*/timeline', {
    statusCode: 200,
    body: { data: { status: 'paid', phase: 'paid', events: [] } },
  }).as('getInvoiceTimeline');

  // Détail d'une facture (invoicesShow.PATH = /invoices/{uuid}). Registré
  // APRÈS la liste pour gagner la priorité sur `/invoices/{uuid}`.
  // La fixture `invoice-detail.json` porte un objet unique `{ data: {...} }`.
  cy.intercept('GET', '/contractor-compliance/invoices/*', {
    fixture: 'invoice-detail.json',
  }).as('getInvoiceDetail');

  // ── Missions ──
  // Le backend Tuita n'expose pas de route `/missions` agrégée. Le SDK route :
  //   - liste interventions  → /missions/active  (missionsActive.PATH)
  //   - historique           → /missions/history (missionsHistory.PATH)
  //   - offres disponibles   → /missions/offers  (missionsOffers.PATH)
  //   - détail mission       → /missions/{ref}   (missionsShow.PATH)
  //
  // La route Angular /missions affiche ContractorMissionOffersComponent
  // (page « Offres disponibles ») qui consomme /missions/offers → fixture
  // au format MissionOffer[]. La route /interventions/:mid affiche le détail
  // mission (facture) qui consomme /missions/{ref}.

  // Offres disponibles — consommé par /missions (liste) ET /missions/:mid
  // (détail offre, qui filtre la liste côté client par mission_ref).
  cy.intercept('GET', '/contractor-compliance/missions/offers*', {
    fixture: 'mission-offers.json',
  }).as('getMissionOffers');

  // Détail d'une mission précise (/missions/{ref}) — consommé par la page
  // détail intervention (/interventions/:mid) qui affiche le statut facture.
  // Doit être registré AVANT `/missions/active*` pour ne pas être masqué.
  cy.intercept('GET', '/contractor-compliance/missions/MIS-*', {
    fixture: 'mission-detail.json',
  }).as('getMissionDetail');
  cy.intercept('GET', '/contractor-compliance/missions/CASE-*', {
    fixture: 'mission-detail.json',
  }).as('getMissionDetail');

  // Liste des interventions (missions réalisées). Alias historique
  // `getMissions` conservé pour les specs qui l'attendent encore.
  cy.intercept('GET', '/contractor-compliance/missions/active*', {
    fixture: f.missions ?? 'missions.json',
  }).as('getMissions');
  cy.intercept('GET', '/contractor-compliance/missions/history*', {
    fixture: f.missions ?? 'missions.json',
  }).as('getMissionsHistory');


  // ── Certification ──
  // Backend: GET /certification/status (contractor.php:113)
  cy.intercept('GET', '/contractor-compliance/certification/status', {
    statusCode: 200,
    body: { data: { completed: false, completed_at: null, score: 0 } },
  }).as('getCertificationStatus');

  // Backend: POST /certification/complete (contractor.php:114)
  cy.intercept('POST', '/contractor-compliance/certification/complete', {
    statusCode: 200,
    body: { data: { score: 80, passed: true } },
  }).as('completeCertification');
});

// ───────────────────────────────────────────────────────────────────────
// Admin validation/review mocks (legacy Sanctum routes)
// Verified against api.php:229-232 + api.php:267
// ───────────────────────────────────────────────────────────────────────

Cypress.Commands.add('mockAdminValidationApi', () => {
  // Routes admin legacy Sanctum : non servies par Laminas → ces specs ne
  // sont pas convertibles en real-backend, le mock reste indispensable même
  // quand le toggle est actif. On loggue quand même pour la traçabilité.
  if (skipIfRealBackend()) {
    cy.log('⚠️ mockAdminValidationApi : routes legacy Sanctum — mock conservé en real-backend');
  }

  // Backend: GET /admin/validations (api.php:230)
  cy.intercept('GET', '/api/admin/validations*', {
    fixture: 'admin-validations-pending.json',
  }).as('getValidations');

  // Backend: GET /admin/validations/{verification} (api.php:231)
  cy.intercept('GET', '/api/admin/validations/*', {
    fixture: 'admin-validation-detail.json',
  }).as('getValidationDetail');

  // Backend: PUT /admin/validations/{verification}/review (api.php:232)
  cy.intercept('PUT', '/api/admin/validations/*/review', (req) => {
    req.reply({
      statusCode: 200,
      body: {
        success: true,
        data: {
          uuid: 'verif-uuid-001',
          status: req.body.decision === 'approved' ? 'verified' : req.body.decision === 'rejected' ? 'rejected' : 'pending',
          review: {
            decision: req.body.decision,
            notes: req.body.notes ?? null,
            reviewed_at: new Date().toISOString(),
            reviewed_by: 'admin@tuita.fr',
          },
        },
      },
    });
  }).as('reviewValidation');

  // Backend: GET /admin/resilience/kyc/failures (api.php:267)
  cy.intercept('GET', '/api/admin/resilience/kyc/failures*', {
    fixture: 'admin-kyc-manual-review.json',
  }).as('getKycFailures');
});

// ───────────────────────────────────────────────────────────────────────
// cy.waitApi(alias) — attente d'un appel API tolérante aux 2 modes
// ───────────────────────────────────────────────────────────────────────
//
// PIÈGE #1 (cf. WS3-CYPRESS.md) : en mode real-backend, un mock no-op ne
// poserait aucun intercept → les alias `@getDashboard` etc. n'existeraient
// jamais et `cy.wait('@getDashboard')` lèverait « no request ever occurred ».
//
// SOLUTION : en real-backend, mockContractorApi() pose des SPY-intercepts
// (spyContractorApi) → l'alias existe ET la requête part au vrai backend.
// cy.waitApi() peut alors faire un vrai cy.wait(alias) dans LES DEUX modes :
//   - mode mock : attend la requête interceptée/stubbée.
//   - mode real : attend la VRAIE requête (timeout généreux : certains
//     endpoints réels — /documents avec ses payloads OCR — répondent en
//     plusieurs secondes).
//
// PRÉREQUIS : la spec doit avoir appelé mockContractorApi() au préalable
// (dans un beforeEach) — c'est lui qui enregistre l'alias, en mode mock
// comme en real-backend. C'est le cas des 6 specs « convertible direct ».
Cypress.Commands.add('waitApi', (alias: string) => {
  // Timeout généreux en real-backend : les endpoints réels (notamment
  // /documents avec ses gros payloads OCR) peuvent répondre en >10s.
  const timeout = REAL_BACKEND ? 30000 : 10000;
  cy.wait(alias, { timeout });
});

// ───────────────────────────────────────────────────────────────────────
// Helpers d'authentification real-backend
// ───────────────────────────────────────────────────────────────────────
//
// GARDE-FOU SMS/mail : ces helpers ne doivent recevoir QUE des numéros de
// téléphone factices (06 00 00 00 9x). Le seed contient de vrais numéros de
// contractors — un request-pin vers un vrai numéro tenterait un envoi SMS.
// IS_PROD=false protège (MySmsSender fail-closed) mais on n'en dépend pas :
// on n'utilise QUE des numéros factices, point.

/**
 * Authentifie un contractor via le flow PIN SMS Tuita natif et pose le
 * cookie de session __contractor_ssid (récupéré automatiquement par
 * withCredentials côté Angular et propagé par le proxy ng serve).
 *
 * @param phonePlus  Téléphone FACTICE au format P33XXXXXXXXX (ex P33600000099).
 */
/**
 * Un tour de cycle pin → lecture → login. Retourne true si la session est
 * établie (login 200 + data non-false), false sinon (PIN périmé/race).
 */
function attemptContractorLogin(phonePlus: string): Cypress.Chainable<boolean> {
  // Étape 1 — déclenche la génération du PIN (stocké en clair en dev).
  return cy
    .request('POST', '/contractor/auth/pin', { smsphone: phonePlus })
    .its('status')
    .should('eq', 200)
    .then(() =>
      // Étape 2 — lit le PIN en clair depuis cft_contractor_oauth via cy.task.
      cy.task<string>('readContractorPin', phonePlus)
    )
    .then((pin) =>
      // Étape 3 — login. `failOnStatusCode:false` : on inspecte la réponse
      // nous-mêmes pour décider si un retry est nécessaire.
      cy.request({
        method: 'POST',
        url: '/contractor/auth/login',
        body: { smsphone: phonePlus, pincode: pin },
        failOnStatusCode: false,
      })
    )
    .then((res) => {
      // POURQUOI on ne se fie pas qu'au statut : /contractor/auth/login
      // renvoie 200 MÊME quand le PIN est faux/périmé — `data` vaut alors
      // false/null et AUCUN cookie n'est posé (cf. AuthSteps backend). C'est
      // le cas en cas de course PIN entre deux tests. On renvoie false pour
      // déclencher un retry du cycle complet.
      const ok = res.status === 200 && !!(res.body && res.body.data);
      return cy.wrap(ok, { log: false });
    });
}

Cypress.Commands.add('loginContractor', (phonePlus: string) => {
  // Retry du cycle complet : la race PIN (request-pin renvoie 200 avant que
  // la nouvelle valeur sms_password ne soit lisible/propagée) peut faire
  // échouer un login isolé. 3 tentatives suffisent largement en pratique.
  const tryLogin = (remaining: number): void => {
    attemptContractorLogin(phonePlus).then((ok) => {
      if (ok) {
        return;
      }
      if (remaining <= 1) {
        throw new Error(
          `loginContractor(${phonePlus}) : login échoué après plusieurs essais ` +
            `(PIN refusé). Le contractor existe-t-il et le backend est-il en dev ?`
        );
      }
      cy.log(`loginContractor: PIN refusé, nouvelle tentative (${remaining - 1} restantes)`);
      tryLogin(remaining - 1);
    });
  };
  tryLogin(3);

  // Garde-fou final : le cookie de session doit être présent. Sans lui,
  // toutes les requêtes Angular partiraient sans auth → 401 → redirect /login.
  cy.getCookie('__contractor_ssid').should('exist');
});

/**
 * Authentifie un compte staff Tuita (back-office) et stocke l'access_token
 * OAuth2 dans sessionStorage.tuita_admin_token (clé lue par adminAuthGuard).
 *
 * Flow imposé : request-pin → lecture PIN dans le log applicatif → POST
 * /signin form-encoded avec header Sms-Trip (cf. AdminAuthSteps backend).
 *
 * @param email  Email du compte staff (doit exister en oauth_users role=staff).
 */
Cypress.Commands.add('loginAdmin', (email: string) => {
  cy.request('POST', '/contractor-compliance/admin/auth/request-pin', { email })
    .then((r) => {
      const smsTrip = r.body.sms_trip_token;
      expect(smsTrip, 'sms_trip_token présent dans la réponse request-pin').to.be.ok;

      cy.task<string>('readAdminPin', email).then((pin) => {
        cy.request({
          method: 'POST',
          url: '/signin',
          form: true,
          body: {
            grant_type: 'password',
            username: email,
            password: pin,
            client_id: 'tuita',
          },
          headers: { 'Sms-Trip': smsTrip },
        }).then((s) => {
          expect(s.status, '/signin renvoie 200').to.eq(200);
          // adminAuthGuard lit cette clé pour autoriser les routes /admin/*.
          window.sessionStorage.setItem('tuita_admin_token', s.body.access_token);
        });
      });
    });
});

// ───────────────────────────────────────────────────────────────────────
// cy.assertAppShell() — landmark stable du mode real-backend
// ───────────────────────────────────────────────────────────────────────
//
// POURQUOI : en real-backend, le CONTENU d'une page contractor n'est pas
// déterministe — l'état (score, plan, vérifié/non) est piloté par la synchro
// smith Tuita, et certains états déclenchent un 403 « compte non vérifié » ou
// l'ouverture automatique d'une modale promo « Passez au Plan Pro » qui
// recouvre le corps de page. Asserter `cy.contains('Bonjour')` est donc
// fragile.
//
// CE QUI EST STABLE : le `app-header` (logo Tuita + icônes de navigation)
// est rendu pour TOUTE route contractor authentifiée, quel que soit l'état
// du contractor et qu'une modale soit ouverte ou non. C'est le landmark
// real-backend de référence : il prouve que l'app a bien booté, routé, et
// monté le layout contractor — sans dépendre de données métier.
Cypress.Commands.add('assertAppShell', () => {
  // app-root non vide : Angular a bootstrappé.
  cy.get('app-root', { timeout: 20000 }).should('not.be.empty');
  // Le header contractor est monté (logo Tuita) — présent sur toutes les
  // pages du layout, derrière une éventuelle modale.
  cy.get('app-header, .contractor-header', { timeout: 20000 }).should('exist');
});

// ───────────────────────────────────────────────────────────────────────
// cy.dismissStepperVideo() — ferme la modale vidéo du stepper d'upload
// ───────────────────────────────────────────────────────────────────────
//
// POURQUOI : à l'arrivée sur /documents/upload, le stepper guidé ouvre
// automatiquement une modale vidéo explicative (OnboardingVideoDialogComponent)
// qui recouvre le contenu de l'étape — y compris le <input type=file>. Tant
// que la modale est ouverte, aucun upload n'est possible.
//
// La modale s'ouvre de façon asynchrone (après chargement des données du
// stepper) : on attend donc explicitement l'apparition du bouton « J'ai
// compris » avant de cliquer. En session Cypress fraîche (chaque test repart
// d'un état vierge), la modale s'ouvre systématiquement sur le stepper.
Cypress.Commands.add('dismissStepperVideo', () => {
  cy.contains('button', "J'ai compris", { timeout: 15000 })
    .should('be.visible')
    .click();
  // Attend la fin de l'animation de fermeture du MatDialog : le bouton
  // « J'ai compris » ne doit plus être dans le DOM avant de cibler le
  // contenu de l'étape.
  cy.contains('button', "J'ai compris").should('not.exist');
});

// ───────────────────────────────────────────────────────────────────────
// cy.openStepperUploadZone() — révèle la zone de dépôt de l'étape courante
// ───────────────────────────────────────────────────────────────────────
//
// POURQUOI : sur l'étape « Ta pièce d'identité » du stepper, aucune zone de
// dépôt n'est rendue tant que l'artisan n'a pas choisi une variante
// (Carte d'identité / Passeport). Sur une étape document simple, la dropzone
// est rendue d'emblée. Ce helper clique la variante CNI SI le sélecteur est
// présent — sinon no-op — pour qu'un <input type=file> soit toujours
// disponible juste après.
Cypress.Commands.add('openStepperUploadZone', () => {
  // Attend que le contenu de l'étape soit rendu (sélecteur de variante
  // identité OU input fichier déjà présent) avant de décider.
  cy.get('[data-testid="identity-variant-cni"], input[type="file"]', {
    timeout: 15000,
  }).should('exist');
  cy.get('body').then(($body) => {
    const variant = $body.find('[data-testid="identity-variant-cni"]:visible');
    if (variant.length) {
      cy.wrap(variant.first()).click();
    }
  });
});

// ─── Type augmentation ───

declare global {
  namespace Cypress {
    interface Chainable {
      mockContractorApi(fixtures?: string | MockFixtures): Chainable<void>;
      mockAdminValidationApi(): Chainable<void>;
      /** Ferme la modale vidéo du stepper d'upload si elle est ouverte. */
      dismissStepperVideo(): Chainable<void>;
      /** Révèle la zone de dépôt de l'étape stepper courante (clic variante). */
      openStepperUploadZone(): Chainable<void>;
      /** Attente d'un appel API tolérante aux modes mock / real-backend. */
      waitApi(alias: string): Chainable<void>;
      /** Auth contractor via PIN SMS (real-backend). Numéro FACTICE only. */
      loginContractor(phonePlus: string): Chainable<void>;
      /** Auth staff Tuita via OAuth2 PIN (real-backend). */
      loginAdmin(email: string): Chainable<void>;
      /** Vérifie le shell applicatif (header) — landmark stable real-backend. */
      assertAppShell(): Chainable<void>;
    }
  }
}
