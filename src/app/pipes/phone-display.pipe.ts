import { Pipe, PipeTransform } from '@angular/core';

/**
 * PhoneDisplayPipe
 *
 * Convertit le format de stockage interne tuita.fr (`P33...`, où `P` remplace
 * `+`) en numéro lisible pour le frontend.
 *
 *   "P33756874218"  → "+33 7 56 87 42 18"
 *   "+33756874218"  → "+33 7 56 87 42 18"
 *   "0612345678"    → "06 12 34 56 78"
 *   null/undefined  → ""
 *
 * Le préfixe `P` est un détail technique interne — il ne doit jamais
 * apparaître côté utilisateur (contractor ou admin Tuita).
 */
@Pipe({
  name: 'phoneDisplay',
  standalone: true,
})
export class PhoneDisplayPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';

    const trimmed = value.trim();
    if (trimmed === '') return '';

    if (/^P\d+$/i.test(trimmed)) {
      return this.formatInternational('+' + trimmed.slice(1));
    }

    if (/^\+\d+$/.test(trimmed)) {
      return this.formatInternational(trimmed);
    }

    if (/^0\d{9}$/.test(trimmed)) {
      return this.formatFrenchLocal(trimmed);
    }

    // Format masqué RGPD : "P33******18" → "+33******18"
    if (/^P[\d*]+$/i.test(trimmed)) {
      return '+' + trimmed.slice(1);
    }

    return trimmed;
  }

  /** "+33756874218" → "+33 7 56 87 42 18" (FR) ou "+CC XX XX XX..." (autres) */
  private formatInternational(value: string): string {
    if (value.startsWith('+33') && value.length === 12) {
      const rest = value.slice(3);
      return `+33 ${rest[0]} ${rest.slice(1, 3)} ${rest.slice(3, 5)} ${rest.slice(5, 7)} ${rest.slice(7, 9)}`;
    }
    return value;
  }

  /** "0612345678" → "06 12 34 56 78" */
  private formatFrenchLocal(value: string): string {
    return `${value.slice(0, 2)} ${value.slice(2, 4)} ${value.slice(4, 6)} ${value.slice(6, 8)} ${value.slice(8, 10)}`;
  }
}
