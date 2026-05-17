import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FreeInvoiceService, FreeInvoiceRequestSummary } from '../../services/free-invoice.service';
import { NewFreeInvoiceRequestDialogComponent } from './new-free-invoice-request-dialog.component';
import { UploadFreeInvoiceDialogComponent } from './upload-free-invoice-dialog.component';
import { ConfirmationDialogComponent } from '../../components/shared/confirmation-dialog.component';
import { BackButtonComponent } from '../../components/shared/back-button/back-button.component';

@Component({
  selector: 'app-contractor-free-invoices',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatDialogModule, RouterLink, RouterLinkActive, BackButtonComponent],
  templateUrl: './contractor-free-invoices.component.html',
  styleUrl: './contractor-free-invoices.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorFreeInvoicesComponent implements OnInit {
  private svc = inject(FreeInvoiceService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  loading = signal(true);
  requests = signal<FreeInvoiceRequestSummary[]>([]);
  currentPage = signal(1);
  total = signal(0);
  perPage = signal(20);

  totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.perPage())));
  hasPrev = computed(() => this.currentPage() > 1);
  hasNext = computed(() => this.currentPage() < this.totalPages());

  ngOnInit() {
    this.refresh();
  }

  refresh(page = this.currentPage()) {
    this.loading.set(true);
    this.svc.list(page).subscribe({
      next: (res) => {
        this.requests.set(res.data);
        this.currentPage.set(page);
        if (res.meta) {
          this.total.set(res.meta.total);
          this.perPage.set(res.meta.per_page);
        }
        this.loading.set(false);
      },
      error: () => { this.snack.open('Erreur lors du chargement.', 'OK', { duration: 3000 }); this.loading.set(false); },
    });
  }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages()) return;
    this.refresh(page);
  }

  openNew() {
    this.dialog.open(NewFreeInvoiceRequestDialogComponent, { width: '720px', disableClose: true })
      .afterClosed().subscribe((created) => { if (created) this.refresh(); });
  }

  openUpload(req: FreeInvoiceRequestSummary) {
    this.dialog.open(UploadFreeInvoiceDialogComponent, { width: '600px', data: req, disableClose: true })
      .afterClosed().subscribe((uploaded) => { if (uploaded) this.refresh(); });
  }

  cancel(uuid: string) {
    ConfirmationDialogComponent.open(this.dialog, {
      title: 'Annuler cette demande ?',
      message: 'Cette demande sera retirée de la liste de traitement Tuita. Vous pourrez en créer une nouvelle ensuite.',
      confirmText: 'Annuler la demande',
      cancelText: 'Garder',
      type: 'warning',
      icon: 'cancel_schedule_send',
    }).subscribe((ok) => {
      if (!ok) return;
      this.svc.cancel(uuid).subscribe({
        next: () => { this.snack.open('Demande annulée.', 'OK', { duration: 2500 }); this.refresh(); },
        error: () => this.snack.open('Erreur lors de l\'annulation.', 'OK', { duration: 3000 }),
      });
    });
  }

  statusLabel(s: string): string {
    return ({
      pending_admin_approval: 'En attente d\'approbation',
      authorized: 'En attente de votre facture',
      rejected: 'Rejetée',
      expired: 'Expirée',
      consumed: 'Facture envoyée',
      cancelled: 'Annulée',
    } as Record<string, string>)[s] ?? s;
  }

  /**
   * Le contractor peut uploader une nouvelle facture si :
   *  - aucune facture rattachée (1ʳᵉ tentative)
   *  - OU la dernière facture est REJECTED (correction après rejet OCR)
   *
   * On masque le bouton si l'invoice est dans un statut "actif" (validating /
   * pending_payment_validation / ready_to_pay / payment_in_progress / paid)
   * pour éviter qu'un re-clic mène à un 409 ALREADY_HAS_ACTIVE_INVOICE backend.
   */
  canUpload(r: FreeInvoiceRequestSummary): boolean {
    if (!r.invoice_status) return true;
    return r.invoice_status === 'rejected' || r.invoice_status === 'cancelled';
  }

  invoiceStateLabel(status: string): string {
    // Libellés en français concret pour artisans BTP — pas de mot technique
    // (OCR, validation, ...). On parle au statut, pas au pipeline interne.
    return ({
      validating: 'On vérifie ta facture...',
      pending_payment_validation: 'Tuita la vérifie',
      ready_to_pay: 'Bon pour paiement',
      payment_in_progress: 'Virement en cours',
      paid: 'Payée',
      rejected: 'Refusée - corrige et renvoie',
      cancelled: 'Annulée',
    } as Record<string, string>)[status] ?? status;
  }

  invoiceStateBadge(status: string): 'ok' | 'pending' | 'ko' {
    if (status === 'paid' || status === 'ready_to_pay' || status === 'payment_in_progress') return 'ok';
    if (status === 'rejected') return 'ko';
    return 'pending';
  }

  invoiceStateIcon(status: string): string {
    return ({
      validating: 'autorenew',
      pending_payment_validation: 'pending_actions',
      ready_to_pay: 'task_alt',
      payment_in_progress: 'sync_alt',
      paid: 'check_circle',
      rejected: 'error',
      cancelled: 'block',
    } as Record<string, string>)[status] ?? 'help';
  }
}
