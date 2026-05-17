import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

import { ContractorDashboardComponent } from './contractor-dashboard.component';
import { ContractorSessionService } from '../../services/contractor-session.service';
import { PushProService } from '../../services/push-pro.service';
import type { ContractorDashboard } from '../../services/contractor-api.service';

function buildDashboard(overrides: Partial<ContractorDashboard> = {}): ContractorDashboard {
  return {
    contractor: { phone: 'P33', firstName: 'A', lastName: 'B', companyName: 'C', siren: 'S' },
    compliance: { score: 0, global_status: 'new', is_verified: false },
    billing: { plan: 'free', can_upgrade: true },
    documents: { total_required: 0, verified: 0, missing: 0, pending: 0, expired: 0, rejected: 0, items: [] },
    kyc: { status: 'not_started', can_start: true, identity_doc_verified: true, last_attempt_at: null },
    certification: { completed: false, completed_at: null },
    account_state: 'new',
    missions_count: 0,
    next_action: 'start_kyc',
    ...overrides,
  } satisfies ContractorDashboard;
}

function createFixture(dashboard: ContractorDashboard) {
  const subject = new BehaviorSubject<ContractorDashboard | null>(dashboard);
  const sessionStub = {
    dashboard$: subject.asObservable(),
    isLoading$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<string | null>(null),
    refreshDashboard: vi.fn(),
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ContractorDashboardComponent],
    providers: [
      provideRouter([]),
      { provide: ContractorSessionService, useValue: sessionStub },
      { provide: PushProService, useValue: { shouldShow: () => false, show: () => {} } },
      { provide: MatDialog, useValue: { open: () => {} } },
    ],
  });

  const fixture = TestBed.createComponent(ContractorDashboardComponent);
  fixture.detectChanges();
  return fixture;
}

describe('ContractorDashboardComponent — identity/certification split', () => {
  it('locks the certification tile when KYC is not approved', () => {
    const fixture = createFixture(buildDashboard({
      kyc: { status: 'not_started', can_start: true, identity_doc_verified: true, last_attempt_at: null },
    }));
    const cmp = fixture.componentInstance;
    expect(cmp.certificationLocked()).toBe(true);
    expect(cmp.certificationSubtitle()).toContain('Après identité validée');
  });

  it('marks the certification tile as warn when KYC is approved but QCM not done', () => {
    const fixture = createFixture(buildDashboard({
      kyc: { status: 'approved', can_start: false, identity_doc_verified: true, last_attempt_at: null },
      certification: { completed: false, completed_at: null },
    }));
    const cmp = fixture.componentInstance;
    expect(cmp.certificationLocked()).toBe(false);
    expect(cmp.certificationStatus()).toBe('warn');
    expect(cmp.certificationRoute()).toBe('/certification');
    expect(cmp.certificationSubtitle()).toContain('QCM à passer');
  });

  it('marks the certification tile as ok and routes to /certification/memo when certified', () => {
    const fixture = createFixture(buildDashboard({
      kyc: { status: 'approved', can_start: false, identity_doc_verified: true, last_attempt_at: null },
      certification: { completed: true, completed_at: '2026-03-14T10:00:00Z' },
    }));
    const cmp = fixture.componentInstance;
    expect(cmp.certificationLocked()).toBe(false);
    expect(cmp.certificationStatus()).toBe('ok');
    expect(cmp.certificationRoute()).toBe('/certification/memo');
  });

  it('locks the identity tile when no identity document is VERIFIED yet', () => {
    const fixture = createFixture(buildDashboard({
      kyc: { status: 'not_started', can_start: false, identity_doc_verified: false, last_attempt_at: null },
    }));
    const cmp = fixture.componentInstance;
    expect(cmp.identityLocked()).toBe(true);
    expect(cmp.identitySubtitle()).toContain('CNI ou passeport');
  });

  it('unlocks the identity tile once CNI/passport is VERIFIED', () => {
    const fixture = createFixture(buildDashboard({
      kyc: { status: 'not_started', can_start: true, identity_doc_verified: true, last_attempt_at: null },
    }));
    const cmp = fixture.componentInstance;
    expect(cmp.identityLocked()).toBe(false);
    expect(cmp.identitySubtitle()).toBe('Vidéo à enregistrer');
  });

  it('keeps the identity tile unlocked once a KYC attempt has been made, even if the identity flag is stale', () => {
    // Garde-fou : une KYC rejected/approved/processing signifie que le doc
    // d'identité a forcément été vérifié à un moment — on ne re-verrouille pas.
    const fixture = createFixture(buildDashboard({
      kyc: { status: 'rejected', can_start: true, identity_doc_verified: false, last_attempt_at: null },
    }));
    expect(fixture.componentInstance.identityLocked()).toBe(false);
  });

  it('derives identity status purely from KYC (not from certification)', () => {
    // KYC approved, certif pas encore fait — l'identité reste "ok"
    const fixture = createFixture(buildDashboard({
      kyc: { status: 'approved', can_start: false, identity_doc_verified: true, last_attempt_at: null },
      certification: { completed: false, completed_at: null },
    }));
    expect(fixture.componentInstance.identityStatus()).toBe('ok');
    expect(fixture.componentInstance.identitySubtitle()).toBe('Vérifiée');
  });

  it('locks the chantiers tile when account is not fully_verified', () => {
    const fixture = createFixture(buildDashboard({
      account_state: 'documents_incomplete',
    }));
    expect(fixture.componentInstance.chantiersLocked()).toBe(true);
  });

  it('unlocks the chantiers tile when account is fully_verified', () => {
    const fixture = createFixture(buildDashboard({
      account_state: 'fully_verified',
      kyc: { status: 'approved', can_start: false, identity_doc_verified: true, last_attempt_at: null },
      certification: { completed: true, completed_at: '2026-03-14T10:00:00Z' },
    }));
    expect(fixture.componentInstance.chantiersLocked()).toBe(false);
  });

  it('marks the chantiers tile as warn when at least one invoice is rejected (correctable, not blocking)', () => {
    const fixture = createFixture(buildDashboard({
      account_state: 'fully_verified',
      invoices: {
        total: 3,
        validating: 0,
        pending_payment_validation: 0,
        ready_to_pay: 0,
        payment_in_progress: 0,
        paid: 2,
        rejected: 1,
      },
    }));
    // Une facture rejetée est corrigeable (reupload) → 'warn' (à compléter),
    // pas 'bad' (bloqué). `bad` reste réservé aux états réellement bloqués
    // (chantiersLocked) — cf. commentaire du computed chantiersStatus.
    expect(fixture.componentInstance.chantiersStatus()).toBe('warn');
  });

  it('marks the chantiers tile as warn when interventions are awaiting invoicing', () => {
    const fixture = createFixture(buildDashboard({
      account_state: 'fully_verified',
      missions: { completed: 5, invoiceable: 2 },
    }));
    expect(fixture.componentInstance.chantiersStatus()).toBe('warn');
  });

  describe('passive-tile hiding (less buttons, less lost contractor)', () => {
    it('hides the identity tile when KYC is approved and nothing to do', () => {
      const fixture = createFixture(buildDashboard({
        kyc: { status: 'approved', can_start: false, identity_doc_verified: true, last_attempt_at: null },
      }));
      expect(fixture.componentInstance.showIdentityTile()).toBe(false);
    });

    it('hides the identity tile during onboarding (banner handles CNI upload)', () => {
      // Règle low-literacy : pendant l'onboarding (next_action != 'none'),
      // le bandeau Bienvenu pilote l'upload CNI via son CTA unique. Dédoubler
      // avec une tuile verrouillée = deux portes pour la même action.
      const fixture = createFixture(buildDashboard({
        kyc: { status: 'not_started', can_start: false, identity_doc_verified: false, last_attempt_at: null },
        next_action: 'start_kyc',
      }));
      expect(fixture.componentInstance.showIdentityTile()).toBe(false);
    });

    it('shows the identity tile post-onboarding when KYC is rejected', () => {
      // Une fois l'onboarding terminé (next_action='none'), un KYC `rejected`
      // doit ré-afficher la tuile pour proposer "Refaire ma vérification".
      const fixture = createFixture(buildDashboard({
        kyc: { status: 'rejected', can_start: true, identity_doc_verified: true, last_attempt_at: null },
        next_action: 'none',
      }));
      expect(fixture.componentInstance.showIdentityTile()).toBe(true);
    });

    it('always shows the chantiers tile — it is the entry point to missions and invoices', () => {
      // Even fully verified with 0 missions and 0 invoices, the contractor
      // must keep access to this section (missions arrive over time).
      const fixture = createFixture(buildDashboard({
        account_state: 'fully_verified',
        kyc: { status: 'approved', can_start: false, identity_doc_verified: true, last_attempt_at: null },
        certification: { completed: true, completed_at: '2026-03-14T10:00:00Z' },
      }));
      expect(fixture.componentInstance.showChantiersTile()).toBe(true);
    });

    it('still shows the chantiers tile when locked (visual cue mid-onboarding)', () => {
      const fixture = createFixture(buildDashboard({
        account_state: 'documents_incomplete',
      }));
      expect(fixture.componentInstance.showChantiersTile()).toBe(true);
    });

    it('always hides the certification tile (passive memo)', () => {
      const fixture = createFixture(buildDashboard({
        certification: { completed: true, completed_at: '2026-03-14T10:00:00Z' },
      }));
      expect(fixture.componentInstance.showCertificationTile()).toBe(false);
    });

    it('always hides the Pro management tile (header chip is the entry point)', () => {
      const fixture = createFixture(buildDashboard({
        billing: { plan: 'paid', can_upgrade: false },
      }));
      expect(fixture.componentInstance.showAbonnementProTile()).toBe(false);
    });
  });

  describe('documents tile route — adaptive depending on status', () => {
    const baseReq = {
      type: 'rc',
      label: 'RC Pro',
      can_purchase: false,
      purchase_price_eur: null,
      document_uuid: 'doc-1',
      expires_at: '2027-06-01T00:00:00Z',
      is_bonus: false,
    };

    it('routes to /documents (list + download) when everything is OK', () => {
      const fixture = createFixture(buildDashboard({
        documents: {
          total_required: 1, verified: 1, missing: 0, pending: 0, expired: 0, rejected: 0,
          items: [{ ...baseReq, status: 'verified', days_until_expiry: 365 }],
        },
      }));
      expect(fixture.componentInstance.documentsStatus()).toBe('ok');
      expect(fixture.componentInstance.documentsRoute()).toBe('/documents');
    });

    it('routes to /documents/upload (stepper) when a doc is expiring soon', () => {
      const fixture = createFixture(buildDashboard({
        documents: {
          total_required: 1, verified: 1, missing: 0, pending: 0, expired: 0, rejected: 0,
          items: [{ ...baseReq, status: 'verified', days_until_expiry: 7 }],
        },
      }));
      expect(fixture.componentInstance.documentsStatus()).toBe('warn');
      expect(fixture.componentInstance.documentsRoute()).toBe('/documents/upload');
    });

    it('routes to /documents/upload when something is rejected', () => {
      const fixture = createFixture(buildDashboard({
        documents: {
          total_required: 1, verified: 0, missing: 0, pending: 0, expired: 0, rejected: 1,
          items: [{ ...baseReq, status: 'rejected', days_until_expiry: null }],
        },
      }));
      expect(fixture.componentInstance.documentsStatus()).toBe('bad');
      expect(fixture.componentInstance.documentsRoute()).toBe('/documents/upload');
    });
  });

  describe('expiring-soon signal on the documents tile', () => {
    const baseRequirement = {
      type: 'rc',
      label: 'RC Pro',
      can_purchase: false,
      purchase_price_eur: null,
      document_uuid: 'doc-1',
      expires_at: '2026-06-01T00:00:00Z',
      is_bonus: false,
    };

    it('flips the documents tile from ok to warn when a verified doc expires in ≤ 30 days', () => {
      const fixture = createFixture(buildDashboard({
        documents: {
          total_required: 1,
          verified: 1,
          missing: 0,
          pending: 0,
          expired: 0,
          rejected: 0,
          items: [{ ...baseRequirement, status: 'verified', days_until_expiry: 12 }],
        },
      }));
      const cmp = fixture.componentInstance;
      expect(cmp.expiringSoonCount()).toBe(1);
      expect(cmp.documentsStatus()).toBe('warn');
      expect(cmp.documentsSubtitle()).toBe('Expire dans 12 j');
    });

    it('keeps the tile ok when no doc is in the 30-day window', () => {
      const fixture = createFixture(buildDashboard({
        documents: {
          total_required: 1,
          verified: 1,
          missing: 0,
          pending: 0,
          expired: 0,
          rejected: 0,
          items: [{ ...baseRequirement, status: 'verified', days_until_expiry: 180 }],
        },
      }));
      expect(fixture.componentInstance.expiringSoonCount()).toBe(0);
      expect(fixture.componentInstance.documentsStatus()).toBe('ok');
    });

    it('uses the smallest days_until_expiry across multiple expiring docs', () => {
      const fixture = createFixture(buildDashboard({
        documents: {
          total_required: 2,
          verified: 2,
          missing: 0,
          pending: 0,
          expired: 0,
          rejected: 0,
          items: [
            { ...baseRequirement, type: 'rc', status: 'verified', days_until_expiry: 25 },
            { ...baseRequirement, type: 'urssaf', document_uuid: 'doc-2', status: 'verified', days_until_expiry: 4 },
          ],
        },
      }));
      const cmp = fixture.componentInstance;
      expect(cmp.expiringSoonCount()).toBe(2);
      expect(cmp.documentsSubtitle()).toBe('2 expirent bientôt');
    });

    it('keeps "bad" priority when a doc is already expired and others are expiring soon', () => {
      const fixture = createFixture(buildDashboard({
        documents: {
          total_required: 2,
          verified: 1,
          missing: 0,
          pending: 0,
          expired: 1,
          rejected: 0,
          items: [
            { ...baseRequirement, type: 'rc', status: 'expired', days_until_expiry: null },
            { ...baseRequirement, type: 'urssaf', document_uuid: 'doc-2', status: 'verified', days_until_expiry: 7 },
          ],
        },
      }));
      expect(fixture.componentInstance.documentsStatus()).toBe('bad');
      expect(fixture.componentInstance.documentsSubtitle()).toBe('1 expiré');
    });

    it('uses "demain" wording when a single doc expires in 1 day', () => {
      const fixture = createFixture(buildDashboard({
        documents: {
          total_required: 1,
          verified: 1,
          missing: 0,
          pending: 0,
          expired: 0,
          rejected: 0,
          items: [{ ...baseRequirement, status: 'verified', days_until_expiry: 1 }],
        },
      }));
      expect(fixture.componentInstance.documentsSubtitle()).toBe('Expire demain');
    });
  });
});
