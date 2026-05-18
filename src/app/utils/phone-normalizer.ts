/**
 * Normalisation de numéros de téléphone français — partagé login/signup.
 *
 * POURQUOI deux formats :
 *   - Backend module ContractorCompliance signup (`/contractor-compliance/signup`)
 *     attend `P33XXXXXXXXX` (format historique Tuita stocké en DB).
 *   - Backend Tuita natif ContractorAuthAction (`/contractor/auth/{pin,login}`)
 *     attend `+33XXXXXXXXX` (cf. ContractorOauthWrapper::sendSmsPassword).
 *
 * Les deux helpers acceptent les saisies humaines libres (espaces, points,
 * "+33", "33", "0", "P33") et émettent le format strict attendu côté serveur.
 */

/**
 * Format attendu par le module ContractorCompliance (signup).
 *
 * Retourne `''` si la saisie est vide ou ne contient aucun chiffre — laisse
 * le composant gérer l'état "invalide" via le validateur dédié.
 *
 * Exemples :
 *   - `'06 12 34 56 78'`  → `'P33612345678'`
 *   - `'+33 6 12 34 56 78'` → `'P33612345678'`
 *   - `'33612345678'`     → `'P33612345678'`
 *   - `'P33612345678'`    → `'P33612345678'` (idempotent)
 */
export function toTuitaPhoneP33(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') return '';

  // Garde uniquement chiffres + P (uppercase).
  let cleaned = trimmed.toUpperCase().replace(/[^0-9P]/g, '');

  // Retire le P éventuel en tête (on le re-préfixe à la fin).
  if (cleaned.startsWith('P')) cleaned = cleaned.slice(1);

  // 0XX → 33XX (numéro national français).
  if (cleaned.startsWith('0')) cleaned = '33' + cleaned.slice(1);

  if (cleaned === '') return '';
  return 'P' + cleaned;
}

/**
 * Format attendu par l'API Tuita native `/contractor/auth/{pin,login}`
 * (avec préfixe `+`).
 *
 * On part du format P33 (canonique) et on remplace le P par +.
 */
export function toTuitaPhonePlus(raw: string): string {
  const p33 = toTuitaPhoneP33(raw);
  if (p33 === '') return '';
  return '+' + p33.slice(1);
}

/**
 * Validation stricte d'un numéro normalisé P33XXXXXXXXX (10-15 chiffres
 * après le P, FR ou international).
 */
export function isValidTuitaPhoneP33(normalized: string): boolean {
  return /^P\d{10,15}$/.test(normalized);
}
