import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/**
 * PushProModalComponent
 *
 * Modal "intrusif" d'upgrade vers le plan Pro affiché au login aux
 * contractors en plan free.
 *
 * - Dégradé purple → orange (style premium moderne)
 * - 3 arguments valeur (factures auto, paiement rapide, statut Pro visible)
 * - CTA primaire "Passer au Pro" → navigate /billing
 * - CTA secondaire "Plus tard" → ferme sans naviguer
 * - Dismissable par ESC et click outside (comportement par défaut de MatDialog)
 * - Animation d'entrée slide-up + fade (CSS keyframes)
 */
@Component({
  selector: 'app-push-pro-modal',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './push-pro-modal.component.html',
  styleUrl: './push-pro-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PushProModalComponent {
  private readonly dialogRef = inject(MatDialogRef<PushProModalComponent>);
  private readonly router = inject(Router);

  readonly priceEur = 99;

  readonly benefits = [
    {
      icon: 'receipt_long',
      emoji: '📄',
      title: 'Factures générées automatiquement',
      description: 'Format standardisé Tuita, plus de fabrication manuelle après chaque mission',
    },
    {
      icon: 'bolt',
      emoji: '⚡',
      title: 'Paiement plus rapide',
      description: 'Moins d\'étapes, moins d\'attente - Tuita rachète la prestation directement',
    },
    {
      icon: 'workspace_premium',
      emoji: '🔗',
      title: 'Statut Pro actif',
      description: 'Exposé aux autres services Tuita - visibilité premium auprès des donneurs d\'ordre',
    },
  ];

  onUpgrade(): void {
    this.dialogRef.close('upgrade');
    this.router.navigateByUrl('/billing');
  }

  onDismiss(): void {
    this.dialogRef.close('dismiss');
  }
}
