import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

/**
 * Dialog de confirmation pour la déconnexion. Remplace `window.confirm()`
 * (alerte JS brute, non accessible, look amateur). Utilise un MatDialog
 * Material, focus restauré sur « Annuler » par défaut pour éviter une
 * déconnexion par Entrée accidentel.
 */
@Component({
  selector: 'app-logout-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './logout-confirm-dialog.component.html',
  styleUrls: ['./logout-confirm-dialog.component.scss'],
})
export class LogoutConfirmDialogComponent {
  constructor(private readonly dialogRef: MatDialogRef<LogoutConfirmDialogComponent, boolean>) {}

  cancel(): void {
    this.dialogRef.close(false);
  }

  confirm(): void {
    this.dialogRef.close(true);
  }
}
