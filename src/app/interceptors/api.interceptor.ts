import {
  HttpRequest,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpEvent,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError, catchError } from 'rxjs';

/**
 * API Interceptor
 * Handles error responses for the contractor compliance portal.
 * Authentication is cookie-based (__contractor_ssid) — no JWT or token refresh.
 */
export const apiInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {

  // Skip interceptor for external APIs
  if (req.url.startsWith('http://') || req.url.startsWith('https://')) {
    // On laisse passer les URLs externes qui ne ciblent pas notre backend
    // Tuita (préfixe `/contractor-compliance` après alignement Tuita).
    if (!req.url.includes('/contractor-compliance/') && !req.url.includes('/api/')) {
      return next(req);
    }
  }

  // Ensure cookies are sent with requests (cross-origin cookie auth)
  const authReq = req.clone({ withCredentials: true });

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // 401 Unauthorized — session expired or invalid cookie.
      //
      // Mêmes garde-fous que contractor-cookie.interceptor (cf. ce fichier
      // pour le rationale complet) :
      //   - Page /login ou /signup → pas de redirect, le composant gère.
      //   - Endpoint d'auth lui-même (request-code, verify-code, signup) →
      //     pas de redirect, 401 = code invalide géré par le composant.
      //   - Hors domaine prod (`tuita.fr` exact) → redirect IN-APP vers /login
      //     pour permettre les tests staging *.run.app + localhost sans sortir
      //     du domaine.
      //   - Sur tuita.fr exact → redirect tuita.fr/contractor/login.
      // [ADAPTATION TUITA BACKEND]
      // Auth Tuita (cookie __contractor_ssid). PROD → page login externe.
      // NON-PROD → page /login in-app (cf. contractor-cookie.interceptor.ts
      // pour le rationale complet). On évite aussi de rebouclage si l'utilisateur
      // est déjà sur /login ou /signup.
      if (error.status === 401 && !isAuthEndpoint(req.url) && !isOnSelfServedAuthPage()) {
        if (window.location.hostname === 'tuita.fr') {
          window.location.href = 'https://tuita.fr/contractor/login';
        } else {
          window.location.assign('/login');
        }
        return throwError(() => error);
      }

      // 422 Validation Errors — return as-is for component-level handling
      if (error.status === 422) {
        return throwError(() => error);
      }

      // 429 Too Many Requests
      if (error.status === 429) {
        return throwError(() => new Error('Trop de requêtes. Veuillez réessayer dans quelques instants.'));
      }

      // 500 Server Errors
      if (error.status >= 500) {
        return throwError(() => new Error('Erreur serveur. Veuillez réessayer plus tard.'));
      }

      // Network errors
      if (error.error instanceof ErrorEvent) {
        return throwError(() => new Error('Erreur de connexion. Vérifiez votre internet.'));
      }

      return throwError(() => error);
    })
  );
};

/**
 * Vrai quand l'utilisateur est sur /login ou /signup — pas de redirect, le
 * composant gère le 401 (boot APP_INITIALIZER sans cookie ou code invalide).
 */
function isOnSelfServedAuthPage(): boolean {
  const path = window.location.pathname;
  return path.startsWith('/login') || path.startsWith('/signup');
}

/**
 * Vrai pour les endpoints d'auth eux-mêmes — un 401 ici = code invalide,
 * géré par le composant de login/signup (snackbar « code invalide »).
 */
function isAuthEndpoint(url: string): boolean {
  return (
    url.includes('/auth/request-code') ||
    url.includes('/auth/verify-code') ||
    url.includes('/signup/verify-code') ||
    url.endsWith('/signup')
  );
}
