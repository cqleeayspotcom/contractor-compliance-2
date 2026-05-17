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

const ADMIN_LABEL_STORAGE_KEY = 'tuita.admin.user-label';

/**
 * Dialog de génération d'un code d'invitation racine.
 *
 * Champs requis (BDD garantit la traçabilité) :
 *   - generated_by_label : qui crée le code (email/nom Tuita)
 *   - note : à qui ce code est destiné (pour audit + heuristique mismatch)
 *
 * UX : `generated_by_label` est mémorisé en sessionStorage après la 1ère
 * saisie pour ne pas réclamer le nom à chaque génération.
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
  readonly generatedByLabel = signal<string>(this.loadAdminLabel());

  readonly isGenerating = signal<boolean>(false);
  readonly generatedCode = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly canGenerate = computed<boolean>(() => {
    if (this.isGenerating()) return false;
    if (this.note().trim().length < 3) return false;
    if (this.generatedByLabel().trim().length < 2) return false;
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

    // Persiste l'admin label pour les prochaines générations (sessionStorage,
    // limité à la session navigateur courante — sécurité raisonnable).
    this.persistAdminLabel(this.generatedByLabel().trim());

    this.api.create({
      valid_for_days: days,
      max_uses: max,
      note: this.note().trim(),
      generated_by_label: this.generatedByLabel().trim(),
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

  // ── Persistence admin label ────────────────────────────────────────────
  private loadAdminLabel(): string {
    try {
      if (typeof window === 'undefined' || !window.sessionStorage) return '';
      return window.sessionStorage.getItem(ADMIN_LABEL_STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  }

  private persistAdminLabel(label: string): void {
    try {
      if (typeof window === 'undefined' || !window.sessionStorage) return;
      if (label.length === 0) return;
      window.sessionStorage.setItem(ADMIN_LABEL_STORAGE_KEY, label);
    } catch {
      // sessionStorage indispo — on perd juste le pré-remplissage à la
      // prochaine ouverture, pas critique.
    }
  }
}
