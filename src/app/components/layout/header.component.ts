import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { ContractorSessionService } from '../../services/contractor-session.service';
import { RefreshService } from '../../services/refresh.service';
import { ProfileService } from '../../services/profile.service';
import { LogoutConfirmDialogComponent } from '../../pages/contractor-profile/logout-confirm-dialog.component';

/**
 * Contractor header component matching the tuita.fr/contractor design.
 * Full-width white bar with logo on the left and navigation icon buttons on the right.
 * No sidebar -- this is the only navigation element.
 */
@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
  ],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  private readonly session = inject(ContractorSessionService);
  private readonly refreshBus = inject(RefreshService);
  private readonly profileService = inject(ProfileService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  /** Expose au template pour `[disabled]` et tooltip dynamique. */
  readonly canRefresh = this.refreshBus.canRefresh;

  /**
   * Click handler du bouton "Rafraichir".
   * Recharge les donnees globales (dashboard) ET emet un tick sur le
   * RefreshService auquel chaque page active s'est abonnee pour
   * recharger ses propres donnees (missions, factures, documents, etc.).
   *
   * No-op si une page a pose un verrou via `setBusy` (ex. enregistrement
   * KYC en cours, QCM en cours) pour ne pas detruire du travail en cours.
   */
  refresh(): void {
    if (!this.canRefresh()) return;
    this.session.refreshDashboard();
    this.refreshBus.trigger();
  }

  /**
   * Vrai logout : confirmation modale → appel API logout (invalide la
   * session backend) → snackbar → redirect tuita.fr. Sans l'appel API, la
   * session côté serveur restait active et un simple retour sur l'app
   * reconnectait l'user — bug.
   */
  async exit(): Promise<void> {
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

    this.snack.open('Déconnexion réussie', '', {
      duration: 1500,
      panelClass: ['snack-success'],
      horizontalPosition: 'center',
      verticalPosition: 'top',
    });

    setTimeout(() => {
      window.location.href = '/';
    }, 800);
  }
}
