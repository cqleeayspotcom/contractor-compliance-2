/**
 * Route guards for the certification flow.
 *
 * /certification serves the QCM flow; /certification/memo serves the
 * post-certification aide-mémoire. These guards enforce mutual exclusivity:
 * a non-certified contractor shouldn't see the memo, and a certified one
 * shouldn't be sent back through the QCM entry screen when navigating from
 * the dashboard tile.
 *
 * If the dashboard hasn't loaded yet (session.certificationCompleted returns
 * false by default), we let navigation proceed — the target component handles
 * its own loading state.
 */
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { ContractorSessionService } from '../services/contractor-session.service';

export const certificationCompletedGuard: CanActivateFn = () => {
  const session = inject(ContractorSessionService);
  const router = inject(Router);

  if (session.certificationCompleted) {
    return true;
  }

  return router.createUrlTree(['/certification']);
};

export const certificationNotCompletedGuard: CanActivateFn = (route) => {
  const session = inject(ContractorSessionService);
  const router = inject(Router);

  if (!session.certificationCompleted) {
    return true;
  }

  // Permet à un contractor déjà certifié de relancer le QCM via ?retake=1
  // (bouton « Refaire le QCM » sur /certification/memo).
  if (route.queryParamMap.get('retake') === '1') {
    return true;
  }

  return router.createUrlTree(['/certification/memo']);
};
