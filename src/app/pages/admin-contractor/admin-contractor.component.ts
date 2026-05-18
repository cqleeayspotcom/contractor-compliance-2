import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnInit,
  WritableSignal,
} from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, Observable } from 'rxjs';

import { MatCardModule } from '@angular/material/card';
import { MatTabsModule, MatTabChangeEvent } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

import {
  AdminContractorService,
  ContractorDetail,
  ContractorDocumentRow,
  ContractorInvoiceRow,
  ContractorKycRow,
  ContractorMissionRow,
  ContractorPurchaseRow,
  ListQuery,
  PaginatedMeta,
} from '../../services/admin-contractor.service';
import { HttpClient } from '@angular/common/http';
import { AdminDocumentPreviewDialogComponent } from './admin-document-preview-dialog.component';
import { AdminKycSessionDialogComponent } from '../admin-kyc-failures/admin-kyc-session-dialog.component';
import { PurchaseDetailDialogComponent } from '../admin-purchases/purchase-detail-dialog/purchase-detail-dialog.component';
import { PurchaseDetail } from '../admin-purchases/admin-purchases.component';
import { PhoneDisplayPipe } from '../../pipes/phone-display.pipe';

interface TabState<T> {
  rows: WritableSignal<T[]>;
  meta: WritableSignal<PaginatedMeta>;
  loading: WritableSignal<boolean>;
  loaded: WritableSignal<boolean>;
  // filters
  search: WritableSignal<string>;
  status: WritableSignal<string>;
  type: WritableSignal<string>;
  sort: WritableSignal<string>;
  dir: WritableSignal<'asc' | 'desc'>;
}

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function emptyMeta(): PaginatedMeta {
  return {
    total: 0,
    current_page: 1,
    per_page: DEFAULT_PAGE_SIZE,
    last_page: 1,
    from: null,
    to: null,
  };
}

function makeTabState<T>(defaultSort: string): TabState<T> {
  return {
    rows: signal<T[]>([]),
    meta: signal<PaginatedMeta>(emptyMeta()),
    loading: signal<boolean>(false),
    loaded: signal<boolean>(false),
    search: signal<string>(''),
    status: signal<string>(''),
    type: signal<string>(''),
    sort: signal<string>(defaultSort),
    dir: signal<'asc' | 'desc'>('desc'),
  };
}

@Component({
  selector: 'app-admin-contractor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatCardModule,
    MatTabsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatSnackBarModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatPaginatorModule,
    MatTooltipModule,
    MatSlideToggleModule,
    MatDialogModule,
    PhoneDisplayPipe,
  ],
  templateUrl: './admin-contractor.component.html',
  styleUrl: './admin-contractor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminContractorComponent implements OnInit {
  private readonly api = inject(AdminContractorService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly http = inject(HttpClient);
  private readonly dialogRef = inject<MatDialogRef<AdminContractorComponent> | null>(MatDialogRef, { optional: true });
  private readonly dialogData = inject<{ phone?: string } | null>(MAT_DIALOG_DATA, { optional: true });

  readonly isDialog = !!this.dialogRef;

  readonly phone = signal<string>('');
  readonly data = signal<ContractorDetail | null>(null);
  readonly loading = signal<boolean>(false);
  readonly errorMsg = signal<string | null>(null);
  readonly activeTab = signal<number>(0);

  readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  readonly defaultPageSize = DEFAULT_PAGE_SIZE;

  // Tab states
  readonly documents = makeTabState<ContractorDocumentRow>('created_at');
  readonly kyc = makeTabState<ContractorKycRow>('created_at');
  readonly invoices = makeTabState<ContractorInvoiceRow>('created_at');
  readonly purchases = makeTabState<ContractorPurchaseRow>('created_at');
  readonly missions = makeTabState<ContractorMissionRow>('completed_at');

  // Mission-specific filter: only missions without an active invoice
  readonly missionsWithoutInvoice = signal<boolean>(false);

  // Documents-specific filter: include all historical versions (re-uploads,
  // renouvellements, anciennes versions superseded). Permet à l'admin de
  // tracer l'historique complet des fichiers du contractor — RGPD-friendly.
  readonly documentsIncludeOldVersions = signal<boolean>(false);

  // Debounced search
  private readonly searchInput$ = new Subject<{ tab: 'documents' | 'kyc' | 'invoices' | 'purchases' | 'missions'; value: string }>();

  readonly initials = computed<string>(() => {
    const id = this.data()?.identity;
    if (!id) return '';
    const f = id.first_name?.trim()?.[0] ?? '';
    const l = id.last_name?.trim()?.[0] ?? '';
    return (f + l).toUpperCase() || '?';
  });

  readonly fullName = computed<string>(() => {
    const id = this.data()?.identity;
    if (!id) return '';
    const parts = [id.first_name, id.last_name].filter(Boolean);
    return parts.join(' ').trim() || '(sans nom)';
  });

  // Display columns
  readonly documentColumns = ['type', 'status', 'expires_at', 'verified_at', 'version', 'actions'];
  readonly kycColumns = ['status', 'biometric_provider', 'face_match_score', 'failure_reason', 'completed_at'];
  readonly invoiceColumns = ['number', 'status', 'amount', 'mission', 'issued_at', 'created_at'];
  readonly purchaseColumns = ['document_type', 'siren', 'source', 'status', 'price', 'created_at'];
  readonly missionColumns = ['mission_ref', 'mission_title', 'city', 'expected_amount', 'completed_at', 'invoice_status'];

  // Status filter options per tab
  readonly documentStatuses = ['', 'verified', 'pending', 'processing', 'rejected', 'expired', 'legally_outdated'];
  readonly kycStatuses = ['', 'approved', 'rejected', 'pending', 'pending_manual_review', 'expired'];
  readonly invoiceStatuses = ['', 'validating', 'pending_payment_validation', 'ready_to_pay', 'payment_in_progress', 'paid', 'rejected', 'cancelled', 'draft'];
  readonly purchaseStatuses = ['', 'pending', 'processing', 'completed', 'failed', 'refunded'];

  ngOnInit(): void {
    const phone = this.dialogData?.phone ?? this.route.snapshot.paramMap.get('phone') ?? '';
    this.phone.set(phone);
    this.fetchSummary();

    this.searchInput$.pipe(debounceTime(300)).subscribe(({ tab, value }) => {
      const state = this[tab] as TabState<unknown>;
      state.search.set(value);
      state.meta.update((m) => ({ ...m, current_page: 1 }));
      this.reloadTab(tab);
    });
  }

  fetchSummary(): void {
    const phone = this.phone();
    if (!phone) {
      this.errorMsg.set('Téléphone manquant dans l\'URL.');
      return;
    }

    this.loading.set(true);
    this.errorMsg.set(null);

    this.api.getContractor(phone).subscribe({
      next: (res) => {
        this.data.set(res.data);
        this.loading.set(false);
        // Auto-load first tab
        this.loadTabIfNeeded('documents');
      },
      error: (err: { status?: number; message?: string }) => {
        this.loading.set(false);
        this.handleAuthError(err);
      },
    });
  }

  refresh(): void {
    // Reset all tab loaded flags so they refetch on next view
    this.documents.loaded.set(false);
    this.kyc.loaded.set(false);
    this.invoices.loaded.set(false);
    this.purchases.loaded.set(false);
    this.missions.loaded.set(false);
    this.fetchSummary();
  }

  goBack(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
      return;
    }
    this.location.back();
  }

  onTabChange(event: MatTabChangeEvent): void {
    this.activeTab.set(event.index);
    const map: Record<number, 'documents' | 'kyc' | 'invoices' | 'purchases' | 'missions'> = {
      0: 'kyc',
      1: 'documents',
      2: 'missions',
      3: 'invoices',
      4: 'purchases',
    };
    const tab = map[event.index];
    if (tab) this.loadTabIfNeeded(tab);
  }

  private loadTabIfNeeded(tab: 'documents' | 'kyc' | 'invoices' | 'purchases' | 'missions'): void {
    const state = this[tab] as TabState<unknown>;
    if (!state.loaded() && !state.loading()) {
      this.reloadTab(tab);
    }
  }

  private buildQuery(state: TabState<unknown>, tab?: 'documents' | 'kyc' | 'invoices' | 'purchases' | 'missions'): ListQuery {
    const q: ListQuery = {
      page: state.meta().current_page,
      per_page: state.meta().per_page,
      search: state.search() || undefined,
      status: state.status() || undefined,
      type: state.type() || undefined,
      sort: state.sort(),
      dir: state.dir(),
    };
    if (tab === 'missions' && this.missionsWithoutInvoice()) {
      q.without_invoice = 1;
    }
    if (tab === 'documents' && this.documentsIncludeOldVersions()) {
      q.include_old_versions = 1;
    }
    return q;
  }

  reloadTab(tab: 'documents' | 'kyc' | 'invoices' | 'purchases' | 'missions'): void {
    const phone = this.phone();
    if (!phone) return;
    const state = this[tab] as TabState<unknown>;
    state.loading.set(true);

    const query = this.buildQuery(state, tab);
    const obs: Observable<{ data: unknown[]; meta: PaginatedMeta }> =
      tab === 'documents' ? this.api.listDocuments(phone, query)
      : tab === 'kyc' ? this.api.listKycSessions(phone, query)
      : tab === 'invoices' ? this.api.listInvoices(phone, query)
      : tab === 'missions' ? this.api.listMissions(phone, query)
      : this.api.listPurchases(phone, query);

    obs.subscribe({
      next: (res) => {
        (state.rows as WritableSignal<unknown[]>).set(res.data);
        state.meta.set(res.meta);
        state.loading.set(false);
        state.loaded.set(true);
      },
      error: (err: { status?: number; message?: string }) => {
        state.loading.set(false);
        this.handleAuthError(err);
      },
    });
  }

  private handleAuthError(err: { status?: number; message?: string }): void {
    if (err.status === 401 || err.status === 403) {
      sessionStorage.removeItem('tuita_admin_key');
      this.snackBar.open('Session admin expirée. Reconnectez-vous.', 'OK', { duration: 4000 });
      this.router.navigate(['/admin']);
      return;
    }
    if (err.status === 404) {
      this.errorMsg.set('Aucun contractor trouvé avec ce téléphone.');
      return;
    }
    this.snackBar.open('Erreur de chargement.', 'OK', { duration: 3000 });
  }

  // ---- Filter/sort/page handlers (bound from template) ----

  onSearchInput(tab: 'documents' | 'kyc' | 'invoices' | 'purchases' | 'missions', value: string): void {
    this.searchInput$.next({ tab, value });
  }

  onStatusChange(tab: 'documents' | 'kyc' | 'invoices' | 'purchases' | 'missions', value: string): void {
    const state = this[tab] as TabState<unknown>;
    state.status.set(value);
    state.meta.update((m) => ({ ...m, current_page: 1 }));
    this.reloadTab(tab);
  }

  onTypeChange(tab: 'documents' | 'purchases', value: string): void {
    const state = this[tab] as TabState<unknown>;
    state.type.set(value);
    state.meta.update((m) => ({ ...m, current_page: 1 }));
    this.reloadTab(tab);
  }

  onSortChange(tab: 'documents' | 'kyc' | 'invoices' | 'purchases' | 'missions', column: string): void {
    const state = this[tab] as TabState<unknown>;
    if (state.sort() === column) {
      state.dir.set(state.dir() === 'asc' ? 'desc' : 'asc');
    } else {
      state.sort.set(column);
      state.dir.set('desc');
    }
    this.reloadTab(tab);
  }

  onPageChange(tab: 'documents' | 'kyc' | 'invoices' | 'purchases' | 'missions', event: PageEvent): void {
    const state = this[tab] as TabState<unknown>;
    state.meta.update((m) => ({
      ...m,
      current_page: event.pageIndex + 1,
      per_page: event.pageSize,
    }));
    this.reloadTab(tab);
  }

  resetFilters(tab: 'documents' | 'kyc' | 'invoices' | 'purchases' | 'missions'): void {
    const state = this[tab] as TabState<unknown>;
    state.search.set('');
    state.status.set('');
    state.type.set('');
    state.sort.set('created_at');
    state.dir.set('desc');
    state.meta.update((m) => ({ ...m, current_page: 1 }));
    if (tab === 'missions') {
      this.missionsWithoutInvoice.set(false);
    }
    if (tab === 'documents') {
      this.documentsIncludeOldVersions.set(false);
    }
    this.reloadTab(tab);
  }

  toggleDocumentsIncludeOldVersions(value: boolean): void {
    this.documentsIncludeOldVersions.set(value);
    this.documents.meta.update((m) => ({ ...m, current_page: 1 }));
    this.reloadTab('documents');
  }

  toggleMissionsWithoutInvoice(value: boolean): void {
    this.missionsWithoutInvoice.set(value);
    this.missions.meta.update((m) => ({ ...m, current_page: 1 }));
    this.reloadTab('missions');
  }

  // ---- Document preview ----

  openDocumentPreview(row: ContractorDocumentRow): void {
    this.dialog.open(AdminDocumentPreviewDialogComponent, {
      data: row,
      width: '90vw',
      maxWidth: '1100px',
      height: '85vh',
      panelClass: 'admin-doc-preview-dialog',
    });
  }

  openKycDetail(row: ContractorKycRow): void {
    this.dialog.open(AdminKycSessionDialogComponent, {
      data: { session: row },
      width: '960px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: false,
      panelClass: 'admin-kyc-detail-dialog',
    });
  }

  openPurchaseDetail(row: ContractorPurchaseRow): void {
    const adminKey = sessionStorage.getItem('tuita_admin_key') ?? '';
    this.http
      .get<{ data: PurchaseDetail }>(`/contractor-compliance/admin/purchases/${row.uuid}`, {
        headers: { 'X-Tuita-Admin-Key': adminKey },
      })
      .subscribe({
        next: (res) => {
          this.dialog.open(PurchaseDetailDialogComponent, {
            data: res.data,
            width: '1100px',
            maxWidth: '95vw',
            maxHeight: '90vh',
          });
        },
        error: (err) => this.handleAuthError(err),
      });
  }

  // ---- Formatters / helpers ----

  isPro(plan: string | null): boolean {
    return plan === 'paid' || plan === 'pro';
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('fr-FR', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  formatDateOnly(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('fr-FR');
    } catch {
      return iso;
    }
  }

  isExpiringSoon(iso: string | null): boolean {
    if (!iso) return false;
    const exp = new Date(iso).getTime();
    if (isNaN(exp)) return false;
    return (exp - Date.now()) / (1000 * 60 * 60 * 24) < 30;
  }

  goToInvoice(uuid: string): void {
    this.router.navigate(['/admin/invoices'], { queryParams: { uuid } });
  }

  invoiceStatusLabel(status: string | null): string {
    if (!status) return 'Sans facture';
    const map: Record<string, string> = {
      validating: 'En vérification OCR',
      pending_payment_validation: 'En attente validations',
      ready_to_pay: 'Bon pour paiement',
      payment_in_progress: 'Virement en cours',
      paid: 'Payée',
      rejected: 'Rejetée',
      cancelled: 'Annulée',
      draft: 'Brouillon',
    };
    return map[status] ?? status;
  }

  invoiceStatusChipClass(status: string | null): string {
    if (!status) return 'chip-missing';
    if (status === 'paid') return 'chip-paid';
    if (['ready_to_pay', 'payment_in_progress'].includes(status)) return 'chip-ready';
    if (['rejected', 'cancelled'].includes(status)) return 'chip-rejected';
    return 'chip-pending';
  }

  formatAmount(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  }

  /** Customer-safe label — n'expose JAMAIS "Pappers" côté UI. */
  sourceLabel(source: string | null | undefined): string {
    if (!source) return '—';
    return source.toLowerCase() === 'pappers' ? 'officiel' : source;
  }

  documentTypeLabel(type: string | null | undefined): string {
    if (!type) return '—';
    const map: Record<string, string> = {
      cni: 'CNI',
      passport: 'Passeport',
      passeport: 'Passeport',
      titre_sejour: 'Titre de séjour',
      kbis: 'KBIS',
      extrait_inpi: 'Extrait INPI',
      avis_sirene: 'Avis SIRENE',
      statuts: 'Statuts',
      urssaf: 'URSSAF',
      rc: 'RC Pro',
      rib: 'RIB',
      assurance_decennale: 'Décennale',
      assurance_do: 'Dommages-ouvrage',
    };
    return map[type] ?? type;
  }

  statusLabel(status: string): string {
    return status.replace(/_/g, ' ');
  }

  sortIcon(state: TabState<unknown>, column: string): string {
    if (state.sort() !== column) return 'unfold_more';
    return state.dir() === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }
}
