import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AdminFreeInvoiceService } from '../../services/admin-free-invoice.service';
import { ConfirmationDialogComponent } from '../../components/shared/confirmation-dialog.component';
import { ContractorComplianceSummaryComponent } from '../../components/shared/contractor-compliance-summary/contractor-compliance-summary.component';
import { SkeletonComponent } from '../../components/shared/skeleton.component';

interface AssociatedMission {
  mission_ref: string;
  mission_title: string | null;
  expected_amount_ttc: string | null;
  mission_completed_at: string;
  is_snapshot_orphan: boolean;
}

interface AttachmentBlob {
  index: number;
  original_name: string;
  mime: string;
  size: number;
  blobUrl: string | null;
  loading: boolean;
  error: boolean;
}

export interface AdminFreeInvoiceDialogData {
  /** Liste ordonnée des UUID à parcourir (typiquement la tab courante). */
  uuids: string[];
  /** UUID à afficher initialement. Doit appartenir à `uuids`. */
  initialUuid: string;
}

@Component({
  selector: 'app-admin-free-invoice-detail-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatTooltipModule,
    MatSnackBarModule,
    ContractorComplianceSummaryComponent,
    SkeletonComponent,
  ],
  templateUrl: './admin-free-invoice-detail-dialog.component.html',
  styleUrl: './admin-free-invoice-detail-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminFreeInvoiceDetailDialogComponent implements OnInit, OnDestroy {
  private readonly data = inject<AdminFreeInvoiceDialogData | string>(MAT_DIALOG_DATA);
  private readonly svc = inject(AdminFreeInvoiceService);
  private readonly dialogRef = inject(MatDialogRef<AdminFreeInvoiceDetailDialogComponent>);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly pdfSafeUrlCache = new Map<string, SafeResourceUrl>();

  /** Liste navigable. Compat ascendante : si on reçoit juste un UUID (string),
   *  on initialise avec une liste à 1 élément (prev/next masqués). */
  readonly uuids = signal<string[]>(
    typeof this.data === 'string' ? [this.data] : (this.data.uuids ?? []),
  );
  readonly currentIndex = signal<number>(
    typeof this.data === 'string'
      ? 0
      : Math.max(0, (this.data.uuids ?? []).indexOf(this.data.initialUuid)),
  );
  /** UUID actuellement affiché — dérivé de la liste + index. */
  readonly uuid = computed<string>(() => this.uuids()[this.currentIndex()] ?? '');
  readonly hasPrev = computed<boolean>(() => this.currentIndex() > 0);
  readonly hasNext = computed<boolean>(() => this.currentIndex() < this.uuids().length - 1);
  /** True si on a au moins 1 « action » faite (approve/reject) → le parent
   *  doit refresh sa table même si l'utilisateur ferme via ✕ ensuite. */
  private actedOnce = false;

  readonly detail = signal<any | null>(null);
  readonly loadingDetail = signal(true);
  readonly attachments = signal<AttachmentBlob[]>([]);

  readonly associatedMissions = computed<AssociatedMission[]>(() => {
    const d = this.detail();
    return (d?.associated_missions ?? []) as AssociatedMission[];
  });

  readonly missionsTotal = computed(() =>
    this.associatedMissions().reduce(
      (sum, m) => sum + (m.expected_amount_ttc ? parseFloat(m.expected_amount_ttc) : 0),
      0,
    ),
  );

  readonly rejectReason = signal('');
  private readonly blobUrls: string[] = [];

  // Vrai pendant l'envoi d'une action (approve/reject) au serveur. Sert à
  // afficher un spinner « En cours... » et désactiver les deux boutons pour
  // empêcher les double-clics → double traitement (le serveur peut être lent).
  readonly submitting = signal(false);

  // F4 : le montant autorisé n'est plus saisi côté admin — le backend le fige
  // sur le montant demandé (FreeInvoiceService::approve). Le formulaire ne
  // porte plus qu'une note interne facultative.
  readonly approveForm = this.fb.group({
    note: [''],
  });

  ngOnInit(): void {
    this.loadCurrent();
  }

  private loadCurrent(): void {
    const uuid = this.uuid();
    if (!uuid) return;
    this.loadingDetail.set(true);
    this.detail.set(null);
    this.attachments.set([]);
    this.rejectReason.set('');
    this.approveForm.reset({ note: '' });

    this.svc.detail(uuid).subscribe({
      next: (r) => {
        this.detail.set(r.data);
        this.loadingDetail.set(false);
        this.loadAttachments(r.data.attachments ?? []);
      },
      error: (err) => {
        this.loadingDetail.set(false);
        const msg = (err as any)?.error?.error?.message ?? 'Impossible de charger la demande.';
        this.snack.open(msg, 'OK', { duration: 4000 });
      },
    });
  }

  goPrev(): void {
    if (!this.hasPrev()) return;
    this.currentIndex.update(i => i - 1);
    this.loadCurrent();
  }

  goNext(): void {
    if (!this.hasNext()) return;
    this.currentIndex.update(i => i + 1);
    this.loadCurrent();
  }

  /** Avance à la suivante après une action (approve/reject) ou ferme le dialog
   *  si on était sur la dernière. Le retour `acted=true` signale au parent qu'il
   *  doit refresh sa table. */
  private advanceOrClose(): void {
    this.actedOnce = true;
    if (this.hasNext()) {
      this.goNext();
    } else {
      this.dialogRef.close(true);
    }
  }

  closeDialog(): void {
    this.dialogRef.close(this.actedOnce);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(ev: KeyboardEvent): void {
    const target = ev.target as HTMLElement;
    const isInput = target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
    if (isInput) return;
    if (ev.key === 'j' || ev.key === 'J' || ev.key === 'ArrowDown') {
      this.goNext();
      ev.preventDefault();
    } else if (ev.key === 'k' || ev.key === 'K' || ev.key === 'ArrowUp') {
      this.goPrev();
      ev.preventDefault();
    }
  }

  ngOnDestroy(): void {
    // Revoke all blob URLs to free memory
    for (const url of this.blobUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
  }

  private loadAttachments(rawAttachments: any[]): void {
    const items: AttachmentBlob[] = rawAttachments.map((a: any, idx: number) => ({
      index: idx,
      original_name: a.original_name ?? `attachment-${idx}`,
      mime: a.mime ?? 'application/octet-stream',
      size: a.size ?? 0,
      blobUrl: null,
      loading: true,
      error: false,
    }));
    this.attachments.set(items);

    const currentUuid = this.uuid();
    // Une demande n'a qu'un seul PDF — la boucle tourne 0 ou 1 fois. La route
    // admin `/attachments` sert ce PDF unique sans segment d'index.
    rawAttachments.forEach((_att: any, idx: number) => {
      this.svc.fetchAttachmentBlob(currentUuid).subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          this.blobUrls.push(url);
          this.attachments.update((list) =>
            list.map((item) =>
              item.index === idx ? { ...item, blobUrl: url, loading: false } : item,
            ),
          );
        },
        error: () => {
          this.attachments.update((list) =>
            list.map((item) =>
              item.index === idx ? { ...item, loading: false, error: true } : item,
            ),
          );
        },
      });
    });
  }

  downloadAttachment(att: AttachmentBlob): void {
    if (!att.blobUrl) return;
    const a = document.createElement('a');
    a.href = att.blobUrl;
    a.download = att.original_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  openAttachment(att: AttachmentBlob): void {
    if (!att.blobUrl) return;
    window.open(att.blobUrl, '_blank', 'noopener');
  }

  sanitizeBlobUrl(url: string): SafeResourceUrl {
    let safe = this.pdfSafeUrlCache.get(url);
    if (!safe) {
      safe = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      this.pdfSafeUrlCache.set(url, safe);
    }
    return safe;
  }

  approve(): void {
    const d = this.detail();
    if (!d) return;
    if (this.submitting()) return;

    // Montant figé = montant demandé (le backend ne lit plus de montant
    // autorisé envoyé par le front — cf. F4). On l'affiche pour confirmation.
    const amount = ((d.amount_ttc_cents ?? 0) / 100).toFixed(2).replace('.', ',');
    const clientName = d.client_name ?? '';
    const note = this.approveForm.value.note?.trim() || undefined;

    ConfirmationDialogComponent.open(this.dialog, {
      title: 'Approuver cette demande ?',
      message: `Tuita autorisera l'émission d'une facture libre de ${amount} € TTC pour le client « ${clientName} ».\n\nLe contractor recevra un email et pourra uploader son PDF.`,
      confirmText: 'Approuver',
      cancelText: 'Annuler',
      type: 'success',
      icon: 'task_alt',
    }).subscribe((ok) => {
      if (!ok) return;

      this.submitting.set(true);
      this.svc
        .approve(this.uuid(), { note })
        .subscribe({
          next: () => {
            this.submitting.set(false);
            const advancing = this.hasNext();
            this.snack.open(
              advancing ? 'Approuvée. Passage à la suivante.' : 'Approuvée. Le contractor a été notifié.',
              'OK',
              { duration: 2500 },
            );
            this.advanceOrClose();
          },
          error: (err) => {
            this.submitting.set(false);
            const msg = (err as any)?.error?.error?.message ?? 'Erreur lors de l\'approbation.';
            this.snack.open(msg, 'OK', { duration: 4000 });
          },
        });
    });
  }

  reject(): void {
    if (this.submitting()) return;
    const reason = this.rejectReason();
    if (reason.length < 10) {
      this.snack.open('La raison doit contenir au moins 10 caractères.', 'OK', { duration: 3000 });
      return;
    }

    ConfirmationDialogComponent.open(this.dialog, {
      title: 'Rejeter cette demande ?',
      message: `Le contractor sera notifié avec la raison :\n\n« ${reason} »\n\nIl pourra refaire une demande ultérieurement.`,
      confirmText: 'Rejeter',
      cancelText: 'Annuler',
      type: 'error',
      icon: 'cancel',
    }).subscribe((ok) => {
      if (!ok) return;

      this.submitting.set(true);
      this.svc.reject(this.uuid(), reason).subscribe({
        next: () => {
          this.submitting.set(false);
          const advancing = this.hasNext();
          this.snack.open(
            advancing ? 'Rejetée. Passage à la suivante.' : 'Rejetée. Le contractor a été notifié.',
            'OK',
            { duration: 2500 },
          );
          this.advanceOrClose();
        },
        error: (err) => {
          this.submitting.set(false);
          const msg = (err as any)?.error?.error?.message ?? 'Erreur lors du rejet.';
          this.snack.open(msg, 'OK', { duration: 4000 });
        },
      });
    });
  }

  onRejectReasonInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    this.rejectReason.set(textarea.value);
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      pending_approval: 'En attente d\'approbation',
      approved: 'Approuvée',
      rejected: 'Rejetée',
      expired: 'Expirée',
      consumed: 'Facture envoyée',
      cancelled: 'Annulée',
      awaiting_payment: 'En attente de paiement',
      paid: 'Payée',
    };
    return map[status] ?? status;
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
    } catch {
      return iso;
    }
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    return `${Math.round(bytes / 1024)} Ko`;
  }

  trackByIndex(_idx: number, item: AttachmentBlob): number {
    return item.index;
  }
}
