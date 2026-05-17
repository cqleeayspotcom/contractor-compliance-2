import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { FreeInvoiceService } from './free-invoice.service';

describe('FreeInvoiceService', () => {
  let service: FreeInvoiceService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [FreeInvoiceService],
    });
    service = TestBed.inject(FreeInvoiceService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('lists requests via GET', () => {
    service.list().subscribe();
    const req = httpMock.expectOne((r) => r.url.endsWith('/contractor/invoices/free'));
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });
});
