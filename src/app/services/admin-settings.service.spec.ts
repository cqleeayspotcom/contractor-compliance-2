import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminSettingsService, PlatformSetting } from './admin-settings.service';

describe('AdminSettingsService', () => {
  let service: AdminSettingsService;
  let http: HttpTestingController;

  const sample: PlatformSetting = {
    key: 'kyc.face_match_threshold',
    value: 0.8,
    type: 'float',
    source: 'database',
    description: 'Threshold',
    updated_at: '2026-04-24T10:00:00Z',
  };

  beforeEach(() => {
    sessionStorage.setItem('tuita_admin_key', 'test-key');
    TestBed.configureTestingModule({
      providers: [
        AdminSettingsService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AdminSettingsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.removeItem('tuita_admin_key');
  });

  it('GET /settings returns the list', async () => {
    const promise = service.list();
    const req = http.expectOne('/contractor-compliance/admin/settings');
    expect(req.request.method).toBe('GET');
    req.flush({ data: [sample] });
    const out = await promise;
    expect(out.length).toBe(1);
    expect(out[0].key).toBe('kyc.face_match_threshold');
  });

  it('PUT /settings/{key} sends value + reason', async () => {
    const promise = service.update('kyc.face_match_threshold', {
      value: 0.85,
      reason: 'Tightening security',
    });
    const req = http.expectOne('/contractor-compliance/admin/settings/kyc.face_match_threshold');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ value: 0.85, reason: 'Tightening security' });
    req.flush({ data: { ...sample, value: 0.85 } });
    const out = await promise;
    expect(out.value).toBe(0.85);
  });

  it('POST /settings/{key}/reset sends reason', async () => {
    const promise = service.reset('kyc.face_match_threshold', 'Reverting test config');
    const req = http.expectOne('/contractor-compliance/admin/settings/kyc.face_match_threshold/reset');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'Reverting test config' });
    req.flush({ data: { ...sample, source: 'env_fallback' } });
    const out = await promise;
    expect(out.source).toBe('env_fallback');
  });
});
