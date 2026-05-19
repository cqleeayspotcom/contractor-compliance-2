import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Injecte le header `Authorization: Bearer <token>` sur toutes les requêtes
 * vers `/contractor-compliance/admin/*`.
 *
 * POURQUOI ce changement (anciennement X-Tuita-Admin-Key) :
 * Le module externe utilisait une clé API admin custom. Depuis l'intégration
 * Tuita, l'auth admin passe par OAuth2 Bearer côté monolithe (CLEARANCE_STAFF_ONLY,
 * cf. ContractorCompliance/src/Controller/AbstractAdminController.php). Le
 * token est obtenu via POST /contractor-compliance/admin/auth/login (dev) ou
 * via le flow /signin standard Tuita (OTP SMS/email en prod).
 *
 * Stocké en `sessionStorage` (et non localStorage) pour limiter la fenêtre
 * d'exposition : le token disparaît à la fermeture de l'onglet. Le composant
 * `AdminLoginComponent` est le seul à écrire cette clé.
 *
 * Exception : la route `/auth/login` elle-même est exclue — c'est l'endpoint
 * qui produit le token, lui envoyer un Bearer expiré n'a pas de sens.
 *
 * Ne pas étendre à d'autres routes : le header n'est pertinent que pour
 * l'API admin Tuita.
 */
const STORAGE_KEY = 'tuita_admin_token';
const ADMIN_PATH_PREFIX = '/contractor-compliance/admin/';
const LOGIN_PATH = '/contractor-compliance/admin/auth/login';

export const adminKeyInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes(ADMIN_PATH_PREFIX)) {
    return next(req);
  }
  if (req.url.includes(LOGIN_PATH)) {
    return next(req);
  }
  const token = sessionStorage.getItem(STORAGE_KEY);
  if (!token) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
