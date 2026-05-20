import { Injectable, inject } from '@angular/core';

import { Api } from '../api/api';
import { adminCircuitBreakersList } from '../api/fn/admin-circuit-breakers/admin-circuit-breakers-list';
import { adminCircuitBreakersReset } from '../api/fn/admin-circuit-breakers/admin-circuit-breakers-reset';

/**
 * Admin Circuit Breaker Service
 *
 * Encapsule `/contractor-compliance/admin/circuit-breakers*`. Les disjoncteurs
 * protègent les appels providers (OCR, biométrie, Stripe, Pappers) : quand un
 * provider tombe, le breaker s'ouvre et coupe les appels le temps qu'il revienne.
 * Le Bearer admin est injecté globalement par admin-key.interceptor.ts.
 */
@Injectable({ providedIn: 'root' })
export class AdminCircuitBreakerService {
  private readonly api = inject(Api);

  /** État courant des disjoncteurs (closed / half-open / open) par service. */
  async list(): Promise<unknown> {
    const env = await this.api.invoke(adminCircuitBreakersList);
    return (env as { data?: unknown }).data ?? env;
  }

  /**
   * Réarme manuellement le disjoncteur d'un service (ex: 'ocr', 'stripe').
   * À utiliser quand le provider est confirmé rétabli, pour ne pas attendre
   * la fenêtre de recovery automatique.
   */
  async reset(service: string): Promise<unknown> {
    const env = await this.api.invoke(adminCircuitBreakersReset, { service });
    return (env as { data?: unknown }).data ?? env;
  }
}
