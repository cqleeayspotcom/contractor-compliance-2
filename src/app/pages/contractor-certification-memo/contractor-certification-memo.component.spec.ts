import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { ContractorCertificationMemoComponent, MEMO_SECTIONS } from './contractor-certification-memo.component';
import { ContractorSessionService } from '../../services/contractor-session.service';
import type { ContractorDashboard } from '../../services/contractor-api.service';

function buildDashboard(overrides: Partial<ContractorDashboard> = {}): ContractorDashboard {
  return {
    contractor: { phone: 'P33', firstName: 'A', lastName: 'B', companyName: 'C', siren: 'S' },
    compliance: { score: 100, global_status: 'verified', is_verified: true },
    billing: { plan: 'free', can_upgrade: true },
    documents: { total_required: 0, verified: 0, missing: 0, pending: 0, expired: 0, rejected: 0, items: [] },
    kyc: { status: 'approved', can_start: false, last_attempt_at: null },
    certification: { completed: true, completed_at: '2026-03-14T10:00:00Z' },
    account_state: 'fully_verified',
    missions_count: 0,
    next_action: 'none',
    ...overrides,
  } as ContractorDashboard;
}

describe('ContractorCertificationMemoComponent', () => {
  let sessionStub: { dashboard$: BehaviorSubject<ContractorDashboard | null> };
  let routerSpy: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    sessionStub = { dashboard$: new BehaviorSubject<ContractorDashboard | null>(buildDashboard()) };
    routerSpy = { navigate: vi.fn() };

    TestBed.configureTestingModule({
      imports: [ContractorCertificationMemoComponent],
      providers: [
        { provide: ContractorSessionService, useValue: sessionStub },
        { provide: Router, useValue: routerSpy },
      ],
    });
  });

  it('exports 6 thematic memo sections', () => {
    expect(MEMO_SECTIONS).toHaveLength(6);
    for (const section of MEMO_SECTIONS) {
      expect(section.id).toBeTruthy();
      expect(section.title).toBeTruthy();
      expect(section.rules.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('exposes the certification date from the dashboard', () => {
    const fixture = TestBed.createComponent(ContractorCertificationMemoComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.certifiedAt()).toBe('2026-03-14T10:00:00Z');
  });

  it('returns null when the dashboard has no completed_at', () => {
    sessionStub.dashboard$.next(buildDashboard({
      certification: { completed: true, completed_at: null },
    }));
    const fixture = TestBed.createComponent(ContractorCertificationMemoComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.certifiedAt()).toBeNull();
  });

  it('navigates to /certification with retake=1 when retakeQcm() is called', () => {
    const fixture = TestBed.createComponent(ContractorCertificationMemoComponent);
    fixture.componentInstance.retakeQcm();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/certification'], { queryParams: { retake: '1' } });
  });

  it('navigates to /dashboard when goBack() is called', () => {
    const fixture = TestBed.createComponent(ContractorCertificationMemoComponent);
    fixture.componentInstance.goBack();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/dashboard']);
  });
});
