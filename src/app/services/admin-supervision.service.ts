import { Injectable, inject } from '@angular/core';

import { Api } from '../api/api';
import { adminHealth } from '../api/fn/admin-supervision/admin-health';
import { adminMetrics } from '../api/fn/admin-supervision/admin-metrics';
import { adminProvidersPing } from '../api/fn/admin-supervision/admin-providers-ping';

/**
 * Admin Supervision Service
 *
 * Encapsule les endpoints d'observabilité du module
 * `/contractor-compliance/admin/{health,metrics,providers/ping}`.
 * Le Bearer admin est injecté globalement par admin-key.interceptor.ts.
 */
@Injectable({ providedIn: 'root' })
export class AdminSupervisionService {
  private readonly api = inject(Api);

  /** Sondes santé du module (DB, cache, file d'attente RabbitMQ). */
  async getHealth(): Promise<unknown> {
    const env = await this.api.invoke(adminHealth);
    return (env as { data?: unknown }).data ?? env;
  }

  /** Métriques agrégées : compteurs pipeline, latences, volumétrie. */
  async getMetrics(): Promise<unknown> {
    const env = await this.api.invoke(adminMetrics);
    return (env as { data?: unknown }).data ?? env;
  }

  /**
   * Ping live des providers externes (OCR, biométrie, Stripe, Pappers).
   * Sert l'écran de supervision pour distinguer une panne module d'une
   * panne tierce.
   */
  async pingProviders(): Promise<unknown> {
    const env = await this.api.invoke(adminProvidersPing);
    return (env as { data?: unknown }).data ?? env;
  }
}
