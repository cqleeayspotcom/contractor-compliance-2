import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar } from '@angular/material/snack-bar';

import { Api } from '../../api/api';
import { adminDashboardOverview } from '../../api/fn/admin/admin-dashboard-overview';
import { adminComplianceStats } from '../../api/fn/admin/admin-compliance-stats';
import { adminSignupAttemptsList } from '../../api/fn/admin/admin-signup-attempts-list';
import { adminHealth } from '../../api/fn/admin-supervision/admin-health';

// ---------------------------------------------------------------------------
// Types — shapes attendues dans `data` côté backend (cf. AdminDashboardController,
// AdminSupervisionController, AdminComplianceStatsController).
// SuccessEnvelope du SDK renvoie `{ success, data, message? }` typé loosement
// en JsonObject ; on caste vers ces interfaces locales pour piloter le template.
// ---------------------------------------------------------------------------

interface BackendHealthEntry {
  status: string;
  latency_ms?: number | null;
  note?: string;
}

interface HealthData {
  overall: string;
  services: Record<string, BackendHealthEntry>;
  checked_at: string;
}

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latency_ms: number | null;
}

interface ComplianceStats {
  total_contractors: number;
  verified_percentage: number;
  documents_verified: number;
  avg_processing_time_seconds: number;
  account_states: Record<string, number>;
}

interface PipelineBucket {
  count: number;
  total_amount: number;
  currency: string;
}

interface DashboardOverview {
  pipeline: {
    validating: PipelineBucket;
    draft: PipelineBucket;
    pending_payment_validation: PipelineBucket & { aging_buckets?: { '0_3d': number; '3_7d': number; '7_plus': number } };
    ready_to_pay: PipelineBucket;
    payment_in_progress: PipelineBucket;
    paid_today: PipelineBucket;
    rejected_today: PipelineBucket;
  };
  alerts: {
    stuck_pending_validation_critical: number;
    stuck_ready_to_pay_critical: number;
    stuck_payment_in_progress_critical: number;
    failed_jobs_count: number;
    webhooks_dead_count: number;
    open_circuit_breakers: { service: string; opened_at: string | null }[];
    paid_disputed_open_count: number;
    free_invoices_pending_count?: number;
    free_invoices_pending_amount?: number;
    stuck_purchases_count?: number;
  };
  today_to_pay: {
    count: number;
    total_amount: number;
    currency: string;
    oldest_ready_since: string | null;
  };
}

// Champs exposés par AdminSignupAttemptsController::indexAction (PHP).
// ATTENTION : l'inscription contractor se fait par téléphone + code
// d'invitation — il n'y a PAS d'email dans une tentative d'inscription.
interface SignupAttemptRow {
  uuid: string;
  code_input?: string | null;
  phone_input?: string | null;
  status?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  siren?: string | null;
  failure_detail?: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@Component({
  selector: 'app-contractor-admin',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
  ],
  templateUrl: './contractor-admin.component.html',
  styleUrl: './contractor-admin.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorAdminComponent implements OnInit, OnDestroy {
  private readonly api = inject(Api);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  // POURQUOI un timer plutôt qu'un polling RxJS : le composant n'est monté
  // que sur /admin (root du back-office), refresh 30s suffisant pour des KPIs
  // de productivité du jour. Pas besoin d'une stream Observable.
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  // ---------------------------------------------------------------------------
  // Auth — gérée en amont par `adminAuthGuard` + page /admin/login
  // (flow OAuth2 mysession Tuita). `adminKeyInterceptor` injecte
  // `Authorization: Bearer <token>` sur tout /contractor-compliance/admin/*.
  // Si on rend ce composant, le token est valide ; sinon le guard a déjà
  // redirigé vers /admin/login.
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Data signals — tous initialisés à des objets/listes vides pour éviter les
  // accès à `null` dans le template (un crash Angular au premier render).
  // ---------------------------------------------------------------------------

  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly healthServices = signal<ServiceHealth[]>([]);
  readonly complianceStats = signal<ComplianceStats | null>(null);
  readonly overview = signal<DashboardOverview | null>(null);
  readonly signupAttempts = signal<SignupAttemptRow[]>([]);
  readonly infraCollapsed = signal<boolean>(true);

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  readonly accountStateEntries = computed(() => {
    const stats = this.complianceStats();
    if (!stats || !stats.account_states) return [];
    return Object.entries(stats.account_states).map(([key, value]) => ({ key, value }));
  });

  readonly accountStateTotal = computed(() => {
    return this.accountStateEntries().reduce((sum, e) => sum + e.value, 0);
  });

  readonly signupAttemptColumns = ['created_at', 'phone', 'name', 'status', 'reason'];

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  ngOnInit(): void {
    this.loadAll();
    this.refreshTimer = setInterval(() => this.loadAll(), 30_000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  logout(): void {
    // Purge la triple-clé OAuth2 admin (cf. admin-login.component) puis
    // bascule sur la page de login. Le guard reprendra la main au prochain
    // accès aux routes /admin/*.
    sessionStorage.removeItem('tuita_admin_token');
    sessionStorage.removeItem('tuita_admin_refresh');
    sessionStorage.removeItem('tuita_admin_user');
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.router.navigate(['/admin/login']);
  }

  refreshAll(): void {
    this.loadAll();
  }

  toggleInfra(): void {
    this.infraCollapsed.update((v) => !v);
  }

  // ---------------------------------------------------------------------------
  // Loaders SDK — tous via Api.invoke(fn) ; aucun raw HttpClient (l'interceptor
  // ajoute le Bearer, mais le SDK garde la signature typée + le centralise).
  // ---------------------------------------------------------------------------

  private loadAll(): void {
    this.isLoading.set(true);
    this.error.set(null);
    // Lancements en parallèle ; chaque promise gère ses propres erreurs.
    void Promise.allSettled([
      this.loadOverview(),
      this.loadHealth(),
      this.loadComplianceStats(),
      this.loadSignupAttempts(),
    ]).then(() => this.isLoading.set(false));
  }

  private async loadOverview(): Promise<void> {
    try {
      const res = await this.api.invoke(adminDashboardOverview);
      const data = (res as { data?: Partial<DashboardOverview> })?.data ?? null;
      // Si le backend renvoie un payload partiel (ancienne version de
      // l'endpoint qui n'expose pas encore pipeline/alerts/today_to_pay),
      // on remplit les trous avec une structure neutre pour que le
      // template ne crashe pas sur `ov.pipeline.*`.
      this.overview.set(data ? this.normalizeOverview(data) : null);
    } catch (err) {
      this.overview.set(null);
      this.handleError(err, 'overview');
    }
  }

  /** Remplit pipeline/alerts/today_to_pay avec des zéros si absents. */
  private normalizeOverview(data: Partial<DashboardOverview>): DashboardOverview {
    const emptyBucket: PipelineBucket = { count: 0, total_amount: 0, currency: 'EUR' };
    return {
      pipeline: {
        validating:                 emptyBucket,
        draft:                      emptyBucket,
        pending_payment_validation: { ...emptyBucket, aging_buckets: { '0_3d': 0, '3_7d': 0, '7_plus': 0 } },
        ready_to_pay:               emptyBucket,
        payment_in_progress:        emptyBucket,
        paid_today:                 emptyBucket,
        rejected_today:             emptyBucket,
        ...(data.pipeline ?? {}),
      },
      alerts: {
        stuck_pending_validation_critical: 0,
        stuck_ready_to_pay_critical: 0,
        stuck_payment_in_progress_critical: 0,
        failed_jobs_count: 0,
        webhooks_dead_count: 0,
        open_circuit_breakers: [],
        paid_disputed_open_count: 0,
        ...(data.alerts ?? {}),
      },
      today_to_pay: {
        count: 0,
        total_amount: 0,
        currency: 'EUR',
        oldest_ready_since: null,
        ...(data.today_to_pay ?? {}),
      },
    };
  }

  private async loadHealth(): Promise<void> {
    try {
      const res = await this.api.invoke(adminHealth);
      const data = (res as { data?: HealthData })?.data;
      const raw = data?.services ?? {};
      const services: ServiceHealth[] = Object.entries(raw).map(([name, entry]) => ({
        name,
        status: this.normalizeHealthStatus(entry?.status),
        latency_ms: entry?.latency_ms ?? null,
      }));
      this.healthServices.set(services);
    } catch (err) {
      this.healthServices.set([]);
      this.handleError(err, 'health');
    }
  }

  private async loadComplianceStats(): Promise<void> {
    try {
      const res = await this.api.invoke(adminComplianceStats);
      const d = (res as { data?: any })?.data ?? {};
      const docsByStatus: Record<string, number> = d.documents?.by_status ?? {};
      const documentsVerified = Number(docsByStatus['verified'] ?? 0);
      const total = Number(d.contractors?.total ?? 0);
      const byState: Record<string, number> = d.contractors?.by_state ?? {};
      const verifiedCount = Number(byState['verified'] ?? 0) + Number(byState['active'] ?? 0);
      const verifiedPct = total > 0 ? Math.round((verifiedCount / total) * 1000) / 10 : 0;

      this.complianceStats.set({
        total_contractors: total,
        verified_percentage: verifiedPct,
        documents_verified: documentsVerified,
        avg_processing_time_seconds: Number(d.performance?.avg_validation_seconds ?? 0),
        account_states: byState,
      });
    } catch (err) {
      this.complianceStats.set(null);
      this.handleError(err, 'compliance');
    }
  }

  private async loadSignupAttempts(): Promise<void> {
    try {
      const res = await this.api.invoke(adminSignupAttemptsList);
      const rows = (res as { data?: SignupAttemptRow[] })?.data ?? [];
      // Limité aux 20 plus récents — le backend renvoie déjà trié desc, on
      // tronque côté client pour éviter de surcharger l'UI dashboard.
      this.signupAttempts.set(rows.slice(0, 20));
    } catch (err) {
      this.signupAttempts.set([]);
      this.handleError(err, 'signup-attempts');
    }
  }

  private normalizeHealthStatus(raw: string | undefined): ServiceHealth['status'] {
    switch (raw) {
      case 'ok':
      case 'healthy':
        return 'healthy';
      case 'degraded':
        return 'degraded';
      case 'down':
      case 'critical':
        return 'down';
      default:
        return 'down';
    }
  }

  private handleError(err: unknown, context: string): void {
    const httpErr = err as { status?: number; message?: string };
    if (httpErr.status === 401 || httpErr.status === 403) {
      // Bearer absent ou expiré → on délègue à logout() qui purge + redirige.
      this.snack.open('Session admin expirée. Reconnectez-vous.', 'OK', { duration: 4000 });
      this.logout();
      return;
    }
    console.error(`[admin] Error loading ${context}`, err);
  }

  // ---------------------------------------------------------------------------
  // View helpers
  // ---------------------------------------------------------------------------

  formatEur(value: number | null | undefined): string {
    if (value == null) return '—';
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
  }

  agingDays(iso: string | null): number | null {
    if (!iso) return null;
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return null;
    return Math.floor((Date.now() - then) / 86_400_000);
  }

  hasAnyAlert(): boolean {
    const a = this.overview()?.alerts;
    if (!a) return false;
    return (
      a.stuck_pending_validation_critical > 0 ||
      a.stuck_ready_to_pay_critical > 0 ||
      a.stuck_payment_in_progress_critical > 0 ||
      a.failed_jobs_count > 0 ||
      a.webhooks_dead_count > 0 ||
      a.open_circuit_breakers.length > 0 ||
      a.paid_disputed_open_count > 0 ||
      (a.free_invoices_pending_count ?? 0) > 0 ||
      (a.stuck_purchases_count ?? 0) > 0
    );
  }

  goToStuckInvoices(tab: 'pending' | 'ready' | 'inprogress' | 'all' = 'all'): void {
    this.router.navigate(['/admin/invoices'], { queryParams: { tab, filter: 'stuck' } });
  }

  // Tuile "Aujourd'hui" → /admin/invoices filtré sur l'onglet correspondant
  // mais sans le filtre "stuck" (volumes globaux du jour, pas anomalies).
  goToInvoicesTab(tab: 'pending' | 'ready' | 'inprogress' | 'all'): void {
    this.router.navigate(['/admin/invoices'], { queryParams: { tab } });
  }

  goToFreeInvoicesPending(): void {
    this.router.navigate(['/admin/free-invoices']);
  }

  goToStuckPurchases(): void {
    this.router.navigate(['/admin/purchases'], { queryParams: { status: 'pending', stuck: 1 } });
  }

  healthIcon(status: string): string {
    if (status === 'healthy') return 'check_circle';
    if (status === 'degraded') return 'warning';
    return 'error';
  }

  healthColor(status: string): string {
    if (status === 'healthy') return '#04A777';
    if (status === 'degraded') return '#F75C03';
    return '#DC2626';
  }

  serviceIcon(name: string): string {
    const icons: Record<string, string> = {
      database: 'storage',
      redis: 'memory',
      storage: 'cloud',
      ocr: 'document_scanner',
    };
    return icons[name.toLowerCase()] ?? 'dns';
  }

  accountStateLabel(key: string): string {
    const labels: Record<string, string> = {
      new: 'Nouveau',
      documents_pending: 'Docs en attente',
      kyc_pending: 'KYC en attente',
      fully_verified: 'Vérifié',
      suspended: 'Suspendu',
    };
    return labels[key] ?? key;
  }

  accountStateColor(key: string): string {
    switch (key) {
      case 'fully_verified': return '#04A777';
      case 'suspended': return '#DC2626';
      case 'new': return '#699CBE';
      default: return '#F75C03';
    }
  }

  accountStateBarPercent(value: number): number {
    const total = this.accountStateTotal();
    return total > 0 ? (value / total) * 100 : 0;
  }

  formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}m ${secs}s`;
  }

  trackByName(_index: number, item: ServiceHealth): string {
    return item.name;
  }

  trackByKey(_index: number, item: { key: string }): string {
    return item.key;
  }

  trackBySignup(_index: number, item: SignupAttemptRow): string {
    return item.uuid;
  }

  /** Nom complet de la tentative, ou '—' si non renseigné (échec précoce). */
  signupName(row: SignupAttemptRow): string {
    const full = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
    return full || '—';
  }

  /** Libellé FR du statut d'une tentative d'inscription (valeurs brutes
   *  côté backend : cf. enum SignupAttemptStatus). */
  signupStatusLabel(status: string | null | undefined): string {
    const labels: Record<string, string> = {
      success: 'Réussie',
      invalid_format: 'Format invalide',
      validation_failed: 'Validation échouée',
      code_not_found: 'Code introuvable',
      code_expired: 'Code expiré',
      code_revoked: 'Code révoqué',
      code_exhausted: 'Code déjà utilisé',
      phone_already_registered: 'Téléphone déjà inscrit',
      siren_not_found: 'SIREN introuvable',
      siren_closed: 'SIREN radié',
      siren_name_mismatch: 'Nom ≠ SIREN',
      siren_out_of_sector: 'Secteur non éligible',
      internal_error: 'Erreur interne',
    };
    return status ? (labels[status] ?? status) : '—';
  }

  /** Tonalité visuelle du statut : 'ok' = succès, 'error' = bug serveur,
   *  'warn' = refus métier (code/SIREN/téléphone). */
  signupStatusTone(status: string | null | undefined): 'ok' | 'warn' | 'error' {
    if (status === 'success') return 'ok';
    if (status === 'internal_error') return 'error';
    return 'warn';
  }
}
