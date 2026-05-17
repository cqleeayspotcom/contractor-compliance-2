import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

const STATUS_LABELS: Record<string, string> = {
  validating: 'Validation OCR',
  draft: 'Brouillon',
  pending_payment_validation: 'À valider',
  ready_to_pay: 'Bon pour paiement',
  payment_in_progress: 'Virement en cours',
  paid: 'Payée',
  rejected: 'Rejetée',
  cancelled: 'Annulée',
};

@Component({
  selector: 'app-invoice-status-chip',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './invoice-status-chip.component.html',
  styleUrl: './invoice-status-chip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoiceStatusChipComponent {
  @Input({ required: true }) status!: string;

  get label(): string { return STATUS_LABELS[this.status] ?? this.status; }
  get cssClass(): string { return `chip chip--${this.status}`; }
}
