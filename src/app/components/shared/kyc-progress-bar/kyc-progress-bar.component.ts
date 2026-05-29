import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

/**
 * État interne du parcours KYC tel qu'exposé par `ContractorKycComponent`.
 * Dupliqué ici pour découpler le composant partagé du fichier d'origine.
 * En cas d'évolution côté KYC, garder les deux types synchronisés.
 */
export type KycFlowState =
  | 'verified_recap'
  | 'idle'
  | 'qr_code'
  | 'phone_connected'
  | 'challenge_ready'
  | 'countdown'
  | 'recording'
  | 'uploading'
  | 'processing'
  | 'polling_stalled'
  | 'approved'
  | 'rejected'
  | 'qr_expired';

/**
 * Phases visibles dans la barre de progression. On collapse les 9 états de la
 * machine en 3 étapes lisibles par un artisan BTP faible littératie — règle
 * UX : une icône par phase, un libellé court, zéro jargon technique. Cf.
 * mémoire `feedback_ux_low_literacy_artisans.md` (audit du 2026-05-11).
 */
type Phase = 0 | 1 | 2;

const STATE_TO_PHASE: Record<KycFlowState, Phase | null> = {
  // Pré-flow / post-flow : la barre n'apparaît pas (écrans dédiés).
  idle: null,
  verified_recap: null,
  approved: null,
  rejected: null,

  // Phase 1 : préparer + filmer. phone_connected = le mobile a scanné et
  // filme en ce moment ; qr_expired = le QR est mort, on en regénère un —
  // dans les deux cas on est toujours à l'étape « Filme-toi ».
  qr_code: 0,
  phone_connected: 0,
  qr_expired: 0,
  challenge_ready: 0,
  countdown: 0,
  recording: 0,

  // Phase 2 : envoyer la vidéo au backend.
  uploading: 1,

  // Phase 3 : DeepFace vérifie liveness + face matching (jusqu'à 10 min).
  processing: 2,
  polling_stalled: 2,
};

interface PhaseView {
  index: Phase;
  label: string;
  icon: string;
  status: 'past' | 'active' | 'future';
}

const PHASES: ReadonlyArray<{ index: Phase; label: string; icon: string }> = [
  { index: 0, label: 'Filme-toi', icon: 'photo_camera' },
  { index: 1, label: 'Envoi', icon: 'cloud_upload' },
  { index: 2, label: 'Vérification', icon: 'search' },
];

/**
 * Barre de progression 3 phases pour le parcours KYC vidéo.
 *
 * Affichée au-dessus du contenu actif (qr_code → processing). Cachée pendant
 * les écrans de bienvenue (`idle`, `verified_recap`) et de verdict
 * (`approved`, `rejected`) qui ont leur propre UI plein écran.
 *
 * Volontairement non-cliquable : un artisan ne doit JAMAIS pouvoir naviguer
 * en arrière une fois la vidéo prise (intégrité de la session biométrique).
 */
@Component({
  selector: 'app-kyc-progress-bar',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './kyc-progress-bar.component.html',
  styleUrl: './kyc-progress-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KycProgressBarComponent {
  /** État courant du parcours KYC (lecture seule). */
  readonly state = input.required<KycFlowState>();

  /**
   * `true` si la barre doit s'afficher pour l'état courant. Permet au parent
   * de wrapper l'élément dans un `@if` sans dupliquer la logique mapping.
   */
  readonly visible = computed<boolean>(() => STATE_TO_PHASE[this.state()] !== null);

  /**
   * Phase courante (0..2). `null` si la barre est cachée — protégé par
   * `visible` côté template.
   */
  readonly currentPhase = computed<Phase | null>(() => STATE_TO_PHASE[this.state()]);

  /** Vue rendue par le template : icône + label + statut past/active/future. */
  readonly phases = computed<readonly PhaseView[]>(() => {
    const current = this.currentPhase();
    if (current === null) return [];
    return PHASES.map((p) => ({
      ...p,
      status:
        p.index < current ? 'past' : p.index === current ? 'active' : 'future',
    }));
  });

  /**
   * Sous-texte affiché en dessous de la barre quand on est sur la phase 3
   * (vérification longue) pour rassurer l'artisan que ce n'est pas planté.
   * Vide sinon (le contexte du contenu principal est suffisant).
   */
  readonly subtext = computed<string | null>(() => {
    const s = this.state();
    // Sur `processing`, le contenu principal de la page (carte "Analyse en cours")
    // affiche déjà le détail + la durée estimée → on évite le doublon ici.
    if (s === 'polling_stalled') {
      return 'Toujours en cours - pas besoin de fermer la page.';
    }
    if (s === 'uploading') {
      return 'On envoie ta vidéo - ne ferme pas la page.';
    }
    return null;
  });
}
