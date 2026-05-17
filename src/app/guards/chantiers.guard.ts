/**
 * Garde de route `/chantiers` — accessible uniquement aux contractors
 * `fully_verified`. Défense en profondeur en plus du lock visuel sur la
 * tuile dashboard.
 *
 * Si la session n'a pas encore chargé le dashboard (`isFullyVerified` renvoie
 * false par défaut), on redirige vers `/dashboard` — la page contient déjà la
 * logique de chargement et le bandeau d'onboarding.
 */
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { ContractorSessionService } from '../services/contractor-session.service';

export const chantiersAccessGuard: CanActivateFn = () => {
  const session = inject(ContractorSessionService);
  const router = inject(Router);

  if (session.isFullyVerified) {
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};
