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
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { DlqReplayDialogComponent, DlqReplayDialogResult } from './dlq-replay-dialog.component';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'ok';
  latency_ms: number | null;
}

interface BackendHealthEntry {
  status: string;
  latency_ms?: number | null;
  note?: string;
}

interface HealthResponse {
  success: boolean;
  data: {
    overall: string;
    services: Record<string, BackendHealthEntry>;
    checked_at: string;
  };
}

interface QueueStatus {
  pending: number;
  processing: number;
  failed: number;
}

interface WebhookLog {
  id: string;
  event_type: string;
  status: 'sent' | 'failed' | 'retrying' | 'dead';
  attempts: number;
  response_status: number | null;
  created_at: string;
}

interface CircuitBreaker {
  service: string;
  state: 'closed' | 'open' | 'half_open';
  opened_at: string | null;
  failure_count: number;
}

interface StuckCounts {
  pending_validation_over_7d: number;
  ready_to_pay_over_3d: number;
  ready_to_pay_over_14d: number;
  payment_in_progress_over_5d: number;
  payment_in_progress_over_10d: number;
  total: number;
}

interface StuckCountsBackend {
  by_status?: {
    validating?: { warning?: number; critical?: number };
    pending_payment_validation?: { warning?: number; critical?: number };
    ready_to_pay?: { warning?: number; critical?: number };
    payment_in_progress?: { warning?: number; critical?: number };
  };
  total_warning?: number;
  total_critical?: number;
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

type WebhookFilter = 'all' | 'sent' | 'failed' | 'dead' | 'retrying';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@Component({
  selector: 'app-contractor-admin',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatSortModule,
    MatTableModule,
    MatInputModule,
    MatFormFieldModule,
    MatDialogModule,
    MatSnackBarModule,
  ],
  templateUrl: './contractor-admin.component.html',
  styleUrl: './contractor-admin.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorAdminComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private stuckTimer: ReturnType<typeof setInterval> | null = null;

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  readonly apiKey = signal<string>(sessionStorage.getItem('tuita_admin_key') ?? '');
  readonly isAuthenticated = computed(() => this.apiKey().length > 0 && this.authConfirmed());
  readonly authConfirmed = signal<boolean>(!!sessionStorage.getItem('tuita_admin_key'));
  apiKeyInput = '';

  // ---------------------------------------------------------------------------
  // Data signals
  // ---------------------------------------------------------------------------

  readonly isLoading = signal(false);
  readonly healthServices = signal<ServiceHealth[]>([]);
  readonly queueStatus = signal<QueueStatus>({ pending: 0, processing: 0, failed: 0 });
  readonly webhookLogs = signal<WebhookLog[]>([]);
  readonly circuitBreakers = signal<CircuitBreaker[]>([]);
  readonly complianceStats = signal<ComplianceStats | null>(null);
  readonly webhookFilter = signal<WebhookFilter>('all');
  readonly error = signal<string | null>(null);
  readonly failedTasksList = signal<{ id: string | number; [key: string]: any }[]>([]);
  readonly stuckCounts = signal<StuckCounts | null>(null);
  readonly overview = signal<DashboardOverview | null>(null);
  readonly infraCollapsed = signal<boolean>(true);

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  readonly filteredWebhookLogs = computed(() => {
    const filter = this.webhookFilter();
    const logs = this.webhookLogs();
    if (filter === 'all') return logs;
    return logs.filter(l => l.status === filter);
  });

  // Tri server-side de la table webhooks : `sort` + `direction` envoyÃ©s au
  // backend (whitelist alignÃ©e avec AdminSupervisionController::webhookLogs).
  // Couvre toutes les pages â€” filtre `webhookFilter` cÃ´tÃ© frontend reste
  // appliquÃ© au sous-ensemble retournÃ©.
  readonly webhookSort = signal<string>('created_at');
  readonly webhookDirection = signal<'asc' | 'desc'>('desc');

  readonly queueTotal = computed(() => {
    const q = this.queueStatus();
    return q.pending + q.processing + q.failed;
  });

  readonly accountStateEntries = computed(() => {
    const stats = this.complianceStats();
    if (!stats || !stats.account_states) return [];
    return Object.entries(stats.account_states).map(([key, value]) => ({ key, value }));
  });

  readonly accountStateTotal = computed(() => {
    return this.accountStateEntries().reduce((sum, e) => sum + e.value, 0);
  });

  readonly webhookDisplayedColumns = ['event_type', 'status', 'attempts', 'response_status', 'created_at', 'actions'];

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  ngOnInit(): void {
    if (this.isAuthenticated()) {
      this.loadAll();
      this.refreshTimer = setInterval(() => this.loadAll(), 30_000);
      this.stuckTimer = setInterval(() => this.loadStuckCounts(), 60_000);
    }
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    if (this.stuckTimer) {
      clearInterval(this.stuckTimer);
    }
  }

  // ---------------------------------------------------------------------------
  // Auth actions
  // ---------------------------------------------------------------------------

  submitApiKey(): void {
    if (!this.apiKeyInput.trim()) return;
    const key = this.apiKeyInput.trim();
    sessionStorage.setItem('tuita_admin_key', key);
    this.apiKey.set(key);
    this.authConfirmed.set(true);
    this.loadAll();
    this.refreshTimer = setInterval(() => this.loadAll(), 30_000);
    this.stuckTimer = setInterval(() => this.loadStuckCounts(), 60_000);
  }

  logout(): void {
    sessionStorage.removeItem('tuita_admin_key');
    this.apiKey.set('');
    this.authConfirmed.set(false);
    this.apiKeyInput = '';
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.stuckTimer) {
      clearInterval(this.stuckTimer);
      this.stuckTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // HTTP helpers
  // ---------------------------------------------------------------------------

  private headers(): HttpHeaders {
    return new HttpHeaders({ 'X-Tuita-Admin-Key': this.apiKey() });
  }

  private loadAll(): void {
    this.isLoading.set(true);
    this.error.set(null);
    this.loadHealth();
    this.loadQueues();
    this.loadFailedTasks();
    this.loadWebhooks();
    this.loadCircuitBreakers();
    this.loadComplianceStats();
    this.loadStuckCounts();
    this.loadOverview();
  }

  private loadOverview(): void {
    this.http
      .get<{ data: DashboardOverview }>('/contractor-compliance/admin/dashboard/overview', {
        headers: this.headers(),
      })
      .subscribe({
        next: (res) => this.overview.set(res.data),
        error: (err) => {
          this.overview.set(null);
          this.handleError(err, 'overview');
        },
      });
  }

  toggleInfra(): void {
    this.infraCollapsed.update((v) => !v);
  }

  formatEur(value: number | null | undefined): string {
    if (value == null) return 'â€”';
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

  private loadStuckCounts(): void {
    this.http
      .get<{ data: StuckCountsBackend }>('/contractor-compliance/admin/invoices/stuck/counts', {
        headers: this.headers(),
      })
      .subscribe({
        next: (res) => this.stuckCounts.set(this.mapStuckCounts(res.data)),
        error: (err) => {
          this.stuckCounts.set(null);
          this.handleError(err, 'stuck-counts');
        },
      });
  }

  private mapStuckCounts(d: StuckCountsBackend | undefined): StuckCounts | null {
    if (!d) return null;
    const bs = d.by_status ?? {};
    const ppvCritical = bs.pending_payment_validation?.critical ?? 0;
    const rtpWarning = bs.ready_to_pay?.warning ?? 0;
    const rtpCritical = bs.ready_to_pay?.critical ?? 0;
    const pipWarning = bs.payment_in_progress?.warning ?? 0;
    const pipCritical = bs.payment_in_progress?.critical ?? 0;
    return {
      pending_validation_over_7d: ppvCritical,
      ready_to_pay_over_3d: rtpWarning,
      ready_to_pay_over_14d: rtpCritical,
      payment_in_progress_over_5d: pipWarning,
      payment_in_progress_over_10d: pipCritical,
      total: ppvCritical + rtpWarning + rtpCritical + pipWarning + pipCritical,
    };
  }

  goToStuckInvoices(tab: 'pending' | 'ready' | 'inprogress' | 'all' = 'all'): void {
    this.router.navigate(['/admin/invoices'], { queryParams: { tab, filter: 'stuck' } });
  }

  /** Redirige vers /admin/invoices filtrÃ© sur la tab demandÃ©e â€” SANS le filtre stuck.
   *  UtilisÃ© par les tuiles "Aujourd'hui" qui montrent les volumes globaux du jour,
   *  pas les anomalies. */
  goToInvoicesTab(tab: 'pending' | 'ready' | 'inprogress' | 'all'): void {
    this.router.navigate(['/admin/invoices'], { queryParams: { tab } });
  }

  goToFreeInvoicesPending(): void {
    this.router.navigate(['/admin/free-invoices']);
  }

  goToStuckPurchases(): void {
    this.router.navigate(['/admin/purchases'], { queryParams: { status: 'pending', stuck: 1 } });
  }

  replayAllDeadLetters(): void {
    const ref = this.dialog.open<
      DlqReplayDialogComponent,
      undefined,
      DlqReplayDialogResult | undefined
    >(DlqReplayDialogComponent, {
      width: '560px',
      disableClose: true,
    });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.http
        .post<{ data?: { replayed_count?: number }; replayed_count?: number; message?: string }>(
          '/contractor-compliance/admin/webhooks/dead-letter/replay-all',
          { reason: result.reason },
          { headers: this.headers() },
        )
        .subscribe({
          next: (res) => {
            const count =
              res?.data?.replayed_count ?? res?.replayed_count ?? null;
            const msg =
              count !== null
                ? `${count} webhook(s) relancÃ©(s) depuis la DLQ`
                : (res?.message ?? 'Replay massif lancÃ©');
            this.snack.open(msg, 'Fermer', { duration: 5000 });
            this.loadWebhooks();
          },
          error: (err) => {
            this.snack.open('Erreur lors du replay massif', 'Fermer', { duration: 4000 });
            this.handleError(err, 'dlq-replay-all');
          },
        });
    });
  }

  private loadHealth(): void {
    this.http.get<HealthResponse>('/contractor-compliance/admin/health', { headers: this.headers() })
      .subscribe({
        next: res => {
          const raw = res?.data?.services ?? {};
          const services: ServiceHealth[] = Object.entries(raw).map(([name, entry]) => ({
            name,
            status: this.normalizeHealthStatus(entry?.status),
            latency_ms: entry?.latency_ms ?? null,
          }));
          this.healthServices.set(services);
        },
        error: err => {
          this.healthServices.set([]);
          this.handleError(err, 'health');
        },
      });
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

  private loadFailedTasks(): void {
    this.http.get<{ data: any[] }>('/contractor-compliance/admin/tasks/failed', { headers: this.headers() })
      .subscribe({
        next: res => this.failedTasksList.set(res.data ?? []),
        error: err => this.handleError(err, 'failed-tasks'),
      });
  }

  private loadQueues(): void {
    this.http.get<{ data: QueueStatus }>('/contractor-compliance/admin/queues/status', { headers: this.headers() })
      .subscribe({
        next: res => this.queueStatus.set(res.data),
        error: err => this.handleError(err, 'queues'),
      });
  }

  private loadWebhooks(): void {
    let params = new HttpParams()
      .set('sort', this.webhookSort())
      .set('direction', this.webhookDirection());
    this.http.get<{ data: WebhookLog[] }>('/contractor-compliance/admin/webhooks/logs', { headers: this.headers(), params })
      .subscribe({
        next: res => {
          this.webhookLogs.set(res.data);
          this.isLoading.set(false);
        },
        error: err => {
          this.isLoading.set(false);
          this.handleError(err, 'webhooks');
        },
      });
  }

  private loadCircuitBreakers(): void {
    this.http.get<{ data: CircuitBreaker[] }>('/contractor-compliance/admin/circuit-breakers', { headers: this.headers() })
      .subscribe({
        next: res => {
          this.circuitBreakers.set(res?.data ?? []);
        },
        error: err => this.handleError(err, 'circuit-breakers'),
      });
  }

  private loadComplianceStats(): void {
    this.http.get<{ data: any }>('/contractor-compliance/admin/compliance/stats', { headers: this.headers() })
      .subscribe({
        next: res => {
          const d = res?.data ?? {};
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
        },
        error: err => {
          this.complianceStats.set(null);
          this.handleError(err, 'compliance');
        },
      });
  }

  private handleError(err: unknown, context: string): void {
    const httpErr = err as { status?: number; message?: string };
    if (httpErr.status === 401 || httpErr.status === 403) {
      this.error.set('Cle d\'administration invalide.');
      this.logout();
    } else {
      console.error(`[admin] Error loading ${context}`, err);
    }
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  retryFailedTask(taskId: string | number): void {
    this.http.post(`/contractor-compliance/admin/tasks/${taskId}/retry`, {}, { headers: this.headers() })
      .subscribe({
        next: () => {
          this.loadQueues();
          this.loadFailedTasks();
        },
        error: err => this.handleError(err, 'retry-task'),
      });
  }

  retryAllFailed(): void {
    const tasks = this.failedTasksList();
    if (tasks.length === 0) return;
    // Retry each failed task individually (backend has no bulk retry)
    tasks.forEach(task => this.retryFailedTask(task.id));
  }

  replayWebhook(log: WebhookLog): void {
    this.http.post(`/contractor-compliance/admin/webhooks/${log.id}/replay`, {}, { headers: this.headers() })
      .subscribe({
        next: () => this.loadWebhooks(),
        error: err => this.handleError(err, 'replay-webhook'),
      });
  }

  forceCloseCircuit(cb: CircuitBreaker): void {
    // Note: Backend n'a pas d'endpoint pour fermer un circuit breaker.
    // Les circuits se ferment automatiquement aprÃ¨s RECOVERY_TIMEOUT (300s).
    // Ce bouton rafraichit l'Ã©tat pour vÃ©rifier si le circuit s'est refermÃ©.
    this.loadCircuitBreakers();
  }

  setWebhookFilter(filter: WebhookFilter): void {
    this.webhookFilter.set(filter);
  }

  refreshAll(): void {
    this.loadAll();
  }

  // ---------------------------------------------------------------------------
  // View helpers
  // ---------------------------------------------------------------------------

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

  queueBarPercent(value: number): number {
    const total = this.queueTotal();
    return total > 0 ? (value / total) * 100 : 0;
  }

  webhookStatusColor(status: string): string {
    switch (status) {
      case 'sent': return '#04A777';
      case 'failed': return '#DC2626';
      case 'retrying': return '#F75C03';
      case 'dead': return '#1a1a1a';
      default: return '#888';
    }
  }

  webhookStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      sent: 'Envoye',
      failed: 'Echoue',
      retrying: 'Relance',
      dead: 'Mort',
    };
    return labels[status] ?? status;
  }

  canReplay(log: WebhookLog): boolean {
    return log.status === 'failed' || log.status === 'dead';
  }

  circuitStateLabel(state: string): string {
    if (state === 'closed') return 'OK';
    if (state === 'open') return 'OUVERT';
    return 'DEMI-OUVERT';
  }

  circuitStateColor(state: string): string {
    if (state === 'closed') return '#04A777';
    if (state === 'half_open') return '#F75C03';
    return '#DC2626';
  }

  circuitIcon(service: string): string {
    const icons: Record<string, string> = {
      mistral: 'auto_awesome',
      pappers: 'article',
      deepface: 'face',
      'tuita.fr': 'language',
      tuita_main: 'language',
      urssaf_avcs: 'verified_user',
    };
    return icons[service.toLowerCase()] ?? 'electrical_services';
  }

  circuitLabel(service: string): string {
    const labels: Record<string, string> = {
      mistral: 'Mistral',
      pappers: 'Pappers',
      deepface: 'DeepFace',
      tuita_main: 'tuita.fr',
      'tuita.fr': 'tuita.fr',
      urssaf_avcs: 'URSSAF AVCS',
    };
    return labels[service.toLowerCase()] ?? service;
  }

  accountStateLabel(key: string): string {
    const labels: Record<string, string> = {
      new: 'Nouveau',
      documents_pending: 'Docs en attente',
      kyc_pending: 'KYC en attente',
      fully_verified: 'VÃ©rifiÃ©',
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

  trackByService(_index: number, item: CircuitBreaker): string {
    return item.service;
  }

  trackById(_index: number, item: WebhookLog): string {
    return item.id;
  }

  onWebhookSortChange(s: Sort): void {
    if (!s.active || !s.direction) {
      this.webhookSort.set('created_at');
      this.webhookDirection.set('desc');
    } else {
      this.webhookSort.set(s.active);
      this.webhookDirection.set(s.direction);
    }
    this.loadWebhooks();
  }

  trackByKey(_index: number, item: { key: string }): string {
    return item.key;
  }
}
