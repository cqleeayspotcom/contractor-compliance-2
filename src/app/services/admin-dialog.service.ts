import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { AdminMissionDialogComponent, AdminMissionDialogData }
  from '../components/admin/admin-mission-dialog/admin-mission-dialog.component';

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
   * V1 stub. The mission dialog emits an `openInvoice` Output that the host
   * page (admin-invoices) wires to its existing openDetail() — Material
   * stacks the second dialog on top automatically.
   */
  openInvoice(invoiceUuid: string): MatDialogRef<unknown> | null {
    void invoiceUuid;
    return null;
  }
}
