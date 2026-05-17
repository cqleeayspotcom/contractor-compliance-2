import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { NavigationHistoryService } from '../../../services/navigation-history.service';

@Component({
  selector: 'app-back-button',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './back-button.component.html',
  styleUrl: './back-button.component.scss',
})
export class BackButtonComponent {
  private readonly history = inject(NavigationHistoryService);

  /** Fallback target if there is no in-app history (direct entry, refresh, deep link). */
  to = input<string | unknown[]>('/dashboard');
  /** Texte affiché à droite de l'icône. Vide par défaut (icône seule). */
  label = input<string>('');

  onClick(event: MouseEvent): void {
    event.preventDefault();
    this.history.back(this.to());
  }
}
