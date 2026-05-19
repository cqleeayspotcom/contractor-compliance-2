import { ApplicationConfig, APP_INITIALIZER } from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding
} from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { MAT_SNACK_BAR_DEFAULT_OPTIONS } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

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
function initFeatureFlags(flags: FeatureFlagsService) {
  return () => flags.load();
}

/**
 * Load the contractor dashboard before the first render.
 * If the backend returns 401, the cookie interceptor redirects to login.
 *
 * NOTE: si le feature flag est OFF, l'interceptor renvoie une erreur 503
 * synthétique et le `.catch(() => {})` l'avale silencieusement.
 */
function initContractorSession(
  session: ContractorSessionService,
  flags: FeatureFlagsService
) {
  return () => {
    // Skip si module désactivé : pas d'API à appeler, on laisse le guard
    // de route rabattre vers /service-unavailable.
    if (!flags.isContractorComplianceEnabled()) {
      return Promise.resolve();
    }
    return firstValueFrom(session.loadDashboard()).catch(() => {});
  };
}

function initPricing(pricing: PricingService, flags: FeatureFlagsService) {
  return () => {
    if (!flags.isContractorComplianceEnabled()) {
      return Promise.resolve();
    }
    return pricing.load();
  };
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

    provideAnimations(),

    LoadingService,
    ContractorSessionService,
    FeatureFlagsService,

    // Doit s'exécuter EN PREMIER (les initializers Angular sont résolus dans
    // l'ordre de déclaration). Charge /assets/feature-flags.json.
    {
      provide: APP_INITIALIZER,
      useFactory: initFeatureFlags,
      deps: [FeatureFlagsService],
      multi: true
    },

    {
      provide: APP_INITIALIZER,
      useFactory: initContractorSession,
      deps: [ContractorSessionService, FeatureFlagsService],
      multi: true
    },

    {
      provide: APP_INITIALIZER,
      useFactory: initPricing,
      deps: [PricingService, FeatureFlagsService],
      multi: true
    },

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
