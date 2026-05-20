import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import {
  AdminInvitationCodeService,
  InvitationCodeDetail,
} from '../../services/admin-invitation-code.service';
import { PhoneDisplayPipe } from '../../pipes/phone-display.pipe';
import { ConfirmationDialogComponent } from '../../components/shared/confirmation-dialog.component';

interface DetailDialogData {
  uuid: string;
}

/**
 * Dialog de détail d'un code d'invitation : 2 onglets
 *   - Vue d'ensemble : metadata + édition note + révocation
 *   - Consommations : liste des contractors qui ont utilisé ce code
 */
@Component({
  selector: 'app-code-detail-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DatePipe,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTabsModule,
    PhoneDisplayPipe,
  ],
  templateUrl: './code-detail-dialog.component.html',
  styleUrl: './code-detail-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodeDetailDialogComponent implements OnInit {
  private readonly api = inject(AdminInvitationCodeService);
  private readonly ref = inject<MatDialogRef<CodeDetailDialogComponent, boolean>>(MatDialogRef);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  readonly data = inject<DetailDialogData>(MAT_DIALOG_DATA);

  readonly isLoading = signal<boolean>(false);
  readonly detail = signal<InvitationCodeDetail | null>(null);

  readonly noteDraft = signal<string>('');
  readonly isSavingNote = signal<boolean>(false);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.isLoading.set(true);
    this.api.detail(this.data.uuid).subscribe({
      next: (res) => {
        this.detail.set(res.data);
        this.noteDraft.set(res.data.note ?? '');
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.snack.open('Impossible de charger le détail.', 'OK', { duration: 4000 });
      },
    });
  }

  saveNote(): void {
    if (this.isSavingNote()) return;
    this.isSavingNote.set(true);
    this.api.updateNote(this.data.uuid, this.noteDraft()).subscribe({
      next: (res) => {
        this.isSavingNote.set(false);
        this.snack.open('Note mise à jour.', '', { duration: 2000 });
        const current = this.detail();
        if (current) {
          this.detail.set({ ...current, note: res.data.note });
        }
      },
      error: () => {
        this.isSavingNote.set(false);
        this.snack.open('Échec de la sauvegarde.', 'OK', { duration: 4000 });
      },
    });
  }

  revoke(): void {
    const d = this.detail();
    if (!d || d.revoked_at) return;
    ConfirmationDialogComponent.open(this.dialog, {
      title: `Révoquer le code ${d.code} ?`,
      message:
        'Les contractors déjà inscrits via ce code restent actifs ; seul le code lui-même devient inutilisable.',
      confirmText: 'Révoquer',
      type: 'warning',
    }).subscribe((ok) => {
      if (!ok) return;
      this.api.revoke(this.data.uuid).subscribe({
        next: () => {
          this.snack.open('Code révoqué.', '', { duration: 2000 });
          this.ref.close(true);
        },
        error: () => {
          this.snack.open('Échec de la révocation.', 'OK', { duration: 4000 });
        },
      });
    });
  }

  close(): void {
    this.ref.close(false);
  }

  /** Label "généré par" — toutes les codes sont générés par un admin Tuita. */
  generatedByLabel(d: InvitationCodeDetail): string {
    return d.generated_by_label?.trim() || 'Admin Tuita';
  }
}
