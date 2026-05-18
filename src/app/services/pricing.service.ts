import { Injectable, computed, signal } from '@angular/core';

/**
 * Source de vérité unique pour les 2 prix affichés dans le portail contractor :
 *
 *  - **Document officiel one-shot** (extrait INPI, avis SIRENE, statuts, KBIS) :
 *    9,99 € — tarif unifié Pappers, configurable backend via env
 *    `PAPPERS_*_PRICE_EUR`.
 *
 *  - **Abonnement Tuita Pro** : 99 € / mois — backend `PLAN_PRICE_EUR`.
 *
 * Pourquoi statique : le backend Tuita n'expose pas d'endpoint catalogue
 * (juste `/billing/subscription` pour le plan courant et `/documents/purchase`
 * pour l'achat unitaire). Les prix sont configurés côté backend via
 * `PAPPERS_*_PRICE_EUR` et `PLAN_PRICE_EUR` — on miroite les valeurs par
 * défaut ici. Si un endpoint catalogue est ajouté plus tard, rebrancher
 * `loadDocumentPrice` / `loadSubscriptionPrice` avec les fonctions SDK.
 */
@Injectable({ providedIn: 'root' })
export class PricingService {
  // Fallbacks alignés sur .env par défaut.
  private static readonly FALLBACK_DOCUMENT_EUR = 9.99;
  private static readonly FALLBACK_SUBSCRIPTION_EUR = 99;

  private readonly documentEur = signal<number>(PricingService.FALLBACK_DOCUMENT_EUR);
  private readonly subscriptionEur = signal<number>(PricingService.FALLBACK_SUBSCRIPTION_EUR);

  readonly documentPriceLabel = computed(() => this.formatEur(this.documentEur()));
  readonly subscriptionPriceLabel = computed(() => this.formatEur(this.subscriptionEur()));

  /**
   * Appelé une fois au boot par APP_INITIALIZER.
   * No-op : fallback statique uniquement (cf. note ci-dessus).
   */
  async load(): Promise<void> {
    return Promise.resolve();
  }

  /** Prix d'un justificatif d'immatriculation officiel (9,99 € par défaut). */
  priceLabelFor(_documentType?: string): string {
    return this.documentPriceLabel();
  }

  private formatEur(value: number): string {
    const formatted = Number.isInteger(value)
      ? `${value}`
      : value.toFixed(2).replace('.', ',');
    return `${formatted} €`;
  }
}
