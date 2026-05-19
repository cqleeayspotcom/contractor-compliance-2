import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';

import { Api } from '../../api/api';
import { adminAuthRequestPin } from '../../api/fn/admin-auth/admin-auth-request-pin';

/**
 * Page de connexion admin Tuita.
 *
 * Flow OAuth2 mysession standard (directive Maxime 2026-05-19) :
 *
 *   Step 1 — POST /contractor-compliance/admin/auth/request-pin {email}
 *            → backend appelle EmailOtaPdo::saveToken (storage OAuth2 natif
 *              Tuita) + diffuse le PIN sur Slack canal `granting-enquiry`
 *              et dans application.log en dev.
 *            ← réponse { sms_trip_token, expires_at, pincode_media }
 *
 *   Step 2 — POST /signin (route OAuth2 vendor laminas-api-tools/oauth2)
 *            body  : grant_type=password&username=&password=<PIN>&client_id=tuita
 *            header: Sms-Trip: <sms_trip_token>
 *            ← réponse { access_token, expires_in, refresh_token, token_type }
 *
 *   Step 3 — store access_token en sessionStorage → adminKeyInterceptor
 *            l'injectera comme `Authorization: Bearer ...` sur toutes les
 *            requêtes /contractor-compliance/admin/*.
 *
 * POURQUOI on n'appelle PAS l'endpoint odass `/login/send-sms-verif` :
 *   bug pré-existant — le controller lit le username via params()->fromPost()
 *   qui ne marche pas pour un body JSON. Le wrapper module utilise le même
 *   storage OAuth2 mais via bodyParam() correctement.
 */
// POURQUOI : alias local sur le shape retourné par le SDK `adminAuthRequestPin`.
// On reste à plat (le backend ne wrappe PAS dans `{ data: ... }` pour cette route
// pré-auth, contrairement aux autres endpoints admin sous SuccessEnvelope).
type PincodeMedia = 'log' | 'slack';

interface SigninResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
  scope?: string | null;
}

interface ErrorBody {
  error?: { code?: string; message?: string };
  detail?: string;
}

type Step = 'email' | 'pin';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './admin-login.component.html',
  styleUrl: './admin-login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLoginComponent {
  // POURQUOI HttpClient reste injecté : /signin est une route OAuth2 vendor
  // (laminas-api-tools/oauth2) hors spec OpenAPI du module → pas de fn SDK,
  // appel brut form-urlencoded indispensable.
  private readonly http = inject(HttpClient);
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snack = inject(MatSnackBar);

  readonly step = signal<Step>('email');
  readonly email = signal('');
  readonly pin = signal('');
  readonly smsTripToken = signal<string | null>(null);
  readonly pincodeMedia = signal<PincodeMedia>('log');
  readonly loading = signal(false);

  async submitEmail(): Promise<void> {
    const email = this.email().trim();
    if (!email) {
      this.snack.open('Renseigne ton email.', 'OK');
      return;
    }
    this.loading.set(true);
    try {
      // POURQUOI SDK : `adminAuthRequestPin` est désormais exposé dans
      // l'OpenAPI module. Le body est à plat `{ sms_trip_token, expires_at,
      // pincode_media }` — pas d'enveloppe `{ data }` côté pré-auth.
      const resp = await this.api.invoke(adminAuthRequestPin, { body: { email } });
      this.smsTripToken.set(resp.sms_trip_token);
      this.pincodeMedia.set(resp.pincode_media);
      this.step.set('pin');
      this.snack.open(
        resp.pincode_media === 'slack'
          ? 'PIN envoyé sur Slack #granting-enquiry.'
          : 'PIN généré — récupère-le dans application.log (dev).',
        'OK',
        { duration: 4000 }
      );
    } catch (e) {
      const msg = this.extractError(e, 'Impossible de demander un PIN.');
      this.snack.open(msg, 'OK');
    } finally {
      this.loading.set(false);
    }
  }

  async submitPin(): Promise<void> {
    const pin = this.pin().trim();
    const smsTrip = this.smsTripToken();
    if (!pin || !smsTrip) {
      this.snack.open('Saisis le PIN reçu.', 'OK');
      return;
    }
    this.loading.set(true);
    try {
      // /signin attend du form-urlencoded (route OAuth2 vendor), pas du JSON.
      // On construit donc un URLSearchParams plutôt qu'un objet JSON.
      const body = new URLSearchParams();
      body.set('grant_type', 'password');
      body.set('username', this.email().trim());
      body.set('password', pin);
      body.set('client_id', 'tuita');

      const resp = await firstValueFrom(
        this.http.post<SigninResponse>('/signin', body.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Sms-Trip': smsTrip,
          },
        })
      );
      sessionStorage.setItem('tuita_admin_token', resp.access_token);
      if (resp.refresh_token) {
        sessionStorage.setItem('tuita_admin_refresh', resp.refresh_token);
      }
      sessionStorage.setItem('tuita_admin_user', JSON.stringify({
        email: this.email().trim(),
      }));
      this.snack.open('Connecté.', 'OK', { duration: 2000 });
      const redirect = this.route.snapshot.queryParamMap.get('redirect');
      this.router.navigateByUrl(redirect ?? '/admin');
    } catch (e) {
      const msg = this.extractError(e, 'PIN invalide ou expiré.');
      this.snack.open(msg, 'OK');
    } finally {
      this.loading.set(false);
    }
  }

  resetToEmail(): void {
    this.step.set('email');
    this.pin.set('');
    this.smsTripToken.set(null);
  }

  /**
   * Le backend peut répondre soit dans le shape ProblemDetails (`{detail}`,
   * /signin OAuth2 vendor), soit dans le shape module (`{error: {message}}`).
   * On accepte les deux pour éviter un fallback systématique générique.
   */
  private extractError(e: unknown, fallback: string): string {
    if (e instanceof HttpErrorResponse) {
      const body = e.error as ErrorBody | undefined;
      return body?.error?.message ?? body?.detail ?? fallback;
    }
    return fallback;
  }
}
