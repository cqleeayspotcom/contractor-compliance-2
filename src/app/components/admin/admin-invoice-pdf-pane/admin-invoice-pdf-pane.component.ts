import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SafeResourceUrl } from '@angular/platform-browser';
import { AdminInvoice } from '../../../services/admin-invoice.service';
import { RibDisplayComponent } from '../rib-display/rib-display.component';
import { ContractorStatusBannerComponent } from '../contractor-status-banner/contractor-status-banner.component';
import { PhoneDisplayPipe } from '../../../pipes/phone-display.pipe';

@Component({
  selector: 'app-admin-invoice-pdf-pane',
  standalone: true,
  imports: [
    CommonModule, MatIconModule, MatButtonModule, MatChipsModule,
    MatTooltipModule, MatProgressSpinnerModule,
    RibDisplayComponent, ContractorStatusBannerComponent,
    PhoneDisplayPipe,
  ],
  templateUrl: './admin-invoice-pdf-pane.component.html',
  styleUrl: './admin-invoice-pdf-pane.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminInvoicePdfPaneComponent {
  readonly invoice = input<AdminInvoice | null>(null);
  readonly pdfUrl = input<SafeResourceUrl | null>(null);
  readonly pdfLoading = input<boolean>(false);
  readonly pdfError = input<string | null>(null);
  readonly currentIndex = input<number>(0);
  readonly total = input<number>(0);

  readonly markPaid = output<AdminInvoice>();
  readonly markPaymentInProgress = output<AdminInvoice>();
  readonly downloadPdf = output<AdminInvoice>();
  readonly openDetail = output<AdminInvoice>();
  readonly prev = output<void>();
  readonly next = output<void>();
  readonly profileClick = output<string>();

  readonly canMarkPaid = computed(() => {
    const inv = this.invoice();
    if (!inv) return false;
    if (inv.rib?.status === 'missing') return false;
    return inv.status === 'payment_in_progress';
  });

  readonly canMarkInProgress = computed(() => {
    const inv = this.invoice();
    if (!inv) return false;
    if (inv.rib?.status === 'missing') return false;
    return inv.status === 'ready_to_pay';
  });

  readonly statusLabel = computed(() => {
    const s = this.invoice()?.status ?? '';
    const map: Record<string, string> = {
      validating: 'Validation OCR',
      draft: 'Génération',
      pending_payment_validation: 'À valider',
      ready_to_pay: 'Bon pour paiement',
      payment_in_progress: 'Virement en cours',
      paid: 'Payée',
      rejected: 'Rejetée',
      cancelled: 'Annulée',
    };
    return map[s] ?? s;
  });

  amountLabel(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
  }

  validatorChipClass(type: 'compliance' | 'production' | 'accounting'): string {
    const inv = this.invoice();
    if (!inv) return 'chip-pending';
    if (inv.validations_received?.includes(type)) return 'chip-ok';
    return 'chip-pending';
  }

  validatorChipLabel(type: 'compliance' | 'production' | 'accounting'): string {
    const inv = this.invoice();
    if (!inv) return type;
    if (inv.validations_received?.includes(type)) return `✓ ${type}`;
    return `⏳ ${type}`;
  }

  emitMarkPaid(): void { const i = this.invoice(); if (i) this.markPaid.emit(i); }
  emitMarkInProgress(): void { const i = this.invoice(); if (i) this.markPaymentInProgress.emit(i); }
  emitDownload(): void { const i = this.invoice(); if (i) this.downloadPdf.emit(i); }
  emitOpenDetail(): void { const i = this.invoice(); if (i) this.openDetail.emit(i); }
  onProfileClick(phone: string): void { this.profileClick.emit(phone); }
}
