import { Component, ChangeDetectionStrategy, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';

import { ContractorApiService, ContractorMission } from '../../services/contractor-api.service';
import { ContractorSessionService } from '../../services/contractor-session.service';
import { RefreshService } from '../../services/refresh.service';
import { InvoicePreviewPanelComponent } from './invoice-preview-panel/invoice-preview-panel.component';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-contractor-intervention-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './contractor-intervention-detail.component.html',
  styleUrl: './contractor-intervention-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorInterventionDetailComponent implements OnInit {
  private readonly api = inject(ContractorApiService);
  private readonly session = inject(ContractorSessionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly refreshBus = inject(RefreshService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  readonly mission = signal<ContractorMission | null>(null);
  readonly isLoading = signal(true);
  readonly notFound = signal(false);
  readonly isSimulating = signal(false);
  readonly simulateResult = signal<string | null>(null);
  readonly simulateError = signal<string | null>(null);

  /**
   * Bloc « Simulation (dev) » : permet de déclencher manuellement la fin de
   * mission en environnement local pour tester le pipeline de génération
   * automatique de facture (plan Pro). Masqué en production — un contractor
   * réel ne doit JAMAIS voir ce bouton ni pouvoir le déclencher.
   */
  readonly showDevSimulation = !environment.production;

  ngOnInit(): void {
    const mid = this.route.snapshot.paramMap.get('mid');
    if (!mid) {
      this.notFound.set(true);
      this.isLoading.set(false);
      return;
    }

    this.loadMission(mid);
    this.refreshBus.refresh$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadMission(mid));
  }

  private loadMission(mid: string): void {
    this.isLoading.set(true);
    this.api.getMission(mid).subscribe({
      next: m => {
        this.mission.set(m);
        this.notFound.set(false);
        this.isLoading.set(false);
      },
      error: () => {
        this.notFound.set(true);
        this.isLoading.set(false);
      },
    });
  }

  get isPaidPlan(): boolean {
    return this.session.plan === 'paid';
  }

  simulateComplete(): void {
    // L'endpoint dev-only `/missions/:ref/simulate-complete` n'a pas été
    // porté côté Tuita (les missions sont complétées par le workflow ops
    // backoffice). Le bouton reste affiché en dev pour rappel manuel, mais
    // il ne fait plus que signaler l'indisponibilité — pas de crash UI.
    this.isSimulating.set(false);
    this.simulateResult.set(null);
    this.simulateError.set(
      'Simulation de fin de mission indisponible côté Tuita — déclencher la complétion via le backoffice ops.',
    );
  }

  /**
   * Ouvre un panel latéral droit avec le détail de la facture associée à la
   * mission, sans quitter la page mission. Charge la facture par UUID via
   * l'API. Fonctionne pour les 2 plans (Pro = facture auto-générée,
   * Freemium = facture uploadée par le contractor).
   */
  openInvoicePanel(mission: ContractorMission): void {
    if (!mission.invoice_uuid) return;

    this.dialog.open(InvoicePreviewPanelComponent, {
      data: {
        uuid: mission.invoice_uuid,
        number: mission.invoice_number ?? null,
        missionRef: mission.caseNumber,
      },
      panelClass: 'invoice-side-panel',
      width: '480px',
      maxWidth: '100vw',
      height: '100vh',
      maxHeight: '100vh',
      position: { right: '0', top: '0' },
      autoFocus: false,
    });
  }

  goToInvoice(mission: ContractorMission): void {
    const baseQuery = {
      mission_ref: mission.caseNumber,
      amount: mission.price.toString(),
      mid: mission.mid,
    };

    // Si la mission a une facture rejetee, on doit basculer en mode "Corriger"
    // sur /invoices. Pour cela on trouve l'UUID de la facture rejetee et on
    // l'ajoute en query param `reupload`. Sans ca, l'utilisateur tomberait sur
    // le formulaire d'upload normal et la soumission echouerait avec
    // `invoice.already_exists_rejected` (fallback existant) avant de basculer.
    if (mission.invoice_status !== 'rejected') {
      this.router.navigate(['/invoices'], { queryParams: baseQuery });
      return;
    }

    this.api.getInvoices({ status: 'rejected', per_page: 50 }).subscribe({
      next: (res: any) => {
        const rejected = (res?.data ?? []).find((i: any) => i.mission_ref === mission.caseNumber);
        const queryParams = rejected
          ? { ...baseQuery, reupload: rejected.uuid }
          : baseQuery;
        this.router.navigate(['/invoices'], { queryParams });
      },
      error: () => {
        // En cas d'echec, fallback sur le mode standard (le serveur reverra
        // `invoice.already_exists_rejected` qui declenche le startReupload cote /invoices).
        this.router.navigate(['/invoices'], { queryParams: baseQuery });
      },
    });
  }

  formatPrice(price: number | null | undefined): string {
    if (price == null) return '-';
    return price.toFixed(2).replace('.', ',') + ' \u20AC';
  }

  formatDate(iso: string | null): string {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  operationIcon(type: string): string {
    const icons: Record<string, string> = {
      starlink: 'satellite_alt',
      previsit: 'search',
      drone_prev: 'flight',
    };
    return icons[type] ?? 'work';
  }

  invoiceStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      none: 'Facture manquante',
      validating: 'Vérification OCR',
      pending_validation: 'Validation Tuita',
      ready_to_pay: 'Bon pour paiement',
      paying: 'Virement en cours',
      paid: 'Payée',
      uploaded: 'Facture envoyée',
      auto_generated: 'Facture auto-générée',
      rejected: 'Facture rejetée',
    };
    return labels[status] ?? status;
  }

  invoiceStatusClass(status: string): string {
    switch (status) {
      case 'paid':
      case 'ready_to_pay':
      case 'uploaded':
      case 'auto_generated':
        return 'badge--green';
      case 'rejected':
        return 'badge--red';
      case 'validating':
      case 'pending_validation':
      case 'paying':
        return 'badge--blue';
      default:
        return 'badge--orange';
    }
  }

  invoiceStatusIcon(status: string): string {
    switch (status) {
      case 'paid': return 'verified';
      case 'ready_to_pay': return 'check_circle';
      case 'paying': return 'account_balance';
      case 'uploaded':
      case 'auto_generated': return 'check_circle';
      case 'validating':
      case 'pending_validation': return 'hourglass_top';
      case 'rejected': return 'error_outline';
      default: return 'warning';
    }
  }

  invoiceStatusTooltip(status: string): string {
    const tooltips: Record<string, string> = {
      none:
        "Aucune facture n'a encore été émise pour cette mission.",
      validating:
        "Nos robots relisent votre facture (OCR, cohérence des montants, vérifications anti-fraude). Généralement < 1 minute.",
      pending_validation:
        "Votre facture est en cours de validation chez Tuita. Aucune action de votre part - vous serez notifié dès que c'est validé.",
      ready_to_pay:
        "Tuita a validé votre facture. Elle est dans la file de virement - la comptabilité va lancer le paiement sous 1 à 3 jours ouvrés.",
      paying:
        "Le virement a été lancé vers votre IBAN. Confirmation bancaire sous T+1 à T+3 selon votre banque.",
      paid:
        "Virement confirmé côté banque. La boucle comptable est fermée - merci !",
      uploaded:
        "Facture envoyée et prise en compte. Elle est maintenant dans le pipeline de validation.",
      auto_generated:
        "Facture générée automatiquement par Tuita à partir du bon de commande de la mission (plan Pro).",
      rejected:
        "La facture a été refusée. Consultez la raison dans l'onglet Factures - vous pouvez la corriger et la renvoyer.",
    };
    return tooltips[status] ?? '';
  }
}
