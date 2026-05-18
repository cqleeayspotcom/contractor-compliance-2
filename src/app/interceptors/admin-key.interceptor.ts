import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Injecte le header `X-Tuita-Admin-Key` sur toutes les requêtes vers
 * `/contractor-compliance/admin/*`.
 *
 * POURQUOI : depuis la migration vers le SDK auto-généré (ng-openapi-gen),
 * les services admin ne construisent plus eux-mêmes leur HttpHeaders — les
 * appels passent par `Api.invoke(fn, params)` qui ne connaît pas le header.
 * Cet intercepteur centralise l'injection : si la clé est présente en
 * `sessionStorage['tuita_admin_key']`, elle est ajoutée à chaque requête
 * admin. Sinon la requête part sans header et le backend renverra 401/403,
 * géré par les intercepteurs de session.
 *
 * Ne pas étendre à d'autres routes : le header n'est pertinent que pour
 * l'API admin Tuita (CLEARANCE_STAFF_ONLY côté Laminas).
 */
const SESSION_KEY = 'tuita_admin_key';
const ADMIN_PATH_PREFIX = '/contractor-compliance/admin/';

export const adminKeyInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes(ADMIN_PATH_PREFIX)) {
    return next(req);
  }
  const key = sessionStorage.getItem(SESSION_KEY);
  if (!key) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { 'X-Tuita-Admin-Key': key } }));
};
