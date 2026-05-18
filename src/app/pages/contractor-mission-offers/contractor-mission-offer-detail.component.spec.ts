import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router, ActivatedRoute } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatSnackBar } from '@angular/material/snack-bar';
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
        { provide: ActivatedRoute, useValue: { paramMap: of({ get: (_k: string) => 'FIBRE-1' }) } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  function flushOffer(extra: Partial<Record<string, unknown>> = {}) {
    httpMock.expectOne((r) => r.url.endsWith('/missions/offers')).flush({
      data: {
        data: [{
          mission_ref: 'FIBRE-1', title: 'Raccordement', category: 'fibre',
          expected_amount_ttc: 310, scheduled_at: '2026-06-01T10:00:00Z',
          address: { street: 'x', city: 'Paris', postal_code: '75008', department: '75' },
          description_short: 'Test desc', required_badges: ['decennale_verified'],
          expires_at: '2026-05-15T18:00:00Z', offered_at: '2026-05-11T08:00:00Z',
        }],
        can_accept: false,
        ...extra,
      },
    });
  }

  it('loads and displays offer detail', async () => {
    const fixture = TestBed.createComponent(ContractorMissionOfferDetailComponent);
    fixture.detectChanges();
    flushOffer();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Raccordement');
    expect(fixture.nativeElement.textContent).toContain('Test desc');
  });

  it('confirmAccept shows snackbar (acceptation indisponible côté Tuita)', async () => {
    const navSpy = vi.spyOn(router, 'navigateByUrl');
    const snack = TestBed.inject(MatSnackBar);
    const snackSpy = vi.spyOn(snack, 'open');
    const fixture = TestBed.createComponent(ContractorMissionOfferDetailComponent);
    fixture.detectChanges();
    flushOffer();
    fixture.detectChanges();
    await fixture.whenStable();

    // Acceptation/refus passent désormais par le manager FOM — confirmAccept
    // affiche juste un snackbar, ne fait pas d'appel HTTP et ne navigue pas.
    fixture.componentInstance.confirmAccept();
    httpMock.expectNone((r) => r.url.includes('/accept'));
    expect(snackSpy).toHaveBeenCalled();
    expect(navSpy).not.toHaveBeenCalledWith('/interventions');
  });
});
