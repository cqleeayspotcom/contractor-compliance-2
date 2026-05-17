import { ChangeDetectionStrategy, Component, EventEmitter, Inject, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { AdminMissionService, MissionDetail } from '../../../services/admin-mission.service';
import { AdminDialogShellComponent } from '../admin-dialog-shell/admin-dialog-shell.component';
import { KpiTileComponent } from '../kpi-tile/kpi-tile.component';
import { AnomalyChipComponent } from '../anomaly-chip/anomaly-chip.component';
import { ContractorMiniCardComponent } from '../contractor-mini-card/contractor-mini-card.component';
import { InvoiceStatusChipComponent } from '../invoice-status-chip/invoice-status-chip.component';
import { ValidatorChipsComponent } from '../validator-chips/validator-chips.component';
import { WebhookStatusDotsComponent } from '../webhook-status-dots/webhook-status-dots.component';
import { DeviationBadgeComponent } from '../deviation-badge/deviation-badge.component';

export interface AdminMissionDialogData { missionRef: string; }

@Component({
  selector: 'app-admin-mission-dialog',
  standalone: true,
  imports: [
    CommonModule, MatIconModule, MatButtonModule, MatTooltipModule,
    AdminDialogShellComponent, KpiTileComponent, AnomalyChipComponent,
    ContractorMiniCardComponent, InvoiceStatusChipComponent,
    ValidatorChipsComponent, WebhookStatusDotsComponent, DeviationBadgeComponent,
  ],
  templateUrl: './admin-mission-dialog.component.html',
  styleUrl: './admin-mission-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminMissionDialogComponent implements OnInit {
  private svc = inject(AdminMissionService);
  private router = inject(Router);
  private ref = inject(MatDialogRef<AdminMissionDialogComponent>);

  loading = signal(true);
  error = signal<string | null>(null);
  detail = signal<MissionDetail | null>(null);

  @Output() openInvoice = new EventEmitter<string>();

  constructor(@Inject(MAT_DIALOG_DATA) public data: AdminMissionDialogData) {}

  ngOnInit(): void {
    this.svc.getMissionDetail(this.data.missionRef).subscribe({
      next: d => { this.detail.set(d); this.loading.set(false); },
      error: e => {
        const code = e?.error?.error?.code;
        this.error.set(code === 'mission.unknown' ? 'Mission inconnue ou cancelled' : 'Erreur de chargement');
        this.loading.set(false);
      },
    });
  }

  onInvoiceClick(uuid: string): void { this.openInvoice.emit(uuid); }

  onContractorClick(uuid: string): void {
    this.router.navigate(['/admin/contractors', uuid]);
    this.ref.close();
  }

  close(): void { this.ref.close(); }

  missionStatusLabel(d: MissionDetail | null): string {
    if (!d) return '';
    if (d.snapshot === null && d.invoices.length > 0) return 'Cancelled / inconnue';
    if (d.snapshot === null) return 'Inconnue';
    return 'Active';
  }
}
