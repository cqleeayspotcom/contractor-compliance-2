import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { AdminDialogService } from './admin-dialog.service';
import { AdminMissionDialogComponent } from '../components/admin/admin-mission-dialog/admin-mission-dialog.component';
import { AdminInvoiceDialogComponent } from '../components/admin/admin-invoice-dialog/admin-invoice-dialog.component';

class FakeMatDialog {
  // Chaque appel renvoie une ref distincte avec un spy `close`, pour pouvoir
  // vérifier qu'empiler un 2e dialog ne ferme pas le précédent.
  open = vi.fn(() => ({ close: vi.fn() }) as unknown as MatDialogRef<unknown>);
}

describe('AdminDialogService', () => {
  let service: AdminDialogService;
  let dialog: FakeMatDialog;

  beforeEach(() => {
    dialog = new FakeMatDialog();
    TestBed.configureTestingModule({
      providers: [AdminDialogService, { provide: MatDialog, useValue: dialog }],
    });
    service = TestBed.inject(AdminDialogService);
  });

  it('openMission opens AdminMissionDialogComponent with mission_ref data', () => {
    service.openMission('M-1');
    expect(dialog.open).toHaveBeenCalledWith(AdminMissionDialogComponent, expect.objectContaining({
      data: { missionRef: 'M-1' },
      width: '1100px',
      maxWidth: '95vw',
      panelClass: 'admin-dialog',
      autoFocus: false,
    }));
  });

  it('chained openMission then openInvoice stacks both dialogs without closing the first', () => {
    const missionRef = service.openMission('M-1');
    service.openInvoice('inv-uuid');
    // openInvoice ouvre AdminInvoiceDialogComponent par-dessus le dialog
    // mission. Material empile les modals : le premier ne doit pas se fermer.
    expect(dialog.open).toHaveBeenCalledTimes(2);
    expect(dialog.open).toHaveBeenNthCalledWith(
      2,
      AdminInvoiceDialogComponent,
      expect.objectContaining({ data: { invoiceUuid: 'inv-uuid' } }),
    );
    expect(missionRef.close).not.toHaveBeenCalled();
  });
});
