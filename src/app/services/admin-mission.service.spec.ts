import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminMissionService, MissionDetail } from './admin-mission.service';

describe('AdminMissionService', () => {
  let service: AdminMissionService;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.setItem('tuita_admin_key', 'test-admin-key');
    TestBed.configureTestingModule({
      providers: [
        AdminMissionService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AdminMissionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.removeItem('tuita_admin_key');
  });

  it('GETs /missions/{ref} with admin key header', () => {
    service.getMissionDetail('M-2026-001').subscribe();
    const req = http.expectOne('/contractor-compliance/admin/missions/M-2026-001');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { mission_ref: 'M-2026-001' } });
  });

  it('encodes special characters in mission_ref', () => {
    service.getMissionDetail('M/special#1').subscribe();
    const req = http.expectOne(r =>
      r.url === '/contractor-compliance/admin/missions/M%2Fspecial%231',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ data: { mission_ref: 'M/special#1' } });
  });

  it('returns the parsed body to subscribers', () => {
    let captured: MissionDetail | undefined;
    const payload: MissionDetail = {
      mission_ref: 'M-2026-001',
      snapshot: {
        mission_title: 'Réparation chaudière',
        operation_type: 'depannage',
        city: 'Paris',
        expected_amount_ttc: 500,
        completed_at: '2026-05-01T10:00:00Z',
      },
      contractor: null,
      kpis: {
        expected_ttc: 500,
        total_invoiced_ttc: 500,
        deviation_pct: 0,
        reopens_count: 0,
        age_days: 6,
      },
      anomalies: [],
      invoices: [],
    };
    service.getMissionDetail('M-2026-001').subscribe(res => (captured = res));
    const req = http.expectOne('/contractor-compliance/admin/missions/M-2026-001');
    req.flush({ data: payload });
    expect(captured).toEqual(payload);
    expect(captured?.mission_ref).toBe('M-2026-001');
  });
});
