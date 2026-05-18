import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FreeInvoiceService } from './free-invoice.service';

describe('FreeInvoiceService', () => {
  let service: FreeInvoiceService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        FreeInvoiceService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(FreeInvoiceService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists requests via GET', () => {
    service.list().subscribe();
    // Le SDK invocesFreeList tape `/contractor-compliance/invoices/free?page=1`.
    const req = httpMock.expectOne((r) => r.url.endsWith('/contractor-compliance/invoices/free'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ data: [], meta: { total: 0, per_page: 20 } });
  });
});
