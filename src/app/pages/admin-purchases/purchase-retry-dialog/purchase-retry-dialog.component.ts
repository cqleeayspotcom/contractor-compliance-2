import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-purchase-retry-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './purchase-retry-dialog.component.html',
  styleUrl: './purchase-retry-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseRetryDialogComponent {
  reason = '';

  constructor(public dialogRef: MatDialogRef<PurchaseRetryDialogComponent>) {}

  confirm(): void {
    this.dialogRef.close({ reason: this.reason.trim() });
  }
}
