import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './header.component';
import { FooterComponent } from './footer.component';
import { NavigationHistoryService } from '../../services/navigation-history.service';

/**
 * Contractor layout wrapper.
 * Simple structure: sticky header at top, centered content area, optional footer.
 * No sidebar -- navigation is handled entirely by the header icon bar.
 */
@Component({
  selector: 'app-contractor-layout',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, FooterComponent],
  templateUrl: './contractor-layout.component.html',
  styleUrl: './contractor-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorLayoutComponent {
  constructor() {
    inject(NavigationHistoryService);
  }
}
