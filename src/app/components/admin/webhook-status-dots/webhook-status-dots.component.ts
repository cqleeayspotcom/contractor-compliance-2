import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface WebhookFlags {
  rejected: boolean;
  ready_to_pay: boolean;
  payment_in_progress: boolean;
  paid: boolean;
}

@Component({
  selector: 'app-webhook-status-dots',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './webhook-status-dots.component.html',
  styleUrl: './webhook-status-dots.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebhookStatusDotsComponent {
  @Input({ required: true }) webhooks!: WebhookFlags;

  readonly events: Array<{ key: keyof WebhookFlags; label: string; abbr: string }> = [
    { key: 'rejected', label: 'rejected', abbr: 'r' },
    { key: 'ready_to_pay', label: 'ready_to_pay', abbr: 'p' },
    { key: 'payment_in_progress', label: 'payment_in_progress', abbr: 'i' },
    { key: 'paid', label: 'paid', abbr: 'd' },
  ];
}
