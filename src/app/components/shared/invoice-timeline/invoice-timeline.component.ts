import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import {
  ExpectedNextAction,
  InvoiceTimeline,
  TimelineStep,
  TimelineStepData,
  TimelineStepState,
} from '../../../models/invoice-timeline.model';
import { RelativeDatePipe } from '../../../pipes/relative-date.pipe';

/**
 * Libellés et icônes par étape — source unique de vérité côté front.
 * Ordre fixe, utilisé pour tri et affichage.
 */
const STEP_LABELS: Record<TimelineStep, string> = {
  ocr_passed: 'Vérification automatique',
  compliance: 'Contrôle conformité',
  production: 'Validation chantier',
  accounting: 'Bon pour paiement',
  payment_launched: 'Virement lancé',
  paid: 'Virement reçu',
};

const STEP_EMOJIS: Record<TimelineStep, string> = {
  ocr_passed: '🔍',
  compliance: '✅',
  production: '🏗️',
  accounting: '💳',
  payment_launched: '🚀',
  paid: '🎉',
};

/**
 * Description accessible (aria-label) par combinaison step × state.
 * Utilisée par les lecteurs d'écran pour décrire chaque point.
 */
const STATE_VERBS: Record<TimelineStepState, string> = {
  done: 'terminée',
  in_progress: 'en cours',
  pending: 'à venir',
  rejected: 'refusée',
  skipped: 'non applicable',
};

/**
 * Ordre de référence des étapes — utilisé pour propager `skipped` après un
 * `rejected` (toutes les étapes postérieures deviennent grisées).
 */
const STEP_ORDER: TimelineStep[] = [
  'ocr_passed',
  'compliance',
  'production',
  'accounting',
  'payment_launched',
  'paid',
];

/**
 * InvoiceTimelineComponent
 *
 * Affiche la timeline visuelle du pipeline de paiement d'une facture. Le but
 * est de rendre transparent pour le contractor *où* en est sa facture et *qui*
 * doit agir, pour qu'il ne relance jamais le support par téléphone.
 *
 * Input unique : une `InvoiceTimeline` déjà hydratée (pas de fetch ici).
 * Le composant gère :
 *   - la propagation automatique de `skipped` après un `rejected` (sécurité UI
 *     au cas où le backend oublierait — on veut que ça reste cohérent),
 *   - les branches Pro vs Freemium (Pro = 5 étapes, Freemium = 6 étapes avec
 *     `ocr_passed` en tête),
 *   - l'alerte "équipe prévenue" si `support_contact_needed = true`.
 *
 * Accessibilité : chaque point a un `aria-label` explicite et la carte
 * "Prochaine étape" porte `role="status"` pour être annoncée dynamiquement
 * par les lecteurs d'écran quand elle change.
 */
@Component({
  selector: 'app-invoice-timeline',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule, RelativeDatePipe],
  templateUrl: './invoice-timeline.component.html',
  styleUrl: './invoice-timeline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoiceTimelineComponent {
  private readonly _timeline = signal<InvoiceTimeline | null>(null);

  @Input({ required: true })
  set timeline(value: InvoiceTimeline) {
    this._timeline.set(value);
  }
  get timeline(): InvoiceTimeline | null {
    return this._timeline();
  }

  /**
   * Steps normalisés :
   *   - triés dans l'ordre canonique STEP_ORDER,
   *   - propagation `skipped` après un `rejected` (filet de sécurité UI).
   */
  readonly normalizedSteps = computed<TimelineStepData[]>(() => {
    const tl = this._timeline();
    if (!tl) return [];

    const byStep = new Map<TimelineStep, TimelineStepData>();
    for (const s of tl.steps) byStep.set(s.step, s);

    const ordered: TimelineStepData[] = [];
    let rejectedSeen = false;

    for (const key of STEP_ORDER) {
      const data = byStep.get(key);
      if (!data) continue; // step absent (ex: ocr_passed absent en Pro)

      if (rejectedSeen && data.state !== 'rejected') {
        ordered.push({ ...data, state: 'skipped' });
      } else {
        ordered.push(data);
      }
      if (data.state === 'rejected') rejectedSeen = true;
    }

    return ordered;
  });

  readonly statusLabel = computed(() => this._timeline()?.status_label ?? '');
  readonly statusDescription = computed(() => this._timeline()?.status_description ?? '');
  readonly expectedNext = computed<ExpectedNextAction | null>(
    () => this._timeline()?.expected_next_action ?? null,
  );
  readonly supportAlerted = computed(() => this._timeline()?.support_contact_needed === true);

  /** Libellé FR de l'étape (pour affichage principal). */
  stepLabel(step: TimelineStep): string {
    return STEP_LABELS[step];
  }

  stepEmoji(step: TimelineStep): string {
    return STEP_EMOJIS[step];
  }

  /**
   * aria-label complet d'un point de la timeline.
   * Exemple : "Étape Contrôle conformité, terminée le 11/04/2026"
   */
  stepAriaLabel(s: TimelineStepData): string {
    const base = `Étape ${STEP_LABELS[s.step]}, ${STATE_VERBS[s.state]}`;
    if (s.state === 'done' && s.at) {
      return `${base} le ${this.shortDate(s.at)}`;
    }
    if (s.state === 'rejected' && s.comment) {
      return `${base} : ${s.comment}`;
    }
    if (s.state === 'pending' && s.eta) {
      return `${base}, délai estimé : ${s.eta}`;
    }
    return base;
  }

  /** "11/04/2026" — format court pour aria-label et tooltips. */
  shortDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  /** Classe CSS pour le point et le segment — encode l'état. */
  stateClass(state: TimelineStepState): string {
    return `timeline-step--${state.replace('_', '-')}`;
  }

  /** Track function ngFor pour éviter les re-renders inutiles. */
  trackByStep(_: number, s: TimelineStepData): TimelineStep {
    return s.step;
  }
}
