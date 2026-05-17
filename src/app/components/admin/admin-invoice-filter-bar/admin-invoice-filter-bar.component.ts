import { Component, ChangeDetectionStrategy, input, output, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { InvoiceSearchFilters } from '../../../services/admin-invoice.service';

export type FilterBarMode = 'pending' | 'ready' | 'inprogress' | 'disputed' | 'all';

const STATUS_OPTIONS = [
  { value: 'pending_payment_validation', label: 'À valider' },
  { value: 'ready_to_pay', label: 'Bon pour paiement' },
  { value: 'payment_in_progress', label: 'Virement en cours' },
  { value: 'paid', label: 'Payée' },
  { value: 'rejected', label: 'Rejetée' },
  { value: 'cancelled', label: 'Annulée' },
];

@Component({
  selector: 'app-admin-invoice-filter-bar',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatFormFieldModule, MatInputModule, MatIconModule, MatButtonModule,
    MatSelectModule, MatChipsModule, MatCheckboxModule,
    MatDatepickerModule, MatNativeDateModule,
  ],
  templateUrl: './admin-invoice-filter-bar.component.html',
  styleUrl: './admin-invoice-filter-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminInvoiceFilterBarComponent {
  readonly mode = input<FilterBarMode>('all');
  readonly filtersChange = output<InvoiceSearchFilters>();

  readonly statusOptions = STATUS_OPTIONS;

  // Local model
  readonly q = signal<string>('');
  readonly statuses = signal<string[]>([]);
  readonly amountMin = signal<number | null>(null);
  readonly amountMax = signal<number | null>(null);
  readonly dateFrom = signal<Date | null>(null);
  readonly dateTo = signal<Date | null>(null);
  readonly sort = signal<'newest' | 'oldest' | 'amount_desc' | 'amount_asc'>('newest');
  /** @deprecated pivot 2026-05-13. Conservé pour compat URL params, plus exposé dans l'UI. */
  readonly validatorMissing = signal<'compliance' | 'production' | 'accounting' | null>(null);
  /** Pivot 2026-05-13 — nb d'approbations manquantes (1, 2 ou 3). */
  readonly missingValidations = signal<1 | 2 | 3 | null>(null);
  /** Pivot 2026-05-13 — factures pending depuis > N jours (7 = warning, 14 = critical). */
  readonly staleDays = signal<number | null>(null);
  readonly plan = signal<'free' | 'pro' | null>(null);
  readonly stuck = signal<boolean>(false);
  readonly paidDisputed = signal<boolean>(false);

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Effect: re-emit on any change (debounced for `q`).
    effect(() => {
      // Read all signals so the effect tracks them
      const filters: InvoiceSearchFilters = {
        ...(this.q().trim().length >= 2 && { q: this.q().trim() }),
        ...(this.statuses().length > 0 && { status: this.statuses() }),
        ...(this.amountMin() !== null && { amount_min: this.amountMin()! }),
        ...(this.amountMax() !== null && { amount_max: this.amountMax()! }),
        ...(this.dateFrom() && { date_from: this.toIso(this.dateFrom()!) }),
        ...(this.dateTo() && { date_to: this.toIso(this.dateTo()!) }),
        sort: this.sort(),
        ...(this.validatorMissing() && { validator_missing: this.validatorMissing()! }),
        ...(this.missingValidations() !== null && { missing_validations: this.missingValidations()! }),
        ...(this.staleDays() !== null && { stale_days: this.staleDays()! }),
        ...(this.plan() && { plan: this.plan()! }),
        ...(this.stuck() && { stuck: true }),
        ...(this.paidDisputed() && { paid_disputed: true }),
      };
      // Debounce 300ms (handles fast typing on `q`)
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.filtersChange.emit(filters), 300);
    });
  }

  reset(): void {
    this.q.set('');
    this.statuses.set([]);
    this.amountMin.set(null);
    this.amountMax.set(null);
    this.dateFrom.set(null);
    this.dateTo.set(null);
    this.sort.set('newest');
    this.validatorMissing.set(null);
    this.missingValidations.set(null);
    this.staleDays.set(null);
    this.plan.set(null);
    this.stuck.set(false);
    this.paidDisputed.set(false);
  }

  toggleStatus(value: string): void {
    const cur = this.statuses();
    if (cur.includes(value)) {
      this.statuses.set(cur.filter(v => v !== value));
    } else {
      this.statuses.set([...cur, value]);
    }
  }

  isStatusActive(value: string): boolean {
    return this.statuses().includes(value);
  }

  activeFiltersCount(): number {
    let n = 0;
    if (this.q().trim().length >= 2) n++;
    if (this.statuses().length > 0) n++;
    if (this.amountMin() !== null) n++;
    if (this.amountMax() !== null) n++;
    if (this.dateFrom()) n++;
    if (this.dateTo()) n++;
    if (this.sort() !== 'newest') n++;
    if (this.validatorMissing()) n++;
    if (this.missingValidations() !== null) n++;
    if (this.staleDays() !== null) n++;
    if (this.plan()) n++;
    if (this.stuck()) n++;
    if (this.paidDisputed()) n++;
    return n;
  }

  private toIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
