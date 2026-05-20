import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
  provideAppInitializer
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding
} from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { MAT_SNACK_BAR_DEFAULT_OPTIONS } from '@angular/material/snack-bar';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { firstValueFrom } from 'rxjs';

// Sans ça, Angular utilise en-US par défaut : les pipes date/number/currency
// affichent les dates au format américain (5/20/26, 9:16 AM). On enregistre
// les données de la locale fr puis on force LOCALE_ID à 'fr-FR' (voir plus bas).
registerLocaleData(localeFr);

import { routes } from './app.routes';
import { contractorCookieInterceptor } from './interceptors/contractor-cookie.interceptor';
import { loadingInterceptor } from './interceptors/loading.interceptor';
import { errorInterceptor } from './interceptors/error.interceptor';
import { loggingInterceptor } from './interceptors/logging.interceptor';
import { featureFlagInterceptor } from './interceptors/feature-flag.interceptor';
import { adminKeyInterceptor } from './interceptors/admin-key.interceptor';
import { LoadingService } from './services/loading.service';
import { ContractorSessionService } from './services/contractor-session.service';
import { PricingService } from './services/pricing.service';
import { FeatureFlagsService } from './services/feature-flags.service';

/**
 * Charge les feature flags runtime AVANT toute autre init.
 * POURQUOI prioritaire : les autres initializers (session, pricing) font des
 * appels API. Si le flag `contractorComplianceEnabled` est OFF, l'interceptor
 * doit le savoir pour court-circuiter ces requêtes — sinon elles partent
 * dans le vide pendant 1-2s avant que le guard de route ne réagisse.
 */
function initFeatureFlags() {
  return inject(FeatureFlagsService).load();
}

/**
 * Load the contractor dashboard before the first render.
 * If the backend returns 401, the cookie interceptor redirects to login.
 *
 * NOTE: si le feature flag est OFF, l'interceptor renvoie une erreur 503
 * synthétique et le `.catch(() => {})` l'avale silencieusement.
 */
function initContractorSession() {
  const flags = inject(FeatureFlagsService);
  const session = inject(ContractorSessionService);
  // Skip si module désactivé : pas d'API à appeler, on laisse le guard
  // de route rabattre vers /service-unavailable.
  if (!flags.isContractorComplianceEnabled()) {
    return Promise.resolve();
  }
  return firstValueFrom(session.loadDashboard()).catch(() => {});
}

function initPricing() {
  const flags = inject(FeatureFlagsService);
  const pricing = inject(PricingService);
  if (!flags.isContractorComplianceEnabled()) {
    return Promise.resolve();
  }
  return pricing.load();
}

export const appConfig: ApplicationConfig = {
  providers: [
    // Pas de `withViewTransitions()` : l'API native du navigateur émet des
    // `AbortError: Transition was skipped` quand deux navigations
    // s'enchaînent vite (ex: stepper qui se ré-route immédiatement vers
    // dashboard quand tout est déjà OK). Bénin mais bruyant en console.
    provideRouter(
      routes,
      withComponentInputBinding()
    ),

    provideHttpClient(
      withInterceptors([
        // featureFlagInterceptor en premier : court-circuite les requêtes
        // /contractor-compliance/* quand le flag est OFF, AVANT que loading
        // ou cookie n'agissent dessus.
        featureFlagInterceptor,
        // Doit s'exécuter AVANT contractorCookieInterceptor pour que le
        // header Authorization Bearer soit déjà posé quand withCredentials
        // est ajouté. Inactif sur les routes non-admin.
        adminKeyInterceptor,
        loadingInterceptor,
        contractorCookieInterceptor,
        errorInterceptor,
        loggingInterceptor
      ])
    ),

    // Pas de `provideAnimations()` : aucune animation Angular (`@Component({
    // animations: [...] })`) dans l'app, et Angular Material utilise des
    // animations CSS natives depuis la v19 — le provider est donc inutile.

    // Toute l'app en français : dates → 20/05/2026 09:16, etc.
    { provide: LOCALE_ID, useValue: 'fr-FR' },

    LoadingService,
    ContractorSessionService,
    FeatureFlagsService,

    // Doit s'exécuter EN PREMIER (les initializers Angular sont résolus dans
    // l'ordre de déclaration). Charge /assets/feature-flags.json.
    provideAppInitializer(initFeatureFlags),
    provideAppInitializer(initContractorSession),
    provideAppInitializer(initPricing),

    {
      provide: MAT_SNACK_BAR_DEFAULT_OPTIONS,
      useValue: {
        duration: 4000,
        verticalPosition: 'top',
        horizontalPosition: 'center',
        panelClass: ['tuita-snackbar'],
      }
    }
  ]
};
