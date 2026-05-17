import { Component, ChangeDetectionStrategy, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { PurchaseDetail, statusLabel, statusColor } from '../admin-purchases.component';
import { ContractorComplianceSummaryComponent } from '../../../components/shared/contractor-compliance-summary/contractor-compliance-summary.component';

@Component({
  selector: 'app-purchase-detail-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatChipsModule,
    ContractorComplianceSummaryComponent,
  ],
  templateUrl: './purchase-detail-dialog.component.html',
  styleUrl: './purchase-detail-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseDetailDialogComponent {
  private readonly router = inject(Router);

  constructor(
    public dialogRef: MatDialogRef<PurchaseDetailDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PurchaseDetail | null,
  ) {}

  canRetry(status: string): boolean {
    return status === 'failed' || status === 'pending';
  }

  emitRetry(): void {
    this.dialogRef.close({ action: 'retry' });
  }

  goToContractor(phone: string): void {
    this.router.navigate(['/admin/contractors', phone]);
    this.dialogRef.close();
  }

  statusLabel = statusLabel;
  statusColor = statusColor;

  timelineIcon(event: string): string {
    const icons: Record<string, string> = {
      created: 'add_circle',
      stripe_paid: 'payment',
      job_dispatched: 'play_arrow',
      document_created: 'check_circle',
      failed: 'error',
    };
    return icons[event] ?? 'radio_button_checked';
  }
}
