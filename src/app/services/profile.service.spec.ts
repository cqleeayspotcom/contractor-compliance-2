import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ProfileService } from './profile.service';

describe('ProfileService', () => {
  let service: ProfileService;
  let http: HttpTestingController;

  beforeEach(() => {
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
    const promise = service.getProfile();
    const req = http.expectOne('/contractor-compliance/profile');
    expect(req.request.method).toBe('GET');
    req.flush({
      data: {
        identity: { phone: '+33', first_name: 'A', last_name: 'B', company_name: 'C', siren: '1' },
      },
    });
    const out = await promise;
    expect(out.identity.phone).toBe('+33');
  });

  it('POST /profile/logout returns void', async () => {
    const promise = service.logout();
    const req = http.expectOne('/contractor-compliance/profile/logout');
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await promise;
  });
});
