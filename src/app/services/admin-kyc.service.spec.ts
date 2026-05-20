import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminKycService } from './admin-kyc.service';

describe('AdminKycService', () => {
  let service: AdminKycService;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.setItem('tuita_admin_token', 'test-key-123');
    TestBed.configureTestingModule({
      providers: [
        AdminKycService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AdminKycService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.removeItem('tuita_admin_token');
  });

  it('GET /sessions returns paginated rows and sends admin header', async () => {
    const promise = service.getSessions({ page: 1, per_page: 25 });
    const req = http.expectOne((r) => r.url === '/contractor-compliance/admin/kyc/sessions');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('per_page')).toBe('25');
    req.flush({
      data: [
        {
          uuid: 'sess-1',
          user_id: 1,
          contractor_phone: 'P33756874218',
          contractor_first_name: 'LUCIAN',
          contractor_last_name: 'SIRBU',
          status: 'rejected',
          failure_reason: 'face_mismatch',
          failure_detail: 'Le visage ne correspond pas',
          liveness_score: 0.95,
          face_match_score: 0.42,
          biometric_provider: 'deepface',
          biometric_result: { foo: 'bar' },
          retry_count: 0,
          last_retried_at: null,
          started_at: '2026-04-20T10:00:00Z',
          completed_at: '2026-04-20T10:01:00Z',
          created_at: '2026-04-20T10:00:00Z',
        },
      ],
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 1 },
    });
    const out = await promise;
    expect(out.data.length).toBe(1);
    expect(out.data[0].failure_reason).toBe('face_mismatch');
  });

  it('GET /rejections sanitizes failure_reason "all" (omits it)', async () => {
    // Le SDK fn `adminKycRejections` n'expose pas `failure_reason`/`phone`
    // (cf. spec OpenAPI) -> ces filtres sont dropped au niveau SDK. La regle
    // metier verifiee ici est : `failure_reason: 'all'` est sanitize avant
    // l'appel pour eviter le faux filtre.
    const promise2 = service.getRejections({ failure_reason: 'all' });
    const req2 = http.expectOne((r) => r.url === '/contractor-compliance/admin/kyc/rejections');
    expect(req2.request.params.has('failure_reason')).toBe(false);
    req2.flush({ data: [] });
    await promise2;
  });

  it('getArtifacts maps the signed video URL to a single artifact', async () => {
    const promise = service.getArtifacts('sess-1');
    const req = http.expectOne(
      (r) => r.url === '/contractor-compliance/admin/kyc/sess-1/artifacts/view',
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      data: {
        session_uuid: 'sess-1',
        video_url: 'https://signed.example/kyc/sess-1/video.webm',
        available: true,
      },
    });
    const out = await promise;
    expect(out.length).toBe(1);
    expect(out[0].type).toBe('video');
    expect(out[0].path).toBe('https://signed.example/kyc/sess-1/video.webm');
  });

  it('getArtifacts returns [] when no selfie video is stored', async () => {
    const promise = service.getArtifacts('sess-2');
    const req = http.expectOne(
      (r) => r.url === '/contractor-compliance/admin/kyc/sess-2/artifacts/view',
    );
    req.flush({ data: { session_uuid: 'sess-2', video_url: null, available: false } });
    const out = await promise;
    expect(out.length).toBe(0);
  });
});
