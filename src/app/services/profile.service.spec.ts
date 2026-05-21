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
    // Le service appelle le SDK profileShow → /contractor-compliance/profile.
    // L'enveloppe canonique backend : { data: { identity: {...}, notifications: {...} } }
    // Le bloc identity est déjà en snake_case (cf. ContractorProfileController::buildIdentity).
    const promise = service.getProfile();
    const req = http.expectOne('/contractor-compliance/profile');
    expect(req.request.method).toBe('GET');
    req.flush({
      data: {
        identity: {
          phone: '+33',
          email: 'a@b.fr',
          first_name: 'A',
          last_name: 'B',
          company_name: 'C',
          siren: '1',
        },
        notifications: {
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

  it('GET /profile expose l\'email du compte contractor', async () => {
    // Un seul email contractor : celui du compte (cc_users.email), renvoyé
    // dans le bloc identity. L'écran profil l'affiche en lecture seule.
    const promise = service.getProfile();
    const req = http.expectOne('/contractor-compliance/profile');
    req.flush({
      data: {
        identity: {
          phone: null,
          email: 'moussa@tuita.fr',
          first_name: null,
          last_name: null,
          company_name: null,
          siren: null,
        },
        notifications: {
          email_invoice_payment: true,
          email_document_expiry: false,
          email_invoice_rejected: false,
        },
      },
    });
    const out = await promise;
    expect(out.identity.email).toBe('moussa@tuita.fr');
    expect(out.notifications.email_invoice_payment).toBe(true);
  });

  it('GET /profile — email absent du payload → null', async () => {
    const promise = service.getProfile();
    const req = http.expectOne('/contractor-compliance/profile');
    req.flush({ data: { identity: {}, notifications: {} } });
    const out = await promise;
    expect(out.identity.email).toBeNull();
  });

  it('PATCH /profile/notifications lit la réponse à plat (valeur serveur)', async () => {
    // La réponse backend est l'objet préférences à plat sous `data` —
    // { email_* } — pas { data: { notifications: {...} } }. Le service doit
    // lire `data` directement.
    const promise = service.updateNotifications({ email_invoice_payment: true });
    const req = http.expectOne('/contractor-compliance/profile/notifications');
    expect(req.request.method).toBe('PATCH');
    req.flush({
      data: {
        email_invoice_payment: true,
        email_document_expiry: false,
        email_invoice_rejected: false,
      },
    });
    const out = await promise;
    expect(out.email_invoice_payment).toBe(true);
  });

  it('POST /profile/logout returns void', async () => {
    const promise = service.logout();
    const req = http.expectOne('/contractor-compliance/profile/logout');
    expect(req.request.method).toBe('POST');
    req.flush({ data: null }, { status: 200, statusText: 'OK' });
    await promise;
  });
});
