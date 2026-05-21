import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { MatIconModule } from '@angular/material/icon';

import { ContractorSessionService } from '../../services/contractor-session.service';
import { ContractorDashboard } from '../../services/contractor-api.service';
import { BackButtonComponent } from '../../components/shared/back-button/back-button.component';
import { SkeletonComponent } from '../../components/shared/skeleton.component';

type SubcardStatus = 'ok' | 'warn' | 'bad';

/**
 * Page-hub `/chantiers` accessible uniquement aux contractors `fully_verified`.
 *
 * Regroupe les deux zones « gagner sa vie » : Interventions (chantiers acceptés
 * sur tuita.fr) et Factures (envoi + suivi paiement). La garde de route assure
 * que seuls les contractors vérifiés y accèdent — un contractor en cours
 * d'onboarding voit la tuile lockée sur le dashboard et est redirigé ici si
 * il essaie de forcer l'URL.
 *
 * Les compteurs viennent du dashboard signal partagé — pas d'appel HTTP
 * supplémentaire.
 */
@Component({
  selector: 'app-contractor-chantiers',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, BackButtonComponent, SkeletonComponent],
  templateUrl: './contractor-chantiers.component.html',
  styleUrl: './contractor-chantiers.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorChantiersComponent {
  readonly session = inject(ContractorSessionService);

  readonly isLoading$ = this.session.isLoading$;
  readonly error$ = this.session.error$;

  readonly dashboard = toSignal<ContractorDashboard | null>(this.session.dashboard$, {
    initialValue: null,
  });

  // ─── Interventions ──────────────────────────────────────────────────────

  readonly missionsTotal = computed<number>(() => {
    return this.dashboard()?.missions?.completed ?? 0;
  });

  readonly missionsInvoiceable = computed<number>(() => {
    return this.dashboard()?.missions?.invoiceable ?? 0;
  });

  readonly missionsStatus = computed<SubcardStatus>(() => {
    return this.missionsInvoiceable() > 0 ? 'warn' : 'ok';
  });

  readonly missionsSubtitle = computed<string>(() => {
    const total = this.missionsTotal();
    const todo = this.missionsInvoiceable();
    if (todo > 0) {
      return `${todo} intervention${todo > 1 ? 's' : ''} à facturer`;
    }
    if (total === 0) {
      return 'Aucune intervention pour le moment';
    }
    return `${total} intervention${total > 1 ? 's' : ''} terminée${total > 1 ? 's' : ''}`;
  });

  // ─── Factures ───────────────────────────────────────────────────────────

  readonly invoicesStatus = computed<SubcardStatus>(() => {
    const inv = this.dashboard()?.invoices;
    if (!inv) return 'ok';
    if (inv.rejected > 0) return 'bad';
    if (
      inv.pending_payment_validation > 0 ||
      inv.ready_to_pay > 0 ||
      inv.payment_in_progress > 0 ||
      inv.validating > 0
    ) {
      return 'warn';
    }
    return 'ok';
  });

  readonly invoicesSubtitle = computed<string>(() => {
    const inv = this.dashboard()?.invoices;
    if (!inv) return 'Chargement...';
    if (inv.rejected > 0) {
      return `${inv.rejected} facture${inv.rejected > 1 ? 's' : ''} refusée${inv.rejected > 1 ? 's' : ''}`;
    }
    const inFlight =
      inv.validating + inv.pending_payment_validation + inv.ready_to_pay + inv.payment_in_progress;
    if (inFlight > 0) {
      return `${inFlight} facture${inFlight > 1 ? 's' : ''} en cours de traitement`;
    }
    if (inv.paid > 0) {
      return `${inv.paid} facture${inv.paid > 1 ? 's' : ''} payée${inv.paid > 1 ? 's' : ''}`;
    }
    return 'Aucune facture pour le moment';
  });

  // ─── UI helpers ─────────────────────────────────────────────────────────

  statusIcon(status: SubcardStatus): string {
    switch (status) {
      case 'ok':   return 'check_circle';
      case 'warn': return 'priority_high';
      case 'bad':  return 'error';
    }
  }

  statusLabel(status: SubcardStatus): string {
    switch (status) {
      case 'ok':   return 'À jour';
      case 'warn': return 'Action attendue';
      case 'bad':  return 'À corriger';
    }
  }

  retry(): void {
    this.session.refreshDashboard();
  }
}
