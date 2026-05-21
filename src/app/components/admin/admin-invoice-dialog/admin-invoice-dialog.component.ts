import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnDestroy,
  OnInit,
  TemplateRef,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Observable } from 'rxjs';

import { AdminInvoiceService, DisputeResolution, InvoiceDetail } from '../../../services/admin-invoice.service';
import { AdminDialogShellComponent } from '../admin-dialog-shell/admin-dialog-shell.component';
import { InvoiceStatusChipComponent } from '../invoice-status-chip/invoice-status-chip.component';

export interface AdminInvoiceDialogData {
  /** UUID de la facture à afficher. */
  invoiceUuid: string;
}

/** Champ de saisie d'un sous-dialog de confirmation d'action. */
interface ConfirmField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'select';
  value: string;
  required: boolean;
  /** Longueur minimale exigée (champs texte uniquement). */
  minLength?: number;
  /** Choix proposés pour un champ `select`. */
  options?: { value: string; label: string }[];
  hint?: string;
}

interface ConfirmContext {
  title: string;
  body: string;
  confirmLabel: string;
  danger: boolean;
  fields: ConfirmField[];
}

/**
 * Dialog facture autonome — empilable par-dessus n'importe quel autre modal
 * (typiquement la fiche Contractor). Charge le détail + le PDF via
 * AdminInvoiceService et expose les actions de traitement (valider, rejeter,
 * lancer le virement, marquer payée, rouvrir, résoudre litige, ajouter note).
 *
 * Pourquoi un composant dédié plutôt que naviguer vers /admin/invoices :
 * depuis la fiche contractor (elle-même un modal), un router.navigate ne
 * ferme pas le modal et n'ouvre rien d'utile. Material empile les dialogs —
 * on ouvre donc ce composant directement par-dessus.
 *
 * À la fermeture, renvoie `true` si au moins une action a modifié la facture,
 * pour que l'hôte rafraîchisse sa liste.
 */
@Component({
  selector: 'app-admin-invoice-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    AdminDialogShellComponent,
    InvoiceStatusChipComponent,
  ],
  templateUrl: './admin-invoice-dialog.component.html',
  styleUrl: './admin-invoice-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminInvoiceDialogComponent implements OnInit, OnDestroy {
  private readonly api = inject(AdminInvoiceService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly ref =
    inject<MatDialogRef<AdminInvoiceDialogComponent, boolean>>(MatDialogRef);

  @ViewChild('confirmTpl', { static: true }) confirmTpl!: TemplateRef<unknown>;

  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly detail = signal<InvoiceDetail | null>(null);
  readonly acting = signal<boolean>(false);

  readonly pdfUrl = signal<SafeResourceUrl | null>(null);
  readonly pdfLoading = signal<boolean>(false);
  readonly pdfError = signal<string | null>(null);
  private pdfObjectUrl: string | null = null;

  /** Passé à true dès qu'une action modifie la facture. */
  private didChange = false;

  // Sous-dialog de confirmation (saisie des champs d'action).
  confirmCtx: ConfirmContext = { title: '', body: '', confirmLabel: '', danger: false, fields: [] };
  private confirmRun: (() => void) | null = null;
  private confirmRef: MatDialogRef<unknown> | null = null;

  readonly status = computed<string>(() => this.detail()?.invoice?.status ?? '');

  constructor(@Inject(MAT_DIALOG_DATA) public data: AdminInvoiceDialogData) {}

  ngOnInit(): void {
    this.loadDetail(true);
    this.loadPdf();
  }

  ngOnDestroy(): void {
    this.revokePdf();
  }

  // ── Chargement ──────────────────────────────────────────────────────────

  /** Recharge le détail structuré. `withSpinner` n'affiche le spinner que
   *  pour le premier chargement (les refreshs post-action sont silencieux). */
  private loadDetail(withSpinner = false): void {
    if (withSpinner) this.loading.set(true);
    this.api.getInvoiceDetail(this.data.invoiceUuid).subscribe({
      next: (res) => {
        this.detail.set(res.data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(this.errorMessage(err, 'Impossible de charger la facture.'));
      },
    });
  }

  private loadPdf(): void {
    this.pdfLoading.set(true);
    this.pdfError.set(null);
    this.api.downloadInvoicePdf(this.data.invoiceUuid, true).subscribe({
      next: (blob) => {
        this.pdfLoading.set(false);
        this.revokePdf();
        this.pdfObjectUrl = URL.createObjectURL(blob);
        this.pdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfObjectUrl));
      },
      error: (err) => {
        this.pdfLoading.set(false);
        const code = (err as { error?: { error?: { code?: string } } })?.error?.error?.code;
        this.pdfError.set(
          code === 'INVOICE_PDF_NOT_FOUND'
            ? 'PDF indisponible (fichier source perdu).'
            : 'Impossible de charger le PDF.',
        );
      },
    });
  }

  private revokePdf(): void {
    if (this.pdfObjectUrl) {
      URL.revokeObjectURL(this.pdfObjectUrl);
      this.pdfObjectUrl = null;
    }
  }

  // ── Fermeture ───────────────────────────────────────────────────────────

  close(): void {
    this.ref.close(this.didChange);
  }

  openPdfInNewTab(): void {
    if (this.pdfObjectUrl) window.open(this.pdfObjectUrl, '_blank', 'noopener');
  }

  // ── Calculs d'affichage ─────────────────────────────────────────────────

  /** Écart entre montant facturé TTC et montant convenu de la mission. */
  amountDeviation(): { delta: number; pct: number } | null {
    const d = this.detail();
    const declared = d?.invoice?.amount_ttc;
    const expected = d?.mission_snapshot?.expected_amount_ttc;
    if (!declared || !expected) return null;
    const delta = declared - expected;
    return { delta, pct: (delta / expected) * 100 };
  }

  deviationClass(pct: number): string {
    if (pct >= -5 && pct <= 5) return 'deviation--ok';
    if (pct < -50 || pct > 50) return 'deviation--alert';
    return 'deviation--warn';
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return iso;
    }
  }

  /** Validations de paiement triées par date croissante. */
  validations(): NonNullable<InvoiceDetail['payment_validations']> {
    return (this.detail()?.payment_validations ?? [])
      .slice()
      .sort((a, b) => (a.validated_at ?? '').localeCompare(b.validated_at ?? ''));
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  /** Action principale contextuelle selon le statut courant. */
  hotAction(): { label: string; icon: string; run: () => void } | null {
    switch (this.status()) {
      case 'pending_payment_validation':
        return { label: 'Approuver', icon: 'check_circle', run: () => this.approve() };
      case 'ready_to_pay':
        return { label: 'Lancer le virement', icon: 'send', run: () => this.markPaymentInProgress() };
      case 'payment_in_progress':
        return { label: 'Marquer payée', icon: 'paid', run: () => this.markPaid() };
      case 'rejected':
        return { label: 'Rouvrir', icon: 'restart_alt', run: () => this.reopen() };
      default:
        return null;
    }
  }

  get isPending(): boolean { return this.status() === 'pending_payment_validation'; }
  get isReady(): boolean { return this.status() === 'ready_to_pay'; }
  get hasOpenDispute(): boolean {
    const dispute = this.detail()?.dispute;
    return !!dispute && !dispute.resolved_at;
  }

  approve(): void {
    this.openConfirm(
      {
        title: 'Approuver la facture',
        body: 'Enregistre une approbation vers le quorum de validation du paiement.',
        confirmLabel: 'Approuver',
        danger: false,
        fields: [
          { key: 'reason', label: 'Commentaire (optionnel)', type: 'textarea', value: '', required: false },
        ],
      },
      () => this.run(
        this.api.validate(this.data.invoiceUuid, {
          decision: 'approved',
          reason: this.field('reason') || undefined,
        }),
        'Approbation enregistrée.',
      ),
    );
  }

  reject(): void {
    this.openConfirm(
      {
        title: 'Rejeter la facture',
        body: 'La facture sera rejetée. Le motif est consigné dans l\'audit trail.',
        confirmLabel: 'Rejeter',
        danger: true,
        fields: [
          { key: 'reason', label: 'Motif du rejet', type: 'textarea', value: '', required: true },
        ],
      },
      () => this.run(
        this.api.validate(this.data.invoiceUuid, {
          decision: 'rejected',
          reason: this.field('reason'),
        }),
        'Facture rejetée.',
      ),
    );
  }

  markPaymentInProgress(): void {
    this.openConfirm(
      {
        title: 'Lancer le virement',
        body: 'Passe la facture en « virement en cours » et notifie le contractor.',
        confirmLabel: 'Lancer le virement',
        danger: false,
        fields: [],
      },
      () => this.run(
        this.api.markPaymentInProgress(this.data.invoiceUuid),
        'Virement marqué en cours.',
      ),
    );
  }

  markPaid(): void {
    this.openConfirm(
      {
        title: 'Marquer la facture payée',
        body: 'Confirme le paiement et notifie le contractor.',
        confirmLabel: 'Marquer payée',
        danger: false,
        fields: [
          { key: 'paid_at', label: 'Date de paiement', type: 'date', value: this.todayIso(), required: true },
          { key: 'payment_ref', label: 'Référence de virement', type: 'text', value: '', required: true },
        ],
      },
      () => this.run(
        this.api.markPaid(this.data.invoiceUuid, {
          paid_at: this.field('paid_at'),
          payment_ref: this.field('payment_ref'),
        }),
        'Facture marquée payée.',
      ),
    );
  }

  markPaidFastPath(): void {
    this.openConfirm(
      {
        title: 'Marquer payée — fast path',
        body: '⚠ Saute l\'étape « virement en cours ». À réserver à un virement instantané déjà confirmé par la banque.',
        confirmLabel: 'Confirmer le fast path',
        danger: true,
        fields: [
          { key: 'paid_at', label: 'Date de paiement', type: 'date', value: this.todayIso(), required: true },
          { key: 'payment_ref', label: 'Référence de virement', type: 'text', value: '', required: true },
          { key: 'reason', label: 'Raison (consignée dans l\'audit)', type: 'textarea', value: '', required: true },
        ],
      },
      () => this.run(
        this.api.markPaid(this.data.invoiceUuid, {
          paid_at: this.field('paid_at'),
          payment_ref: this.field('payment_ref'),
          skip_in_progress: true,
          reason: this.field('reason'),
        }),
        'Facture marquée payée (fast path).',
      ),
    );
  }

  reopen(): void {
    this.openConfirm(
      {
        title: 'Rouvrir la facture',
        body: 'Clone la facture rejetée en une nouvelle facture à valider. L\'ancienne reste rejetée pour audit.',
        confirmLabel: 'Rouvrir',
        danger: false,
        fields: [
          { key: 'reason', label: 'Raison de la réouverture', type: 'textarea', value: '', required: true },
        ],
      },
      () => this.run(
        this.api.reopen(this.data.invoiceUuid, { reason: this.field('reason') }),
        'Facture rouverte (clone créé).',
      ),
    );
  }

  resolveDispute(): void {
    this.openConfirm(
      {
        title: 'Résoudre le litige',
        body: 'Clôture le litige ouvert sur cette facture payée.',
        confirmLabel: 'Résoudre',
        danger: false,
        fields: [
          {
            key: 'resolution',
            label: 'Décision comptable',
            type: 'select',
            value: '',
            required: true,
            options: [
              { value: 'credit_note_issued', label: 'Avoir émis' },
              { value: 'amicable_refund', label: 'Remboursement à l\'amiable' },
              { value: 'no_action', label: 'Aucune action nécessaire' },
            ],
          },
          {
            key: 'notes',
            label: 'Justification (20 caractères min.)',
            type: 'textarea',
            value: '',
            required: true,
            minLength: 20,
            hint: 'Consignée dans l\'audit trail — l\'URSSAF peut en demander le détail.',
          },
        ],
      },
      () => this.run(
        this.api.resolveDispute(this.data.invoiceUuid, {
          resolution: this.field('resolution') as DisputeResolution,
          notes: this.field('notes'),
        }),
        'Litige résolu.',
      ),
    );
  }

  addNote(): void {
    this.openConfirm(
      {
        title: 'Ajouter une note admin',
        body: 'La note est consignée dans l\'audit trail de la facture.',
        confirmLabel: 'Ajouter',
        danger: false,
        fields: [
          { key: 'content', label: 'Note', type: 'textarea', value: '', required: true },
        ],
      },
      () => this.run(
        this.api.addNote(this.data.invoiceUuid, { content: this.field('content') }),
        'Note ajoutée.',
      ),
    );
  }

  // ── Plomberie sous-dialog de confirmation ───────────────────────────────

  private openConfirm(ctx: ConfirmContext, run: () => void): void {
    this.confirmCtx = ctx;
    this.confirmRun = run;
    this.confirmRef = this.dialog.open(this.confirmTpl, { width: '480px', autoFocus: false });
    this.confirmRef.afterClosed().subscribe(() => { this.confirmRef = null; });
  }

  confirmCancel(): void {
    this.confirmRef?.close();
  }

  confirmOk(): void {
    const invalid = this.confirmCtx.fields.some((f) => {
      const v = f.value.trim();
      if (f.required && !v) return true;
      if (f.minLength && v.length < f.minLength) return true;
      return false;
    });
    if (invalid) {
      this.snack.open('Complétez correctement les champs requis.', 'OK', { duration: 2500 });
      return;
    }
    const run = this.confirmRun;
    this.confirmRef?.close();
    if (run) run();
  }

  /** Lit la valeur (trimée) d'un champ du sous-dialog courant. */
  private field(key: string): string {
    return (this.confirmCtx.fields.find((f) => f.key === key)?.value ?? '').trim();
  }

  /** Exécute l'appel d'action, gère le snackbar + le refresh du détail. */
  private run(obs: Observable<unknown>, successMsg: string): void {
    this.acting.set(true);
    obs.subscribe({
      next: () => {
        this.acting.set(false);
        this.didChange = true;
        this.snack.open(successMsg, 'OK', { duration: 4000 });
        this.loadDetail();
      },
      error: (err) => {
        this.acting.set(false);
        this.snack.open(this.errorMessage(err, 'Erreur lors de l\'action.'), 'OK', { duration: 6000 });
      },
    });
  }

  private errorMessage(err: unknown, fallback: string): string {
    const apiMsg = (err as { error?: { error?: { message?: string } } })?.error?.error?.message;
    return apiMsg ?? fallback;
  }

  private todayIso(): string {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${mm}-${dd}`;
  }
}
