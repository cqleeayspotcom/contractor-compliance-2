import { Component, ChangeDetectionStrategy, DestroyRef, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ContractorApiService } from '../../services/contractor-api.service';
import { MissionPickerComponent, MissionPickerSelection } from '../../components/shared/mission-picker.component';
import { BackButtonComponent } from '../../components/shared/back-button/back-button.component';
import { SkeletonComponent } from '../../components/shared/skeleton.component';
import { ContractorSessionService } from '../../services/contractor-session.service';
import { RealtimeService } from '../../services/realtime.service';
import { RefreshService } from '../../services/refresh.service';
import {
  InvoiceRejectionCopy,
  getInvoiceRejectionCopy,
} from './invoice-rejection-messages';

interface InvoiceMission {
  title: string;
  operation_type: string;
  city: string;
  address: string;
  visit_date: string | null;
  mid: string;
}

interface ValidationProgress {
  approved_count: number;
  total: number;
  approved_types: Array<'compliance' | 'production' | 'accounting'>;
}

interface Invoice {
  uuid: string;
  invoice_number: string;
  status: string;
  amount_ht: number;
  amount_ttc: number;
  amount_tva?: number | null;
  currency: string;
  mission_ref: string;
  issued_at: string;
  source: 'auto_generated' | 'manual_upload';
  is_rejected?: boolean;
  mission?: InvoiceMission;
  created_at: string;
  // Rejet freemium — exposés par /contractor/invoices quand status=rejected
  rejection_reason?: string | null;
  rejection_details?: string[] | null;
  pages_count?: number | null;
  // Progression des 3 validateurs humains (compliance + production + accounting)
  // — exposée uniquement quand status=pending_payment_validation
  validation_progress?: ValidationProgress | null;
}

interface InvoiceStats {
  total_invoices: number;
  total_amount_ttc: number;
  pending_payment_validation: number;
  ready_to_pay: number;
  payment_in_progress: number;
  paid: number;
  rejected: number;
}

type FilterKey =
  | 'all'
  | 'pending_payment_validation'
  | 'ready_to_pay'
  | 'payment_in_progress'
  | 'paid'
  | 'rejected';

@Component({
  selector: 'app-contractor-invoices',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatPaginatorModule,
    MissionPickerComponent,
    BackButtonComponent,
    SkeletonComponent,
  ],
  templateUrl: './contractor-invoices.component.html',
  styleUrl: './contractor-invoices.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorInvoicesComponent implements OnInit, OnDestroy {
  private readonly api = inject(ContractorApiService);
  readonly session = inject(ContractorSessionService);
  private readonly realtime = inject(RealtimeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly refreshBus = inject(RefreshService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly snack = inject(MatSnackBar);

  readonly invoices = signal<Invoice[]>([]);
  readonly stats = signal<InvoiceStats>({
    total_invoices: 0,
    total_amount_ttc: 0,
    pending_payment_validation: 0,
    ready_to_pay: 0,
    payment_in_progress: 0,
    paid: 0,
    rejected: 0,
  });
  readonly isLoading = signal(true);
  readonly activeFilter = signal<FilterKey>('all');
  readonly errorMessage = signal<string | null>(null);

  // Upload form (plan gratuit uniquement)
  // Pagination
  readonly currentPage = signal(1);
  readonly totalItems = signal(0);
  readonly lastPage = signal(1);
  readonly perPage = signal(15);

  // Upload form (plan gratuit uniquement)
  readonly isUploading = signal(false);
  readonly uploadFile = signal<File | null>(null);
  readonly showUploadForm = signal(false);
  readonly reuploadingInvoice = signal<Invoice | null>(null);
  /** UUID de la facture renvoyée par le dernier upload (succès OU rejet) —
   *  permet de surligner la carte correspondante dans la liste pour que le
   *  contractor comprenne immédiatement « voilà la réponse à mon envoi ». */
  readonly lastResponseUuid = signal<string | null>(null);
  readonly lastResponseStatus = signal<'rejected' | 'accepted' | null>(null);
  private lastResponseTimer: ReturnType<typeof setTimeout> | null = null;
  missionRef = '';
  amountTtc = '';
  hasQueryParams = false;
  /** Vrai des qu'une mission a ete choisie via le picker (verrouille les champs). */
  readonly hasSelectedMission = signal(false);

  // Progression simulee de l'upload (le backend est synchrone et ne renvoie
  // qu'a la fin du pipeline OCR — on temporise les etapes cote front pour
  // rassurer l'utilisateur. Cf. CLAUDE.md "Upload synchrone".)
  readonly uploadStep = signal(0);
  readonly uploadElapsed = signal(0);
  private stepTimers: ReturnType<typeof setTimeout>[] = [];
  private elapsedTimer: ReturnType<typeof setInterval> | null = null;
  readonly uploadSteps = [
    { icon: 'cloud_upload', label: 'Envoi du fichier' },
    { icon: 'document_scanner', label: 'Lecture du document (OCR)' },
    { icon: 'rule', label: "Vérification des règles de facturation" },
    { icon: 'compare_arrows', label: 'Croisement avec la mission' },
  ];

  readonly filteredInvoices = computed(() => {
    const filter = this.activeFilter();
    const all = this.invoices();
    switch (filter) {
      case 'pending_payment_validation': return all.filter(i => i.status === 'pending_payment_validation');
      case 'ready_to_pay': return all.filter(i => i.status === 'ready_to_pay');
      case 'payment_in_progress': return all.filter(i => i.status === 'payment_in_progress');
      case 'paid': return all.filter(i => i.status === 'paid');
      case 'rejected': return all.filter(i => i.status === 'rejected');
      default: return all;
    }
  });

  get isPaidPlan(): boolean {
    return this.session.plan === 'paid';
  }

  ngOnInit(): void {
    const params = this.route.snapshot.queryParams;
    const reuploadUuid = params['reupload'] as string | undefined;

    // Pre-fill upload form if coming from missions page
    if (params['mission_ref']) {
      this.missionRef = params['mission_ref'];
      this.hasQueryParams = true;
      this.showUploadForm.set(true);
    }
    if (params['amount']) {
      this.amountTtc = params['amount'];
    }

    this.loadInvoices(() => {
      if (!reuploadUuid) return;
      // Re-upload deeplink (depuis la page detail facture ou mission detail) —
      // bascule en mode "Corriger la facture". On cherche d'abord dans la liste
      // courante (page 1), puis on tombe sur GET /invoices/{uuid} si absent
      // (cas oU la facture rejetee n'est pas sur la 1re page paginee).
      const inList = this.invoices().find(i => i.uuid === reuploadUuid);
      if (inList) {
        this.startReupload(inList);
        return;
      }
      this.api.getInvoice(reuploadUuid).subscribe({
        next: (inv: Invoice) => {
          if (inv) this.startReupload(inv);
        },
        error: () => {
          this.errorMessage.set('Facture introuvable. Recharge la page ou re-essaie depuis ta liste.');
        },
      });
    });

    // Connexion WebSocket (Reverb) — complément du polling HTTP.
    // Même note que pour les documents : le backend broadcast sur
    // contractor.{from_company_id}. Tant que l'id n'est pas exposé
    // dans /dashboard, on passe le téléphone en fallback (no-op si
    // mismatch channel).
    const channelId =
      (this.session.contractor as any)?.companyId
      ?? this.session.contractor?.phone
      ?? null;
    this.realtime.connect(channelId);

    this.realtime
      .onInvoiceStatusChanged()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(ev => {
        // Mise à jour ciblée de la facture dans la liste sans reload.
        this.invoices.update(list =>
          list.map(inv =>
            inv.uuid === ev.uuid
              ? {
                  ...inv,
                  status: ev.status,
                  amount_ht: ev.amount_ht ?? inv.amount_ht,
                  amount_ttc: ev.amount_ttc ?? inv.amount_ttc,
                  amount_tva: ev.amount_tva ?? inv.amount_tva,
                  rejection_reason: ev.rejection_reason ?? inv.rejection_reason,
                  rejection_details: ev.rejection_details ?? inv.rejection_details,
                  pages_count: ev.pages_count ?? inv.pages_count,
                }
              : inv,
          ),
        );
      });

    this.refreshBus.refresh$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadInvoices());
  }

  ngOnDestroy(): void {
    this.realtime.disconnect();
    this.stopUploadProgress();
    this.clearLastResponseHighlight();
  }

  private flagLastResponse(uuid: string | null, status: 'rejected' | 'accepted'): void {
    this.clearLastResponseHighlight();
    if (!uuid) return;
    this.lastResponseUuid.set(uuid);
    this.lastResponseStatus.set(status);
    // Auto-clear apres 30 s : passe ce delai, l'info devient du bruit visuel.
    this.lastResponseTimer = setTimeout(() => this.clearLastResponseHighlight(), 30000);
  }

  dismissLastResponseHighlight(): void {
    this.clearLastResponseHighlight();
  }

  private clearLastResponseHighlight(): void {
    if (this.lastResponseTimer) {
      clearTimeout(this.lastResponseTimer);
      this.lastResponseTimer = null;
    }
    this.lastResponseUuid.set(null);
    this.lastResponseStatus.set(null);
  }

  private scrollToLastResponse(): void {
    const uuid = this.lastResponseUuid();
    if (!uuid) return;
    // Laisse Angular rendre le bloc verdict avant de scroller dessus.
    setTimeout(() => {
      const verdict = document.querySelector('.verdict-card');
      if (verdict) {
        verdict.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const card = document.querySelector(`[data-invoice-uuid="${uuid}"]`);
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  }

  /**
   * Demarre la progression simulee. Le backend etant synchrone (pipeline OCR
   * en ~30-90s), on avance les etapes via setTimeout pour donner du feedback
   * visuel. La derniere etape "tient" tant que la reponse n'est pas arrivee.
   */
  private startUploadProgress(): void {
    this.stopUploadProgress();
    this.uploadStep.set(0);
    this.uploadElapsed.set(0);

    // 4 etapes : 0 (envoi) -> 1 (OCR, le plus long) -> 2 (regles) -> 3 (cross-check)
    // On bloque sur l'etape 3 si le backend n'a pas encore repondu.
    this.stepTimers.push(setTimeout(() => this.uploadStep.set(1), 3000));
    this.stepTimers.push(setTimeout(() => this.uploadStep.set(2), 25000));
    this.stepTimers.push(setTimeout(() => this.uploadStep.set(3), 45000));

    const startedAt = Date.now();
    this.elapsedTimer = setInterval(() => {
      this.uploadElapsed.set(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
  }

  formatElapsed(seconds: number): string {
    if (seconds < 60) return `${seconds}s ecoulees`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}min ${s.toString().padStart(2, '0')}s ecoulees`;
  }

  private stopUploadProgress(): void {
    this.stepTimers.forEach(t => clearTimeout(t));
    this.stepTimers = [];
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
    this.uploadStep.set(0);
    this.uploadElapsed.set(0);
  }

  loadInvoices(onLoaded?: () => void): void {
    this.isLoading.set(true);
    this.api.getInvoices({ page: this.currentPage(), per_page: this.perPage() }).subscribe({
      next: (res: any) => {
        this.invoices.set(res.data ?? []);
        if (res.meta) {
          this.currentPage.set(res.meta.current_page ?? 1);
          this.totalItems.set(res.meta.total ?? 0);
          this.lastPage.set(res.meta.last_page ?? 1);
          this.perPage.set(res.meta.per_page ?? 15);
          if (res.meta.stats) {
            this.stats.set(res.meta.stats);
          }
        }
        this.isLoading.set(false);
        onLoaded?.();
      },
      error: () => this.isLoading.set(false),
    });
  }

  onPageChange(event: PageEvent): void {
    this.currentPage.set(event.pageIndex + 1);
    this.perPage.set(event.pageSize);
    this.loadInvoices();
  }

  openInvoice(invoice: Invoice): void {
    this.router.navigateByUrl(`/invoices/${invoice.uuid}`);
  }

  setFilter(key: FilterKey): void {
    this.activeFilter.set(key);
  }

  // --- Upload (free plan) ---

  toggleUploadForm(): void {
    this.showUploadForm.update(v => !v);
    if (!this.showUploadForm()) {
      this.resetUploadForm();
    }
  }

  onMissionPicked(selection: MissionPickerSelection | null): void {
    if (selection) {
      this.missionRef = selection.mission_ref;
      this.amountTtc = selection.amount_ttc.toFixed(2);
      this.hasSelectedMission.set(true);
      this.errorMessage.set(null);
    } else {
      this.hasSelectedMission.set(false);
      if (!this.hasQueryParams) {
        this.missionRef = '';
        this.amountTtc = '';
      }
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.acceptFile(input.files[0]);
    }
    input.value = '';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.acceptFile(files[0]);
    }
  }

  private acceptFile(file: File): void {
    const isPdf = file.type === 'application/pdf'
      || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      this.uploadFile.set(null);
      this.errorMessage.set(
        `Seuls les fichiers PDF sont acceptés. Le fichier « ${file.name} » n'est pas un PDF.`,
      );
      return;
    }
    this.errorMessage.set(null);
    this.uploadFile.set(file);
  }

  uploadInvoice(): void {
    const file = this.uploadFile();
    if (!file || !this.missionRef || !this.amountTtc) return;

    this.isUploading.set(true);
    this.errorMessage.set(null);
    this.clearLastResponseHighlight();
    this.startUploadProgress();

    const rejectedInvoice = this.reuploadingInvoice();

    const upload$ = rejectedInvoice
      ? this.api.reuploadInvoice(rejectedInvoice.uuid, file)
      : this.api.uploadInvoice(file, this.missionRef, parseFloat(this.amountTtc));

    upload$.subscribe({
      next: (res: any) => {
        this.stopUploadProgress();
        this.isUploading.set(false);
        // Backend sync : la reponse contient deja le statut final et
        // eventuellement `rejection_reason` / `rejection_details`. On affiche
        // le rejet dans la meme vue pour que le contractor puisse corriger
        // immediatement sans recharger.
        const data = res?.data ?? {};
        const status = data.status;
        const responseUuid = data.uuid ?? rejectedInvoice?.uuid ?? null;
        if (status === 'rejected') {
          // On surligne la carte rejetée et on scrolle dessus pour que le
          // contractor voie immédiatement « voilà la réponse à mon envoi ».
          this.flagLastResponse(responseUuid, 'rejected');
          // On garde le formulaire ouvert pour guider vers le re-upload
          this.loadInvoices(() => this.scrollToLastResponse());
          return;
        }
        this.resetUploadForm();
        this.showUploadForm.set(false);
        this.flagLastResponse(responseUuid, 'accepted');
        this.loadInvoices(() => this.scrollToLastResponse());
        // Confirmation visible : le formulaire se ferme, sinon le contractor
        // ne sait pas si l'envoi est passé. Snack vert + auto-dismiss 6 s.
        this.snack.open(
          rejectedInvoice
            ? '✓ Correction envoyée - votre facture est en attente de validation'
            : '✓ Facture envoyée - en attente de validation par Tuita',
          'OK',
          {
            duration: 6000,
            panelClass: ['snack-success'],
            horizontalPosition: 'center',
            verticalPosition: 'top',
          },
        );
      },
      error: (err: any) => {
        this.stopUploadProgress();
        this.isUploading.set(false);

        // Rxjs TimeoutError : la reponse a mis plus de 150 s.
        if (err?.name === 'TimeoutError') {
          this.errorMessage.set(
            'La vérification automatique prend plus longtemps que prévu. '
            + 'La facture est en cours de traitement, rechargez dans quelques secondes.',
          );
          this.loadInvoices();
          return;
        }

        const errorData = err?.error?.error ?? err?.error;
        const code = errorData?.code;

        // Si une facture rejetee existe deja → basculer en mode re-upload
        if (code === 'invoice.already_exists_rejected' && errorData?.existing_invoice_uuid) {
          this.loadInvoices();
          // Trouver la facture rejetee dans la liste rechargee et basculer en mode correction
          this.api.getInvoices().subscribe(res => {
            const rejected = (res.data ?? []).find((i: any) => i.uuid === errorData.existing_invoice_uuid);
            if (rejected) {
              this.startReupload(rejected);
              this.errorMessage.set('Une facture existe déjà pour cette mission. Corrigez-la ci-dessous.');
            } else {
              this.errorMessage.set(errorData?.message ?? 'Erreur.');
            }
          });
          return;
        }

        // Laravel ValidationException : `error` (objet) a `code`+`detail` mais pas `message`.
        // Le `message` lisible vit dans `errors.<champ>[0]` ou dans `error.detail`.
        const validationErrors = err?.error?.errors;
        const firstFieldError = validationErrors && typeof validationErrors === 'object'
          ? (Object.values(validationErrors)[0] as string[] | undefined)?.[0]
          : null;
        const message = firstFieldError
          ?? errorData?.detail
          ?? errorData?.message
          ?? err?.error?.message
          ?? 'Erreur lors de l\'upload.';
        this.errorMessage.set(message);
      },
    });
  }

  startReupload(invoice: Invoice): void {
    this.reuploadingInvoice.set(invoice);
    this.missionRef = invoice.mission_ref;
    this.amountTtc = invoice.amount_ttc.toString();
    this.hasQueryParams = true;
    this.showUploadForm.set(true);
    this.uploadFile.set(null);
    this.errorMessage.set(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private resetUploadForm(): void {
    this.uploadFile.set(null);
    this.reuploadingInvoice.set(null);
    this.errorMessage.set(null);
    this.hasSelectedMission.set(false);
    if (!this.hasQueryParams) {
      this.missionRef = '';
      this.amountTtc = '';
    }
  }

  // --- Download ---

  downloadPdf(invoice: Invoice): void {
    this.api.downloadInvoicePdf(invoice.uuid).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `facture-${invoice.invoice_number}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.errorMessage.set('Le PDF de cette facture n\'est pas encore disponible.');
      },
    });
  }

  // --- Helpers ---

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      // Pipeline unifié (cf. docs/payment-flow.md § 6)
      draft: 'Brouillon',
      validating: 'Vérification OCR',
      pending_payment_validation: 'Validation Tuita',
      ready_to_pay: 'Bon pour paiement',
      payment_in_progress: 'Virement en cours',
      paid: 'Payée',
      rejected: 'Rejetée',
      cancelled: 'Annulée',
      // Legacy (pré pipeline unifié)
      validated: 'Validée',
      sent: 'Envoyée',
      overdue: 'En retard',
    };
    return labels[status] ?? status;
  }

  statusClass(status: string): string {
    switch (status) {
      case 'paid':
      case 'ready_to_pay':
      case 'validated':
      case 'sent':
        return 'badge--green';
      case 'draft':
      case 'validating':
      case 'pending_payment_validation':
      case 'payment_in_progress':
        return 'badge--orange';
      case 'rejected':
      case 'overdue':
      case 'cancelled':
        return 'badge--red';
      default:
        return 'badge--grey';
    }
  }

  statusIcon(status: string): string {
    switch (status) {
      case 'paid': return 'check_circle';
      case 'ready_to_pay': return 'verified';
      case 'payment_in_progress': return 'account_balance';
      case 'validated':
      case 'sent': return 'verified';
      case 'validating':
      case 'pending_payment_validation': return 'hourglass_top';
      case 'rejected': return 'error_outline';
      case 'overdue': return 'schedule';
      case 'cancelled': return 'block';
      default: return 'receipt_long';
    }
  }

  operationIcon(type: string | undefined): string {
    if (!type) return 'work';
    const icons: Record<string, string> = { starlink: 'satellite_alt', previsit: 'search', drone_prev: 'flight' };
    return icons[type] ?? 'work';
  }

  sourceLabel(source: string): string {
    return source === 'auto_generated' ? 'Auto' : 'Manuel';
  }

  formatAmount(amount: number | null | undefined): string {
    if (amount === null || amount === undefined) return '-';
    return amount.toFixed(2).replace('.', ',') + ' \u20AC';
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  trackByUuid(_index: number, invoice: Invoice): string {
    return invoice.uuid;
  }

  /** Copy user-friendly pour un rejet (mapping code → titre + description + action). */
  rejectionCopy(code: string | null | undefined): InvoiceRejectionCopy {
    return getInvoiceRejectionCopy(code);
  }

  rejectionDetailsList(details: unknown): string[] {
    if (!details) return [];
    if (Array.isArray(details)) return details.map(String).filter(d => d.length > 0);
    if (typeof details === 'string') return details.length > 0 ? [details] : [];
    return [String(details)];
  }

  /**
   * Label humain à afficher sur la carte facture, aligné sur les badges du
   * pipeline unifié (cf. docs/payment-flow.md § 6 et mission-detail component).
   *
   * Note : `validating` n'est quasiment jamais vu côté UI depuis l'upload
   * synchrone (hardcode 2026-04-24 — cf. backend/config/compliance.php),
   * la facture arrive directement en `pending_payment_validation` ou
   * `rejected` en sortie de l'upload HTTP.
   */
  validatingPhaseLabel(inv: Invoice): string {
    switch (inv.status) {
      case 'draft': return 'Préparation en cours';
      case 'validating': return 'Vérification OCR';
      case 'pending_payment_validation': return 'Validation Tuita';
      case 'ready_to_pay': return 'Bon pour paiement';
      case 'payment_in_progress': return 'Virement en cours';
      case 'paid': return 'Payée';
      case 'rejected': return 'Rejetée';
      case 'cancelled': return 'Annulée';
      // Legacy (pré pipeline unifié)
      case 'validated':
      case 'sent': return 'Validée';
      case 'overdue': return 'En retard';
      default: return this.statusLabel(inv.status);
    }
  }
}
