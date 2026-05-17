import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-kpi-tile',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './kpi-tile.component.html',
  styleUrl: './kpi-tile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KpiTileComponent {
  @Input({ required: true }) icon!: string;
  @Input({ required: true }) label!: string;
  @Input({ required: true }) value!: string;
  @Input() sub: string | null = null;
  @Input() tone: 'neutral' | 'positive' | 'warning' | 'critical' = 'neutral';
}
