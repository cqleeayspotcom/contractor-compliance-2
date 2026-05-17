import { Pipe, PipeTransform } from '@angular/core';

/**
 * RelativeDatePipe
 *
 * Affiche une date au format humain français :
 *   "il y a 2 jours — 16/04/2026 à 14h30"
 *   "aujourd'hui — 18/04/2026 à 09h15"
 *   "dans 3 jours — 21/04/2026"
 *
 * Utilisé par la timeline de statut paiement pour que le contractor
 * puisse situer une étape en un coup d'œil sans lire la date ISO brute.
 *
 * @example
 *   {{ '2026-04-16T14:30:00Z' | relativeDate }}
 *   // → "il y a 2 jours — 16/04/2026 à 14h30"
 *
 *   {{ null | relativeDate }}  // → ''
 */
@Pipe({
  name: 'relativeDate',
  standalone: true,
})
export class RelativeDatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined, options?: { withTime?: boolean }): string {
    if (!value) return '';

    const withTime = options?.withTime !== false; // défaut true

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const relative = this.relativeLabel(date);
    const absolute = this.absoluteLabel(date, withTime);

    return `${relative} - ${absolute}`;
  }

  /** "il y a X jours" / "aujourd'hui" / "hier" / "dans X jours". */
  private relativeLabel(date: Date): string {
    const now = new Date();

    // Comparaison au jour près (0h00 local) pour éviter les effets de bord
    // d'heures tardives (ex : une étape à 23h45 ne doit pas afficher
    // "dans 12h" mais bien "aujourd'hui").
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

    const deltaDays = Math.round((startOfDate - startOfToday) / (1000 * 60 * 60 * 24));

    if (deltaDays === 0) return "aujourd'hui";
    if (deltaDays === -1) return 'hier';
    if (deltaDays === 1) return 'demain';
    if (deltaDays < 0) return `il y a ${Math.abs(deltaDays)} jours`;
    return `dans ${deltaDays} jours`;
  }

  /** "16/04/2026 à 14h30" ou "16/04/2026" sans heure. */
  private absoluteLabel(date: Date, withTime: boolean): string {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    const datePart = `${d}/${m}/${y}`;

    if (!withTime) return datePart;

    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${datePart} à ${hh}h${mm}`;
  }
}
