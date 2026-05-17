/**
 * Invoice payment timeline â€” data contract
 *
 * Pipeline cÃ´tÃ© contractor (transparence paiement) :
 *   1. ocr_passed         (freemium uniquement) â€” OCR Mistral + rÃ¨gles mÃ©tier OK
 *   2. compliance         â€” admin tuita.fr : PV de rÃ©ception signÃ©
 *   3. production         â€” admin tuita.fr : chantier conforme (photos, rapport)
 *   4. accounting         â€” admin tuita.fr : bon pour paiement Ã©mis
 *   5. payment_launched   â€” ops compta Tuita : virement dÃ©clenchÃ©
 *   6. paid               â€” virement reÃ§u (terminal)
 *
 * RÃ¨gle de rendu : si une Ã©tape est `rejected`, toutes les suivantes doivent
 * Ãªtre rendues en `skipped` (gris clair), le pipeline s'arrÃªte Ã  ce point.
 *
 * NOTE : ce contrat est anticipÃ© â€” l'endpoint backend
 *   GET /contractor-compliance/invoices/{uuid}
 * sera enrichi plus tard pour renvoyer ce bloc `timeline`. Le composant
 * s'utilise dÃ¨s maintenant avec des donnÃ©es mockÃ©es ou partielles.
 */

/** Identifiant stable d'une Ã©tape (clÃ© pour icÃ´ne, libellÃ©, ordre). */
export type TimelineStep =
  | 'ocr_passed'
  | 'compliance'
  | 'production'
  | 'accounting'
  | 'payment_launched'
  | 'paid';

/**
 * Ã‰tat visuel d'une Ã©tape.
 * - done         : Ã©tape terminÃ©e avec succÃ¨s (vert)
 * - in_progress  : Ã©tape en cours (bleu pulsation)
 * - pending      : Ã©tape future, pas encore atteinte (gris)
 * - rejected     : Ã©tape Ã©chouÃ©e â€” la timeline s'arrÃªte ici (rouge)
 * - skipped      : Ã©tape suivante d'un rejet, non exÃ©cutÃ©e (gris clair)
 */
export type TimelineStepState =
  | 'done'
  | 'in_progress'
  | 'pending'
  | 'rejected'
  | 'skipped';

/**
 * DonnÃ©es d'une Ã©tape individuelle de la timeline.
 *
 * - `at`  : horodatage ISO 8601 si l'Ã©tape est terminÃ©e (done/rejected).
 * - `by`  : nom lisible du validateur humain, ex "Marie D. (Compliance)".
 *           Absent pour ocr_passed (automatique) et paid (virement reÃ§u).
 * - `comment` : commentaire libre du validateur, ex "PV signÃ© OK".
 * - `eta` : estimation en langage naturel pour une Ã©tape `pending`,
 *           ex "2-3 jours ouvrÃ©s". Utile surtout sur `paid`.
 * - `payment_ref_masked` : rÃ©fÃ©rence bancaire masquÃ©e (Ã©tape payment_launched
 *           uniquement), ex "FR76****1234". Masquage fait cÃ´tÃ© backend via
 *           PaymentRefMasker â€” on ne doit JAMAIS recevoir la ref complÃ¨te.
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
 * Prochaine action attendue â€” affichÃ©e dans une carte dÃ©diÃ©e.
 * Permet au contractor de savoir EXACTEMENT qui doit agir et quand.
 */
export interface ExpectedNextAction {
  readonly who: string;
  readonly what: string;
  readonly eta: string;
}

/**
 * Payload complet renvoyÃ© par le backend pour afficher la timeline.
 *
 * - `status`            : code machine (ex 'payment_in_progress')
 * - `status_label`      : label user-friendly (ex "Virement lancÃ©")
 * - `status_description`: explication dÃ©taillÃ©e, peut inclure dates,
 *                         rÃ©fÃ©rences masquÃ©es, dÃ©lais bancaires.
 * - `steps`             : liste ordonnÃ©e des Ã©tapes (5 pour Pro, 6 pour freemium).
 * - `expected_next_action` : si la facture n'est pas terminale, indique qui
 *                            doit agir ensuite. Null si PAID ou REJECTED.
 * - `support_contact_needed` : true si le dÃ©lai anormal a dÃ©clenchÃ© une
 *                              escalade interne â€” on rassure le contractor :
 *                              "on a Ã©tÃ© alertÃ©, pas besoin de nous appeler".
 */
export interface InvoiceTimeline {
  readonly status: string;
  readonly status_label: string;
  readonly status_description: string;
  readonly steps: readonly TimelineStepData[];
  readonly expected_next_action?: ExpectedNextAction | null;
  readonly support_contact_needed: boolean;
}
