import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { PricingService } from '../../../services/pricing.service';

export interface UrgencyDialogData {
  /** Action attendue côté backend (mêmes valeurs que `next_action`). */
  nextAction: string;
  firstName: string;
}

interface UrgencyContent {
  icon: string;
  title: string;
  body: string;
  cta: string;
  route: string;
}

/**
 * Modal récurrent affiché quand le dossier contractor n'est pas complet.
 * Volontairement bloquant (pas de croix, pas d'esc) — l'artisan doit
 * cliquer "Plus tard" ou "Continuer" pour le fermer.
 *
 * Réapparaît à chaque arrivée sur le dashboard tant que `next_action` n'est
 * pas `none`. Le service `UrgencyDialogService` gère la fréquence pour ne
 * pas l'afficher 10 fois par jour si l'artisan rafraîchit la page.
 */
@Component({
  selector: 'app-urgency-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './urgency-dialog.component.html',
  styleUrl: './urgency-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UrgencyDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<UrgencyDialogComponent>>(MatDialogRef);
  private readonly router = inject(Router);
  readonly data = inject<UrgencyDialogData>(MAT_DIALOG_DATA);
  private readonly pricing = inject(PricingService);

  readonly content: UrgencyContent = this.computeContent(this.data.nextAction);

  private computeContent(action: string): UrgencyContent {
    switch (action) {
      case 'upload_missing_documents':
        return {
          icon: 'folder_shared',
          title: 'Ton dossier n\'est pas complet',
          body:
            'Sans tes documents administratifs, tu ne peux pas recevoir de chantier. quelques minutes pour tout déposer.',
          cta: 'Compléter mon dossier',
          route: '/documents/upload',
        };
      case 'start_kyc':
        return {
          icon: 'badge',
          title: 'Ta vérification d\'identité reste à faire',
          body:
            'Une courte vidéo (~30 s) avec deux gestes simples - une seule fois et c\'est validé pour toujours.',
          cta: 'Vérifier mon identité',
          route: '/kyc',
        };
      case 'retry_kyc':
        return {
          icon: 'badge',
          title: 'Refais ta vérification d\'identité',
          body:
            'Ta dernière tentative n\'a pas abouti. Recommence dans de bonnes conditions de lumière.',
          cta: 'Reprendre',
          route: '/kyc',
        };
      case 'complete_certification':
        return {
          icon: 'school',
          title: 'Passe ton test Tuita pour finaliser',
          body:
            'Un QCM de 24 questions pour valider tes acquis et débloquer tes premiers chantiers.',
          cta: 'Passer le test',
          route: '/certification',
        };
      case 'subscribe_paid_plan':
        return {
          icon: 'workspace_premium',
          title: 'Passe en offre Pro',
          body:
            `Factures générées automatiquement, paiement sécurisé et zéro paperasse. ${this.pricing.subscriptionPriceLabel()}/mois.`,
          cta: 'Découvrir Pro',
          route: '/billing',
        };
      case 'renew_expired_documents':
        return {
          icon: 'autorenew',
          title: 'Un de tes documents a expiré',
          body:
            'Pour rester actif sur Tuita, mets à jour ton dossier en quelques minutes.',
          cta: 'Mettre à jour',
          // Route vers le stepper (`/documents/upload`) plutôt que la liste —
          // le stepper se positionne automatiquement sur le doc expiré et
          // affiche la dropzone + la date d'expiration.
          route: '/documents/upload',
        };
      default:
        return {
          icon: 'priority_high',
          title: 'Une action est requise',
          body: 'Termine la prochaine étape de ton inscription pour débloquer tes chantiers.',
          cta: 'Continuer',
          route: '/dashboard',
        };
    }
  }

  greeting(): string {
    const name = this.data.firstName?.trim();
    return name ? `${name}, ` : '';
  }

  goToAction(): void {
    this.dialogRef.close({ action: 'go' });
    void this.router.navigateByUrl(this.content.route);
  }

  later(): void {
    this.dialogRef.close({ action: 'later' });
  }
}
