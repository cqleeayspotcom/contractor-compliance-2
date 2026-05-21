import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterModule } from '@angular/router';

import { ContractorApiService } from '../../../services/contractor-api.service';
import { SkeletonComponent } from '../../../components/shared/skeleton.component';

interface InvoicePreviewData {
  uuid: string;
  number?: string | null;
  missionRef?: string | null;
}

@Component({
  selector: 'app-invoice-preview-panel',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    SkeletonComponent,
  ],
  templateUrl: './invoice-preview-panel.component.html',
  styleUrl: './invoice-preview-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoicePreviewPanelComponent implements OnInit {
  private readonly api = inject(ContractorApiService);
  private readonly dialogRef = inject(MatDialogRef<InvoicePreviewPanelComponent>);
  private readonly router = inject(Router);
  readonly data = inject<InvoicePreviewData>(MAT_DIALOG_DATA);

  readonly invoice = signal<any | null>(null);
  readonly isLoading = signal(true);
  readonly error = signal<string | null>(null);
  readonly isDownloading = signal(false);

  readonly statusLabel = computed(() => {
    const inv = this.invoice();
    if (!inv) return '';
    return this.formatStatus(inv.status);
  });

  readonly statusBadgeClass = computed(() => {
    const inv = this.invoice();
    if (!inv) return 'badge--neutral';
    return this.statusToBadgeClass(inv.status);
  });

  ngOnInit(): void {
    this.api.getInvoice(this.data.uuid).subscribe({
      next: inv => {
        this.invoice.set(inv);
        this.isLoading.set(false);
      },
      error: err => {
        this.error.set(err?.error?.error?.message ?? 'Impossible de charger la facture.');
        this.isLoading.set(false);
      },
    });
  }

  formatAmount(value: number | string | null | undefined): string {
    if (value === null || value === undefined) return '-';
    const n = typeof value === 'string' ? parseFloat(value) : value;
    if (Number.isNaN(n)) return '-';
    return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
  }

  formatStatus(status: string | null | undefined): string {
    if (!status) return '-';
    const labels: Record<string, string> = {
      validating: 'Vérification OCR',
      pending_payment_validation: 'Validation Tuita en cours',
      ready_to_pay: 'Bon pour paiement',
      payment_in_progress: 'Virement en cours',
      paid: 'Payée',
      rejected: 'Rejetée',
      draft: 'Brouillon',
      validated: 'Validée',
      sent: 'Envoyée',
      cancelled: 'Annulée',
    };
    return labels[status] ?? status;
  }

  statusToBadgeClass(status: string | null | undefined): string {
    switch (status) {
      case 'paid':
      case 'ready_to_pay':
      case 'validated':
      case 'sent':
        return 'badge--green';
      case 'rejected':
      case 'cancelled':
        return 'badge--red';
      case 'validating':
      case 'pending_payment_validation':
      case 'payment_in_progress':
        return 'badge--blue';
      default:
        return 'badge--neutral';
    }
  }

  downloadPdf(): void {
    if (this.isDownloading()) return;
    this.isDownloading.set(true);
    this.api.downloadInvoicePdf(this.data.uuid).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const inv = this.invoice();
        a.download = `facture-${inv?.number ?? this.data.uuid}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        this.isDownloading.set(false);
      },
      error: () => {
        this.error.set('Téléchargement impossible.');
        this.isDownloading.set(false);
      },
    });
  }

  openFullPage(): void {
    this.dialogRef.close();
    this.router.navigate(['/invoices', this.data.uuid]);
  }

  close(): void {
    this.dialogRef.close();
  }
}
