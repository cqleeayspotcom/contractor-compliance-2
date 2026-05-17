import { CommonModule, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BackButtonComponent } from '../../components/shared/back-button/back-button.component';

interface PurchaseRow {
  uuid: string;
  created_at: string;
  completed_at: string | null;
  refunded_at: string | null;
  document_type: string;
  label: string;
  siren: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  status_label: string;
  price_eur: number;
  document_uuid: string | null;
  document_download_url: string | null;
  stripe_receipt_url: string | null;
}

@Component({
  selector: 'app-contractor-purchases',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    DatePipe,
    BackButtonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './contractor-purchases.component.html',
  styleUrl: './contractor-purchases.component.scss',
})
export class ContractorPurchasesComponent {
  private readonly http = inject(HttpClient);
  private readonly snackBar = inject(MatSnackBar);

  readonly loading = signal(true);
  readonly rows = signal<PurchaseRow[]>([]);
  readonly statusFilter = signal<'' | 'pending' | 'completed' | 'failed' | 'refunded'>('');
  readonly rangeFilter = signal<'30' | '90' | '365' | 'all'>('365');

  readonly filteredRows = computed(() => {
    const status = this.statusFilter();
    return status ? this.rows().filter(r => r.status === status) : this.rows();
  });

  readonly totals = computed(() => {
    const all = this.rows();
    return {
      total: all.length,
      completed: all.filter(r => r.status === 'completed').length,
      pending: all.filter(r => r.status === 'pending').length,
      failed: all.filter(r => r.status === 'failed').length,
      refunded: all.filter(r => r.status === 'refunded').length,
    };
  });

  constructor() {
    void this.fetch();
  }

  async fetch(): Promise<void> {
    this.loading.set(true);
    try {
      const params = new URLSearchParams();
      const range = this.rangeFilter();
      if (range !== 'all') {
        const since = new Date();
        since.setDate(since.getDate() - parseInt(range, 10));
        params.set('since', since.toISOString());
      }
      const url = `${environment.apiUrl}/contractor/documents/purchases?${params.toString()}`;
      const res = await firstValueFrom(
        this.http.get<{ success: boolean; data: PurchaseRow[] }>(url)
      );
      this.rows.set(res.data ?? []);
    } catch {
      this.snackBar.open(
        "Impossible de charger l'historique. Réessayez dans un instant.",
        'Fermer',
        { duration: 5000 }
      );
      this.rows.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  onRangeChange(): void {
    void this.fetch();
  }

  async contactSupport(row: PurchaseRow): Promise<void> {
    try {
      const url = `${environment.apiUrl}/contractor/documents/purchases/${row.uuid}/contact-support`;
      await firstValueFrom(this.http.post(url, {}));
      this.snackBar.open(
        'Notre équipe est alertée et vous recontacte sous 24h.',
        'Fermer',
        { duration: 6000 }
      );
    } catch {
      this.snackBar.open(
        "Échec de l'envoi. Écrivez-nous à support@tuita.fr.",
        'Fermer',
        { duration: 5000 }
      );
    }
  }

  statusIcon(status: PurchaseRow['status']): string {
    switch (status) {
      case 'completed':
        return 'check_circle';
      case 'pending':
        return 'schedule';
      case 'refunded':
        return 'currency_exchange';
      default:
        return 'error_outline';
    }
  }
}
