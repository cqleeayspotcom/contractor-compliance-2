/**
 * Invoice payment timeline — data contract
 *
 * Pipeline côté contractor (transparence paiement) :
 *   1. ocr_passed         (freemium uniquement) — OCR Mistral + règles métier OK
 *   2. compliance         — admin tuita.fr : PV de réception signé
 *   3. production         — admin tuita.fr : chantier conforme (photos, rapport)
 *   4. accounting         — admin tuita.fr : bon pour paiement émis
 *   5. payment_launched   — ops compta Tuita : virement déclenché
 *   6. paid               — virement reçu (terminal)
 *
 * Règle de rendu : si une étape est `rejected`, toutes les suivantes doivent
 * être rendues en `skipped` (gris clair), le pipeline s'arrête à ce point.
 *
 * NOTE : ce contrat est anticipé — l'endpoint backend
 *   GET /contractor-compliance/invoices/{uuid}
 * sera enrichi plus tard pour renvoyer ce bloc `timeline`. Le composant
 * s'utilise dès maintenant avec des données mockées ou partielles.
 */

/** Identifiant stable d'une étape (clé pour icône, libellé, ordre). */
export type TimelineStep =
  | 'ocr_passed'
  | 'compliance'
  | 'production'
  | 'accounting'
  | 'payment_launched'
  | 'paid';

/**
 * État visuel d'une étape.
 * - done         : étape terminée avec succès (vert)
 * - in_progress  : étape en cours (bleu pulsation)
 * - pending      : étape future, pas encore atteinte (gris)
 * - rejected     : étape échouée — la timeline s'arrête ici (rouge)
 * - skipped      : étape suivante d'un rejet, non exécutée (gris clair)
 */
export type TimelineStepState =
  | 'done'
  | 'in_progress'
  | 'pending'
  | 'rejected'
  | 'skipped';

/**
 * Données d'une étape individuelle de la timeline.
 *
 * - `at`  : horodatage ISO 8601 si l'étape est terminée (done/rejected).
 * - `by`  : nom lisible du validateur humain, ex "Marie D. (Compliance)".
 *           Absent pour ocr_passed (automatique) et paid (virement reçu).
 * - `comment` : commentaire libre du validateur, ex "PV signé OK".
 * - `eta` : estimation en langage naturel pour une étape `pending`,
 *           ex "2-3 jours ouvrés". Utile surtout sur `paid`.
 * - `payment_ref_masked` : référence bancaire masquée (étape payment_launched
 *           uniquement), ex "FR76****1234". Masquage fait côté backend via
 *           PaymentRefMasker — on ne doit JAMAIS recevoir la ref complète.
 */
export interface TimelineStepData {
  readonly step: TimelineStep;
  readonly state: TimelineStepState;
  readonly at: string | null;
  readonly by: string | null;
  readonly comment?: string | null;
  readonly eta?: string | null;
  readonly payment_ref_masked?: string | null;
}

/**
 * Prochaine action attendue — affichée dans une carte dédiée.
 * Permet au contractor de savoir EXACTEMENT qui doit agir et quand.
 */
export interface ExpectedNextAction {
  readonly who: string;
  readonly what: string;
  readonly eta: string;
}

/**
 * Payload complet renvoyé par le backend pour afficher la timeline.
 *
 * - `status`            : code machine (ex 'payment_in_progress')
 * - `status_label`      : label user-friendly (ex "Virement lancé")
 * - `status_description`: explication détaillée, peut inclure dates,
 *                         références masquées, délais bancaires.
 * - `steps`             : liste ordonnée des étapes (5 pour Pro, 6 pour freemium).
 * - `expected_next_action` : si la facture n'est pas terminale, indique qui
 *                            doit agir ensuite. Null si PAID ou REJECTED.
 * - `support_contact_needed` : true si le délai anormal a déclenché une
 *                              escalade interne — on rassure le contractor :
 *                              "on a été alerté, pas besoin de nous appeler".
 */
export interface InvoiceTimeline {
  readonly status: string;
  readonly status_label: string;
  readonly status_description: string;
  readonly steps: readonly TimelineStepData[];
  readonly expected_next_action?: ExpectedNextAction | null;
  readonly support_contact_needed: boolean;
}
