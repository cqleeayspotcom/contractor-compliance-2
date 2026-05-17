import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { BackButtonComponent } from '../../components/shared/back-button/back-button.component';
import { ContractorApiService, MissionOffer } from '../../services/contractor-api.service';

type ViewState =
  | { kind: 'loading' }
  | { kind: 'ready'; offers: MissionOffer[]; canAccept: boolean }
  | { kind: 'error'; message: string };

@Component({
  selector: 'app-contractor-mission-offers',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, MatButtonModule, BackButtonComponent],
  templateUrl: './contractor-mission-offers.component.html',
  styleUrl: './contractor-mission-offers.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorMissionOffersComponent implements OnInit {
  private api = inject(ContractorApiService);

  state = signal<ViewState>({ kind: 'loading' });

  isLoading = computed(() => this.state().kind === 'loading');
  isEmpty = computed(() => {
    const s = this.state();
    return s.kind === 'ready' && s.offers.length === 0;
  });
  offers = computed(() => {
    const s = this.state();
    return s.kind === 'ready' ? s.offers : [];
  });
  /**
   * `false` quand le contractor n'est pas encore `fully_verified` : on
   * affiche les vraies offres (carotte motivante) mais on désactive les
   * actions accept/decline. Le bandeau d'alerte en haut pousse vers
   * `/documents/upload` pour finir l'onboarding.
   */
  canAccept = computed(() => {
    const s = this.state();
    return s.kind === 'ready' ? s.canAccept : true;
  });
  showVerificationAlert = computed(() => {
    const s = this.state();
    return s.kind === 'ready' && !s.canAccept;
  });
  errorMessage = computed(() => {
    const s = this.state();
    return s.kind === 'error' ? s.message : '';
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.state.set({ kind: 'loading' });
    this.api.listMissionOffers().subscribe({
      next: (res) => this.state.set({
        kind: 'ready',
        offers: res.data ?? [],
        canAccept: res.can_accept ?? true,
      }),
      error: (err) => {
        this.state.set({
          kind: 'error',
          message: err.status === 503
            ? 'Service momentanément indisponible. Réessaie dans 1 min.'
            : "Impossible de charger les offres pour le moment.",
        });
      },
    });
  }

  retry(): void { this.load(); }

  expiresSoon(offer: MissionOffer): boolean {
    const expiresAt = new Date(offer.expires_at).getTime();
    return expiresAt - Date.now() < 4 * 60 * 60 * 1000;
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
  }

  trackByRef(_i: number, offer: MissionOffer): string { return offer.mission_ref; }
}
