import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ContractorProfile,
  NotificationPreferences,
  ProfileService,
} from '../../services/profile.service';
import { LogoutConfirmDialogComponent } from './logout-confirm-dialog.component';
import { PhoneDisplayPipe } from '../../pipes/phone-display.pipe';

@Component({
  selector: 'app-contractor-profile',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSlideToggleModule,
    PhoneDisplayPipe,
  ],
  templateUrl: './contractor-profile.component.html',
  styleUrl: './contractor-profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorProfileComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly profile = signal<ContractorProfile | null>(null);
  readonly draft = signal<NotificationPreferences | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const data = await this.profileService.getProfile();
      this.profile.set(data);
      this.draft.set({ ...data.notifications });
    } finally {
      this.loading.set(false);
    }
  }

  isDirty(): boolean {
    const original = this.profile()?.notifications;
    const draft = this.draft();
    if (!original || !draft) return false;
    return JSON.stringify(original) !== JSON.stringify(draft);
  }

  /**
   * FIX-044 — Initiales contractor pour l'avatar profil.
   * Stratégie : 1er char prénom + 1er char nom de famille en majuscules.
   * Si on n'a que l'un des deux → on prend les 2 premiers chars du dispo.
   * Si tout est vide (cas signup minimal pré-OCR CNI) → retourne ''
   * et le template retombe sur l'icône person générique.
   */
  initials(p: ContractorProfile): string {
    const first = (p.identity.first_name ?? '').trim();
    const last = (p.identity.last_name ?? '').trim();
    if (!first && !last) return '';
    if (first && last) return (first[0] + last[0]).toUpperCase();
    const fallback = (first || last);
    return fallback.slice(0, 2).toUpperCase();
  }

  updateDraft(field: keyof NotificationPreferences, value: string | boolean | null): void {
    const current = this.draft();
    if (!current) return;
    this.draft.set({ ...current, [field]: value } as NotificationPreferences);
  }

  async save(): Promise<void> {
    const draft = this.draft();
    if (!draft) return;
    this.saving.set(true);

    const payload: NotificationPreferences = {
      email_address: draft.email_address?.trim() ? draft.email_address.trim() : null,
      email_invoice_payment: !!draft.email_invoice_payment,
      email_document_expiry: !!draft.email_document_expiry,
      email_invoice_rejected: !!draft.email_invoice_rejected,
    };

    try {
      const updated = await this.profileService.updateNotifications(payload);
      const profile = this.profile();
      if (profile) {
        this.profile.set({ ...profile, notifications: updated });
        this.draft.set({ ...updated });
      }
      this.snack.open('Préférences enregistrées', 'OK', { duration: 3000 });
    } catch (err: unknown) {
      const detail = this.extractValidationDetail(err);
      this.snack.open(
        detail ? `Erreur : ${detail}` : "Erreur lors de l'enregistrement",
        'Fermer',
        { duration: 8000 },
      );
    } finally {
      this.saving.set(false);
    }
  }

  private extractValidationDetail(err: unknown): string | null {
    const e = err as { error?: { message?: string; errors?: Record<string, string[]> } };
    const errors = e?.error?.errors;
    if (errors) {
      const first = Object.values(errors).flat()[0];
      if (first) return String(first);
    }
    return e?.error?.message ?? null;
  }

  /**
   * Confirmation logout via MatDialog Material (au lieu d'un `window.confirm`
   * brut). Snackbar « Déconnexion réussie » avant le redirect tuita.fr pour
   * que l'user perçoive l'action — sans elle la page change brutalement et
   * il pourrait douter d'avoir bien cliqué.
   */
  async logout(): Promise<void> {
    const ref = this.dialog.open<LogoutConfirmDialogComponent, void, boolean>(
      LogoutConfirmDialogComponent,
      {
        width: '420px',
        maxWidth: '92vw',
        autoFocus: false,
        restoreFocus: true,
      },
    );
    const confirmed = await firstValueFrom(ref.afterClosed());
    if (!confirmed) return;

    await this.profileService.logout().catch(() => undefined);

    this.snack.open('Déconnexion réussie - redirection vers tuita.fr', '', {
      duration: 1500,
      panelClass: ['snack-success'],
      horizontalPosition: 'center',
      verticalPosition: 'top',
    });

    // Délai 800 ms : laisse le temps au snackbar d'apparaître + animation
    // avant que la page Compliance disparaisse derrière le redirect.
    setTimeout(() => {
      window.location.href = 'https://tuita.fr';
    }, 800);
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }
}
