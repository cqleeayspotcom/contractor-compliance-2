import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-deviation-badge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './deviation-badge.component.html',
  styleUrl: './deviation-badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviationBadgeComponent {
  @Input() deviationPct: number | null = null;

  get label(): string {
    if (this.deviationPct === null) return '—';
    const sign = this.deviationPct > 0 ? '+' : '';
    return `${sign}${this.deviationPct.toFixed(1)}%`;
  }

  get cssClass(): string {
    if (this.deviationPct === null) return 'dev dev--neutral';
    if (Math.abs(this.deviationPct) <= 5) return 'dev dev--ok';
    return 'dev dev--warn';
  }
}
