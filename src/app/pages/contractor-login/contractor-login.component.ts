import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ContractorSessionService } from '../../services/contractor-session.service';
import { PhoneDisplayPipe } from '../../pipes/phone-display.pipe';
import { isValidTuitaPhoneP33, toTuitaPhoneP33, toTuitaPhonePlus } from '../../utils/phone-normalizer';

type Step = 'phone' | 'code';

@Component({
  selector: 'app-contractor-login',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    PhoneDisplayPipe,
  ],
  templateUrl: './contractor-login.component.html',
  styleUrl: './contractor-login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorLoginComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly session = inject(ContractorSessionService);

  readonly step = signal<Step>('phone');
  readonly phoneRaw = signal('');
  readonly code = signal('');
  readonly loading = signal(false);

  // Normalisation FR → P33 (forme canonique partagée avec le signup).
  // POURQUOI deux dérivés : la forme P33 sert à l'affichage et à la
  // validation ; la forme +33 (Tuita natif) est envoyée à /contractor/auth/*
  // car ContractorOauthWrapper::sendSmsPassword attend explicitement le `+`.
  readonly normalizedPhone = computed<string>(() => toTuitaPhoneP33(this.phoneRaw()));
  readonly phonePlus = computed<string>(() => toTuitaPhonePlus(this.phoneRaw()));
  readonly isPhoneValid = computed<boolean>(() => isValidTuitaPhoneP33(this.normalizedPhone()));

  async submitPhone(): Promise<void> {
    if (!this.isPhoneValid()) {
      this.snack.open('Numéro invalide. Ex. 06 12 34 56 78', 'OK', { duration: 4000 });
      return;
    }
    this.loading.set(true);
    try {
      // Tuita monolithe : POST /contractor/auth/pin avec { smsphone }.
      // Envoie le SMS contenant le PIN (ContractorOauthWrapper::sendSmsPassword).
      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/contractor/auth/pin`,
          // Format Tuita natif strict : +33XXXXXXXXX (cf. ContractorModule
          // CLAUDE.md — Utils::toIntlMobileNotation attend le `+`).
          { smsphone: this.phonePlus() },
          { withCredentials: true })
      );
      this.step.set('code');
    } catch (err: unknown) {
      console.error('[login] /contractor/auth/pin failed', err);
      const e = err as { status?: number; statusText?: string; error?: { error?: { code?: string }; detail?: string; title?: string } };
      const errorCode = e?.error?.error?.code;
      let msg: string;
      if (errorCode === 'phone_not_found') {
        msg = 'Aucun compte pour ce numéro - inscrivez-vous.';
      } else if (e?.status === 0) {
        msg = 'Backend injoignable (vérifie le proxy / docker).';
      } else if (e?.status) {
        msg = `Erreur ${e.status} ${e.statusText ?? ''} ${e.error?.detail ?? e.error?.title ?? ''}`.trim();
      } else {
        msg = 'Erreur. Réessayez.';
      }
      this.snack.open(msg, 'OK', { duration: 6000 });
    } finally {
      this.loading.set(false);
    }
  }

  async submitCode(): Promise<void> {
    if (this.code().length < 4) {
      this.snack.open('Code invalide.', 'OK', { duration: 3000 });
      return;
    }
    this.loading.set(true);
    try {
      // Tuita monolithe : POST /contractor/auth/login avec { smsphone, pincode }.
      // Pose le cookie __contractor_ssid (ContractorOauthWrapper::contractorLogin).
      // ATTENTION : le backend renvoie TOUJOURS 200, le succès se lit dans la
      // réponse JSON. Forme exacte (cf. ContractorOauthWrapper::contractorLogin
      // + ContractorAuthActionController::login → jsonResponse) :
      //   - succès → { data: { profile: { firstname, lastname, ... } } }
      //   - échec  → { data: false }   (PIN faux, expiré, ou champ vide)
      // C'est `data` qu'il faut tester (PAS `connected`, qui est la forme
      // de /contractor/auth/status — endpoint différent).
      const resp = await firstValueFrom(
        this.http.post<{ data?: { profile?: unknown } | false }>(
          `${environment.apiUrl}/contractor/auth/login`,
          // Même format strict +33 — un mismatch entre /pin et /login
          // empêcherait la résolution du contractor (lookup sur smsphone).
          { smsphone: this.phonePlus(), pincode: this.code() },
          { withCredentials: true })
      );
      if (!resp?.data) {
        this.snack.open('Code incorrect.', 'OK', { duration: 3000 });
        return;
      }
      // Recharge la session avec le cookie fraîchement posé avant de naviguer :
      // sinon le dashboard lit l'`error$` "Session expirée" laissé par
      // APP_INITIALIZER (qui avait échoué en 401 faute de cookie).
      await firstValueFrom(this.session.loadDashboard()).catch(() => {});
      void this.router.navigate(['/dashboard']);
    } catch (err: unknown) {
      console.error('[login] /contractor/auth/login failed', err);
      this.snack.open('Code incorrect.', 'OK', { duration: 3000 });
    } finally {
      this.loading.set(false);
    }
  }
}
