import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/**
 * Confirmation avant de relancer une session KYC alors que l'identité est
 * déjà vérifiée. Refaire le KYC invalide le statut actuel → `canRun=false`
 * sur tuita.fr tant que la nouvelle session n'est pas approuvée. Porte de
 * secours auditable, fermée par défaut pour éviter l'auto-sabotage.
 */
@Component({
  selector: 'app-kyc-redo-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './kyc-redo-confirm-dialog.component.html',
  styleUrls: ['./kyc-redo-confirm-dialog.component.scss'],
})
export class KycRedoConfirmDialogComponent {
  constructor(private readonly dialogRef: MatDialogRef<KycRedoConfirmDialogComponent, boolean>) {}

  cancel(): void {
    this.dialogRef.close(false);
  }

  confirm(): void {
    this.dialogRef.close(true);
  }
}
