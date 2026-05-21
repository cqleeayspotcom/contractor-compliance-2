import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { AdminMissionDialogComponent, AdminMissionDialogData }
  from '../components/admin/admin-mission-dialog/admin-mission-dialog.component';
import { AdminInvoiceDialogComponent, AdminInvoiceDialogData }
  from '../components/admin/admin-invoice-dialog/admin-invoice-dialog.component';

@Injectable({ providedIn: 'root' })
export class AdminDialogService {
  private dialog = inject(MatDialog);

  openMission(missionRef: string): MatDialogRef<AdminMissionDialogComponent> {
    return this.dialog.open<AdminMissionDialogComponent, AdminMissionDialogData>(
      AdminMissionDialogComponent,
      {
        data: { missionRef },
        width: '1100px',
        maxWidth: '95vw',
        panelClass: 'admin-dialog',
        autoFocus: false,
      },
    );
  }

  /**
   * Ouvre le dialog facture autonome — empilable par-dessus n'importe quel
   * autre modal (fiche contractor, dialog mission…). Material gère le
   * stacking. À la fermeture, le résultat vaut `true` si une action a modifié
   * la facture, pour que l'hôte rafraîchisse sa liste.
   */
  openInvoice(invoiceUuid: string): MatDialogRef<AdminInvoiceDialogComponent, boolean> {
    return this.dialog.open<AdminInvoiceDialogComponent, AdminInvoiceDialogData, boolean>(
      AdminInvoiceDialogComponent,
      {
        data: { invoiceUuid },
        width: '1100px',
        maxWidth: '95vw',
        maxHeight: '92vh',
        panelClass: 'admin-dialog',
        autoFocus: false,
      },
    );
  }
}
