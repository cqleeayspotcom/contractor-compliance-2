import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AdminFreeInvoiceService } from '../../services/admin-free-invoice.service';
import { AdminBackButtonComponent } from '../../components/admin/admin-back-button/admin-back-button.component';
import { SkeletonComponent } from '../../components/shared/skeleton.component';
import {
  AdminFreeInvoiceDetailDialogComponent,
  AdminFreeInvoiceDialogData,
} from './admin-free-invoice-detail-dialog.component';

@Component({
  selector: 'app-admin-free-invoices',
  standalone: true,
  imports: [
    CommonModule,
    AdminBackButtonComponent,
    MatTabsModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatSnackBarModule,
    SkeletonComponent,
  ],
  templateUrl: './admin-free-invoices.component.html',
  styleUrl: './admin-free-invoices.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminFreeInvoicesComponent implements OnInit {
  private readonly svc = inject(AdminFreeInvoiceService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly pending = signal<any[]>([]);
  readonly all = signal<any[]>([]);
  readonly loading = signal(true);

  // Onglet courant reflété dans l'URL (?tab=pending|all) : deep-link entrant
  // au chargement + URL qui suit le clic d'onglet (lien partageable, refresh
  // qui retombe sur le bon onglet). Index 0 = « À approuver », 1 = « Toutes ».
  private readonly tabOrder: ('pending' | 'all')[] = ['pending', 'all'];
  readonly initialTabIndex = signal<number>(0);

  ngOnInit(): void {
    // Auth garantie par AdminAuthGuard sur la route /admin/* ; le Bearer est
    // injecté par admin-key.interceptor sur chaque appel admin.
    const requested = this.route.snapshot.queryParamMap.get('tab');
    const idx = requested ? this.tabOrder.indexOf(requested as 'pending' | 'all') : -1;
    this.initialTabIndex.set(idx >= 0 ? idx : 0);
    this.refresh();
  }

  /** Reflète l'onglet courant dans l'URL (?tab=...) sans recharger la page.
   *  replaceUrl: true → un clic d'onglet n'empile pas une entrée d'historique. */
  onTabChange(idx: number): void {
    const tab = this.tabOrder[idx] ?? 'pending';
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  refresh(): void {
    this.loading.set(true);
    this.svc.pending().subscribe({
      next: (r) => this.pending.set(r.data ?? []),
      error: (err) => this.handleError(err, 'liste en attente'),
    });
    this.svc.list().subscribe({
      next: (r) => { this.all.set(r.data ?? []); this.loading.set(false); },
      error: (err) => { this.handleError(err, 'liste complète'); this.loading.set(false); },
    });
  }

  /** Ouvre le dialog avec la liste navigable de la tab à laquelle appartient `uuid`.
   *  Si on est sur la tab « À approuver », la liste ne contient que les pending —
   *  l'admin enchaîne approve/reject en série (auto-advance). Sinon, liste complète. */
  openDetail(uuid: string, source: 'pending' | 'all' = 'all'): void {
    const list = (source === 'pending' ? this.pending() : this.all()).map((r: any) => r.uuid);
    const data: AdminFreeInvoiceDialogData = {
      uuids: list.length > 0 ? list : [uuid],
      initialUuid: uuid,
    };
    this.dialog
      .open(AdminFreeInvoiceDetailDialogComponent, {
        width: '1440px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        data,
        disableClose: true,
      })
      .afterClosed()
      .subscribe((acted) => {
        if (acted) this.refresh();
      });
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      pending_approval: 'En attente',
      approved: 'En attente facture',
      rejected: 'Rejetée',
      expired: 'Expirée',
      consumed: 'Facture envoyée',
      cancelled: 'Annulée',
      awaiting_payment: 'En attente paiement',
      paid: 'Payée',
    };
    return map[status] ?? status;
  }

  /** Libellé court du statut de la facture liée (colonne « Facture » tab Toutes). */
  invoiceStatusLabel(status: string | null | undefined): string {
    if (!status) return '—';
    const map: Record<string, string> = {
      validating: 'Validation OCR',
      pending_payment_validation: 'En validation 2/2',
      ready_to_pay: 'Bon pour paiement',
      payment_in_progress: 'Virement en cours',
      paid: 'Payée',
      rejected: 'Rejetée OCR',
      cancelled: 'Annulée',
    };
    return map[status] ?? status;
  }

  invoiceStatusClass(status: string | null | undefined): string {
    if (!status) return 'invoice-none';
    if (status === 'paid' || status === 'ready_to_pay' || status === 'payment_in_progress') return 'invoice-ok';
    if (status === 'rejected') return 'invoice-ko';
    return 'invoice-pending';
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return iso;
    }
  }

  trackByUuid(_idx: number, item: any): string {
    return item.uuid;
  }

  private handleError(err: unknown, context: string): void {
    const httpErr = err as { status?: number };
    if (httpErr.status === 401 || httpErr.status === 403) {
      // Bearer OAuth2 mysession invalide/expiré : purge et retour login.
      sessionStorage.removeItem('tuita_admin_token');
      sessionStorage.removeItem('tuita_admin_refresh');
      sessionStorage.removeItem('tuita_admin_user');
      this.snack.open('Session admin expirée', 'OK', { duration: 4000 });
      this.router.navigate(['/admin/login']);
      return;
    }
    console.error(`[admin-free-invoices] ${context}`, err);
    this.snack.open(`Erreur lors du chargement (${context})`, 'OK', { duration: 6000 });
  }
}
