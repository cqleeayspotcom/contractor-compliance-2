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
import { ActivatedRoute, Router } from '@angular/router';
import { AdminBackButtonComponent } from '../../components/admin/admin-back-button/admin-back-button.component';

import { Api } from '../../api/api';
import { adminPurchasesShow } from '../../api/fn/admin-purchases/admin-purchases-show';
import { adminPurchasesRetry } from '../../api/fn/admin-purchases/admin-purchases-retry';
// Migration SDK (2026-05-20) : les query params (filtres / pagination / tri /
// période) sont désormais déclarés dans l'OpenAPI → 100% api.invoke, plus de
// HttpClient manuel.
import { adminPurchasesList } from '../../api/fn/admin-purchases/admin-purchases-list';
import { adminPurchasesStats } from '../../api/fn/admin-purchases/admin-purchases-stats';
import { adminPurchasesExport } from '../../api/fn/admin-purchases/admin-purchases-export';

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
  private readonly api = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly pricing = inject(PricingService);

  extraitInpiPriceLabel(): string {
    return this.pricing.priceLabelFor('extrait_inpi');
  }

  /** Quand true, ne montre que les achats "stuck" (créés depuis > 10 min). Activé via ?stuck=1. */
  readonly stuckOnly = signal(false);

  // -- Data ------------------------------------------------------------------
  // Auth garantie par AdminAuthGuard sur /admin/* ; le Bearer OAuth2 mysession
  // est injecté par admin-key.interceptor sur chaque appel HttpClient.
  readonly purchases = signal<PurchaseRow[]>([]);
  // Tri server-side : `sort` + `direction` envoyés au backend, qui applique
  // l'orderBy avant pagination → couvre toutes les pages (pas juste la page
  // courante). Whitelist alignée avec AdminPurchaseController::index.
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
    // Pré-filtre depuis les query params (deep-link depuis le dashboard admin).
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
    this.refreshAll();
  }

  // -- HTTP ------------------------------------------------------------------

  refreshAll(): void {
    this.loadList();
    this.loadStats();
  }

  loadStats(): void {
    this.api
      .invoke(adminPurchasesStats)
      .then(env => this.stats.set((env as unknown as { data: PurchaseStats }).data))
      .catch(err => this.onHttpError(err, 'stats'));
  }

  loadList(): void {
    this.isLoading.set(true);
    // Tous les query params sont déclarés dans l'OpenAPI → SDK typé. Les
    // valeurs vides sont passées en `undefined` (le RequestBuilder les omet).
    this.api
      .invoke(adminPurchasesList, {
        per_page: this.pageSize(),
        page: this.pageIndex() + 1,
        sort: this.sort(),
        direction: this.direction(),
        status: this.statusFilter || undefined,
        document_type: this.typeFilter || undefined,
        search: this.searchInput.trim() || undefined,
        since: this.sinceInput || undefined,
        until: this.untilInput || undefined,
        stuck: this.stuckOnly() || undefined,
      })
      .then(env => {
        const res = env as unknown as { data: PurchaseRow[]; meta: { total: number } };
        this.purchases.set(res.data);
        this.total.set(res.meta.total);
        this.isLoading.set(false);
      })
      .catch(err => {
        this.isLoading.set(false);
        this.onHttpError(err, 'list');
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
    // Détail d'achat : SDK `adminPurchasesShow` (envelope SuccessEnvelope →
    // on extrait `.data` typé `PurchaseDetail`).
    this.api
      .invoke(adminPurchasesShow, { uuid: row.uuid })
      .then(env => {
        const detail = (env as unknown as { data: PurchaseDetail }).data;
        const ref = this.dialog.open(PurchaseDetailDialogComponent, {
          data: detail,
          width: '1100px',
          maxWidth: '95vw',
          maxHeight: '90vh',
        });
        ref.afterClosed().subscribe(result => {
          if (result?.action === 'retry') {
            this.openRetry(row);
          }
        });
      })
      .catch(err => this.onHttpError(err, 'detail'));
  }

  openRetry(row: PurchaseRow): void {
    const ref = this.dialog.open(PurchaseRetryDialogComponent, { width: '520px' });
    ref.afterClosed().subscribe(result => {
      if (!result?.reason) return;
      this.doRetry(row, result.reason);
    });
  }

  private doRetry(row: PurchaseRow, reason: string): void {
    // POURQUOI SDK : `adminPurchasesRetry` expose désormais `body { reason }`
    // (audit logger backend). On migre — l'intercepteur Bearer admin couvre l'auth.
    this.api
      .invoke(adminPurchasesRetry, { uuid: row.uuid, body: { reason } })
      .then(() => {
        this.snack.open(`Achat ${row.uuid.substring(0, 8)} relance`, 'OK', {
          duration: 4000,
        });
        this.refreshAll();
      })
      .catch(err => {
        const msg =
          err?.error?.error || err?.error?.message || 'Impossible de relancer cet achat';
        this.snack.open(msg, 'OK', { duration: 6000 });
        this.onHttpError(err, 'retry');
      });
  }

  canRetry(status: string): boolean {
    return status === 'failed' || status === 'pending';
  }

  /**
   * Télécharge l'export CSV des achats (compta) en respectant les filtres
   * courants (statut / type / depuis / jusqu'au).
   *
   * Pas de période → backend prend les 30 derniers jours par défaut.
   * Statut → si l'admin n'a pas filtré, le backend exporte completed+refunded.
   */
  exportCsv(): void {
    // Export 100% SDK : les filtres (status / type / période) sont déclarés
    // dans l'OpenAPI, `invoke$Response` rend le `HttpResponse<Blob>` complet
    // (corps CSV + en-tête Content-Disposition pour le nom de fichier).
    this.api
      .invoke$Response(adminPurchasesExport, {
        status: this.statusFilter || undefined,
        document_type: this.typeFilter || undefined,
        since: this.sinceInput || undefined,
        until: this.untilInput || undefined,
      })
      .then(response =>
        this.handleCsvResponse(
          response.body as unknown as Blob,
          response.headers.get('Content-Disposition'),
        ),
      )
      .catch(err => this.handleCsvError(err));
  }

  /** Déclenche le download du Blob CSV et lit le filename depuis Content-Disposition. */
  private handleCsvResponse(blob: Blob, contentDisposition: string | null): void {
    const match = (contentDisposition ?? '').match(/filename="?([^"]+)"?/);
    const filename =
      match?.[1] ?? `achats-documents_${new Date().toISOString().slice(0, 10)}.csv`;

    const objectUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(objectUrl);

    this.snack.open('Export CSV téléchargé', 'OK', { duration: 4000 });
  }

  private handleCsvError(err: any): void {
    if (err?.status === 401 || err?.status === 403) {
      this.logout();
      return;
    }
    this.snack.open("Échec de l'export CSV", 'OK', { duration: 6000 });
    console.error('[admin-purchases] export', err);
  }

  /** Purge la session admin et redirige vers /admin/login. */
  private logout(): void {
    sessionStorage.removeItem('tuita_admin_token');
    sessionStorage.removeItem('tuita_admin_refresh');
    sessionStorage.removeItem('tuita_admin_user');
    this.router.navigate(['/admin/login']);
  }

  formatDuration(seconds: number | null): string {
    if (seconds === null) return '—';
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
      // Session OAuth2 mysession expirée → purge la triple-clé et redirige
      // explicitement vers /admin/login (plus de simple "set error").
      this.error.set('Session admin expirée');
      this.logout();
    } else {
      console.error('[admin-purchases]', ctx, err);
    }
  }
}
