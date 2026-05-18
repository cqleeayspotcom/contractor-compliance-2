import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ProfileService } from './profile.service';

describe('ProfileService', () => {
  let service: ProfileService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ProfileService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(ProfileService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GET /profile returns identity', async () => {
    // Le service appelle en fait le SDK dashboardIndex → /contractor-compliance/dashboard.
    // L'enveloppe canonique backend : { data: { contractor: {...}, notifications: {...} } }
    // Les champs contractor sont en camelCase (mappés en snake_case dans le service).
    const promise = service.getProfile();
    const req = http.expectOne('/contractor-compliance/dashboard');
    expect(req.request.method).toBe('GET');
    req.flush({
      data: {
        contractor: {
          phone: '+33',
          firstName: 'A',
          lastName: 'B',
          companyName: 'C',
          siren: '1',
        },
        notifications: {
          email_address: null,
          email_invoice_payment: false,
          email_document_expiry: false,
          email_invoice_rejected: false,
        },
      },
    });
    const out = await promise;
    expect(out.identity.phone).toBe('+33');
    expect(out.identity.first_name).toBe('A');
    expect(out.identity.company_name).toBe('C');
  });

  it('POST /profile/logout returns void', async () => {
    const promise = service.logout();
    const req = http.expectOne('/contractor-compliance/profile/logout');
    expect(req.request.method).toBe('POST');
    req.flush({ data: null }, { status: 200, statusText: 'OK' });
    await promise;
  });
});
