import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AdminInvitationCodeService } from '../../services/admin-invitation-code.service';

export type GenerateCodeResult = { action: 'generated'; code: string } | { action: 'cancel' };

/**
 * Dialog de génération d'un code d'invitation racine.
 *
 * Champ requis :
 *   - note : à qui ce code est destiné (pour audit + heuristique mismatch)
 *
 * L'admin qui génère est résolu côté backend via le token OAuth2 (session) ;
 * on ne lui demande donc plus son nom/email — le label de traçabilité est
 * dérivé de l'identité serveur.
 */
@Component({
  selector: 'app-generate-code-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './generate-code-dialog.component.html',
  styleUrl: './generate-code-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateCodeDialogComponent {
  private readonly api = inject(AdminInvitationCodeService);
  private readonly ref = inject<MatDialogRef<GenerateCodeDialogComponent, GenerateCodeResult>>(MatDialogRef);

  readonly validForDays = signal<number>(7);
  readonly maxUses = signal<string>('50');
  readonly note = signal<string>('');

  readonly isGenerating = signal<boolean>(false);
  readonly generatedCode = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly canGenerate = computed<boolean>(() => {
    if (this.isGenerating()) return false;
    if (this.note().trim().length < 3) return false;
    return true;
  });

  setDays(days: number): void {
    if (days < 7 || days > 60) return;
    this.validForDays.set(days);
  }

  generate(): void {
    if (!this.canGenerate()) return;
    const days = Math.min(60, Math.max(7, Math.floor(this.validForDays())));

    let max: number | null = null;
    const raw = this.maxUses().trim();
    if (raw !== '') {
      const parsed = parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        max = parsed;
      } else {
        this.errorMessage.set('Le nombre maximal d\'usages doit être un entier positif.');
        return;
      }
    }

    this.errorMessage.set(null);
    this.isGenerating.set(true);

    this.api.create({
      // Clé attendue par le backend (createAction lit `expires_in_days`).
      // L'admin créateur est résolu côté backend via le token OAuth2.
      expires_in_days: days,
      max_uses: max,
      note: this.note().trim(),
    }).subscribe({
      next: (res) => {
        this.isGenerating.set(false);
        this.generatedCode.set(res.data.code);
      },
      error: (err) => {
        this.isGenerating.set(false);
        this.errorMessage.set(err?.error?.error?.message ?? 'Échec de la génération.');
      },
    });
  }

  copy(): void {
    const code = this.generatedCode();
    if (!code) return;
    navigator.clipboard.writeText(code);
  }

  close(): void {
    const code = this.generatedCode();
    this.ref.close(code ? { action: 'generated', code } : { action: 'cancel' });
  }
}
