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
  // Hard limit backend = 5 pages ; stockÃ© ici pour affichage indicatif.
  pages_count?: number | null;

  // Timeline du pipeline de paiement â€” bloc enrichi par le backend
  // (GET /contractor-compliance/invoices/{uuid}). Optionnel tant que l'endpoint
  // n'a pas Ã©tÃ© mis Ã  jour â€” le composant ne s'affiche que si prÃ©sent.
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
      // Pipeline unifiÃ© (cf. docs/payment-flow.md Â§ 6)
      draft: 'Brouillon',
      validating: 'VÃ©rification OCR',
      pending_payment_validation: 'Validation Tuita',
      ready_to_pay: 'Bon pour paiement',
      payment_in_progress: 'Virement en cours',
      paid: 'PayÃ©e',
      rejected: 'RejetÃ©e',
      cancelled: 'AnnulÃ©e',
      // Statuts legacy (freemium/Pro pre-2026-04-18)
      validated: 'ValidÃ©e',
      sent: 'EnvoyÃ©e',
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
    return source === 'auto_generated' ? 'GÃ©nÃ©rÃ©e automatiquement' : 'EnvoyÃ©e manuellement';
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
   * Copy user-friendly du rejet Ã  afficher au contractor.
   * Mapping exhaustif dans `invoice-rejection-messages.ts` (inclut notamment
   * `invoice_too_many_pages` avec instruction "maximum 5 pages autorisÃ©es,
   * retirez devis / bons d'intervention annexÃ©s").
   */
  rejectionCopy(): InvoiceRejectionCopy | null {
    const inv = this.invoice();
    if (!inv || inv.status !== 'rejected') return null;
    return getInvoiceRejectionCopy(inv.rejection_reason);
  }

  /**
   * Liste dÃ©taillÃ©e des rÃ¨gles ayant Ã©chouÃ© (rejection_details backend).
   * Exemple typique pour too_many_pages :
   *   ["Trop de pages (8) â€” une facture legitime fait 5 pages max"]
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
