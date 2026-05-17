import {
  Component,
  ChangeDetectionStrategy,
  input,
  computed,
  signal,
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
 * Bandeau onboarding pleine largeur affiché au-dessus de la grille du dashboard.
 *
 * Pas de modal popup — pattern Stripe / Qonto : une seule étape visible à la
 * fois, reste affichée tant que l'étape n'est pas faite. Pilotée par le
 * `next_action` retourné par `ContractorDashboardController::determineNextAction`,
 * mappé via `NextOnboardingStepService`.
 *
 * Sur les étapes d'onboarding (kind='onboarding'), une vidéo de présentation
 * joue à gauche en autoplay muet.
 */
@Component({
  selector: 'app-onboarding-banner',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule],
  templateUrl: './onboarding-banner.component.html',
  styleUrl: './onboarding-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingBannerComponent {
  private readonly nextStepService = inject(NextOnboardingStepService);

  readonly nextAction = input<string | null | undefined>(null);
  readonly firstName = input<string>('');

  readonly step = computed<OnboardingStep | null>(() =>
    this.nextStepService.resolve(this.nextAction()),
  );

  readonly hasVideo = computed<boolean>(() => !!this.step()?.video);

  readonly videoEnded = signal<boolean>(false);

  replayVideo(video: HTMLVideoElement): void {
    video.currentTime = 0;
    void video.play();
    this.videoEnded.set(false);
  }

  /**
   * FIX-035 — Toggle play/pause via tap sur la vidéo (compense l'absence de
   * `controls` natifs, retirés pour ne pas polluer le rendu mobile).
   */
  toggleVideoPlayback(video: HTMLVideoElement): void {
    if (video.paused || video.ended) {
      void video.play();
      this.videoEnded.set(false);
    } else {
      video.pause();
    }
  }
}
