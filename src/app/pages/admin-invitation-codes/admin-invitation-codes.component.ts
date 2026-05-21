import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';

import {
  AdminInvitationCodeService,
  InvitationCodeRow,
} from '../../services/admin-invitation-code.service';
import { GenerateCodeDialogComponent, GenerateCodeResult } from './generate-code-dialog.component';
import { CodeDetailDialogComponent } from './code-detail-dialog.component';
import { AdminBackButtonComponent } from '../../components/admin/admin-back-button/admin-back-button.component';
import { ConfirmationDialogComponent } from '../../components/shared/confirmation-dialog.component';
import { SkeletonComponent } from '../../components/shared/skeleton.component';

type StatusFilter = 'all' | 'active' | 'expired' | 'revoked';

/**
 * Page admin de gestion des codes d'invitation contractor.
 *
 *   /admin/invitation-codes
 *
 * - Table paginée (par défaut filtre "active")
 * - Bouton "Générer un code" → modal config + affiche le code en gros
 * - Click sur ligne → drawer détail (consommations + arbre + édition note)
 * - Bouton revoke par ligne (idempotent)
 *
 * Auth : OAuth2 Bearer mysession injecté par admin-key.interceptor sur
 * toutes les routes /contractor-compliance/admin/*.
 */
@Component({
  selector: 'app-admin-invitation-codes',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    AdminBackButtonComponent,
    DatePipe,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
    MatSortModule,
    MatTableModule,
    MatTooltipModule,
    SkeletonComponent,
  ],
  templateUrl: './admin-invitation-codes.component.html',
  styleUrl: './admin-invitation-codes.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminInvitationCodesComponent implements OnInit {
  private readonly api = inject(AdminInvitationCodeService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly isLoading = signal<boolean>(false);
  readonly rows = signal<InvitationCodeRow[]>([]);
  // Tri server-side : envoie `sort` + `direction` au backend (whitelist alignée
  // avec AdminInvitationCodeController::index). Couvre toutes les pages.
  // Colonnes triables (frontend → backend) : code, origin, usage, expires, created_at.
  // Non triables : note (texte libre), first_use (relation), status (dérivé en SQL).
  readonly sort = signal<string>('created_at');
  readonly direction = signal<'asc' | 'desc'>('desc');
  readonly statusFilter = signal<StatusFilter>('active');
  readonly columns = ['code', 'origin', 'usage', 'note', 'first_use', 'expires', 'status', 'actions'];

  readonly emptyHint = computed<string>(() => {
    return this.statusFilter() === 'active'
      ? 'Aucun code actif pour l\'instant — clique sur « Générer un code » pour démarrer une chaîne d\'inscriptions.'
      : 'Aucun code dans cette catégorie.';
  });

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.isLoading.set(true);
    const status = this.statusFilter() === 'all' ? undefined : this.statusFilter();
    this.api.list({ status, per_page: 50, sort: this.sort(), direction: this.direction() }).subscribe({
      next: (res) => {
        this.rows.set(res.data);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        const msg = err?.error?.error?.message ?? err?.error?.message ?? 'Erreur de chargement.';
        this.snack.open(msg, 'OK', { duration: 5000 });
      },
    });
  }

  setStatus(s: StatusFilter): void {
    if (s === this.statusFilter()) return;
    this.statusFilter.set(s);
    // Vide la table pour que le skeleton de chargement s'affiche pendant la
    // requête du nouvel onglet (sinon l'ancienne liste reste figée 3-5 s,
    // sans aucun signe de chargement).
    this.rows.set([]);
    this.refresh();
  }

  openGenerate(): void {
    const ref = this.dialog.open<GenerateCodeDialogComponent, void, GenerateCodeResult>(
      GenerateCodeDialogComponent,
      { width: '480px', maxWidth: '94vw', autoFocus: 'first-tabbable' },
    );
    ref.afterClosed().subscribe((result) => {
      if (result?.action === 'generated') {
        this.snack.open(`Code généré : ${result.code}`, 'OK', { duration: 4000 });
        this.refresh();
      }
    });
  }

  openDetail(row: InvitationCodeRow, ev?: Event): void {
    // stopPropagation : le bouton « œil » est dans la <tr> qui porte aussi
    // (click)="openDetail". Sans ça, un clic sur l'icône déclenche openDetail
    // DEUX fois → deux dialogs empilés + deux requêtes détail.
    ev?.stopPropagation();
    this.dialog.open(CodeDetailDialogComponent, {
      data: { code: row.code },
      width: '880px',
      maxWidth: '96vw',
      maxHeight: '90vh',
      autoFocus: false,
    }).afterClosed().subscribe((mutated?: boolean) => {
      if (mutated) this.refresh();
    });
  }

  revoke(row: InvitationCodeRow, ev: Event): void {
    ev.stopPropagation();
    if (row.revoked_at) return;
    ConfirmationDialogComponent.open(this.dialog, {
      title: `Révoquer le code ${row.code} ?`,
      message:
        'Les contractors déjà inscrits via ce code restent actifs ; seul le code lui-même devient inutilisable.',
      confirmText: 'Révoquer',
      type: 'warning',
    }).subscribe((ok) => {
      if (!ok) return;
      this.api.revoke(row.code).subscribe({
        next: () => {
          this.snack.open('Code révoqué.', 'OK', { duration: 3000 });
          this.refresh();
        },
        error: (err) => {
          const msg = err?.error?.error?.message ?? 'Échec de la révocation.';
          this.snack.open(msg, 'OK', { duration: 5000 });
        },
      });
    });
  }

  copyCode(code: string, ev: Event): void {
    ev.stopPropagation();
    navigator.clipboard.writeText(code).then(
      () => this.snack.open(`Copié : ${code}`, '', { duration: 1500 }),
      () => this.snack.open('Impossible de copier.', 'OK', { duration: 3000 }),
    );
  }

  /** Toutes les codes sont générés par un admin Tuita. On affiche le label
   *  saisi à la génération (email/nom), avec fallback générique si vide. */
  ownerLabel(row: InvitationCodeRow): string {
    return row.generated_by_label?.trim() || 'Admin Tuita';
  }

  statusLabel(row: InvitationCodeRow): { text: string; cls: string } {
    if (row.revoked_at) return { text: 'Révoqué', cls: 'badge--bad' };
    if (new Date(row.expires_at) < new Date()) return { text: 'Expiré', cls: 'badge--warn' };
    if (row.max_uses != null && row.uses_count >= row.max_uses) return { text: 'Épuisé', cls: 'badge--warn' };
    return { text: 'Actif', cls: 'badge--ok' };
  }

  trackByUuid(_i: number, r: InvitationCodeRow): string {
    return r.uuid;
  }

  /**
   * Libellé court "1er inscrit" pour la colonne dédiée. Vide si pas encore
   * consommé.
   */
  firstUseLabel(row: InvitationCodeRow): string {
    if (!row.first_use) return '';
    const name = [row.first_use.first_name, row.first_use.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();
    return name || row.first_use.phone || '';
  }

  /** Applique le tri serveur quand l'admin clique un en-tête de colonne. */
  onSortChange(s: Sort): void {
    // Map column template -> sort key backend.
    const colMap: Record<string, string> = {
      usage: 'usage_count',
      expires: 'expires_at',
    };
    if (!s.active || !s.direction) {
      this.sort.set('created_at');
      this.direction.set('desc');
    } else {
      this.sort.set(colMap[s.active] ?? s.active);
      this.direction.set(s.direction);
    }
    this.refresh();
  }

  /**
   * Tooltip détaillé pour la colonne "1er inscrit" — date + indication
   * mismatch éventuel pour informer l'admin.
   */
  firstUseTooltip(row: InvitationCodeRow): string {
    if (!row.first_use) return 'Aucun inscrit pour l\'instant';
    const parts: string[] = [];
    parts.push(`${this.firstUseLabel(row)} (${row.first_use.phone})`);
    if (row.first_use.consumed_at) {
      const d = new Date(row.first_use.consumed_at);
      parts.push(`Inscrit le ${d.toLocaleDateString('fr-FR')}`);
    }
    if (row.note_matches_first_use === false) {
      parts.push('⚠️ Le 1er inscrit ne correspond pas à la note — vérifie si le code a été redistribué');
    }
    if (row.note_matches_first_use === true) {
      parts.push('✓ Correspond à la note');
    }
    return parts.join(' — ');
  }
}
