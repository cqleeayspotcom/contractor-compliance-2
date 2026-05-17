import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

export interface DlqReplayDialogResult {
  reason: string;
}

@Component({
  selector: 'app-dlq-replay-dialog',
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
  templateUrl: './dlq-replay-dialog.component.html',
  styleUrl: './dlq-replay-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DlqReplayDialogComponent {
  readonly reason = signal<string>('');
  readonly canSubmit = computed(() => this.reason().trim().length >= 10);

  constructor(public dialogRef: MatDialogRef<DlqReplayDialogComponent, DlqReplayDialogResult>) {}

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
