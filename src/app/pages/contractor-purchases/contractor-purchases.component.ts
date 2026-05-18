import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
// Pas d'imports HttpClient ici : l'historique d'achats contractor n'a pas
// d'endpoint dédié côté Tuita (seul l'admin l'expose). La page affiche un
// état vide informatif et redirige le contractor vers le support email.
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
    // Pas d'endpoint contractor-scoped côté Tuita pour l'historique d'achats
    // Pappers (uniquement exposé sur les routes admin). On affiche donc un
    // état vide informatif — le contractor peut contacter le support pour
    // récupérer le détail.
    this.loading.set(true);
    this.rows.set([]);
    this.loading.set(false);
  }

  onRangeChange(): void {
    void this.fetch();
  }

  async contactSupport(_row: PurchaseRow): Promise<void> {
    // Pas de round-trip serveur : on affiche directement les coordonnées
    // du support email côté UI (Tuita centralise le SAV par email).
    this.snackBar.open(
      'Écrivez-nous à support@tuita.fr — réponse sous 24h.',
      'Fermer',
      { duration: 6000 }
    );
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
