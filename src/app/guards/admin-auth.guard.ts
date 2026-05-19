import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

/**
 * Garde simple sur les routes /admin/* : vérifie la présence du Bearer
 * token admin en sessionStorage (clé `tuita_admin_token`).
 *
 * POURQUOI une garde côté Angular en plus de l'auth backend :
 * Sans cette garde, un utilisateur navigant sur /admin sans token enverrait
 * des requêtes au backend qui répondrait 401 — c'est correct mais l'UX est
 * dégradée (page admin vide avec snackbar d'erreur). La garde redirige
 * proactivement vers /admin/login et l'API n'est jamais sollicitée.
 *
 * Pas de validation cryptographique du token côté front : on fait confiance
 * au backend pour rejeter un token expiré/forgé (cf. interceptor + clearance
 * STAFF_ONLY côté Laminas). La garde ne fait que "y a-t-il un token posé ?".
 */
export const adminAuthGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  const hasToken = !!sessionStorage.getItem('tuita_admin_token');
  if (hasToken) {
    return true;
  }
  // Mémorise la cible pour rediriger l'utilisateur après login (retour
  // naturel sur la page demandée — évite un détour par /admin par défaut).
  return router.createUrlTree(['/admin/login'], {
    queryParams: { redirect: state.url },
  });
};
