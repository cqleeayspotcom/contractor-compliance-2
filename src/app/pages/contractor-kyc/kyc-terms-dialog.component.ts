import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-kyc-terms-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './kyc-terms-dialog.component.html',
  styleUrl: './kyc-terms-dialog.component.scss',
})
export class KycTermsDialogComponent {
  constructor(private dialogRef: MatDialogRef<KycTermsDialogComponent>) {}

  accept(): void {
    this.dialogRef.close(true);
  }

  decline(): void {
    this.dialogRef.close(false);
  }
}
