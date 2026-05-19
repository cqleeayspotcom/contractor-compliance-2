import {
  Component,
  ChangeDetectionStrategy,
  ViewEncapsulation,
  signal,
  computed,
  inject,
  OnInit,
  OnDestroy,
  TemplateRef,
  ViewChild,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
// Pourquoi pas HttpClient/HttpHeaders ici : depuis 2026-05-19 toutes les actions
// admin invoice passent par le SDK (cf. AdminInvoiceService) et la validation
// locale utilise adminInvoicesValidate via api.invoke — plus de raw POST.
import { Api } from '../../api/api';
import { interval, Subscription, fromEvent } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatBadgeModule } from '@angular/material/badge';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTooltipModule } from '@angular/material/tooltip';

import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import {
  AdminInvoiceService,
  AdminInvoice,
  AuditTrailDetail,
  InvoiceDetail,
  PaginatedInvoices,
  InvoiceSearchFilters,
} from '../../services/admin-invoice.service';
import { adminInvoicesValidate } from '../../api/fn/admin-invoices/admin-invoices-validate';
import { AdminDialogService } from '../../services/admin-dialog.service';
import { AdminInvoiceFilterBarComponent } from '../../components/admin/admin-invoice-filter-bar/admin-invoice-filter-bar.component';
import { AdminBackButtonComponent } from '../../components/admin/admin-back-button/admin-back-button.component';
import { KeyboardShortcutsOverlayComponent } from '../../components/admin/keyboard-shortcuts-overlay/keyboard-shortcuts-overlay.component';
import { ContractorStatusBannerComponent } from '../../components/admin/contractor-status-banner/contractor-status-banner.component';
import { AdminContractorComponent } from '../admin-contractor/admin-contractor.component';
import { PhoneDisplayPipe } from '../../pipes/phone-display.pipe';

type TabKey = 'pending' | 'ready' | 'inprogress' | 'disputed' | 'all';

interface TabState {
  page: number;
  perPage: number;
  total: number;
  loading: boolean;
  rows: AdminInvoice[];
}

interface DialogContext {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  fields: DialogField[];
  invoice: AdminInvoice | null;
  // Pretty JSON for detail dialog
  detailJson?: string;
}

interface DialogField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'select';
  required: boolean;
  minLength?: number;
  options?: { value: string; label: string }[];
  value: string;
  hint?: string;
}

@Component({
  selector: 'app-admin-invoices',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTabsModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatBadgeModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatSelectModule,
    MatNativeDateModule,
    MatDatepickerModule,
    MatTooltipModule,
    AdminInvoiceFilterBarComponent,
    AdminBackButtonComponent,
    KeyboardShortcutsOverlayComponent,
    ContractorStatusBannerComponent,
    PhoneDisplayPipe,
  ],
  templateUrl: './admin-invoices.component.html',
  styleUrl: './admin-invoices.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Encapsulation None : le modal détail est ouvert via MatDialog avec un
  // TemplateRef et monté dans cdk-overlay-container au niveau <body>. Les
  // styles component-scoped (Emulated) ne suivent pas — les sélecteurs
  // .info-card / .info-grid / .timeline / etc. ne matchent rien et le contenu
  // s'affiche brut. En passant en None, les règles deviennent globales.
  // Safe : les autres composants qui utilisent .info-card ont leurs propres
  // styles scopés (spécificité [_ngcontent-xxx] > sélecteur global) → ils
  // gagnent sur leur propre DOM, on ne pollue que le contenu sans scope.
  encapsulation: ViewEncapsulation.None,
})
export class AdminInvoicesComponent implements OnInit, OnDestroy {
  // ── Polling silencieux ────────────────────────────────────────────────
  readonly lastSyncedAt = signal<Date | null>(null);
  readonly pollingActive = signal<boolean>(true);

  private listPollSub: Subscription | null = null;
  private detailPollSub: Subscription | null = null;
  private visibilitySub: Subscription | null = null;

  private readonly api = inject(AdminInvoiceService);
  // Pour la validation locale via le SDK (adminInvoicesValidate).
  private readonly sdk = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly adminDialog = inject(AdminDialogService);

  // ── État du modal Détail ────────────────────────────────────────────────
  // Signaux dédiés pour ne pas polluer dialogCtx (et permettre OnPush refresh).
  readonly detailData = signal<InvoiceDetail | null>(null);
  readonly detailAudit = signal<AuditTrailDetail | null>(null);
  readonly auditDialogData = signal<AuditTrailDetail | null>(null);
  readonly detailLoading = signal<boolean>(false);
  readonly detailPdfUrl = signal<SafeResourceUrl | null>(null);
  readonly detailPdfLoading = signal<boolean>(false);
  readonly detailPdfError = signal<string | null>(null);
  readonly detailPdfBlob = signal<Blob | null>(null);
  private detailPdfObjectUrl: string | null = null;

  @ViewChild('actionDialogTpl', { static: true }) actionDialogTpl!: TemplateRef<unknown>;
  @ViewChild('detailDialogTpl', { static: true }) detailDialogTpl!: TemplateRef<unknown>;
  @ViewChild('auditDialogTpl', { static: true }) auditDialogTpl!: TemplateRef<unknown>;

  // Active tab
  readonly activeTab = signal<TabKey>('pending');
  readonly initialTabIndex = signal<number>(0);

  // One state per tab
  readonly tabs: Record<TabKey, ReturnType<typeof signal<TabState>>> = {
    pending: signal<TabState>(this.emptyState()),
    ready: signal<TabState>(this.emptyState()),
    inprogress: signal<TabState>(this.emptyState()),
    disputed: signal<TabState>(this.emptyState()),
    all: signal<TabState>(this.emptyState()),
  };

  // Filter passed via query param (?filter=stuck) — applied at fetch time
  readonly stuckFilter = signal<boolean>(false);

  // Split view : sélection courante + PDF dans le pane
  readonly selectedInvoice = signal<AdminInvoice | null>(null);
  readonly selectedInvoiceIndex = computed<number>(() => {
    const sel = this.selectedInvoice();
    if (!sel) return 0;
    const rows = this.tabs[this.activeTab()]().rows;
    return Math.max(0, rows.findIndex(r => r.uuid === sel.uuid));
  });

  readonly paneDetailPdfUrl = signal<SafeResourceUrl | null>(null);
  readonly paneDetailPdfLoading = signal<boolean>(false);
  readonly paneDetailPdfError = signal<string | null>(null);
  private panePdfObjectUrl: string | null = null;

  // Filtres par tab
  readonly tabFilters = signal<Record<TabKey, InvoiceSearchFilters>>({
    pending: {}, ready: {}, inprogress: {}, disputed: {}, all: {},
  });

  // Tri server-side par tab : `sort` (column) + `direction` envoyés au
  // backend (cf. AdminInvoicePaymentController + WithAdminInvoiceFilters
  // applySort). Le tri couvre TOUTES les pages, pas juste la page courante.
  // Mapping template -> backend : 'date' -> 'created_at'.
  readonly tabSort: Record<TabKey, ReturnType<typeof signal<string>>> = {
    pending: signal<string>('created_at'),
    ready: signal<string>('updated_at'),
    inprogress: signal<string>('updated_at'),
    disputed: signal<string>('paid_disputed_at'),
    all: signal<string>('created_at'),
  };

  readonly tabDirection: Record<TabKey, ReturnType<typeof signal<'asc' | 'desc'>>> = {
    pending: signal<'asc' | 'desc'>('asc'), // FIFO : les plus anciens en haut
    ready: signal<'asc' | 'desc'>('asc'),
    inprogress: signal<'asc' | 'desc'>('asc'),
    disputed: signal<'asc' | 'desc'>('asc'),
    all: signal<'asc' | 'desc'>('desc'),
  };

  /** matSortActive attendu par la directive : on remappe le sort backend
   *  vers le nom de colonne template (ex 'created_at' -> 'date'). */
  sortFor(tabKey: string): string {
    const backend = this.tabSort[tabKey as TabKey]();
    return backend === 'created_at' ? 'date' : backend;
  }

  directionFor(tabKey: string): 'asc' | 'desc' | '' {
    return this.tabDirection[tabKey as TabKey]();
  }

  onSortChange(tabKey: string, sort: Sort): void {
    const tk = tabKey as TabKey;
    // template col -> backend whitelist column
    const colMap: Record<string, string> = { date: 'created_at' };
    const defaultCol = tk === 'disputed'
      ? 'paid_disputed_at'
      : (tk === 'ready' || tk === 'inprogress' ? 'updated_at' : 'created_at');
    const defaultDir: 'asc' | 'desc' = tk === 'all' ? 'desc' : 'asc';

    if (!sort.active || !sort.direction) {
      this.tabSort[tk].set(defaultCol);
      this.tabDirection[tk].set(defaultDir);
    } else {
      this.tabSort[tk].set(colMap[sort.active] ?? sort.active);
      this.tabDirection[tk].set(sort.direction);
    }

    // Reset paginator + refetch toute la page 1
    const state = this.tabs[tk]();
    this.tabs[tk].set({ ...state, page: 1 });
    this.loadTab(tk);
  }

  // Cheatsheet raccourcis
  readonly showShortcuts = signal<boolean>(false);

  readonly displayedColumns = ['number', 'mission_ref', 'amount', 'status', 'date', 'actions'];

  // Dialog state (shared by the inline templates)
  dialogCtx: DialogContext = this.emptyDialogCtx();
  private dialogRef: MatDialogRef<unknown> | null = null;
  // Ref dédiée au detail dialog : lui doit survivre quand un confirm dialog
  // d'action s'ouvre par-dessus (mark-paid, mark-payment-in-progress, etc.).
  // Sans ça, `dialogRef` se fait écraser par l'action dialog et la détection
  // « detail ouvert ? » casse.
  private detailDialogRef: MatDialogRef<unknown> | null = null;
  private pendingAction: ((ctx: DialogContext) => void) | null = null;

  readonly currentTabState = computed(() => this.tabs[this.activeTab()]());

  ngOnInit(): void {
    // Auth garantie par AdminAuthGuard sur /admin/* ; le Bearer OAuth2
    // mysession est injecté par admin-key.interceptor.
    const order: TabKey[] = ['pending', 'ready', 'inprogress', 'disputed', 'all'];
    const requested = this.route.snapshot.queryParamMap.get('tab') as TabKey | null;
    const initial: TabKey = requested && order.includes(requested) ? requested : 'pending';
    this.stuckFilter.set(this.route.snapshot.queryParamMap.get('filter') === 'stuck');
    this.activeTab.set(initial);
    this.initialTabIndex.set(order.indexOf(initial));
    this.loadTab(initial);

    // Polling : visibilité de la page
    this.visibilitySub = fromEvent(document, 'visibilitychange').subscribe(() => {
      this.pollingActive.set(document.visibilityState === 'visible');
    });

    // Polling liste — toutes les 30s
    this.listPollSub = interval(30_000).subscribe(() => {
      if (!this.pollingActive()) return;
      if (this.dialogRef) return; // sub-dialog d'action ouvert : on n'écrase pas la saisie
      const tab = this.activeTab();
      const state = this.tabs[tab]();
      if (state.loading) return; // anti-stampede
      this.silentReloadList(tab);
    });

    // Polling détail / pane — toutes les 10s
    this.detailPollSub = interval(10_000).subscribe(() => {
      if (!this.pollingActive()) return;
      if (this.dialogRef) return; // sub-dialog d'action ouvert : on n'écrase pas la saisie
      const detailInv = this.dialogCtx.invoice;
      if (this.isDetailDialogOpen() && detailInv) {
        this.silentReloadDetail(detailInv);
        return;
      }
      const sel = this.selectedInvoice();
      if (sel) this.silentReloadSelectedFromList(sel);
    });
  }

  ngOnDestroy(): void {
    this.listPollSub?.unsubscribe();
    this.detailPollSub?.unsubscribe();
    this.visibilitySub?.unsubscribe();
  }

  /** Refetch la liste sans toucher au spinner. */
  private silentReloadList(tab: TabKey): void {
    const state = this.tabs[tab]();
    const filters: InvoiceSearchFilters = { ...this.tabFilters()[tab] };
    filters.page = state.page;
    filters.per_page = state.perPage;
    filters.sort = this.tabSort[tab]();
    filters.direction = this.tabDirection[tab]();

    const tabStatusMap: Record<TabKey, string[] | null> = {
      pending: ['pending_payment_validation'],
      ready: ['ready_to_pay'],
      inprogress: ['payment_in_progress'],
      disputed: [],
      all: null,
    };
    const forced = tabStatusMap[tab];
    if (forced !== null && forced.length > 0) filters.status = forced;
    if (tab === 'disputed') filters.paid_disputed = true;
    if (this.stuckFilter()) filters.stuck = true;

    this.api.searchInvoices(filters).subscribe({
      next: res => {
        const rows = res.data ?? [];
        this.tabs[tab].set({
          ...this.tabs[tab](),
          rows,
          total: res.meta?.total ?? rows.length,
        });
        this.lastSyncedAt.set(new Date());

        const sel = this.selectedInvoice();
        if (sel) {
          const fresh = rows.find(r => r.uuid === sel.uuid);
          if (fresh) this.selectedInvoice.set(fresh);
        }
      },
      error: () => { /* silent */ },
    });
  }

  /** Refetch le détail courant du modal sans flicker. */
  private silentReloadDetail(inv: AdminInvoice): void {
    this.api.getInvoiceDetail(inv.uuid).subscribe({
      next: res => {
        this.detailData.set(res.data);
        this.lastSyncedAt.set(new Date());
      },
      error: () => {},
    });
    this.api.getAuditTrail(inv.uuid).subscribe({
      next: res => this.detailAudit.set(res.data ?? null),
      error: () => {},
    });
  }

  /** Refetch la facture sélectionnée du pane (sans recharger PDF).
   *  On passe par le reload de la liste : `/admin/invoices/{uuid}` est l'endpoint
   *  de détail (shape `{ invoice: {...}, items: [...], ... }`) et n'expose pas la
   *  forme plate `AdminInvoice` (contractor_phone, validations_received, rib, ...). */
  private silentReloadSelectedFromList(_inv: AdminInvoice): void {
    this.silentReloadList(this.activeTab());
  }

  // ------------------------------------------------------------------
  // Tab change
  // ------------------------------------------------------------------

  onTabChange(idx: number): void {
    const order: TabKey[] = ['pending', 'ready', 'inprogress', 'disputed', 'all'];
    const next = order[idx] ?? 'pending';
    this.activeTab.set(next);
    this.selectedInvoice.set(null);
    this.resetPanePdf();
    if (this.tabs[next]().rows.length === 0) {
      this.loadTab(next);
    } else {
      // Auto-sélectionne la 1ère ligne déjà chargée
      const firstRow = this.tabs[next]().rows[0];
      if (firstRow) this.selectInvoice(firstRow);
    }
  }

  onPageChange(ev: PageEvent): void {
    const tab = this.activeTab();
    const state = this.tabs[tab]();
    this.tabs[tab].set({ ...state, page: ev.pageIndex + 1, perPage: ev.pageSize });
    this.loadTab(tab);
  }

  refreshCurrent(): void {
    this.loadTab(this.activeTab());
  }

  // ------------------------------------------------------------------
  // Loading
  // ------------------------------------------------------------------

  private loadTab(tab: TabKey): void {
    const state = this.tabs[tab]();
    this.tabs[tab].set({ ...state, loading: true });

    const filters: InvoiceSearchFilters = { ...this.tabFilters()[tab] };
    filters.page = state.page;
    filters.per_page = state.perPage;
    filters.sort = this.tabSort[tab]();
    filters.direction = this.tabDirection[tab]();

    // Forcer les statuts selon l'onglet (sauf onglet 'all' qui garde la sélection user)
    const tabStatusMap: Record<TabKey, string[] | null> = {
      pending: ['pending_payment_validation'],
      ready: ['ready_to_pay'],
      inprogress: ['payment_in_progress'],
      disputed: [], // utilise paid_disputed=true
      all: null,
    };
    const forcedStatuses = tabStatusMap[tab];
    if (forcedStatuses !== null && forcedStatuses.length > 0) {
      filters.status = forcedStatuses;
    }
    if (tab === 'disputed') {
      filters.paid_disputed = true;
    }
    if (this.stuckFilter()) {
      filters.stuck = true;
    }

    this.api.searchInvoices(filters).subscribe({
      next: (res: PaginatedInvoices) => {
        const rows = res.data ?? [];
        this.tabs[tab].set({
          ...this.tabs[tab](),
          loading: false,
          rows,
          total: res.meta?.total ?? rows.length,
        });
        if (rows.length > 0 && tab === this.activeTab() && !this.selectedInvoice()) {
          this.selectInvoice(rows[0]);
        }
      },
      error: err => this.handleHttpError(err, `liste ${tab}`),
    });
  }

  /**
   * Détecte un 409 INVOICE_STALE (conflit multi-admin) et reload la liste.
   * Pour tout autre erreur, délègue au handler standard.
   */
  private handleConflictOrFallback(err: unknown, context: string): void {
    const httpErr = err as {
      status?: number;
      error?: { error?: { code?: string } };
    };
    if (httpErr.status === 409 && httpErr.error?.error?.code === 'INVOICE_STALE') {
      this.snack.open(
        'Cette facture a été modifiée par un autre admin. Vue rechargée.',
        'OK',
        { duration: 8000 },
      );
      this.dialogRef?.close();
      this.loadTab(this.activeTab());
      return;
    }
    this.handleHttpError(err, context);
  }

  private handleHttpError(err: unknown, context: string): void {
    const httpErr = err as {
      status?: number;
      message?: string;
      error?: { error?: { code?: string; message?: string; hint?: string } };
    };
    if (httpErr.status === 401 || httpErr.status === 403) {
      sessionStorage.removeItem('tuita_admin_token');
      sessionStorage.removeItem('tuita_admin_refresh');
      sessionStorage.removeItem('tuita_admin_user');
      this.snack.open('Session admin expirée', 'OK', { duration: 4000 });
      this.router.navigate(['/admin/login']);
      return;
    }
    console.error(`[admin-invoices] ${context}`, err);

    const apiError = httpErr.error?.error;
    const status = httpErr.status ?? 0;
    let snackMsg: string;
    if (apiError?.message && status >= 400 && status < 500) {
      const parts = [apiError.message];
      if (apiError.hint) parts.push(apiError.hint);
      snackMsg = parts.join(' — ');
    } else {
      snackMsg = `Erreur lors du chargement (${context})`;
    }
    this.snack.open(snackMsg, 'OK', { duration: 8000 });
    // Reset loading flags on every tab to avoid spinner stuck
    (Object.keys(this.tabs) as TabKey[]).forEach(t => {
      const s = this.tabs[t]();
      if (s.loading) this.tabs[t].set({ ...s, loading: false });
    });
  }

  // ------------------------------------------------------------------
  // Action entry points (kebab menu callbacks)
  // ------------------------------------------------------------------

  openMarkPaymentInProgress(inv: AdminInvoice): void {
    this.openActionDialog(
      {
        title: 'Marquer le virement comme lancé',
        body:
          `Cette action passe la facture en PAYMENT_IN_PROGRESS et émet le webhook ` +
          `contractor.invoice.payment_in_progress vers tuita.fr. Le contractor verra ` +
          `« virement en cours » dans son portail.`,
        confirmLabel: 'Lancer le virement',
        cancelLabel: 'Annuler',
        danger: false,
        fields: [
          { key: 'payment_ref', label: 'Référence de virement', type: 'text', required: true, value: '' },
        ],
        invoice: inv,
      },
      ctx => {
        const payRef = this.fieldValue(ctx, 'payment_ref').trim();
        this.api.markPaymentInProgress(inv.uuid, { payment_ref: payRef }, inv.updated_at ?? undefined).subscribe({
          next: () => this.afterAction('Virement marqué en cours'),
          error: err => this.handleConflictOrFallback(err, 'mark-payment-in-progress'),
        });
      },
    );
  }

  openMarkPaid(inv: AdminInvoice): void {
    this.openActionDialog(
      {
        title: 'Confirmer le paiement',
        body:
          `Cette action passe la facture en PAID et émet le webhook ` +
          `contractor.invoice.paid. Strict D1 : la facture doit être en ` +
          `PAYMENT_IN_PROGRESS.`,
        confirmLabel: 'Marquer payée',
        cancelLabel: 'Annuler',
        danger: false,
        fields: [
          { key: 'paid_at', label: 'Date de paiement (banque)', type: 'date', required: true, value: this.todayIso() },
          { key: 'payment_ref', label: 'Référence de virement', type: 'text', required: true, value: '' },
        ],
        invoice: inv,
      },
      ctx => {
        const paidAt = this.fieldValue(ctx, 'paid_at');
        const payRef = this.fieldValue(ctx, 'payment_ref').trim();
        this.api.markPaid(inv.uuid, { paid_at: paidAt, payment_ref: payRef }, inv.updated_at ?? undefined).subscribe({
          next: () => this.afterAction('Facture marquée payée'),
          error: err => this.handleConflictOrFallback(err, 'mark-paid'),
        });
      },
    );
  }

  openMarkPaidFastPath(inv: AdminInvoice): void {
    this.openActionDialog(
      {
        title: 'Marquer payée — fast path (saute PAYMENT_IN_PROGRESS)',
        body:
          `⚠ ATTENTION : ce fast path saute l'étape PAYMENT_IN_PROGRESS et émet ` +
          `2 webhooks en cascade (payment_in_progress puis paid). À utiliser ` +
          `uniquement pour un virement instantané déjà confirmé côté banque. ` +
          `La raison sera consignée dans l'audit trail.`,
        confirmLabel: 'Confirmer le fast path',
        cancelLabel: 'Annuler',
        danger: true,
        fields: [
          { key: 'paid_at', label: 'Date de paiement', type: 'date', required: true, value: this.todayIso() },
          { key: 'payment_ref', label: 'Référence de virement', type: 'text', required: true, value: '' },
          {
            key: 'reason',
            label: 'Raison (min 10 caractères)',
            type: 'textarea',
            required: true,
            minLength: 10,
            value: '',
            hint: 'Ex : virement instantané validé par le CFO le 24/04',
          },
          {
            key: 'confirm_word',
            label: 'Tape CONFIRMER (en majuscules) pour activer',
            type: 'text',
            required: true,
            value: '',
            hint: 'Confirmation pour cette action critique sans triple validation',
          },
        ],
        invoice: inv,
      },
      ctx => {
        const paidAt = this.fieldValue(ctx, 'paid_at');
        const payRef = this.fieldValue(ctx, 'payment_ref').trim();
        const reason = this.fieldValue(ctx, 'reason').trim();
        this.api.markPaid(inv.uuid, {
          paid_at: paidAt,
          payment_ref: payRef,
          skip_in_progress: true,
          reason,
        }, inv.updated_at ?? undefined).subscribe({
          next: () => this.afterAction('Facture marquée payée (fast path)'),
          error: err => this.handleConflictOrFallback(err, 'mark-paid-fast-path'),
        });
      },
    );
  }

  openReopen(inv: AdminInvoice): void {
    this.openActionDialog(
      {
        title: 'Rouvrir la facture',
        body:
          `Cette action clone la facture REJECTED en une nouvelle facture en ` +
          `PENDING_PAYMENT_VALIDATION. L'ancienne reste rejetée pour audit. ` +
          `Maximum 2 rouvertures par mission_ref.`,
        confirmLabel: 'Rouvrir',
        cancelLabel: 'Annuler',
        danger: false,
        fields: [
          { key: 'reason', label: 'Raison (min 10 caractères)', type: 'textarea', required: true, minLength: 10, value: '' },
          {
            key: 'confirm_word',
            label: 'Tape CONFIRMER (en majuscules) pour activer',
            type: 'text',
            required: true,
            value: '',
            hint: 'Confirmation pour cette action critique sans triple validation',
          },
        ],
        invoice: inv,
      },
      ctx => {
        const reason = this.fieldValue(ctx, 'reason').trim();
        this.api.reopen(inv.uuid, { reason }, inv.updated_at ?? undefined).subscribe({
          next: () => this.afterAction('Facture rouverte (clone créé)'),
          error: err => this.handleConflictOrFallback(err, 'reopen'),
        });
      },
    );
  }

  openResolveDispute(inv: AdminInvoice): void {
    this.openActionDialog(
      {
        title: 'Résoudre le litige',
        body: `Cette action efface le flag paid_disputed_at sur la facture.`,
        confirmLabel: 'Résoudre',
        cancelLabel: 'Annuler',
        danger: false,
        fields: [
          { key: 'resolution', label: 'Résolution (description)', type: 'textarea', required: true, value: '' },
        ],
        invoice: inv,
      },
      ctx => {
        const resolution = this.fieldValue(ctx, 'resolution').trim();
        this.api.resolveDispute(inv.uuid, { resolution }, inv.updated_at ?? undefined).subscribe({
          next: () => this.afterAction('Litige résolu'),
          error: err => this.handleConflictOrFallback(err, 'resolve-dispute'),
        });
      },
    );
  }

  openForceResendWebhook(inv: AdminInvoice): void {
    this.openActionDialog(
      {
        title: 'Renvoyer un webhook',
        body:
          `Reset du flag webhook_*_sent_at correspondant et redispatch du webhook. ` +
          `À utiliser si tuita.fr a manqué un webhook (panne, parsing).`,
        confirmLabel: 'Renvoyer',
        cancelLabel: 'Annuler',
        danger: false,
        fields: [
          {
            key: 'event_type',
            label: 'Type d\'event',
            type: 'select',
            required: true,
            value: 'paid',
            options: [
              { value: 'rejected', label: 'rejected' },
              { value: 'ready_to_pay', label: 'ready_to_pay' },
              { value: 'payment_in_progress', label: 'payment_in_progress' },
              { value: 'paid', label: 'paid' },
            ],
          },
          { key: 'reason', label: 'Raison', type: 'textarea', required: true, value: '' },
          {
            key: 'confirm_word',
            label: 'Tape CONFIRMER (en majuscules) pour activer',
            type: 'text',
            required: true,
            value: '',
            hint: 'Confirmation pour cette action critique sans triple validation',
          },
        ],
        invoice: inv,
      },
      ctx => {
        const eventType = this.fieldValue(ctx, 'event_type') as
          | 'rejected'
          | 'ready_to_pay'
          | 'payment_in_progress'
          | 'paid';
        const reason = this.fieldValue(ctx, 'reason').trim();
        this.api.forceResendWebhook(inv.uuid, { event_type: eventType, reason }, inv.updated_at ?? undefined).subscribe({
          next: () => this.afterAction('Webhook renvoyé'),
          error: err => this.handleConflictOrFallback(err, 'force-resend-webhook'),
        });
      },
    );
  }

  openAddNote(inv: AdminInvoice): void {
    this.openActionDialog(
      {
        title: 'Ajouter une note admin',
        body: `La note sera consignée dans l'audit trail de la facture.`,
        confirmLabel: 'Ajouter',
        cancelLabel: 'Annuler',
        danger: false,
        fields: [
          { key: 'content', label: 'Note', type: 'textarea', required: true, value: '' },
        ],
        invoice: inv,
      },
      ctx => {
        const content = this.fieldValue(ctx, 'content').trim();
        this.api.addNote(inv.uuid, { content }, inv.updated_at ?? undefined).subscribe({
          next: () => this.afterAction('Note ajoutée'),
          error: err => this.handleConflictOrFallback(err, 'add-note'),
        });
      },
    );
  }

  openAuditTrail(inv: AdminInvoice): void {
    this.dialogCtx = {
      ...this.emptyDialogCtx(),
      title: `Audit trail — ${inv.number ?? inv.uuid}`,
      body: '',
      confirmLabel: 'Fermer',
      cancelLabel: '',
      danger: false,
      invoice: inv,
    };
    this.auditDialogData.set(null);
    const dlg = this.dialog.open(this.auditDialogTpl, { width: '880px', maxHeight: '85vh' });
    this.dialogRef = dlg;
    dlg.afterClosed().subscribe(() => { this.dialogRef = null; });
    this.api.getAuditTrail(inv.uuid).subscribe({
      next: res => this.auditDialogData.set(res.data ?? null),
      error: err => this.handleHttpError(err, 'audit-trail'),
    });
  }

  openMissionDialog(missionRef: string): void {
    const ref = this.adminDialog.openMission(missionRef);
    ref.componentInstance.openInvoice.subscribe((invoiceUuid: string) => {
      // Empile le dialog facture par-dessus mission. Material gère le stacking automatiquement.
      const rows = this.tabs[this.activeTab()]().rows;
      const inv = rows.find(r => r.uuid === invoiceUuid);
      if (inv) this.openDetail(inv);
    });
  }

  openDetail(inv: AdminInvoice): void {
    this.dialogCtx = {
      ...this.emptyDialogCtx(),
      title: `Détail — ${inv.number ?? inv.uuid}`,
      body: '',
      confirmLabel: 'Fermer',
      cancelLabel: '',
      danger: false,
      invoice: inv,
    };

    if (!this.detailDialogRef) {
      const dlg = this.dialog.open(this.detailDialogTpl, {
        width: '1200px',
        maxWidth: '95vw',
        maxHeight: '92vh',
        panelClass: 'admin-invoice-detail-panel',
      });
      this.detailDialogRef = dlg;
      // Cleanup blob URL au close
      dlg.afterClosed().subscribe(() => {
        this.resetDetailPdf();
        this.detailDialogRef = null;
      });
    }

    this.loadDetailContent(inv);
  }

  /** Ferme uniquement le detail dialog (le bouton ✕ du header). Distinct
   *  de onDialogCancel() qui ferme le dialog actif générique (action confirm). */
  closeDetailDialog(): void {
    this.detailDialogRef?.close();
  }

  private loadDetailContent(inv: AdminInvoice): void {
    this.detailData.set(null);
    this.detailAudit.set(null);
    this.detailLoading.set(true);
    this.resetDetailPdf();

    this.dialogCtx = {
      ...this.dialogCtx,
      invoice: inv,
      title: `Détail — ${inv.number ?? inv.uuid}`,
    };
    // Sync split-view selection
    this.selectedInvoice.set(inv);

    // 1. Détail structuré
    this.api.getInvoiceDetail(inv.uuid).subscribe({
      next: res => {
        this.detailData.set(res.data);
        this.detailLoading.set(false);
      },
      error: err => {
        this.detailLoading.set(false);
        this.handleHttpError(err, 'invoice-detail');
      },
    });

    // 2. Audit trail (best-effort, n'empêche pas l'affichage)
    this.api.getAuditTrail(inv.uuid).subscribe({
      next: res => this.detailAudit.set(res.data ?? null),
      error: () => {},
    });

    // 3. PDF stream (en parallèle, peut échouer sans bloquer)
    this.detailPdfLoading.set(true);
    this.api.downloadInvoicePdf(inv.uuid, true).subscribe({
      next: blob => {
        this.detailPdfLoading.set(false);
        this.detailPdfBlob.set(blob);
        this.detailPdfObjectUrl = URL.createObjectURL(blob);
        this.detailPdfUrl.set(
          this.sanitizer.bypassSecurityTrustResourceUrl(this.detailPdfObjectUrl),
        );
      },
      error: err => {
        this.detailPdfLoading.set(false);
        const code = err?.error?.error?.code ?? '';
        if (code === 'INVOICE_PDF_NOT_FOUND') {
          this.detailPdfError.set('PDF indisponible (upload freemium dont le fichier S3 a été perdu).');
        } else if (err?.status === 401 || err?.status === 403) {
          this.detailPdfError.set('Accès refusé.');
        } else {
          this.detailPdfError.set('Impossible de charger le PDF.');
        }
      },
    });
  }

  private isDetailDialogOpen(): boolean {
    return this.detailDialogRef !== null;
  }

  detailGoNext(): void {
    const cur = this.dialogCtx.invoice ?? this.selectedInvoice();
    if (!cur) return;
    const rows = this.tabs[this.activeTab()]().rows;
    const idx = rows.findIndex(r => r.uuid === cur.uuid);
    if (idx < 0 || idx >= rows.length - 1) return;
    this.loadDetailContent(rows[idx + 1]);
  }

  detailGoPrev(): void {
    const cur = this.dialogCtx.invoice ?? this.selectedInvoice();
    if (!cur) return;
    const rows = this.tabs[this.activeTab()]().rows;
    const idx = rows.findIndex(r => r.uuid === cur.uuid);
    if (idx <= 0) return;
    this.loadDetailContent(rows[idx - 1]);
  }

  detailIndex(): number {
    const cur = this.dialogCtx.invoice;
    if (!cur) return 0;
    const rows = this.tabs[this.activeTab()]().rows;
    return Math.max(0, rows.findIndex(r => r.uuid === cur.uuid));
  }

  detailTotal(): number {
    return this.tabs[this.activeTab()]().rows.length;
  }

  private resetDetailPdf(): void {
    if (this.detailPdfObjectUrl) {
      URL.revokeObjectURL(this.detailPdfObjectUrl);
      this.detailPdfObjectUrl = null;
    }
    this.detailPdfUrl.set(null);
    this.detailPdfBlob.set(null);
    this.detailPdfError.set(null);
    this.detailPdfLoading.set(false);
  }

  /** Force download du PDF actuellement chargé (réutilise le blob déjà fetché). */
  downloadDetailPdf(): void {
    const blob = this.detailPdfBlob();
    const inv = this.detailData()?.invoice;
    if (!blob || !inv) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `facture-${inv.number ?? inv.uuid}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Ouvre le PDF dans un nouvel onglet (réutilise l'object URL existant). */
  openDetailPdfInNewTab(): void {
    if (this.detailPdfObjectUrl) {
      window.open(this.detailPdfObjectUrl, '_blank', 'noopener');
    }
  }

  /** Compute l'écart entre montant facturé TTC et mission_snapshot.expected. */
  amountDeviation(): { delta: number; pct: number } | null {
    const data = this.detailData();
    if (!data?.invoice?.amount_ttc || !data?.mission_snapshot?.expected_amount_ttc) return null;
    const declared = data.invoice.amount_ttc;
    const expected = data.mission_snapshot.expected_amount_ttc;
    if (!expected) return null;
    const delta = declared - expected;
    const pct = (delta / expected) * 100;
    return { delta, pct };
  }

  /**
   * Pivot 2026-05-13 : retourne la liste chronologique des approbations/rejets
   * reçus pour l'invoice (sans distinction de rôle).
   */
  detailValidators(): Array<{
    index: number;
    label: string;
    status: 'approved' | 'rejected';
    source: string;
    validator: { email: string; name: string; at?: string | null; comment?: string | null };
  }> {
    const data = this.detailData();
    const validations = (data?.payment_validations ?? []) as Array<any>;
    return validations
      .slice()
      .sort((a, b) => (a.validated_at ?? '').localeCompare(b.validated_at ?? ''))
      .map((v, i) => ({
        index: i + 1,
        label: `Validation ${i + 1}/${data?.approvals_required ?? 3}`,
        status: v.status as 'approved' | 'rejected',
        source: v.source ?? 'webhook',
        validator: {
          email: v.validated_by_email,
          name: v.validated_by_name,
          at: v.validated_at,
          comment: v.comment,
        },
      }));
  }

  detailApprovalsCount(): number {
    return this.detailData()?.approvals_count ?? 0;
  }

  detailApprovalsRequired(): number {
    return this.detailData()?.approvals_required ?? 3;
  }

  webhookEntries(): Array<{ key: string; label: string; sent_at: string | null | undefined }> {
    const w = this.detailData()?.webhooks_sent ?? {};
    return [
      { key: 'rejected', label: 'Rejet', sent_at: w.rejected },
      { key: 'ready_to_pay', label: 'Bon pour paiement', sent_at: w.ready_to_pay },
      { key: 'payment_in_progress', label: 'Virement lancé', sent_at: w.payment_in_progress },
      { key: 'paid', label: 'Payée', sent_at: w.paid },
      { key: 'reopened', label: 'Reopened', sent_at: w.reopened },
    ];
  }

  // ------------------------------------------------------------------
  // Dialog plumbing (shared with all action templates)
  // ------------------------------------------------------------------

  private openActionDialog(ctx: DialogContext, onConfirm: (ctx: DialogContext) => void): void {
    this.dialogCtx = ctx;
    this.pendingAction = onConfirm;
    this.dialogRef = this.dialog.open(this.actionDialogTpl, {
      width: '560px',
      disableClose: false,
    });
    this.dialogRef.afterClosed().subscribe(() => { this.dialogRef = null; });
  }

  onDialogConfirm(): void {
    if (!this.dialogCtx) return;
    if (!this.dialogValid()) {
      this.snack.open('Veuillez compléter les champs requis', 'OK', { duration: 2500 });
      return;
    }
    const action = this.pendingAction;
    if (action) action(this.dialogCtx);
    this.dialogRef?.close();
  }

  onDialogCancel(): void {
    this.dialogRef?.close();
  }

  dialogValid(): boolean {
    return this.dialogCtx.fields.every(f => {
      if (!f.required) return true;
      const v = (f.value ?? '').toString().trim();
      if (v.length === 0) return false;
      if (f.minLength && v.length < f.minLength) return false;
      // Champ de confirmation strict : exige le mot exact "CONFIRMER".
      if (f.key === 'confirm_word' && v !== 'CONFIRMER') return false;
      return true;
    });
  }

  private afterAction(msg: string): void {
    this.snack.open(msg, 'OK', { duration: 3500 });
    this.pendingAction = null;
    // Refresh current tab to reflect new state
    this.loadTab(this.activeTab());
    // Si le detail dialog est ouvert sur une facture, recharger son contenu
    // (statut + audit trail) pour que le bouton chaud devienne cohérent avec
    // la nouvelle transition. Le PDF n'a pas changé — pas besoin de le refetch.
    if (this.isDetailDialogOpen()) {
      const inv = this.dialogCtx.invoice;
      if (inv) {
        this.api.getInvoiceDetail(inv.uuid).subscribe({
          next: res => this.detailData.set(res.data),
          error: () => {},
        });
        this.api.getAuditTrail(inv.uuid).subscribe({
          next: res => this.detailAudit.set(res.data ?? null),
          error: () => {},
        });
      }
    }
  }

  /** Bouton chaud à afficher dans le header du detail dialog selon le statut courant.
   *  Renvoie null si aucune transition « 1-clic » n'est applicable. */
  detailHotAction(): { label: string; icon: string; color: 'primary' | 'accent' | 'warn'; run: () => void } | null {
    const status = this.detailData()?.invoice?.status ?? this.dialogCtx.invoice?.status ?? '';
    const inv = this.dialogCtx.invoice;
    if (!inv) return null;
    if (status === 'ready_to_pay') {
      return { label: 'Lancer le virement', icon: 'send', color: 'primary', run: () => this.openMarkPaymentInProgress(inv) };
    }
    if (status === 'payment_in_progress') {
      return { label: 'Marquer payée', icon: 'paid', color: 'primary', run: () => this.openMarkPaid(inv) };
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Template helpers (called from HTML)
  // ------------------------------------------------------------------

  fieldValue(ctx: DialogContext, key: string): string {
    return ctx.fields.find(f => f.key === key)?.value ?? '';
  }

  isRejected(inv: AdminInvoice): boolean {
    return inv.status === 'rejected';
  }

  /** Pivot 2026-05-13 : on raisonne en compte d'approbations, plus en rôles. */
  approvalsCount(inv: AdminInvoice): number {
    return (inv as any).approvals_count ?? 0;
  }

  approvalsRequired(inv: AdminInvoice): number {
    return (inv as any).approvals_required ?? 3;
  }

  approvalsMissing(inv: AdminInvoice): number {
    const req = this.approvalsRequired(inv);
    return Math.max(0, req - this.approvalsCount(inv));
  }

  approvalsLabel(inv: AdminInvoice): string {
    return `${this.approvalsCount(inv)}/${this.approvalsRequired(inv)}`;
  }

  approvalProgressClass(inv: AdminInvoice): string {
    const ratio = this.approvalsCount(inv) / Math.max(1, this.approvalsRequired(inv));
    if (ratio >= 1) return 'chip-ok';
    if (ratio >= 0.5) return 'chip-progress';
    return 'chip-pending';
  }

  /** Détermine si une facture est "vieille" en attente de validation (>= 7j). */
  ageDays(inv: AdminInvoice): number {
    return (inv as any).age_days ?? 0;
  }

  staleSeverity(inv: AdminInvoice): 'fresh' | 'warning' | 'critical' {
    const d = this.ageDays(inv);
    if (d >= 14) return 'critical';
    if (d >= 7) return 'warning';
    return 'fresh';
  }

  amountLabel(inv: AdminInvoice): string {
    const raw = inv.amount_ttc;
    if (raw === null || raw === undefined || raw === '') return '—';
    const num = typeof raw === 'string' ? parseFloat(raw) : raw;
    if (Number.isNaN(num)) return String(raw);
    return `${num.toFixed(2)} €`;
  }

  statusLabel(status: string): string {
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
    return map[status] ?? status;
  }

  statusClass(status: string): string {
    return `status-${status}`;
  }

  /**
   * Ouvre la fiche complète du contractor (vue 360°) à partir de son phone.
   * Utilisé depuis la card "Contractor 360°" du modal détail facture.
   */
  navigateToContractor(phone: string): void {
    this.dialog.open(AdminContractorComponent, {
      data: { phone },
      width: '1200px',
      maxWidth: '95vw',
      maxHeight: '92vh',
      panelClass: 'admin-contractor-dialog-panel',
      autoFocus: false,
    });
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return iso;
    }
  }

  prettyJson(value: unknown): string {
    try {
      return JSON.stringify(value ?? null, null, 2);
    } catch {
      return String(value);
    }
  }

  trackByUuid(_idx: number, item: AdminInvoice): string {
    return item.uuid;
  }

  trackByValidator(idx: number, item: { index?: number }): string {
    return String(item.index ?? idx);
  }

  /**
   * Action admin local : valider/rejeter une facture depuis le back-office.
   * Envoie POST /admin/invoices/{uuid}/validate avec `admin_email` dans le
   * body (l'identité admin est lue depuis sessionStorage et passée côté
   * controller pour l'audit, pas via header).
   */
  approveFromBackOffice(inv: AdminInvoice): void {
    void this.submitLocalValidation(inv, 'approved');
  }

  rejectFromBackOffice(inv: AdminInvoice): void {
    void this.submitLocalValidation(inv, 'rejected');
  }

  /**
   * Vérifie que l'admin actor (email + nom) est configuré dans sessionStorage.
   * Sinon ouvre 2 prompts pour le saisir et persiste. Renvoie [email, name] ou null.
   */
  private ensureAdminActorConfigured(): { email: string; name: string } | null {
    let email = sessionStorage.getItem('tuita_admin_actor_email');
    let name = sessionStorage.getItem('tuita_admin_actor_name');

    if (!email) {
      const input = window.prompt(
        'Configurez votre adresse email admin Tuita (audit obligatoire).\n'
        + 'Elle sera persistée dans cette session et envoyée dans le body admin_email lors des validations.',
        '',
      );
      if (!input || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim())) {
        this.snack.open('Adresse email invalide — validation annulée.', 'OK', { duration: 4000 });
        return null;
      }
      email = input.trim();
      sessionStorage.setItem('tuita_admin_actor_email', email);
    }

    if (!name) {
      const input = window.prompt(
        'Votre nom complet (visible côté contractor sur la timeline portail).',
        '',
      );
      if (!input || input.trim().length < 2) {
        this.snack.open('Nom invalide — validation annulée.', 'OK', { duration: 4000 });
        return null;
      }
      name = input.trim();
      sessionStorage.setItem('tuita_admin_actor_name', name);
    }

    return { email, name };
  }

  /** Permet à l'admin de changer son identité (bouton "Changer admin"). */
  resetAdminActor(): void {
    sessionStorage.removeItem('tuita_admin_actor_email');
    sessionStorage.removeItem('tuita_admin_actor_name');
    this.adminActorEmail.set(null);
    this.adminActorName.set(null);
    this.snack.open('Identité admin oubliée — vous serez invité à la ressaisir à la prochaine validation.', 'OK', { duration: 4000 });
  }

  /** Signals pour exposer l'état courant côté template. */
  readonly adminActorEmail = signal<string | null>(sessionStorage.getItem('tuita_admin_actor_email'));
  readonly adminActorName = signal<string | null>(sessionStorage.getItem('tuita_admin_actor_name'));

  private async submitLocalValidation(inv: AdminInvoice, status: 'approved' | 'rejected'): Promise<void> {
    const actor = this.ensureAdminActorConfigured();
    if (!actor) {
      return;
    }
    const { email: actorEmail, name: actorName } = actor;
    this.adminActorEmail.set(actorEmail);
    this.adminActorName.set(actorName);
    const comment = window.prompt(
      status === 'approved'
        ? 'Commentaire optionnel pour valider :'
        : 'Raison du rejet (obligatoire, min 10 caractères) :',
      '',
    );
    if (status === 'rejected' && (!comment || comment.trim().length < 10)) {
      this.snack.open('Rejet annulé — raison trop courte.', 'OK', { duration: 4000 });
      return;
    }
    // `adminInvoicesValidate` expose un body typé `{ decision, admin_email,
    // reason?, reason_code?, correlation_id? }`. L'identité admin est portée
    // par `admin_email` dans le body (lecture côté backend pour l'audit) ;
    // `actorName` reste mémorisé localement pour l'UI uniquement.
    try {
      const body = await this.sdk.invoke(adminInvoicesValidate, {
        uuid: inv.uuid,
        body: {
          decision: status,
          admin_email: actorEmail,
          reason: comment ?? undefined,
        },
      }) as { data?: { approvals_count?: number; approvals_required?: number; invoice_status?: string } };
      const count = body?.data?.approvals_count ?? 0;
      const required = body?.data?.approvals_required ?? 3;
      const newStatus = body?.data?.invoice_status;
      this.snack.open(
        newStatus === 'ready_to_pay'
          ? `Approbation enregistrée — facture bonne pour paiement (${count}/${required}) 🚩`
          : newStatus === 'rejected'
            ? 'Facture rejetée.'
            : `Approbation enregistrée (${count}/${required}).`,
        'OK',
        { duration: 5000 },
      );
      this.refreshCurrent();
    } catch (err: any) {
      const apiMsg = err?.error?.error?.message;
      this.snack.open(apiMsg ?? 'Erreur réseau lors de la validation.', 'OK', { duration: 6000 });
    }
  }

  webhookEvents(sent: AuditTrailDetail['webhooks_sent'] | undefined | null): { event: string; sent_at: string | null }[] {
    const order: (keyof AuditTrailDetail['webhooks_sent'])[] = [
      'rejected', 'ready_to_pay', 'payment_in_progress', 'paid', 'reopened',
    ];
    return order.map(k => ({ event: k, sent_at: sent?.[k] ?? null }));
  }

  trackByFieldKey(_idx: number, item: DialogField): string {
    return item.key;
  }

  // ------------------------------------------------------------------
  // Split view : sélection + PDF pane + raccourcis clavier
  // ------------------------------------------------------------------

  selectInvoice(inv: AdminInvoice): void {
    if (this.selectedInvoice()?.uuid === inv.uuid) return;
    this.selectedInvoice.set(inv);
    this.loadPanePdf(inv);
  }

  private loadPanePdf(inv: AdminInvoice): void {
    this.resetPanePdf();
    this.paneDetailPdfLoading.set(true);
    this.api.downloadInvoicePdf(inv.uuid, true).subscribe({
      next: blob => {
        this.paneDetailPdfLoading.set(false);
        this.panePdfObjectUrl = URL.createObjectURL(blob);
        this.paneDetailPdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.panePdfObjectUrl));
      },
      error: (err: { status?: number; error?: { error?: { code?: string } } }) => {
        this.paneDetailPdfLoading.set(false);
        const code = err?.error?.error?.code ?? '';
        if (code === 'INVOICE_PDF_NOT_FOUND') {
          this.paneDetailPdfError.set('PDF indisponible (upload freemium dont le fichier S3 a été perdu).');
        } else {
          this.paneDetailPdfError.set('Impossible de charger le PDF.');
        }
      },
    });
  }

  private resetPanePdf(): void {
    if (this.panePdfObjectUrl) {
      URL.revokeObjectURL(this.panePdfObjectUrl);
      this.panePdfObjectUrl = null;
    }
    this.paneDetailPdfUrl.set(null);
    this.paneDetailPdfError.set(null);
    this.paneDetailPdfLoading.set(false);
  }

  onFiltersChange(tabKey: TabKey, filters: InvoiceSearchFilters): void {
    this.tabFilters.update(prev => ({ ...prev, [tabKey]: filters }));
    this.loadTab(tabKey);
  }

  goPrev(): void {
    const rows = this.tabs[this.activeTab()]().rows;
    const idx = this.selectedInvoiceIndex();
    if (idx > 0) this.selectInvoice(rows[idx - 1]);
  }

  goNext(): void {
    const rows = this.tabs[this.activeTab()]().rows;
    const idx = this.selectedInvoiceIndex();
    if (idx < rows.length - 1) this.selectInvoice(rows[idx + 1]);
  }

  downloadPaneInvoicePdf(): void {
    const inv = this.selectedInvoice();
    if (!inv || !this.panePdfObjectUrl) return;
    const a = document.createElement('a');
    a.href = this.panePdfObjectUrl;
    a.download = `facture-${inv.number ?? inv.uuid}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(ev: KeyboardEvent): void {
    const target = ev.target as HTMLElement;
    const isInput = target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);

    if (ev.key === 'Escape' && this.showShortcuts()) {
      this.showShortcuts.set(false);
      return;
    }
    if (ev.key === '?' && !isInput) {
      this.showShortcuts.set(true);
      ev.preventDefault();
      return;
    }
    if (isInput) return;

    const detailDialogOpen = this.isDetailDialogOpen();

    switch (ev.key) {
      case 'j': case 'J': case 'ArrowDown':
        if (detailDialogOpen) this.detailGoNext();
        else this.goNext();
        ev.preventDefault(); break;
      case 'k': case 'K': case 'ArrowUp':
        if (detailDialogOpen) this.detailGoPrev();
        else this.goPrev();
        ev.preventDefault(); break;
      case '/': this.focusSearch(); ev.preventDefault(); break;
      case 'r': case 'R': this.refreshCurrent(); ev.preventDefault(); break;
      case '1': this.switchTabByIndex(0); ev.preventDefault(); break;
      case '2': this.switchTabByIndex(1); ev.preventDefault(); break;
      case '3': this.switchTabByIndex(2); ev.preventDefault(); break;
      case '4': this.switchTabByIndex(3); ev.preventDefault(); break;
      case '5': this.switchTabByIndex(4); ev.preventDefault(); break;
      case 'v': case 'V':
        if (this.selectedInvoice()) this.openMarkPaid(this.selectedInvoice()!);
        ev.preventDefault(); break;
      case 'i': case 'I':
        if (this.selectedInvoice()) this.openMarkPaymentInProgress(this.selectedInvoice()!);
        ev.preventDefault(); break;
      case 'd': case 'D':
        this.downloadPaneInvoicePdf();
        ev.preventDefault(); break;
      case 'o': case 'O':
        if (this.selectedInvoice()) this.openDetail(this.selectedInvoice()!);
        ev.preventDefault(); break;
      case 'c': case 'C': {
        const iban = this.selectedInvoice()?.rib?.iban;
        if (iban) navigator.clipboard.writeText(iban.replace(/\s+/g, ''));
        ev.preventDefault(); break;
      }
    }
  }

  private switchTabByIndex(idx: number): void {
    const order: TabKey[] = ['pending', 'ready', 'inprogress', 'disputed', 'all'];
    const tab = order[idx];
    if (tab) {
      this.activeTab.set(tab);
      this.initialTabIndex.set(idx);
      this.selectedInvoice.set(null);
      this.resetPanePdf();
      if (this.tabs[tab]().rows.length === 0) {
        this.loadTab(tab);
      } else {
        const firstRow = this.tabs[tab]().rows[0];
        if (firstRow) this.selectInvoice(firstRow);
      }
    }
  }

  private focusSearch(): void {
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>('app-admin-invoice-filter-bar input[matInput]');
      el?.focus();
    });
  }

  // ------------------------------------------------------------------
  // Misc helpers
  // ------------------------------------------------------------------

  private emptyState(): TabState {
    return { page: 1, perPage: 20, total: 0, loading: false, rows: [] };
  }

  private emptyDialogCtx(): DialogContext {
    return {
      title: '',
      body: '',
      confirmLabel: 'Confirmer',
      cancelLabel: 'Annuler',
      danger: false,
      fields: [],
      invoice: null,
      detailJson: '',
    };
  }

  private todayIso(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
