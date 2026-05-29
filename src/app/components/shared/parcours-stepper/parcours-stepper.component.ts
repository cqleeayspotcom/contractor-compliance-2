import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

/**
 * Index 1-based de la phase courante du parcours d'onboarding Tuita.
 *   1 = Documents (téléversement / dossier admin)
 *   2 = Identité (KYC vidéo)
 *   3 = Certification (QCM Tuita)
 */
export type ParcoursPhase = 1 | 2 | 3;

interface PhaseView {
  index: ParcoursPhase;
  label: string;
  shortLabel: string;
  icon: string;
  route: string;
  status: 'past' | 'active' | 'future';
}

// IMPORTANT — Phase 1 route vers `/documents` (page de gestion permanente)
// et PAS `/documents/upload` (le stepper one-shot). Le stepper d'upload
// auto-redirige vers /kyc dès que `allDone()` est vrai
// (cf. onboarding-upload-stepper.component.ts L1193-L1213) → un artisan qui
// revient sur ses documents APRÈS avoir tout validé serait téléporté hors
// de l'écran qu'il a justement demandé. La page `/documents` reste accessible
// dans tous les cas et liste les pièces avec un bouton « Gérer ».
const PHASES: ReadonlyArray<Omit<PhaseView, 'status'>> = [
  { index: 1, label: 'Documents',     shortLabel: 'Docs',   icon: 'folder_shared', route: '/documents' },
  { index: 2, label: 'Identité',      shortLabel: 'Identité', icon: 'badge',       route: '/kyc' },
  { index: 3, label: 'Certification', shortLabel: 'Certif.', icon: 'school',      route: '/certification' },
];

/**
 * Mini-stepper horizontal affiché en haut de chacune des 3 pages du
 * parcours d'onboarding (`/documents/upload`, `/kyc`, `/certification`).
 *
 * POURQUOI : sans ce composant, une fois passé le step 1, l'artisan n'a
 * AUCUN chemin direct pour revenir sur les documents (le bouton « Commencer »
 * du dashboard est intelligent et l'envoie toujours sur l'étape courante).
 * Le mini-stepper expose les 3 phases en permanence : passées + courante
 * sont tappables, futures sont grisées non-cliquables.
 *
 * Règle de cliquabilité :
 *   - past   : verte avec ✓, tappable → router vers la phase
 *   - active : verte pleine (mise en avant), non-tappable (déjà ici)
 *   - future : grisée + cadenas, non-tappable
 *
 * Mobile-first : layout horizontal compact, 3 pastilles + libellés courts
 * (« Docs / Identité / Certif. »). Sur desktop, libellés complets visibles
 * sous chaque pastille. Pas de scroll horizontal : tout tient sur 360px de
 * large minimum.
 */
@Component({
  selector: 'app-parcours-stepper',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: './parcours-stepper.component.html',
  styleUrl: './parcours-stepper.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParcoursStepperComponent {
  readonly currentPhase = input.required<ParcoursPhase>();

  /**
   * Quand `true`, TOUTES les phases (past comprises) deviennent non-cliquables
   * et l'ensemble du stepper est rendu grisé. Cas d'usage : pendant un
   * enregistrement vidéo KYC actif (countdown / recording / uploading /
   * processing), un clic accidentel sur la pastille « Docs » détruirait la
   * session caméra et l'artisan perdrait sa vidéo. Hors de ces états, on
   * laisse l'utilisateur naviguer librement. Cf. ContractorKycComponent.
   */
  readonly disabled = input<boolean>(false);

  readonly phases = computed<readonly PhaseView[]>(() => {
    const current = this.currentPhase();
    const isDisabled = this.disabled();
    return PHASES.map(p => ({
      ...p,
      status:
        // Toutes les phases sont forcées en 'future' quand le stepper est
        // disabled — sauf l'active qu'on garde mise en avant pour qu'on
        // continue de voir « où on en est ». Pas de chemin cliquable.
        isDisabled && p.index !== current ? 'future' :
        p.index < current ? 'past' :
        p.index === current ? 'active' :
        'future',
    }));
  });
}
