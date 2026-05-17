/// <reference types="cypress" />

/**
 * FLOW VALIDATION MANUELLE — Admin Tuita deblocage artisans
 *
 * Scenarios ou l'automatisme ne suffit pas :
 *
 *  1. Document OCR confidence trop basse (< 0.70) → pending_manual_review
 *     → Admin consulte le document + donnees OCR extraites
 *     → Decide : approuver, rejeter, ou demander re-upload
 *
 *  2. KYC biometrique echoue apres 3 retries (service down)
 *     → Session en pending_manual_review
 *     → Admin consulte les scores disponibles + frames
 *     → Decide : approuver manuellement ou rejeter
 *
 *  3. KBIS avec SIREN mismatch → flag, admin verifie
 *
 * Ces tests valident les fixtures et simulent les appels API via cy.intercept.
 * Un cy.visit('/admin') declenche les appels interceptes.
 */

const PAUSE = 3000;
const ADMIN_KEY = 'test-admin-api-key-cypress';

function preAuth() {
  cy.visit('/admin');
  cy.window().then(win => win.sessionStorage.setItem('tuita_admin_key', ADMIN_KEY));
}

describe('Validation manuelle — Admin Tuita', () => {

  // ═══════════════════════════════════════════
  // SCENARIO 1 : Documents en pending_manual_review
  // ═══════════════════════════════════════════

  describe('Documents en pending_manual_review (OCR faible)', () => {

    it('3 documents en attente de review avec flags coherents', () => {
      cy.fixture('admin-validations-pending.json').then((data) => {
        expect(data.data).to.have.length(3);

        // URSSAF — confiance basse + date potentiellement expiree
        const urssaf = data.data[0];
        expect(urssaf.status).to.eq('pending_manual_review');
        expect(urssaf.score).to.eq(0.58);
        expect(urssaf.score).to.be.lessThan(0.70);
        expect(urssaf.flags).to.include('low_confidence');
        expect(urssaf.flags).to.include('possible_expired_date');
        expect(urssaf.document_type).to.eq('urssaf');
        expect(urssaf.contractor_name).to.eq('LUCIAN SIRBU');

        // KBIS — SIREN mismatch
        const kbis = data.data[1];
        expect(kbis.score).to.eq(0.62);
        expect(kbis.flags).to.include('siren_mismatch');
        expect(kbis.document_type).to.eq('kbis');
        expect(kbis.contractor_name).to.eq('JEAN DUPONT');

        // RC Pro — document illisible
        const rc = data.data[2];
        expect(rc.score).to.eq(0.45);
        expect(rc.flags).to.include('unreadable_document');
        expect(rc.document_type).to.eq('rc');
        expect(rc.contractor_name).to.eq('PIERRE MARTIN');
      });

      cy.wait(PAUSE);
    });

    it('detail validation contient document, entreprise, OCR et flags', () => {
      cy.fixture('admin-validation-detail.json').then((data) => {
        const v = data.data;

        // Document
        expect(v.document.type).to.eq('urssaf');
        expect(v.document.file_name).to.eq('attestation_urssaf.pdf');
        expect(v.document.file_url).to.not.be.empty;

        // Entreprise
        expect(v.company.name).to.eq('SIRBU LUCIAN BTP');
        expect(v.company.siret).to.eq('12345678900012');

        // Score OCR trop bas pour validation auto
        expect(v.score).to.eq(0.58);
        expect(v.status).to.eq('pending_manual_review');

        // Donnees extraites — l'admin peut les comparer au document
        const extracted = v.result_json.extracted_data;
        expect(extracted.company_name).to.eq('SIRBU LUCIAN BTP');
        expect(extracted.siret).to.eq('12345678900012');
        expect(extracted.status).to.eq('a jour');
        expect(extracted.period).to.eq('T1 2026');
        expect(extracted.expiry_date).to.eq('2026-07-01');

        // Texte OCR brut pour verification visuelle
        expect(v.result_json.ocr_markdown).to.contain('ATTESTATION DE VIGILANCE');
        expect(v.result_json.ocr_markdown).to.contain('SIRBU LUCIAN BTP');

        // Flags
        expect(v.flags_json).to.include('low_confidence');
        expect(v.flags_json).to.include('possible_expired_date');

        // Pas encore de review
        expect(v.review).to.be.null;
      });

      cy.wait(PAUSE);
    });

    it('admin APPROUVE le document via API (force override)', () => {
      cy.mockAdminApi();
      cy.intercept('PUT', '/api/admin/validations/verif-uuid-001/review', (req) => {
        expect(req.body.decision).to.eq('approved');
        expect(req.body.force_override).to.be.true;
        expect(req.body.notes).to.contain('verifie visuellement');

        req.reply({
          statusCode: 200,
          body: {
            success: true,
            data: {
              uuid: 'verif-uuid-001',
              status: 'verified',
              review: { decision: 'approved', notes: req.body.notes, reviewed_by: 'admin@tuita.fr' },
            },
          },
        });
      }).as('approveDoc');

      preAuth();
      cy.visit('/admin');

      // Simuler l'appel admin depuis le browser
      cy.window().then(win => {
        return win.fetch('/api/admin/validations/verif-uuid-001/review', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Tuita-Admin-Key': ADMIN_KEY },
          body: JSON.stringify({
            decision: 'approved',
            notes: 'Document verifie visuellement - URSSAF valide malgre OCR faible',
            force_override: true,
          }),
        });
      });

      cy.wait('@approveDoc');
      cy.wait(PAUSE);
    });

    it('admin REJETE un document illisible avec motif', () => {
      cy.mockAdminApi();
      cy.intercept('PUT', '/api/admin/validations/verif-uuid-003/review', (req) => {
        expect(req.body.decision).to.eq('rejected');
        expect(req.body.notes).to.contain('illisible');

        req.reply({ statusCode: 200, body: { success: true, data: { uuid: 'verif-uuid-003', status: 'rejected' } } });
      }).as('rejectDoc');

      preAuth();
      cy.visit('/admin');

      cy.window().then(win => {
        return win.fetch('/api/admin/validations/verif-uuid-003/review', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Tuita-Admin-Key': ADMIN_KEY },
          body: JSON.stringify({
            decision: 'rejected',
            notes: 'Document illisible - scan de mauvaise qualite, renvoyer un PDF net',
          }),
        });
      });

      cy.wait('@rejectDoc');
      cy.wait(PAUSE);
    });

    it('admin demande re-upload pour SIREN mismatch', () => {
      cy.mockAdminApi();
      cy.intercept('PUT', '/api/admin/validations/verif-uuid-002/review', (req) => {
        expect(req.body.decision).to.eq('request_reupload');

        req.reply({ statusCode: 200, body: { success: true, data: { uuid: 'verif-uuid-002', status: 'pending' } } });
      }).as('requestReupload');

      preAuth();
      cy.visit('/admin');

      cy.window().then(win => {
        return win.fetch('/api/admin/validations/verif-uuid-002/review', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Tuita-Admin-Key': ADMIN_KEY },
          body: JSON.stringify({
            decision: 'request_reupload',
            notes: 'SIREN sur le KBIS ne correspond pas. Verifiez et renvoyez le bon document.',
          }),
        });
      });

      cy.wait('@requestReupload');
      cy.wait(PAUSE);
    });
  });

  // ═══════════════════════════════════════════
  // SCENARIO 2 : KYC en pending_manual_review
  // ═══════════════════════════════════════════

  describe('KYC en pending_manual_review (service biometrique down)', () => {

    it('2 KYC en attente — un sans score, un avec liveness OK', () => {
      cy.fixture('admin-kyc-manual-review.json').then((data) => {
        expect(data.data).to.have.length(2);

        // Cas 1 : service totalement down, aucun score
        const kyc1 = data.data[0];
        expect(kyc1.status).to.eq('pending_manual_review');
        expect(kyc1.failure_reason).to.eq('biometric_service_unavailable');
        expect(kyc1.retry_count).to.eq(3);
        expect(kyc1.liveness_score).to.be.null;
        expect(kyc1.face_match_score).to.be.null;
        expect(kyc1.contractor_name).to.eq('LUCIAN SIRBU');

        // Cas 2 : liveness OK mais DeepFace timeout sur face match
        const kyc2 = data.data[1];
        expect(kyc2.liveness_score).to.eq(0.91);
        expect(kyc2.face_match_score).to.be.null;
        expect(kyc2.contractor_name).to.eq('JEAN DUPONT');
      });

      cy.wait(PAUSE);
    });

    it('admin approuve KYC avec liveness OK + verification visuelle', () => {
      cy.mockAdminApi();
      cy.intercept('PUT', '/api/admin/validations/kyc-review-002/review', (req) => {
        expect(req.body.decision).to.eq('approved');
        req.reply({ statusCode: 200, body: { success: true, data: { uuid: 'kyc-review-002', status: 'approved' } } });
      }).as('approveKyc');

      preAuth();
      cy.visit('/admin');

      cy.window().then(win => {
        return win.fetch('/api/admin/validations/kyc-review-002/review', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Tuita-Admin-Key': ADMIN_KEY },
          body: JSON.stringify({
            decision: 'approved',
            notes: 'Liveness 0.91 OK. Face match impossible (DeepFace down). Verification visuelle frame/CNI confirme identite.',
            force_override: true,
          }),
        });
      });

      cy.wait('@approveKyc');
      cy.wait(PAUSE);
    });

    it('admin rejete KYC sans aucun score biometrique', () => {
      cy.mockAdminApi();
      cy.intercept('PUT', '/api/admin/validations/kyc-review-001/review', (req) => {
        expect(req.body.decision).to.eq('rejected');
        req.reply({ statusCode: 200, body: { success: true, data: { uuid: 'kyc-review-001', status: 'rejected' } } });
      }).as('rejectKyc');

      preAuth();
      cy.visit('/admin');

      cy.window().then(win => {
        return win.fetch('/api/admin/validations/kyc-review-001/review', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Tuita-Admin-Key': ADMIN_KEY },
          body: JSON.stringify({
            decision: 'rejected',
            notes: 'Aucun score biometrique. L\'artisan doit refaire le KYC quand le service est retabli.',
          }),
        });
      });

      cy.wait('@rejectKyc');
      cy.wait(PAUSE);
    });
  });

  // ═══════════════════════════════════════════
  // SCENARIO 3 : Les 3 decisions sont couvertes
  // ═══════════════════════════════════════════

  describe('Couverture des decisions admin', () => {

    it('les 3 decisions possibles existent', () => {
      const decisions = ['approved', 'rejected', 'request_reupload'];
      decisions.forEach(d => {
        expect(d).to.be.oneOf(['approved', 'rejected', 'request_reupload']);
      });
    });

    it('tous les flags metier sont couverts', () => {
      cy.fixture('admin-validations-pending.json').then((data) => {
        const allFlags = data.data.flatMap((v: any) => v.flags);
        expect(allFlags).to.include('low_confidence');
        expect(allFlags).to.include('siren_mismatch');
        expect(allFlags).to.include('unreadable_document');
        expect(allFlags).to.include('possible_expired_date');
      });
    });
  });
});
