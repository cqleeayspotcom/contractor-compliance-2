import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';

/**
 * Données injectées dans le dialog vidéo de l'onboarding.
 *
 * `forceWatch=true` (auto-open d'une étape) → le bouton « J'ai compris » reste
 * désactivé jusqu'au `(ended)` du player. `forceWatch=false` (replay manuel) →
 * bouton actif d'emblée : l'artisan a déjà passé le gate, on respecte son temps.
 */
export interface OnboardingVideoDialogData {
  videoUrl: string;
  stepTitle: string;
  stepNumber: number;
  totalSteps: number;
  forceWatch: boolean;
  /**
   * Lien d'aide externe affiché sous la vidéo. Cas d'usage : envoyer l'artisan
   * vers la page officielle de l'organisme pour télécharger un document qu'on
   * ne sait pas récupérer pour lui (URSSAF — pas de Pappers possible). S'ouvre
   * dans un nouvel onglet, ne ferme pas le dialog pour préserver la progression.
   */
  helpLink?: {
    url: string;
    label: string;
  };
}

@Component({
  selector: 'app-onboarding-video-dialog',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './onboarding-video-dialog.component.html',
  styleUrl: './onboarding-video-dialog.component.scss',
})
export class OnboardingVideoDialogComponent {
  readonly data = inject<OnboardingVideoDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(
    MatDialogRef<OnboardingVideoDialogComponent>,
  );

  readonly videoEnded = signal<boolean>(false);

  readonly canDismiss = computed<boolean>(
    () => !this.data.forceWatch || this.videoEnded(),
  );

  onVideoEnded(): void {
    this.videoEnded.set(true);
  }

  dismiss(): void {
    if (!this.canDismiss()) return;
    this.dialogRef.close();
  }

  /** Sortie de secours (×) — toujours active, contourne le gate forceWatch.
   * Évite que l'artisan reste piégé si la vidéo n'émet jamais (ended). */
  forceClose(): void {
    this.dialogRef.close();
  }
}
