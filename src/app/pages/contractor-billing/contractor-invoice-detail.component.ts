import { Component, ChangeDetectionStrategy, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ContractorApiService } from '../../services/contractor-api.service';
import { RefreshService } from '../../services/refresh.service';
import { getInvoiceRejectionCopy, InvoiceRejectionCopy } from './invoice-rejection-messages';
import { InvoiceTimelineComponent } from '../../components/shared/invoice-timeline/invoice-timeline.component';
import { InvoiceTimeline } from '../../models/invoice-timeline.model';

interface InvoiceMission {
  title: string;
  operation_type: string;
  city: string;
  address: string;
  visit_date: string | null;
  mid: string;
}

interface Invoice {
  uuid: string;
  invoice_number: string;
  status: string;
  amount_ht: number;
  amount_ttc: number;
  currency: string;
  mission_ref: string;
  issued_at: string;
  source: 'auto_generated' | 'manual_upload';
  is_rejected?: boolean;
  mission?: InvoiceMission;
  created_at: string;

  // Champs de rejet (remplis quand status = 'rejected'). Source : backend
  // ValidateInvoiceOcrJob + OcrDocumentRules::evaluateInvoice.
  rejection_reason?: string | null;
  rejection_details?: string[] | null;

  // Nombre de pages physiques du PDF (source : Mistral OCR natif passe 1).
  // Hard limit backend = 5 pages ; stocké ici pour affichage indicatif.
  pages_count?: number | null;

  // Timeline du pipeline de paiement — bloc enrichi par le backend
  // (GET /contractor-compliance/invoices/{uuid}). Optionnel tant que l'endpoint
  // n'a pas été mis à jour — le composant ne s'affiche que si présent.
  timeline?: InvoiceTimeline | null;
}

@Component({
  selector: 'app-contractor-invoice-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    InvoiceTimelineComponent,
  ],
  templateUrl: './contractor-invoice-detail.component.html',
  styleUrl: './contractor-invoice-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorInvoiceDetailComponent implements OnInit {
  private readonly api = inject(ContractorApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly refreshBus = inject(RefreshService);
  private readonly destroyRef = inject(DestroyRef);

  readonly invoice = signal<Invoice | null>(null);
  readonly isLoading = signal(true);
  readonly notFound = signal(false);

  ngOnInit(): void {
    const uuid = this.route.snapshot.paramMap.get('uuid');
    if (!uuid) {
      this.notFound.set(true);
      this.isLoading.set(false);
      return;
    }

    this.loadInvoice(uuid);
    this.refreshBus.refresh$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadInvoice(uuid));
  }

  private loadInvoice(uuid: string): void {
    this.isLoading.set(true);
    // Fetch all invoices and find by uuid (no dedicated single-invoice endpoint)
    this.api.getInvoices().subscribe({
      next: (res: any) => {
        const found = (res.data ?? []).find((i: Invoice) => i.uuid === uuid);
        if (found) {
          this.invoice.set(found);
          this.notFound.set(false);
        } else {
          this.notFound.set(true);
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.notFound.set(true);
        this.isLoading.set(false);
      },
    });
  }

  readonly downloadError = signal(false);

  downloadPdf(): void {
    const inv = this.invoice();
    if (!inv) return;
    this.downloadError.set(false);
    this.api.downloadInvoicePdf(inv.uuid).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `facture-${inv.invoice_number}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.downloadError.set(true);
      },
    });
  }

  goToReupload(): void {
    const inv = this.invoice();
    if (!inv) return;
    this.router.navigateByUrl(
      `/invoices?reupload=${inv.uuid}&mission_ref=${encodeURIComponent(inv.mission_ref)}&amount=${inv.amount_ttc}`
    );
  }

  goToMission(mid: string): void {
    this.router.navigateByUrl(`/interventions/${mid}`);
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      // Pipeline unifié (cf. docs/payment-flow.md § 6)
      draft: 'Brouillon',
      validating: 'Vérification OCR',
      pending_payment_validation: 'Validation Tuita',
      ready_to_pay: 'Bon pour paiement',
      payment_in_progress: 'Virement en cours',
      paid: 'Payée',
      rejected: 'Rejetée',
      cancelled: 'Annulée',
      // Statuts legacy (freemium/Pro pre-2026-04-18)
      validated: 'Validée',
      sent: 'Envoyée',
      overdue: 'En retard',
    };
    return labels[status] ?? status;
  }

  statusClass(status: string): string {
    switch (status) {
      case 'paid':
      case 'ready_to_pay':
      case 'validated':
      case 'sent':
        return 'badge--green';
      case 'validating':
      case 'pending_payment_validation':
      case 'payment_in_progress':
      case 'draft':
        return 'badge--orange';
      case 'rejected':
      case 'overdue':
      case 'cancelled':
        return 'badge--red';
      default:
        return 'badge--grey';
    }
  }

  statusIcon(status: string): string {
    switch (status) {
      case 'paid': return 'check_circle';
      case 'ready_to_pay': return 'verified';
      case 'payment_in_progress': return 'account_balance';
      case 'validated': case 'sent': return 'verified';
      case 'validating':
      case 'pending_payment_validation': return 'hourglass_top';
      case 'rejected': return 'error_outline';
      case 'overdue': return 'schedule';
      case 'cancelled': return 'block';
      default: return 'receipt_long';
    }
  }

  sourceLabel(source: string): string {
    return source === 'auto_generated' ? 'Générée automatiquement' : 'Envoyée manuellement';
  }

  operationIcon(type: string | undefined): string {
    if (!type) return 'work';
    const icons: Record<string, string> = { starlink: 'satellite_alt', previsit: 'search', drone_prev: 'flight' };
    return icons[type] ?? 'work';
  }

  formatAmount(amount: number): string {
    return amount.toFixed(2).replace('.', ',') + ' \u20AC';
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  /**
   * Date \u00e0 laquelle la v\u00e9rification automatique (OCR Mistral + r\u00e8gles m\u00e9tier)
   * a accept\u00e9 la facture.
   *
   * Source : timeline.steps avec step='ocr_passed' et state='done'. C'est
   * l'\u00e9tape automatique qui valide la facture Freemium. Pour les contractors
   * Pro (`source='auto_generated'`), il n'y a pas d'\u00e9tape OCR.
   *
   * Pourquoi cette info compte : c'est la "date de d\u00e9p\u00f4t valid\u00e9e" qui d\u00e9marre
   * le compteur des conditions de paiement 30j fin de mois (directive Moussa
   * 2026-05-19). Tant que cette date n'est pas connue, on ne peut pas afficher
   * la date pr\u00e9vue de paiement au contractor.
   *
   * NB nommage : nom public de l'IA = "Cyndi" (orthographe canonique fig\u00e9e
   * 2026-05-19). La m\u00e9thode reste neutre (`autoValidationAt`) pour d\u00e9coupler
   * le contrat code du branding ; seules les cha\u00eenes user-visible portent
   * le nom Cyndi.
   */
  autoValidationAt(): string | null {
    const inv = this.invoice();
    if (!inv?.timeline) return null;
    const ocrStep = inv.timeline.steps.find(s => s.step === 'ocr_passed');
    if (!ocrStep || ocrStep.state !== 'done' || !ocrStep.at) return null;
    return ocrStep.at;
  }

  /**
   * Calcule la date pr\u00e9vue de paiement selon "30 jours fin de mois" \u2014 convention
   * B2B fran\u00e7aise : on ajoute 30 jours \u00e0 la date de validation puis on arrondit
   * \u00e0 la fin du mois contenant cette date.
   *
   * Exemple : facture valid\u00e9e le 19 mai \u2192 +30j = 18 juin \u2192 fin de mois = 30 juin.
   *
   * Volontairement c\u00f4t\u00e9 front : le calcul est purement informatif (le backend
   * reste source de v\u00e9rit\u00e9 sur l'\u00e9ch\u00e9ance comptable r\u00e9elle). On affiche un
   * "pr\u00e9visionnel" pour g\u00e9rer l'attente du contractor \u2014 pas une garantie.
   */
  expectedPaymentDate(): string | null {
    const at = this.autoValidationAt();
    if (!at) return null;
    const base = new Date(at);
    if (Number.isNaN(base.getTime())) return null;
    const due = new Date(base.getTime());
    due.setDate(due.getDate() + 30);
    // Fin du mois contenant la date d'\u00e9ch\u00e9ance : 1er jour du mois suivant - 1 jour.
    const endOfMonth = new Date(due.getFullYear(), due.getMonth() + 1, 0);
    return endOfMonth.toISOString();
  }

  /**
   * Vrai si la facture est en mode Freemium (upload\u00e9e manuellement par le
   * contractor) \u2014 c'est la cible de l'upsell Plan Pro (passage \u00e0 la
   * facturation auto-g\u00e9n\u00e9r\u00e9e + paiement plus rapide).
   */
  isFreemium(): boolean {
    const inv = this.invoice();
    return inv?.source === 'manual_upload';
  }

  /**
   * Navigue vers la page Plan Pro upsell. Friction volontaire : on incite le
   * contractor \u00e0 passer Pro pour \u00e9viter le d\u00e9lai 30j fin de mois (directive
   * Moussa 2026-05-19 : "cr\u00e9e de la friction pour qu'il en a marre et paie
   * le plan pro").
   */
  goToProUpsell(): void {
    this.router.navigateByUrl('/purchases?from=invoice-detail&utm=payment-delay-friction');
  }

  /**
   * Copy user-friendly du rejet à afficher au contractor.
   * Mapping exhaustif dans `invoice-rejection-messages.ts` (inclut notamment
   * `invoice_too_many_pages` avec instruction "maximum 5 pages autorisées,
   * retirez devis / bons d'intervention annexés").
   */
  rejectionCopy(): InvoiceRejectionCopy | null {
    const inv = this.invoice();
    if (!inv || inv.status !== 'rejected') return null;
    return getInvoiceRejectionCopy(inv.rejection_reason);
  }

  /**
   * Liste détaillée des règles ayant échoué (rejection_details backend).
   * Exemple typique pour too_many_pages :
   *   ["Trop de pages (8) — une facture legitime fait 5 pages max"]
   */
  rejectionDetails(): string[] {
    const inv = this.invoice();
    const raw: unknown = inv?.rejection_details;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(String).filter(d => d.length > 0);
    if (typeof raw === 'string') return raw.length > 0 ? [raw] : [];
    return [String(raw)];
  }
}
