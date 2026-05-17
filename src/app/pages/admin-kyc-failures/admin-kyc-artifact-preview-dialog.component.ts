import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-admin-kyc-artifact-preview-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './admin-kyc-artifact-preview-dialog.component.html',
  styleUrl: './admin-kyc-artifact-preview-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminKycArtifactPreviewDialogComponent {
  readonly dialogRef = inject(MatDialogRef<AdminKycArtifactPreviewDialogComponent>);
  readonly data = inject<{ url: string; label: string }>(MAT_DIALOG_DATA);

  close(): void {
    this.dialogRef.close();
  }
}
