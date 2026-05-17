import { Injectable } from '@angular/core';

export interface OnboardingStep {
  index: number;
  total: number;
  icon: string;
  title: string;
  subtitle: string;
  cta: string;
  route: string;
  /**
   * 'onboarding' = étape du parcours d'inscription initial.
   * 'maintenance' = action ponctuelle hors-parcours (renouvellement,
   *   nouvelle tentative).
   */
  kind: 'onboarding' | 'maintenance';
  /** Vidéo explicative dédiée (utilisée par le bandeau dashboard uniquement). */
  video?: string;
}

const STEP_VIDEOS: Record<string, string> = {
  upload_missing_documents: 'assets/videos/onboarding-welcome.mp4',
  start_kyc: 'assets/videos/onboarding-kyc.mp4',
  complete_certification: 'assets/videos/onboarding-certification.mp4',
};

/**
 * Mappe la valeur backend `dashboard.next_action` (calculée par
 * `ContractorDashboardController::determineNextAction`) vers une étape
 * d'onboarding affichable.
 *
 * Renvoie `null` pour `none`, `null/undefined`, `subscribe_paid_plan`
 * (géré ailleurs) et toute valeur inconnue (forward compat).
 */
@Injectable({ providedIn: 'root' })
export class NextOnboardingStepService {
  resolve(action: string | null | undefined): OnboardingStep | null {
    if (!action || action === 'none') return null;

    const video = STEP_VIDEOS[action];

    switch (action) {
      case 'upload_missing_documents':
        return {
          kind: 'onboarding',
          index: 1,
          total: 3,
          icon: 'folder_shared',
          title: 'Téléverse ton dossier administratif',
          subtitle:
            'KBIS ou avis SIRENE, URSSAF, RC pro, RIB... quelques minutes pour tout déposer.',
          cta: 'Commencer',
          route: '/documents/upload',
          video,
        };

      case 'renew_expired_documents':
        return {
          kind: 'maintenance',
          index: 1,
          total: 3,
          icon: 'autorenew',
          title: 'Renouvelle tes documents expirés',
          subtitle:
            'Un ou plusieurs documents ne sont plus à jour — remets-toi en règle en quelques minutes.',
          cta: 'Mettre à jour',
          // Stepper plutôt que liste : se positionne sur le doc expiré et
          // affiche la dropzone immédiatement (cohérent avec le clic Gérer
          // de la tuile dashboard et le dialog d'urgence).
          route: '/documents/upload',
        };

      case 'start_kyc':
        return {
          kind: 'onboarding',
          index: 2,
          total: 3,
          icon: 'badge',
          title: 'Vérifie ton identité en vidéo',
          subtitle:
            'Une courte vidéo (~30 s) avec deux gestes simples — c\'est demandé une seule fois.',
          cta: 'Démarrer',
          route: '/kyc',
          video,
        };

      case 'retry_kyc':
        return {
          kind: 'maintenance',
          index: 2,
          total: 3,
          icon: 'badge',
          title: 'Refais ta vérification d\'identité',
          subtitle:
            'Ta dernière tentative n\'a pas abouti. Recommence dans de bonnes conditions (lumière, fond neutre).',
          cta: 'Reprendre',
          route: '/kyc',
        };

      case 'complete_certification':
        return {
          kind: 'onboarding',
          index: 3,
          total: 3,
          icon: 'school',
          title: 'Passe le test de qualification Tuita',
          subtitle:
            'Un QCM rapide (24 questions) pour valider tes acquis et débloquer tes chantiers.',
          cta: 'Commencer le test',
          route: '/certification',
          video,
        };

      case 'subscribe_paid_plan':
      default:
        return null;
    }
  }
}
