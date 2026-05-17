import { Component, ChangeDetectionStrategy, input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Rib } from '../../../services/admin-invoice.service';

@Component({
  selector: 'app-rib-display',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule, MatSnackBarModule],
  templateUrl: './rib-display.component.html',
  styleUrl: './rib-display.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RibDisplayComponent {
  private readonly snack = inject(MatSnackBar);
  readonly rib = input.required<Rib>();

  async copy(value: string | null, label: string): Promise<void> {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      this.snack.open(label, 'OK', { duration: 1500 });
    } catch {
      this.snack.open('Copie échouée', 'OK', { duration: 2000 });
    }
  }

  copyIban(): void {
    const compact = (this.rib().iban ?? '').replace(/\s+/g, '');
    void this.copy(compact, 'IBAN copié');
  }
}
