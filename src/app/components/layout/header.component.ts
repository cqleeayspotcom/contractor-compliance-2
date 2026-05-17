import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ContractorSessionService } from '../../services/contractor-session.service';
import { RefreshService } from '../../services/refresh.service';

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

  /** Leave the compliance micro-app and go back to tuita.fr/contractor */
  exit(): void {
    window.location.href = 'https://tuita.fr/contractor';
  }
}
