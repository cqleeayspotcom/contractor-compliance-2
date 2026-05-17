import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { throwError } from 'rxjs';

import { FeatureFlagsService } from '../services/feature-flags.service';

/**
 * Interceptor de protection : si le feature flag
 * `contractorComplianceEnabled` est OFF, on court-circuite TOUTE requête
 * sortante vers /contractor-compliance/* — pas d'appel réseau, erreur
 * synthétique 503.
 *
 * POURQUOI : double rempart en plus du guard de route. Si un composant
 * glisse à travers le guard (ex: déclenche une requête en `ngOnInit` avant
 * que la navigation soit annulée), on évite de spammer le backend avec
 * des requêtes destinées à échouer en 404 (backend offline pour ce module).
 *
 * Les requêtes hors-périmètre (par ex. assets, autres domaines) ne sont
 * pas affectées.
 */
export const featureFlagInterceptor: HttpInterceptorFn = (req, next) => {
  const flags = inject(FeatureFlagsService);

  // Si le flag est ON, comportement normal.
  if (flags.isContractorComplianceEnabled()) {
    return next(req);
  }

  // Flag OFF — on ne court-circuite QUE les routes du module compliance,
  // identifiées par le préfixe `/contractor-compliance/` (peu importe que
  // l'URL soit relative ou absolue).
  const isComplianceCall = req.url.includes('/contractor-compliance/');
  if (!isComplianceCall) {
    return next(req);
  }

  // Erreur synthétique 503 sans appel réseau — les handlers d'erreur
  // existants peuvent réagir comme pour un vrai 503.
  const synthetic = new HttpErrorResponse({
    status: 503,
    statusText: 'Service Unavailable (feature flag OFF)',
    url: req.url,
    error: {
      error: 'feature_flag_off',
      message: 'Le module ContractorCompliance est désactivé côté frontend.',
    },
  });
  return throwError(() => synthetic);
};
