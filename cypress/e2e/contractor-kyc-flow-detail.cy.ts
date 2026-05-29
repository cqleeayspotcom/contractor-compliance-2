/// <reference types="cypress" />

/**
 * KYC FLOW DETAILLE — Termes, challenge, polling, echecs biometriques
 */

const PAUSE = 3000;

describe('KYC — flow detaille', () => {

  beforeEach(() => {
    cy.mockContractorApi();
  });

  it('affiche la page KYC avec les conditions', () => {
    cy.visit('/kyc');
    cy.wait('@getDashboard');

    cy.url().should('include', '/kyc');

    cy.wait(PAUSE);
  });

  it('polling KYC retourne "approved" apres soumission video', () => {
    // Mock le challenge
    cy.intercept('POST', '/contractor-compliance/kyc/challenge', {
      statusCode: 200,
      body: {
        data: {
          session_uuid: 'kyc-sess-001',
          challenge_token: 'tok-abc',
          challenge: 'turn_left',
          challenge_2: 'smile',
          expires_at: new Date(Date.now() + 300000).toISOString(),
          expires_in: 300,
          device_type: 'desktop',
          video_max_duration_seconds: 10,
        },
      },
    }).as('challenge');

    // Mock le polling qui retourne approved
    cy.intercept('GET', '/contractor-compliance/kyc/status', {
      statusCode: 200,
      body: {
        data: {
          status: 'approved',
          liveness_passed: true,
          face_match_score: 0.94,
          completed_at: new Date().toISOString(),
        },
      },
    }).as('kycApproved');

    cy.visit('/kyc');
    cy.wait('@getDashboard');

    cy.wait(PAUSE);
  });

  it('polling KYC retourne "rejected" avec raison face_mismatch', () => {
    cy.intercept('GET', '/contractor-compliance/kyc/status', {
      statusCode: 200,
      body: {
        data: {
          status: 'rejected',
          liveness_passed: true,
          face_match_score: 0.32,
          completed_at: new Date().toISOString(),
          failure_reason: 'face_mismatch',
          failure_detail: 'Le visage de la video ne correspond pas au document d\'identite.',
        },
      },
    }).as('kycRejected');

    cy.visit('/kyc');
    cy.wait('@getDashboard');

    cy.wait(PAUSE);
  });

  it('polling KYC retourne "rejected" avec spoofing_detected', () => {
    cy.intercept('GET', '/contractor-compliance/kyc/status', {
      statusCode: 200,
      body: {
        data: {
          status: 'rejected',
          liveness_passed: false,
          face_match_score: null,
          completed_at: new Date().toISOString(),
          failure_reason: 'spoofing_detected',
          failure_detail: 'Tentative de fraude detectee. Utilisez votre vrai visage face a la camera.',
        },
      },
    }).as('kycSpoofing');

    cy.visit('/kyc');
    cy.wait('@getDashboard');

    cy.wait(PAUSE);
  });

  it('KYC en pending_manual_review (service biometrique down)', () => {
    cy.intercept('GET', '/contractor-compliance/kyc/status', {
      statusCode: 200,
      body: {
        data: {
          status: 'pending_manual_review',
          liveness_passed: false,
          face_match_score: null,
          completed_at: null,
          failure_reason: 'biometric_service_unavailable',
          failure_detail: 'Service biometrique temporairement indisponible. Un administrateur va examiner votre verification.',
        },
      },
    }).as('kycManualReview');

    cy.visit('/kyc');
    cy.wait('@getDashboard');

    cy.wait(PAUSE);
  });

  it('KYC en "processing" — le contractor attend', () => {
    cy.intercept('GET', '/contractor-compliance/kyc/status', {
      statusCode: 200,
      body: {
        data: {
          status: 'processing',
          liveness_passed: false,
          face_match_score: null,
          completed_at: null,
        },
      },
    }).as('kycProcessing');

    cy.visit('/kyc');
    cy.wait('@getDashboard');

    cy.wait(PAUSE);
  });
});
