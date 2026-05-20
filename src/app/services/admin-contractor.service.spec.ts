import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminContractorService } from './admin-contractor.service';

describe('AdminContractorService', () => {
  let service: AdminContractorService;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.setItem('tuita_admin_token', 'test-admin-key');
    TestBed.configureTestingModule({
      providers: [
        AdminContractorService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AdminContractorService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.removeItem('tuita_admin_token');
  });

  it('listDocuments forwards page/per_page/search/status/sort/dir as query params', () => {
    service.listDocuments('P33756874218', {
      page: 2,
      per_page: 50,
      search: 'kbis',
      status: 'verified',
      type: 'kbis',
      sort: 'expires_at',
      dir: 'asc',
    }).subscribe();

    const req = http.expectOne((r) =>
      r.url === '/contractor-compliance/admin/contractors/P33756874218/documents',
    );
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('per_page')).toBe('50');
    expect(req.request.params.get('search')).toBe('kbis');
    expect(req.request.params.get('status')).toBe('verified');
    expect(req.request.params.get('type')).toBe('kbis');
    expect(req.request.params.get('sort')).toBe('expires_at');
    expect(req.request.params.get('dir')).toBe('asc');
    req.flush({ data: [], meta: {} });
  });

  it('list endpoints skip empty params (no &search= in URL)', () => {
    service.listInvoices('P33756874218', { page: 1, per_page: 25, search: '', status: undefined }).subscribe();
    const req = http.expectOne((r) =>
      r.url === '/contractor-compliance/admin/contractors/P33756874218/invoices',
    );
    expect(req.request.params.has('search')).toBe(false);
    expect(req.request.params.has('status')).toBe(false);
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ data: [], meta: {} });
  });

  it('list() forwards browse filters as query params + admin key header', () => {
    service.list({
      page: 2,
      per_page: 50,
      q: 'lucas',
      account_state: 'active',
      plan: 'pro',
      kyc_status: 'approved',
      compliance: 'compliant',
      city: 'Paris',
      department: '75',
      has_active_invoice: 1,
      has_stuck_invoice: 1,
      sort: 'compliance_score',
      direction: 'desc',
    }).subscribe();

    const req = http.expectOne((r) => r.url === '/contractor-compliance/admin/contractors');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('q')).toBe('lucas');
    expect(req.request.params.get('account_state')).toBe('active');
    expect(req.request.params.get('plan')).toBe('pro');
    expect(req.request.params.get('kyc_status')).toBe('approved');
    expect(req.request.params.get('compliance')).toBe('compliant');
    expect(req.request.params.get('city')).toBe('Paris');
    expect(req.request.params.get('department')).toBe('75');
    // Le service coerce les filtres booléens tolérants (1 → true) car le SDK
    // typé attend `boolean` ; le param part donc en `true`.
    expect(req.request.params.get('has_active_invoice')).toBe('true');
    expect(req.request.params.get('has_stuck_invoice')).toBe('true');
    expect(req.request.params.get('sort')).toBe('compliance_score');
    expect(req.request.params.get('direction')).toBe('desc');
    req.flush({ data: [], meta: { total: 0, current_page: 1, per_page: 50, last_page: 1, from: null, to: null }, facets: {} });
  });

  it('list() omits empty/undefined filters', () => {
    service.list({ page: 1 }).subscribe();
    const req = http.expectOne((r) => r.url === '/contractor-compliance/admin/contractors');
    expect(req.request.params.has('q')).toBe(false);
    expect(req.request.params.has('account_state')).toBe(false);
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ data: [], meta: { total: 0, current_page: 1, per_page: 25, last_page: 1, from: null, to: null }, facets: {} });
  });

  it('fetchDocumentBlob hits the admin file endpoint with inline=1 and blob responseType', () => {
    service.fetchDocumentBlob('11111111-2222-3333-4444-555555555555', true).subscribe();
    const req = http.expectOne((r) => r.url.startsWith('/contractor-compliance/admin/documents/'));
    expect(req.request.params.get('inline')).toBe('1');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['test'], { type: 'application/pdf' }));
  });
});
