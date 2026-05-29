/**
 * Décisions PURES du polling KYC desktop, isolées du composant pour être
 * testables sans TestBed. Le composant `contractor-kyc` délègue ici à chaque
 * poll et à chaque échéance du timer de régénération du QR.
 */

/** Sous-ensemble des états du composant manipulés par le polling. */
export type KycPollState =
  | 'qr_code'
  | 'phone_connected'
  | 'processing'
  | 'approved'
  | 'rejected'
  | 'qr_expired';

export interface KycPollInput {
  /** `status` brut renvoyé par GET /kyc/status (peut être null si enveloppe vide). */
  serverStatus: string | null;
  /** `phone_connected` renvoyé par GET /kyc/status. */
  phoneConnected: boolean;
  /** État courant du composant. */
  currentState: KycPollState;
}

/**
 * Décide l'état suivant à partir du dernier poll. Renvoie `null` pour
 * « rester dans l'état courant et re-planifier un poll ».
 *
 * Priorités : résultats finaux d'abord (approved/rejected captés DEPUIS
 * N'IMPORTE QUEL état → le résultat remonte même si le PC était resté sur le
 * QR), puis expiration, puis processing, puis le signal « téléphone connecté ».
 */
export function decideNextKycState(input: KycPollInput): KycPollState | null {
  const { serverStatus, phoneConnected, currentState } = input;

  if (serverStatus === 'approved') return 'approved';
  if (serverStatus === 'rejected') return 'rejected';
  if (serverStatus === 'expired') return 'qr_expired';

  if (serverStatus === 'processing') {
    return currentState === 'processing' ? null : 'processing';
  }

  // pending (ou null) : on n'avance que pour signaler le téléphone connecté.
  if (currentState === 'qr_code' && phoneConnected) return 'phone_connected';

  return null;
}

export interface QrRegenInput {
  currentState: KycPollState;
  phoneConnected: boolean;
}

/**
 * Régénérer le QR (préventif, ~30 s avant expiration) UNIQUEMENT si on affiche
 * encore le QR et que personne n'a scanné. Si le téléphone a déjà scanné, la
 * personne est en train de se filmer avec le jeton courant (prolongé côté
 * backend) → régénérer le casserait.
 */
export function shouldRegenerateQr(input: QrRegenInput): boolean {
  return input.currentState === 'qr_code' && !input.phoneConnected;
}
