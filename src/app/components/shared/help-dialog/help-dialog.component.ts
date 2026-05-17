import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { PricingService } from '../../../services/pricing.service';

/**
 * Modal d'aide global accessible depuis le header du dashboard contractor.
 *
 * Cible : artisan BTP / secrétaire qui dépose les docs pour son patron, sans
 * vocabulaire technique. Explique le parcours en 4 sections : à quoi ça sert,
 * quels docs fournir et où les obtenir, comment se passe la vérification
 * d'identité, qui contacter en cas de blocage.
 */
@Component({
  selector: 'app-help-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './help-dialog.component.html',
  styleUrls: ['./help-dialog.component.scss'],
})
export class HelpDialogComponent {
  /** Vidéo arrivée à la fin → on affiche un bouton "Revoir" en overlay. */
  readonly videoEnded = signal<boolean>(false);

  private readonly pricing = inject(PricingService);

  extraitInpiPriceLabel(): string {
    return this.pricing.priceLabelFor('extrait_inpi');
  }

  constructor(private readonly dialogRef: MatDialogRef<HelpDialogComponent>) {}

  replayVideo(video: HTMLVideoElement): void {
    video.currentTime = 0;
    void video.play();
    this.videoEnded.set(false);
  }

  close(): void {
    this.dialogRef.close();
  }
}
