import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ContractorMissionOffersComponent } from './contractor-mission-offers.component';

describe('ContractorMissionOffersComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ContractorMissionOffersComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('renders offers list', async () => {
    const fixture = TestBed.createComponent(ContractorMissionOffersComponent);
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url.endsWith('/mission-offers'));
    req.flush({ data: [{
      mission_ref: 'FIBRE-1', title: 'Raccordement fibre', category: 'fibre',
      expected_amount_ttc: 310, scheduled_at: '2026-06-01T10:00:00Z',
      address: { street: '8 rue X', city: 'Paris', postal_code: '75008', department: '75' },
      description_short: 'd', required_badges: [],
      expires_at: '2026-05-15T18:00:00Z', offered_at: '2026-05-11T08:00:00Z',
    }]});
    fixture.detectChanges();
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Raccordement fibre');
    expect(text).toContain('Paris');
  });

  it('shows empty state when no offers', async () => {
    const fixture = TestBed.createComponent(ContractorMissionOffersComponent);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url.endsWith('/mission-offers')).flush({ data: [] });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Aucune offre');
  });

  it('shows error state on 503 with retry button', async () => {
    const fixture = TestBed.createComponent(ContractorMissionOffersComponent);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url.endsWith('/mission-offers'))
      .flush({ error: 'service_unavailable' }, { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('indisponible');
    expect(fixture.nativeElement.querySelector('button[data-testid="retry"]')).toBeTruthy();
  });
});
