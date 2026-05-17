import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ContractorApiService } from './contractor-api.service';

/**
 * Source de vérité unique pour les 2 prix affichés dans le portail contractor :
 *
 *  - **Document officiel one-shot** (extrait INPI, avis SIRENE, statuts, KBIS) :
 *    9,99 € — tarif unifié Pappers, configurable backend via env
 *    `PAPPERS_*_PRICE_EUR`. Source : GET /documents/purchasable.
 *
 *  - **Abonnement Tuita Pro** : 99 € / mois — backend `PLAN_PRICE_EUR` exposé
 *    via GET /billing/plan.
 *
 * Les 2 endpoints sont chargés au boot via APP_INITIALIZER. Si l'un échoue
 * (401 sur /login, 5xx, offline) → fallback statique (9,99 et 99) qui
 * matche les valeurs `.env` par défaut. Aucune UI cassée même en mode dégradé.
 */
@Injectable({ providedIn: 'root' })
export class PricingService {
  private readonly api = inject(ContractorApiService);

  // Fallbacks alignés sur .env par défaut. Garantit qu'aucun « € » vide
  // n'apparaisse même si les deux endpoints échouent au boot.
  private static readonly FALLBACK_DOCUMENT_EUR = 9.99;
  private static readonly FALLBACK_SUBSCRIPTION_EUR = 99;

  private readonly documentEur = signal<number>(PricingService.FALLBACK_DOCUMENT_EUR);
  private readonly subscriptionEur = signal<number>(PricingService.FALLBACK_SUBSCRIPTION_EUR);

  readonly documentPriceLabel = computed(() => this.formatEur(this.documentEur()));
  readonly subscriptionPriceLabel = computed(() => this.formatEur(this.subscriptionEur()));

  /** Appelé une fois au boot par APP_INITIALIZER. Best-effort, jamais throw. */
  async load(): Promise<void> {
    await Promise.allSettled([this.loadDocumentPrice(), this.loadSubscriptionPrice()]);
  }

  /** Prix d'un justificatif d'immatriculation officiel (9,99 € par défaut). */
  priceLabelFor(_documentType?: string): string {
    return this.documentPriceLabel();
  }

  private async loadDocumentPrice(): Promise<void> {
    try {
      const data = await firstValueFrom(this.api.getPurchasableCatalog());
      // Tous les types Pappers ont le même prix (offre unifiée 9,99 €).
      // On prend le premier non-null disponible.
      const first = data.documents?.[0]?.price_eur;
      if (typeof first === 'number' && first > 0) {
        this.documentEur.set(first);
      }
    } catch {
      // Silencieux — fallback statique.
    }
  }

  private async loadSubscriptionPrice(): Promise<void> {
    try {
      const res = await firstValueFrom(this.api.getBillingPlan());
      const paid = res?.plans?.find(p => p.id === 'paid');
      const price = paid?.price_eur_month;
      if (typeof price === 'number' && price > 0) {
        this.subscriptionEur.set(price);
      }
    } catch {
      // Silencieux — fallback statique.
    }
  }

  private formatEur(value: number): string {
    const formatted = Number.isInteger(value)
      ? `${value}`
      : value.toFixed(2).replace('.', ',');
    return `${formatted} €`;
  }
}
