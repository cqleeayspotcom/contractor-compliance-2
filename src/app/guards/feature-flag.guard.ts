import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';

import { FeatureFlagsService } from '../services/feature-flags.service';

/**
 * Garde de route global pour le kill-switch `contractorComplianceEnabled`.
 *
 * POURQUOI : si le flag est OFF, on ne veut PAS laisser l'utilisateur entrer
 * sur le dashboard ou n'importe quelle page métier — toutes les requêtes
 * API échoueraient (backend retourne 404 quand son flag est OFF). On le
 * rabat sur `/service-unavailable` qui affiche un message statique sans
 * réseau.
 *
 * Le guard est appliqué sur les routes métier (dashboard, documents, kyc,
 * factures, admin, etc.). La route `/service-unavailable` elle-même n'est
 * PAS gardée — sinon boucle infinie.
 */
export const featureFlagGuard: CanActivateFn = (): boolean | UrlTree => {
  const flags = inject(FeatureFlagsService);
  const router = inject(Router);

  if (flags.isContractorComplianceEnabled()) {
    return true;
  }

  // Flag OFF → rabat sur la page "service indisponible".
  return router.createUrlTree(['/service-unavailable']);
};
