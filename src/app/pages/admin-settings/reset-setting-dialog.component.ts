import { ChangeDetectionStrategy, Component, Inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { PlatformSetting } from '../../services/admin-settings.service';

export interface ResetSettingDialogResult {
  reason: string;
}

@Component({
  selector: 'app-reset-setting-dialog',
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
  templateUrl: './reset-setting-dialog.component.html',
  styleUrl: './reset-setting-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetSettingDialogComponent {
  readonly reason = signal<string>('');
  readonly canSubmit = computed(() => this.reason().trim().length >= 10);

  constructor(
    public dialogRef: MatDialogRef<ResetSettingDialogComponent, ResetSettingDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: PlatformSetting,
  ) {}

  onReasonChange(value: string): void {
    this.reason.set(value);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  submit(): void {
    if (!this.canSubmit()) return;
    this.dialogRef.close({ reason: this.reason().trim() });
  }
}
