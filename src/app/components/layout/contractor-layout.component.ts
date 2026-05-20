import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { HeaderComponent } from './header.component';
import { AdminHeaderComponent } from './admin-header.component';
import { FooterComponent } from './footer.component';
import { NavigationHistoryService } from '../../services/navigation-history.service';

/**
 * App layout wrapper.
 * Simple structure: sticky header at top, centered content area, optional footer.
 * No sidebar -- navigation is handled entirely by the header icon bar.
 *
 * Le header dépend de la zone :
 *  - routes contractor  -> `app-header` (header contractor) + `app-footer`
 *  - routes `/admin/**`  -> `app-admin-header` (header admin dédié), SANS footer
 */
@Component({
  selector: 'app-contractor-layout',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, AdminHeaderComponent, FooterComponent],
  templateUrl: './contractor-layout.component.html',
  styleUrl: './contractor-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorLayoutComponent {
  private readonly router = inject(Router);

  /**
   * Vrai sur toutes les routes de l'espace admin (`/admin`, `/admin/login`,
   * `/admin/**`). Pilote l'affichage : header admin dédié + pas de footer.
   */
  readonly isAdminRoute = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.router.url.startsWith('/admin')),
    ),
    { initialValue: this.router.url.startsWith('/admin') },
  );

  constructor() {
    inject(NavigationHistoryService);
  }
}
