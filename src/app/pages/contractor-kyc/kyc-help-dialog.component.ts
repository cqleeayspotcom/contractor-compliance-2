import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/**
 * Modal d'aide KYC — contenu détaillé pour contractor qui bute sur un geste.
 * Ouverte depuis un bouton "?" discret sur l'écran preview. L'UI principale
 * reste ultra-condensée (pour les artisans pressés), ce modal est le filet
 * pour ceux qui ont besoin de plus de contexte.
 */
@Component({
  selector: 'app-kyc-help-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './kyc-help-dialog.component.html',
  styleUrls: ['./kyc-help-dialog.component.scss'],
})
export class KycHelpDialogComponent {
  constructor(private readonly dialogRef: MatDialogRef<KycHelpDialogComponent>) {}

  close(): void {
    this.dialogRef.close();
  }
}
