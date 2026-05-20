import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AdminMissionDialogComponent, MissionDetail } from './admin-mission-dialog.component';

describe('AdminMissionDialogComponent', () => {
  let fixture: ComponentFixture<AdminMissionDialogComponent>;
  let http: HttpTestingController;
  const closeSpy = { close: () => {} };

  const fakeDetail: MissionDetail = {
    mission_ref: 'M-1',
    snapshot: { mission_title: 'Fibre Paris', operation_type: 'fibre',
      city: 'Paris', expected_amount_ttc: 500, completed_at: '2026-04-25T12:00:00Z' },
    contractor: {
      uuid: 'u1', first_name: 'Marc', last_name: 'Dupont',
      phone: 'P33...', company_name: 'ACME', siren: '123456789',
      plan: 'free', account_state: 'fully_verified', kyc_status: 'approved',
      compliance_score: 100, documents_verified: 5, documents_required: 6, has_iban: true,
    },
    kpis: { expected_ttc: 500, total_invoiced_ttc: 510, deviation_pct: 2,
      reopens_count: 0, age_days: 5 },
    anomalies: [{ level: 'warning', code: 'deviation_over_5pct', label: 'Écart 8% vs attendu' }],
    invoices: [{
      uuid: 'inv1', number: 'FA-001', status: 'pending_payment_validation',
      amount_ttc: 510, deviation_pct: 2,
      validations: { compliance: 'approved', production: null, accounting: null },
      webhooks: { rejected: false, ready_to_pay: false, payment_in_progress: false, paid: false },
      created_at: '2026-04-26T10:00:00Z',
    }],
  };

  beforeEach(() => {
    sessionStorage.setItem('tuita_admin_token', 'k');
    TestBed.configureTestingModule({
      imports: [AdminMissionDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MAT_DIALOG_DATA, useValue: { missionRef: 'M-1' } },
        { provide: MatDialogRef, useValue: closeSpy },
      ],
    });
    fixture = TestBed.createComponent(AdminMissionDialogComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.removeItem('tuita_admin_token');
  });

  it('fetches /admin/missions/{ref} on init and renders mission_ref + KPIs + invoices', () => {
    fixture.detectChanges();
    const req = http.expectOne('/contractor-compliance/admin/missions/M-1');
    req.flush({ data: fakeDetail });
    fixture.detectChanges();
    const html: string = fixture.nativeElement.outerHTML;
    expect(html).toContain('M-1');
    expect(html).toContain('Marc Dupont');
    expect(html).toContain('FA-001');
    expect(html).toContain('Écart 8% vs attendu');
  });

  it('shows 404 friendly state when mission unknown', () => {
    fixture.detectChanges();
    const req = http.expectOne('/contractor-compliance/admin/missions/M-1');
    req.flush({ error: { code: 'mission.unknown' } }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toMatch(/inconnue|introuvable/i);
  });

  it('clicking an invoice row emits openInvoice with uuid', () => {
    fixture.detectChanges();
    http.expectOne('/contractor-compliance/admin/missions/M-1').flush({ data: fakeDetail });
    fixture.detectChanges();
    let captured: string | null = null;
    fixture.componentInstance.openInvoice.subscribe((u: string) => (captured = u));
    const row = fixture.nativeElement.querySelector('.invoice-row');
    row.click();
    expect(captured).toBe('inv1');
  });

  it('disables tuita.fr button with tooltip', () => {
    fixture.detectChanges();
    http.expectOne('/contractor-compliance/admin/missions/M-1').flush({ data: fakeDetail });
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('button[data-test="tuita-live"]');
    expect(btn.disabled).toBe(true);
  });
});
