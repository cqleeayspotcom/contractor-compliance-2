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

  // Normalisation FR → P33 (même logique que le signup et le backend).
  readonly normalizedPhone = computed<string>(() => {
    const raw = this.phoneRaw().trim();
    if (raw === '') return '';
    let cleaned = raw.toUpperCase().replace(/[^0-9P]/g, '');
    if (cleaned.startsWith('P')) cleaned = cleaned.slice(1);
    if (cleaned.startsWith('0')) cleaned = '33' + cleaned.slice(1);
    if (cleaned === '') return '';
    return 'P' + cleaned;
  });

  readonly isPhoneValid = computed<boolean>(() => /^P\d{10,15}$/.test(this.normalizedPhone()));

  async submitPhone(): Promise<void> {
    if (!this.isPhoneValid()) {
      this.snack.open('Numéro invalide. Ex. 06 12 34 56 78', 'OK', { duration: 4000 });
      return;
    }
    this.loading.set(true);
    try {
      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/contractor/auth/request-code`,
          { phone: this.normalizedPhone() },
          { withCredentials: true })
      );
      this.step.set('code');
    } catch (err: unknown) {
      const errorCode = (err as { error?: { error?: { code?: string } } })?.error?.error?.code;
      const msg = errorCode === 'phone_not_found'
        ? 'Aucun compte pour ce numéro - inscrivez-vous.'
        : 'Erreur. Réessayez.';
      this.snack.open(msg, 'OK', { duration: 4000 });
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
      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/contractor/auth/verify-code`,
          { phone: this.normalizedPhone(), code: this.code() },
          { withCredentials: true })
      );
      // Recharge la session avec le cookie fraîchement posé avant de naviguer :
      // sinon le dashboard lit l'`error$` "Session expirée" laissé par
      // APP_INITIALIZER (qui avait échoué en 401 faute de cookie).
      await firstValueFrom(this.session.loadDashboard()).catch(() => {});
      void this.router.navigate(['/dashboard']);
    } catch {
      this.snack.open('Code incorrect.', 'OK', { duration: 3000 });
    } finally {
      this.loading.set(false);
    }
  }
}
