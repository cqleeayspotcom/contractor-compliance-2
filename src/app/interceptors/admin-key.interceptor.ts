import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Injecte le header `Authorization: Bearer <token>` sur toutes les requêtes
 * vers `/contractor-compliance/admin/*`.
 *
 * Auth admin = OAuth2 mysession Tuita (CLEARANCE_STAFF_ONLY, cf.
 * ContractorCompliance/src/Controller/AbstractAdminController.php). Le token
 * est obtenu via le flow /signin standard Tuita (OTP SMS/email) puis exposé
 * sur la page /admin/login.
 *
 * Stocké en `sessionStorage` (et non localStorage) pour limiter la fenêtre
 * d'exposition : le token disparaît à la fermeture de l'onglet. Seul le
 * composant `AdminLoginComponent` écrit cette clé.
 *
 * Exception : la route `/auth/login` elle-même est exclue — c'est l'endpoint
 * qui produit le token, lui envoyer un Bearer expiré n'a pas de sens.
 *
 * Ne pas étendre à d'autres routes : le header n'est pertinent que pour
 * l'API admin Tuita.
 */
const STORAGE_KEY = 'tuita_admin_token';
const ADMIN_PATH_PREFIX = '/contractor-compliance/admin/';
// Endpoint pré-auth qui déclenche l'envoi du PIN OTP : c'est lui qui mène
// à l'émission du Bearer (via /signin), donc inutile/contre-productif d'y
// envoyer un Bearer existant (possiblement expiré).
const LOGIN_PATH = '/contractor-compliance/admin/auth/request-pin';

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
