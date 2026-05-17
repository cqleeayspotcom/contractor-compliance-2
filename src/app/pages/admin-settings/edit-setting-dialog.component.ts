import { ChangeDetectionStrategy, Component, Inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { PlatformSetting, SettingValue } from '../../services/admin-settings.service';

export interface EditSettingDialogResult {
  value: SettingValue;
  reason: string;
}

@Component({
  selector: 'app-edit-setting-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSlideToggleModule,
  ],
  templateUrl: './edit-setting-dialog.component.html',
  styleUrl: './edit-setting-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditSettingDialogComponent {
  readonly textValue = signal<string>('');
  readonly boolValue = signal<boolean>(false);
  readonly reason = signal<string>('');

  readonly isBoolean = computed(() => this.data.type === 'boolean');
  readonly canSubmit = computed(() => this.reason().trim().length >= 10);

  constructor(
    public dialogRef: MatDialogRef<EditSettingDialogComponent, EditSettingDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: PlatformSetting,
  ) {
    if (this.isBoolean()) {
      this.boolValue.set(Boolean(data.value));
    } else if (Array.isArray(data.value)) {
      this.textValue.set(data.value.join(', '));
    } else {
      this.textValue.set(data.value === null || data.value === undefined ? '' : String(data.value));
    }
  }

  onTextChange(value: string): void {
    this.textValue.set(value);
  }

  onBoolChange(value: boolean): void {
    this.boolValue.set(value);
  }

  onReasonChange(value: string): void {
    this.reason.set(value);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  submit(): void {
    if (!this.canSubmit()) return;
    let value: SettingValue;
    if (this.isBoolean()) {
      value = this.boolValue();
    } else if (this.data.type === 'array') {
      value = this.textValue()
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    } else if (this.data.type === 'integer') {
      const n = parseInt(this.textValue(), 10);
      value = Number.isFinite(n) ? n : this.textValue();
    } else if (this.data.type === 'float') {
      const n = parseFloat(this.textValue());
      value = Number.isFinite(n) ? n : this.textValue();
    } else {
      value = this.textValue();
    }
    this.dialogRef.close({ value, reason: this.reason().trim() });
  }
}
