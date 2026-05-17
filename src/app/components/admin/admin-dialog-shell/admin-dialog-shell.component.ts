import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-admin-dialog-shell',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './admin-dialog-shell.component.html',
  styleUrl: './admin-dialog-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDialogShellComponent {
  @Input() title = '';
  @Input() loading = false;
  @Input() error: string | null = null;
  @Output() close = new EventEmitter<void>();
}
