import { Component, ChangeDetectionStrategy, input, output, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-keyboard-shortcuts-overlay',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  templateUrl: './keyboard-shortcuts-overlay.component.html',
  styleUrl: './keyboard-shortcuts-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyboardShortcutsOverlayComponent {
  readonly visible = input<boolean>(false);
  readonly closed = output<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.visible()) this.closed.emit();
  }

  onBackdropClick(): void {
    this.closed.emit();
  }
}
