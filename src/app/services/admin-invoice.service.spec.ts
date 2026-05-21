import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminInvoiceService } from './admin-invoice.service';

describe('AdminInvoiceService', () => {
  let service: AdminInvoiceService;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.setItem('tuita_admin_token', 'test-admin-key');
    TestBed.configureTestingModule({
      providers: [
        AdminInvoiceService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AdminInvoiceService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.removeItem('tuita_admin_token');
  });

  // ---------------------------------------------------------------------
  // List endpoints
  // ---------------------------------------------------------------------

  it('GET /pending-validation forwards page/per_page params', () => {
    service.listPendingValidation(1, 20).subscribe();
    const req = http.expectOne(r =>
      r.url === '/contractor-compliance/admin/invoices/pending-validation',
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('per_page')).toBe('20');
    req.flush({ data: [], meta: { total: 0 } });
  });

  it('GET /pending-validation returns paginated list', async () => {
    let captured: unknown;
    service.listPendingValidation(2, 50).subscribe(res => (captured = res));
    const req = http.expectOne(r =>
      r.url === '/contractor-compliance/admin/invoices/pending-validation',
    );
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('per_page')).toBe('50');
    req.flush({ data: [{ uuid: 'a', status: 'pending_payment_validation' }], meta: { total: 1 } });
    // `api.invoke` est Promise-based → l'émission passe par une microtask.
    await new Promise(r => setTimeout(r));
    expect((captured as { meta: { total: number } }).meta.total).toBe(1);
  });

  it('GET /ready-to-pay', () => {
    service.listReadyToPay().subscribe();
    const req = http.expectOne('/contractor-compliance/admin/invoices/ready-to-pay?page=1&per_page=20');
    req.flush({ data: [] });
  });

  it('GET /payment-in-progress', () => {
    service.listPaymentInProgress().subscribe();
    const req = http.expectOne('/contractor-compliance/admin/invoices/payment-in-progress?page=1&per_page=20');
    req.flush({ data: [] });
  });

  it('GET /paid-disputed', () => {
    service.listPaidDisputed().subscribe();
    const req = http.expectOne('/contractor-compliance/admin/invoices/paid-disputed?page=1&per_page=20');
    req.flush({ data: [] });
  });

  it('GET /stuck-counts', () => {
    service.getStuckCounts().subscribe();
    const req = http.expectOne('/contractor-compliance/admin/invoices/stats/stuck-counts');
    req.flush({ data: { validating: 3 } });
  });

  // ---------------------------------------------------------------------
  // Single invoice + audit
  // ---------------------------------------------------------------------

  it('GET /{uuid} returns single invoice', async () => {
    let captured: unknown;
    service.getInvoice('uuid-1').subscribe(res => (captured = res));
    const req = http.expectOne('/contractor-compliance/admin/invoices/uuid-1');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { uuid: 'uuid-1', status: 'paid' } });
    await new Promise(r => setTimeout(r));
    expect((captured as { data: { status: string } }).data.status).toBe('paid');
  });

  it('GET /{uuid}/audit-trail returns chronological list', () => {
    service.getAuditTrail('uuid-1').subscribe();
    const req = http.expectOne('/contractor-compliance/admin/invoices/uuid-1/audit-trail');
    expect(req.request.method).toBe('GET');
    req.flush({
      data: {
        invoice: { uuid: 'uuid-1', status: 'paid' },
        payment_validations: [],
      },
    });
  });

  // ---------------------------------------------------------------------
  // Action endpoints
  // ---------------------------------------------------------------------

  it('POST /{uuid}/mark-payment-in-progress sends payment_ref', () => {
    service.markPaymentInProgress('uuid-1', { payment_ref: 'VIR-2026-001' }).subscribe();
    const req = http.expectOne('/contractor-compliance/admin/invoices/uuid-1/mark-payment-in-progress');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ payment_ref: 'VIR-2026-001' });
    req.flush({});
  });

  it('POST /{uuid}/mark-paid sends paid_at + payment_ref', () => {
    service.markPaid('uuid-1', { paid_at: '2026-04-24T10:00:00Z', payment_ref: 'VIR-2026-001' }).subscribe();
    const req = http.expectOne('/contractor-compliance/admin/invoices/uuid-1/mark-paid');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ paid_at: '2026-04-24T10:00:00Z', payment_ref: 'VIR-2026-001' });
    req.flush({});
  });

  it('POST /{uuid}/mark-paid fast path includes skip_in_progress + reason', () => {
    service.markPaid('uuid-1', {
      paid_at: '2026-04-24T10:00:00Z',
      payment_ref: 'VIR-2026-001',
      skip_in_progress: true,
      reason: 'Virement instantane confirme par le CFO',
    }).subscribe();
    const req = http.expectOne('/contractor-compliance/admin/invoices/uuid-1/mark-paid');
    expect(req.request.body.skip_in_progress).toBe(true);
    expect(req.request.body.reason).toBe('Virement instantane confirme par le CFO');
    req.flush({});
  });

  it('POST /{uuid}/reopen sends reason', () => {
    service.reopen('uuid-1', { reason: 'rejet erroné, contractor a corrigé' }).subscribe();
    const req = http.expectOne('/contractor-compliance/admin/invoices/uuid-1/reopen');
    expect(req.request.body.reason).toBe('rejet erroné, contractor a corrigé');
    req.flush({});
  });

  it('POST /{uuid}/resolve-dispute sends resolution + notes', () => {
    service.resolveDispute('uuid-1', {
      resolution: 'credit_note_issued',
      notes: 'Avoir émis, litige clos par la compta.',
    }).subscribe();
    const req = http.expectOne('/contractor-compliance/admin/invoices/uuid-1/resolve-dispute');
    // Le backend `resolveDisputeAction` exige les deux champs.
    expect(req.request.body).toEqual({
      resolution: 'credit_note_issued',
      notes: 'Avoir émis, litige clos par la compta.',
    });
    req.flush({});
  });

  it('POST /{uuid}/add-note sends content', () => {
    service.addNote('uuid-1', { content: 'Note admin pour audit' }).subscribe();
    const req = http.expectOne('/contractor-compliance/admin/invoices/uuid-1/add-note');
    expect(req.request.body.content).toBe('Note admin pour audit');
    req.flush({});
  });
});
