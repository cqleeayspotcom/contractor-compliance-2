import {
  Component,
  ChangeDetectionStrategy,
  input,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import {
  NextOnboardingStepService,
  OnboardingStep,
} from '../../../services/next-onboarding-step.service';

/**
 * CTA compact rendu en footer d'une "card succès" (KYC approved, QCM réussi,
 * doc vérifié) pour pousser vers la prochaine étape manquante du tunnel
 * d'onboarding.
 *
 * Source de vérité = `dashboard.next_action`. Renvoie un rendu vide si
 * l'action est `none`, null, ou inconnue (forward compat).
 *
 * Différent du `<app-onboarding-banner>` :
 * - Carte compacte (pas pleine largeur)
 * - Pas de vidéo (déjà joué côté dashboard, on évite la sur-stimulation)
 * - Bouton primaire uniquement
 */
@Component({
  selector: 'app-onboarding-next-step-cta',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule],
  templateUrl: './onboarding-next-step-cta.component.html',
  styleUrl: './onboarding-next-step-cta.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingNextStepCtaComponent {
  private readonly nextStepService = inject(NextOnboardingStepService);

  readonly nextAction = input<string | null | undefined>(null);

  readonly step = computed<OnboardingStep | null>(() =>
    this.nextStepService.resolve(this.nextAction()),
  );
}
