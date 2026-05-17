import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router, ActivatedRoute } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { ContractorMissionOfferDetailComponent } from './contractor-mission-offer-detail.component';

describe('ContractorMissionOfferDetailComponent', () => {
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ContractorMissionOfferDetailComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        provideRouter([]), provideNoopAnimations(),
        { provide: ActivatedRoute, useValue: { paramMap: of({ get: (k: string) => 'FIBRE-1' }) } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  it('loads and displays offer detail', async () => {
    const fixture = TestBed.createComponent(ContractorMissionOfferDetailComponent);
    fixture.detectChanges();

    httpMock.expectOne((r) => r.url.endsWith('/mission-offers/FIBRE-1')).flush({
      data: {
        mission_ref: 'FIBRE-1', title: 'Raccordement', category: 'fibre',
        expected_amount_ttc: 310, scheduled_at: '2026-06-01T10:00:00Z',
        address: { street: 'x', city: 'Paris', postal_code: '75008', department: '75' },
        description_short: 'Test desc', required_badges: ['decennale_verified'],
        expires_at: '2026-05-15T18:00:00Z', offered_at: '2026-05-11T08:00:00Z',
      },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Raccordement');
    expect(fixture.nativeElement.textContent).toContain('Test desc');
  });

  it('accepts the offer and navigates to /interventions', async () => {
    const navSpy = vi.spyOn(router, 'navigateByUrl');
    const fixture = TestBed.createComponent(ContractorMissionOfferDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url.endsWith('/mission-offers/FIBRE-1')).flush({
      data: { mission_ref: 'FIBRE-1', title: 'X', category: 'fibre', expected_amount_ttc: null,
        scheduled_at: '2026-06-01T10:00:00Z',
        address: { street: 'x', city: 'y', postal_code: '75008', department: '75' },
        description_short: 'd', required_badges: [],
        expires_at: '2026-05-15T18:00:00Z', offered_at: '2026-05-11T08:00:00Z' },
    });
    fixture.detectChanges();
    await fixture.whenStable();

    // Call confirmAccept directly (bypasses dialog confirmation for unit test)
    fixture.componentInstance.confirmAccept();
    const acceptReq = httpMock.expectOne((r) => r.url.endsWith('/mission-offers/FIBRE-1/accept'));
    acceptReq.flush({ data: { ok: true } });
    await fixture.whenStable();

    expect(navSpy).toHaveBeenCalledWith('/interventions');
  });
});
