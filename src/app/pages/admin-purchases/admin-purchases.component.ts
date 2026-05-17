import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AdminBackButtonComponent } from '../../components/admin/admin-back-button/admin-back-button.component';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { PricingService } from '../../services/pricing.service';

import { PurchaseDetailDialogComponent } from './purchase-detail-dialog/purchase-detail-dialog.component';
import { PurchaseRetryDialogComponent } from './purchase-retry-dialog/purchase-retry-dialog.component';
import { PhoneDisplayPipe } from '../../pipes/phone-display.pipe';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PurchaseUser {
  uuid: string;
  phone: string | null;
  email: string | null;
}

export interface PurchaseRow {
  uuid: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  document_type: string;
  label: string;
  siren: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  price_eur: number;
  has_document: boolean;
  error_message: string | null;
  stripe_payment_intent_id: string | null;
  user: PurchaseUser | null;
}

export interface PurchaseDetail extends PurchaseRow {
  timeline: Array<{ event: string; label: string; at: string | null; meta?: any }>;
  document: {
    uuid: string;
    type: string;
    status: string;
    file_name: string | null;
    uploaded_at: string | null;
    download_url: string;
  } | null;
  pappers_request_id: string | null;
  source: string;
}

interface PurchaseStats {
  period: { since: string; until: string };
  total: number;
  by_status: {
    completed: number;
    pending: number;
    processing: number;
    failed: number;
    refunded: number;
  };
  by_type: Record<string, number>;
  revenue_eur: number;
  success_rate_pct: number;
  avg_fulfillment_seconds: number | null;
  stuck_count: number;
  top_errors: Array<{ error_message: string; count: number }>;
}

type StatusFilter = '' | 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
type TypeFilter = '' | 'extrait_inpi' | 'avis_sirene' | 'statuts' | 'kbis' | 'cni';

// ===========================================================================
// Helpers partages
// ===========================================================================

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'En attente',
    processing: 'Traitement',
    completed: 'Livre',
    failed: 'Echoue',
    refunded: 'Rembourse',
  };
  return labels[status] ?? status;
}

export function statusColor(status: string): string {
  const colors: Record<string, string> = {
    completed: '#04A777',
    pending: '#F75C03',
    processing: '#699CBE',
    failed: '#DC2626',
    refunded: '#6b7280',
  };
  return colors[status] ?? '#888';
}

// ===========================================================================
// Main component
// ===========================================================================

@Component({
  selector: 'app-admin-purchases',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    AdminBackButtonComponent,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatTableModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSortModule,
    MatDialogModule,
    MatSnackBarModule,
    PhoneDisplayPipe,
  ],
  templateUrl: './admin-purchases.component.html',
  styleUrl: './admin-purchases.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPurchasesComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);
  private readonly pricing = inject(PricingService);

  extraitInpiPriceLabel(): string {
    return this.pricing.priceLabelFor('extrait_inpi');
  }

  /** Quand true, ne montre que les achats "stuck" (crÃ©Ã©s depuis > 10 min). ActivÃ© via ?stuck=1. */
  readonly stuckOnly = signal(false);

  // -- Auth ------------------------------------------------------------------
  readonly apiKey = signal<string>(sessionStorage.getItem('tuita_admin_key') ?? '');
  readonly isAuthenticated = computed(() => this.apiKey().length > 0);
  apiKeyInput = '';

  // -- Data ------------------------------------------------------------------
  readonly purchases = signal<PurchaseRow[]>([]);
  // Tri server-side : `sort` + `direction` envoyÃ©s au backend, qui applique
  // l'orderBy avant pagination â†’ couvre toutes les pages (pas juste la page
  // courante). Whitelist alignÃ©e avec AdminPurchaseController::index.
  readonly sort = signal<string>('created_at');
  readonly direction = signal<'asc' | 'desc'>('desc');
  readonly stats = signal<PurchaseStats | null>(null);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  readonly total = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(25);

  // -- Filters ---------------------------------------------------------------
  statusFilter: StatusFilter = '';
  typeFilter: TypeFilter = '';
  searchInput = '';
  sinceInput = '';
  untilInput = '';

  readonly displayedColumns = [
    'created_at',
    'document_type',
    'siren',
    'contractor',
    'status',
    'price',
    'actions',
  ];

  readonly statusLabel = statusLabel;
  readonly statusColor = statusColor;

  // -- Lifecycle -------------------------------------------------------------
  ngOnInit(): void {
    // PrÃ©-filtre depuis les query params (deep-link depuis le dashboard admin).
    const qp = this.route.snapshot.queryParamMap;
    const status = qp.get('status');
    if (status && ['pending', 'processing', 'completed', 'failed', 'refunded'].includes(status)) {
      this.statusFilter = status as StatusFilter;
    }
    const type = qp.get('document_type');
    if (type) {
      this.typeFilter = type as TypeFilter;
    }
    const stuck = qp.get('stuck');
    if (stuck === '1' || stuck === 'true') {
      this.stuckOnly.set(true);
    }
    if (this.isAuthenticated()) {
      this.refreshAll();
    }
  }

  submitApiKey(): void {
    const key = this.apiKeyInput.trim();
    if (!key) return;
    sessionStorage.setItem('tuita_admin_key', key);
    this.apiKey.set(key);
    this.refreshAll();
  }

  // -- HTTP ------------------------------------------------------------------
  private headers(): HttpHeaders {
    return new HttpHeaders({ 'X-Tuita-Admin-Key': this.apiKey() });
  }

  refreshAll(): void {
    this.loadList();
    this.loadStats();
  }

  loadStats(): void {
    this.http
      .get<{ data: PurchaseStats }>('/contractor-compliance/admin/purchases/stats', {
        headers: this.headers(),
      })
      .subscribe({
        next: res => this.stats.set(res.data),
        error: err => this.onHttpError(err, 'stats'),
      });
  }

  loadList(): void {
    this.isLoading.set(true);
    let params = new HttpParams()
      .set('per_page', String(this.pageSize()))
      .set('page', String(this.pageIndex() + 1))
      .set('sort', this.sort())
      .set('direction', this.direction());

    if (this.statusFilter) params = params.set('status', this.statusFilter);
    if (this.typeFilter) params = params.set('document_type', this.typeFilter);
    if (this.searchInput.trim()) params = params.set('search', this.searchInput.trim());
    if (this.sinceInput) params = params.set('since', this.sinceInput);
    if (this.untilInput) params = params.set('until', this.untilInput);
    if (this.stuckOnly()) params = params.set('stuck', '1');

    this.http
      .get<{ data: PurchaseRow[]; meta: { total: number } }>(
        '/contractor-compliance/admin/purchases',
        { headers: this.headers(), params },
      )
      .subscribe({
        next: res => {
          this.purchases.set(res.data);
          this.total.set(res.meta.total);
          this.isLoading.set(false);
        },
        error: err => {
          this.isLoading.set(false);
          this.onHttpError(err, 'list');
        },
      });
  }

  applyFilters(): void {
    this.pageIndex.set(0);
    this.loadList();
  }

  resetFilters(): void {
    this.statusFilter = '';
    this.typeFilter = '';
    this.searchInput = '';
    this.sinceInput = '';
    this.untilInput = '';
    this.stuckOnly.set(false);
    this.applyFilters();
  }

  onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.loadList();
  }

  openDetail(row: PurchaseRow): void {
    this.http
      .get<{ data: PurchaseDetail }>(`/contractor-compliance/admin/purchases/${row.uuid}`, {
        headers: this.headers(),
      })
      .subscribe({
        next: res => {
          const ref = this.dialog.open(PurchaseDetailDialogComponent, {
            data: res.data,
            width: '1100px',
            maxWidth: '95vw',
            maxHeight: '90vh',
          });
          ref.afterClosed().subscribe(result => {
            if (result?.action === 'retry') {
              this.openRetry(row);
            }
          });
        },
        error: err => this.onHttpError(err, 'detail'),
      });
  }

  openRetry(row: PurchaseRow): void {
    const ref = this.dialog.open(PurchaseRetryDialogComponent, { width: '520px' });
    ref.afterClosed().subscribe(result => {
      if (!result?.reason) return;
      this.doRetry(row, result.reason);
    });
  }

  private doRetry(row: PurchaseRow, reason: string): void {
    this.http
      .post<{ data: { uuid: string; status: string } }>(
        `/contractor-compliance/admin/purchases/${row.uuid}/retry`,
        { reason },
        { headers: this.headers() },
      )
      .subscribe({
        next: () => {
          this.snack.open(`Achat ${row.uuid.substring(0, 8)} relance`, 'OK', {
            duration: 4000,
          });
          this.refreshAll();
        },
        error: err => {
          const msg =
            err?.error?.error || err?.error?.message || 'Impossible de relancer cet achat';
          this.snack.open(msg, 'OK', { duration: 6000 });
          this.onHttpError(err, 'retry');
        },
      });
  }

  canRetry(status: string): boolean {
    return status === 'failed' || status === 'pending';
  }

  /**
   * TÃ©lÃ©charge l'export CSV des achats (compta) en respectant les filtres
   * courants (statut / type / depuis / jusqu'au).
   *
   * Pas de pÃ©riode â†’ backend prend les 30 derniers jours par dÃ©faut.
   * Statut â†’ si l'admin n'a pas filtrÃ©, le backend exporte completed+refunded.
   */
  exportCsv(): void {
    const params = new URLSearchParams();
    if (this.statusFilter) params.set('status', this.statusFilter);
    if (this.typeFilter) params.set('document_type', this.typeFilter);
    if (this.sinceInput) params.set('since', this.sinceInput);
    if (this.untilInput) params.set('until', this.untilInput);

    const url = `/contractor-compliance/admin/purchases/export${params.toString() ? '?' + params.toString() : ''}`;

    fetch(url, {
      headers: { 'X-Tuita-Admin-Key': this.apiKey() },
    })
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.blob().then(blob => ({ blob, headers: res.headers }));
      })
      .then(({ blob, headers }) => {
        const contentDisposition = headers.get('Content-Disposition') ?? '';
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        const filename = match?.[1] ?? `achats-documents_${new Date().toISOString().slice(0, 10)}.csv`;

        const objectUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(objectUrl);

        this.snack.open('Export CSV tÃ©lÃ©chargÃ©', 'OK', { duration: 4000 });
      })
      .catch(err => {
        if (err?.message?.includes('401') || err?.message?.includes('403')) {
          sessionStorage.removeItem('tuita_admin_key');
          this.apiKey.set('');
          this.error.set('Cle admin invalide');
          return;
        }
        this.snack.open("Ã‰chec de l'export CSV", 'OK', { duration: 6000 });
        console.error('[admin-purchases] export', err);
      });
  }

  formatDuration(seconds: number | null): string {
    if (seconds === null) return 'â€”';
    if (seconds < 60) return `${Math.round(seconds)} s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m} min ${s} s`;
  }

  typeLabel(type: string): string {
    const labels: Record<string, string> = {
      extrait_inpi: 'Extrait INPI',
      avis_sirene: 'Avis SIRENE',
      statuts: 'Statuts',
      kbis: 'KBIS',
      cni: 'CNI',
    };
    return labels[type] ?? type;
  }

  trackByUuid(_i: number, row: PurchaseRow): string {
    return row.uuid;
  }

  onSortChange(s: Sort): void {
    // Map column 'price' (frontend) -> 'price_eur' (backend column).
    const colMap: Record<string, string> = { price: 'price_eur' };
    if (!s.active || !s.direction) {
      this.sort.set('created_at');
      this.direction.set('desc');
    } else {
      this.sort.set(colMap[s.active] ?? s.active);
      this.direction.set(s.direction);
    }
    this.pageIndex.set(0);
    this.loadList();
  }

  private onHttpError(err: any, ctx: string): void {
    if (err?.status === 401 || err?.status === 403) {
      sessionStorage.removeItem('tuita_admin_key');
      this.apiKey.set('');
      this.error.set('Cle admin invalide');
    } else {
      console.error('[admin-purchases]', ctx, err);
    }
  }
}
