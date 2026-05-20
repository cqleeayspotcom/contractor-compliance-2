import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  ElementRef,
  input,
  computed,
  signal,
  inject,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import {
  NextOnboardingStepService,
  OnboardingStep,
} from '../../../services/next-onboarding-step.service';

/** Départ du compte à rebours avant lancement auto de la vidéo (secondes). */
const COUNTDOWN_FROM = 3;

/**
 * Bandeau onboarding pleine largeur affiché au-dessus de la grille du dashboard.
 *
 * Pas de modal popup — pattern Stripe / Qonto : une seule étape visible à la
 * fois, reste affichée tant que l'étape n'est pas faite. Pilotée par le
 * `next_action` retourné par `ContractorDashboardController::determineNextAction`,
 * mappé via `NextOnboardingStepService`.
 *
 * Sur les étapes d'onboarding (kind='onboarding'), une vidéo de présentation
 * joue à gauche. Elle ne démarre PAS immédiatement : un compte à rebours
 * 3 → 2 → 1 s'affiche d'abord (bouton « Stop » pour couper), puis la vidéo
 * se lance toute seule. En fin de lecture, le bouton « Revoir la vidéo »
 * apparaît.
 */
@Component({
  selector: 'app-onboarding-banner',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule],
  templateUrl: './onboarding-banner.component.html',
  styleUrl: './onboarding-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingBannerComponent implements OnInit, OnDestroy {
  private readonly nextStepService = inject(NextOnboardingStepService);

  readonly nextAction = input<string | null | undefined>(null);
  readonly firstName = input<string>('');

  /** Réf. à l'élément <video> — sert à lancer la lecture en fin de décompte. */
  private readonly bannerVideo = viewChild<ElementRef<HTMLVideoElement>>('bannerVideo');

  readonly step = computed<OnboardingStep | null>(() =>
    this.nextStepService.resolve(this.nextAction()),
  );

  readonly hasVideo = computed<boolean>(() => !!this.step()?.video);

  /**
   * Compte à rebours avant lancement automatique de la vidéo.
   * - nombre (3 → 1) : décompte en cours, l'artisan peut encore couper.
   * - null : décompte terminé ou annulé — plus d'overlay de décompte.
   */
  readonly countdown = signal<number | null>(null);

  /** Vrai pendant que la vidéo joue — masque l'overlay « Lancer la vidéo ». */
  readonly playing = signal<boolean>(false);

  /** Vrai quand la vidéo est arrivée à la fin — affiche le bouton « Revoir ». */
  readonly videoEnded = signal<boolean>(false);

  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    // Décompte lancé uniquement quand une vidéo est présente sur l'étape.
    if (this.hasVideo()) {
      this.startCountdown();
    }
  }

  ngOnDestroy(): void {
    this.clearCountdownTimer();
  }

  /**
   * Démarre le décompte 3 → 2 → 1. À 0, la vidéo se lance automatiquement.
   * Le bouton « Stop » de l'overlay laisse le temps de couper avant la fin.
   */
  private startCountdown(): void {
    this.countdown.set(COUNTDOWN_FROM);
    this.countdownTimer = setInterval(() => {
      const current = this.countdown();
      if (current === null) {
        return;
      }
      if (current <= 1) {
        this.clearCountdownTimer();
        this.countdown.set(null);
        // `playing` posé en optimiste pour éviter un flash de l'overlay
        // « Lancer la vidéo » entre la fin du décompte et l'event (play).
        this.playing.set(true);
        void this.bannerVideo()?.nativeElement.play();
      } else {
        this.countdown.set(current - 1);
      }
    }, 1000);
  }

  /**
   * Coupe le décompte avant la fin — la vidéo ne démarre pas toute seule.
   * L'artisan garde la main : le bouton « Lancer la vidéo » prend le relais.
   */
  cancelCountdown(): void {
    this.clearCountdownTimer();
    this.countdown.set(null);
  }

  private clearCountdownTimer(): void {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  /** Lance la vidéo manuellement (après un Stop ou une pause). */
  playVideo(video: HTMLVideoElement): void {
    this.playing.set(true);
    void video.play();
  }

  /** Relance la vidéo depuis le début (bouton « Revoir »). */
  replayVideo(video: HTMLVideoElement): void {
    video.currentTime = 0;
    this.playing.set(true);
    this.videoEnded.set(false);
    void video.play();
  }

  /**
   * FIX-035 — Toggle play/pause via tap sur la vidéo (compense l'absence de
   * `controls` natifs, retirés pour ne pas polluer le rendu mobile).
   */
  toggleVideoPlayback(video: HTMLVideoElement): void {
    if (video.paused || video.ended) {
      void video.play();
    } else {
      video.pause();
    }
  }

  // ── Source de vérité de l'état lecture : les events natifs de <video> ──
  onVideoPlay(): void {
    this.playing.set(true);
    this.videoEnded.set(false);
  }

  onVideoPause(): void {
    this.playing.set(false);
  }

  onVideoEnded(): void {
    this.playing.set(false);
    this.videoEnded.set(true);
  }
}
