import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-anomaly-chip',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './anomaly-chip.component.html',
  styleUrl: './anomaly-chip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnomalyChipComponent {
  @Input({ required: true }) level!: 'warning' | 'critical';
  @Input({ required: true }) label!: string;

  get icon(): string { return this.level === 'critical' ? 'error' : 'warning'; }
}
