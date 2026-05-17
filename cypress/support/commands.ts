/// <reference types="cypress" />

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Custom Cypress commands for contractor compliance E2E tests
// All mocks use JSON fixtures from cypress/fixtures/
//
// SYNC CHECK: All endpoints verified against backend/routes/contractor.php
// and backend/routes/api.php on 2026-04-16.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface MockFixtures {
  dashboard?: string;
  invoices?: string;
  missions?: string;
  billing?: string;
}

Cypress.Commands.add('mockContractorApi', (fixtures?: string | MockFixtures) => {
  const f: MockFixtures = typeof fixtures === 'string'
    ? { dashboard: fixtures }
    : fixtures ?? {};

  // â”€â”€ Dashboard â”€â”€
  // Backend: GET /dashboard (contractor.php:54)
  cy.intercept('GET', '/contractor-compliance/dashboard', {
    fixture: f.dashboard ?? 'dashboard.json',
  }).as('getDashboard');

  // â”€â”€ Documents â”€â”€
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

  // Backend: GET /documents/{document}/status (contractor.php:60)
  cy.intercept('GET', '/contractor-compliance/documents/*/status', { fixture: 'document-status.json' }).as('getDocumentStatus');

  // Backend: POST /documents/purchase-kbis (contractor.php:72) â€” NB: hyphen, not slash
  cy.intercept('POST', '/contractor-compliance/documents/purchase-kbis', {
    statusCode: 200,
    body: { success: true, data: { purchase_uuid: 'purchase-uuid-001', status: 'completed', document_type: 'kbis', price_eur: 3.90 } },
  }).as('purchaseKbis');

  // â”€â”€ KYC â”€â”€
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

  // â”€â”€ Billing â”€â”€
  // Backend: GET /billing/plan (contractor.php:85) â€” NB: /billing/plan, not /billing
  cy.intercept('GET', '/contractor-compliance/billing/plan', {
    fixture: f.billing ?? 'billing.json',
  }).as('getBilling');

  // Backend: POST /billing/subscribe (contractor.php:87)
  cy.intercept('POST', '/contractor-compliance/billing/subscribe', {
    statusCode: 200,
    body: { data: { checkout_url: '' } },
  }).as('subscribePlan');

  // â”€â”€ Invoices â”€â”€
  // Backend: GET /invoices (contractor.php:99)
  cy.intercept('GET', '/contractor-compliance/invoices*', {
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

  // Backend: GET /invoices/{invoice}/pdf (contractor.php:102)
  cy.intercept('GET', '/contractor-compliance/invoices/*/pdf', {
    statusCode: 200,
    headers: { 'content-type': 'application/pdf' },
    body: new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' }),
  }).as('downloadInvoicePdf');

  // â”€â”€ Missions â”€â”€
  // Backend: GET /missions/{mission} (contractor.php:94) â€” MUST be before the list intercept
  cy.intercept('GET', /\/api\/contractor\/missions\/MIS-/, {
    fixture: 'mission-detail.json',
  }).as('getMissionDetail');

  // Backend: GET /missions (contractor.php:93) â€” may have ?status= query param
  cy.intercept('GET', '/contractor-compliance/missions*', {
    fixture: f.missions ?? 'missions.json',
  }).as('getMissions');


  // â”€â”€ Certification â”€â”€
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Admin supervision mocks
// All verified against contractor.php:122-163
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface AdminFixtures {
  health?: string;
  queues?: string;
  webhooks?: string;
  circuits?: string;
  complianceStats?: string;
}

Cypress.Commands.add('mockAdminApi', (fixtures?: AdminFixtures) => {
  const f = fixtures ?? {};

  // Backend: GET /admin/health (contractor.php:124)
  cy.intercept('GET', '/contractor-compliance/admin/health', {
    fixture: f.health ?? 'admin-health.json',
  }).as('getHealth');

  // Backend: GET /admin/queues/status (contractor.php:129)
  cy.intercept('GET', '/contractor-compliance/admin/queues/status', {
    fixture: f.queues ?? 'admin-queues.json',
  }).as('getQueues');

  // Backend: GET /admin/tasks/failed (contractor.php:130)
  cy.intercept('GET', '/contractor-compliance/admin/tasks/failed', {
    statusCode: 200,
    body: { data: [] },
  }).as('getFailedTasks');

  // Backend: POST /admin/tasks/{id}/retry (contractor.php:131) â€” single task retry
  cy.intercept('POST', '/contractor-compliance/admin/tasks/*/retry', {
    statusCode: 200,
    body: { success: true },
  }).as('retryTask');

  // Backend: GET /admin/webhooks/logs (contractor.php:134)
  cy.intercept('GET', '/contractor-compliance/admin/webhooks/logs', {
    fixture: f.webhooks ?? 'admin-webhooks.json',
  }).as('getWebhooks');

  // Backend: POST /admin/webhooks/{id}/replay (contractor.php:135)
  cy.intercept('POST', '/contractor-compliance/admin/webhooks/*/replay', {
    statusCode: 200,
    body: { success: true },
  }).as('replayWebhook');

  // Backend: GET /admin/circuit-breakers (contractor.php:136) â€” read only, no /close endpoint
  cy.intercept('GET', '/contractor-compliance/admin/circuit-breakers', {
    fixture: f.circuits ?? 'admin-circuits.json',
  }).as('getCircuits');

  // Backend: GET /admin/compliance/stats (contractor.php:162)
  cy.intercept('GET', '/contractor-compliance/admin/compliance/stats', {
    fixture: f.complianceStats ?? 'admin-compliance-stats.json',
  }).as('getComplianceStats');

  // â”€â”€ Admin actions on contractors â”€â”€

  // Backend: GET /admin/contractors (contractor.php:139)
  cy.intercept('GET', '/contractor-compliance/admin/contractors', {
    statusCode: 200,
    body: { data: [] },
  }).as('getContractors');

  // Backend: POST /admin/documents/{uuid}/extend (contractor.php:152)
  cy.intercept('POST', '/contractor-compliance/admin/documents/*/extend', {
    statusCode: 200,
    body: { success: true },
  }).as('extendDocument');

  // Backend: GET /admin/kyc/sessions (contractor.php:147)
  cy.intercept('GET', '/contractor-compliance/admin/kyc/sessions', {
    statusCode: 200,
    body: { data: [] },
  }).as('getKycSessions');

  // Backend: GET /admin/kyc/rejections (contractor.php:148)
  cy.intercept('GET', '/contractor-compliance/admin/kyc/rejections', {
    statusCode: 200,
    body: { data: [] },
  }).as('getKycRejections');

  // Backend: POST /admin/kyc/{sessionUuid}/force-approve (contractor.php:149)
  cy.intercept('POST', '/contractor-compliance/admin/kyc/*/force-approve', {
    statusCode: 200,
    body: { success: true },
  }).as('forceApproveKyc');

  // Backend: POST /admin/contractors/{userId}/purchase-kbis (contractor.php:155)
  cy.intercept('POST', '/contractor-compliance/admin/contractors/*/purchase-kbis', {
    statusCode: 200,
    body: { success: true },
  }).as('adminPurchaseKbis');
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Admin validation/review mocks (legacy Sanctum routes)
// Verified against api.php:229-232 + api.php:267
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

Cypress.Commands.add('mockAdminValidationApi', () => {
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

// â”€â”€â”€ Type augmentation â”€â”€â”€

declare global {
  namespace Cypress {
    interface Chainable {
      mockContractorApi(fixtures?: string | MockFixtures): Chainable<void>;
      mockAdminApi(fixtures?: AdminFixtures): Chainable<void>;
      mockAdminValidationApi(): Chainable<void>;
    }
  }
}
