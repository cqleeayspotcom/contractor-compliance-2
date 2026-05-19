import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
// POURQUOI : types métier exposés par le composant dialog (l'ancien
// AdminMissionService a été supprimé car wrapper trivial du SDK).
import { MissionContractor } from '../admin-mission-dialog/admin-mission-dialog.component';
import { PhoneDisplayPipe } from '../../../pipes/phone-display.pipe';

@Component({
  selector: 'app-contractor-mini-card',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, PhoneDisplayPipe],
  templateUrl: './contractor-mini-card.component.html',
  styleUrl: './contractor-mini-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorMiniCardComponent {
  @Input({ required: true }) contractor!: MissionContractor;
  @Output() openProfile = new EventEmitter<string>();

  get fullName(): string {
    return [this.contractor.first_name, this.contractor.last_name].filter(Boolean).join(' ') || '—';
  }
}
