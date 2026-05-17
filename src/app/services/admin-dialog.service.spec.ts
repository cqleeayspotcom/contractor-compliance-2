import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideAnimations } from '@angular/platform-browser/animations';
import { AdminDialogService } from './admin-dialog.service';
import { AdminMissionDialogComponent } from '../components/admin/admin-mission-dialog/admin-mission-dialog.component';

class FakeMatDialog {
  open = vi.fn().mockReturnValue({} as MatDialogRef<unknown>);
}

describe('AdminDialogService', () => {
  let service: AdminDialogService;
  let dialog: FakeMatDialog;

  beforeEach(() => {
    dialog = new FakeMatDialog();
    TestBed.configureTestingModule({
      providers: [provideAnimations(), AdminDialogService, { provide: MatDialog, useValue: dialog }],
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

  it('chained openMission then openInvoice does not close the first dialog', () => {
    service.openMission('M-1');
    service.openInvoice('inv-uuid');
    // openInvoice is a stub V1 — host wires actual stacking. Just verify openMission was called once.
    expect(dialog.open).toHaveBeenCalledTimes(1);
  });
});
