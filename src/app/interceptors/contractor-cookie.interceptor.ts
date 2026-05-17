import {
  HttpRequest,
  HttpHandlerFn,
  HttpEvent,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

/**
 * Ensures the __contractor_ssid cookie is sent with every request
 * (withCredentials: true) and handles 401 gracefully.
 *
 * Politique 401 (dans cet ordre) :
 *
 *   1. Si l'utilisateur est déjà sur /login ou /signup → pas de redirect.
 *      Sinon l'APP_INITIALIZER (loadDashboard sans cookie) déclenche un
 *      bounce immédiat vers tuita.fr et la page d'auth ne s'affiche jamais.
 *   2. Si la requête cible un endpoint d'auth (request-code, verify-code,
 *      signup) → pas de redirect. Un 401 ici = code OTP/invitation invalide,
 *      géré par le composant lui-même (snackbar).
 *   3. Si on est sur le domaine de PROD (`tuita.fr` exact) → redirect vers
 *      `tuita.fr/contractor/login` (comportement historique : cookie expiré,
 *      l'utilisateur retourne s'authentifier sur le portail principal).
 *   4. Partout ailleurs (staging Cloud Run *.run.app, localhost, preview…) →
 *      redirect IN-APP vers `/login` afin de permettre les tests bout en bout
 *      sans sortir du domaine staging. Le composant /login utilisera le mock
 *      OTP si `CONTRACTOR_MOCK_AUTH_ENABLED=true` côté backend.
 */
export function contractorCookieInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> {
  const cloned = req.clone({ withCredentials: true });

  return next(cloned).pipe(
    catchError((error: HttpErrorResponse) => {
      if (
        error.status === 401 &&
        !isOnSelfServedAuthPage() &&
        !isAuthEndpoint(req.url) &&
        shouldRedirectOn401()
      ) {
        // [ADAPTATION TUITA BACKEND]
        // L'auth contractor est gérée par le monolithe Tuita (cookie
        // __contractor_ssid via SMS). Les routes /login et /signup locales
        // sont désactivées — on redirige vers le portail Tuita (prod ou
        // backend monolithe local sur :8060).
        if (isProductionDomain()) {
          window.location.href = 'https://tuita.fr/contractor/login';
        } else {
          console.warn('401 hors prod — redirect vers le login Tuita monolithe (localhost:8060)');
          window.location.href = 'http://localhost:8060/contractor/login';
        }
      }
      return throwError(() => error);
    })
  );
}

/**
 * Vrai quand l'utilisateur est sur une route où on peut se logguer
 * directement dans l'app (mock OTP en staging). Sur ces pages, le 401 vient
 * du boot APP_INITIALIZER (loadDashboard sans cookie) — il ne faut surtout
 * pas rediriger, sinon la page /login n'a jamais le temps de s'afficher.
 */
function isOnSelfServedAuthPage(): boolean {
  const path = window.location.pathname;
  return path.startsWith('/login') || path.startsWith('/signup');
}

/**
 * Vrai pour les endpoints de login/signup eux-mêmes. Un 401 sur ces routes
 * = code OTP invalide ou code d'invitation invalide, géré localement par le
 * composant (snackbar « code invalide »).
 */
function isAuthEndpoint(url: string): boolean {
  return (
    url.includes('/auth/request-code') ||
    url.includes('/auth/verify-code') ||
    url.includes('/signup/verify-code') ||
    url.endsWith('/signup')
  );
}

/**
 * Vrai uniquement sur le domaine de production réel (`tuita.fr`). Tout le
 * reste (staging Cloud Run `*.run.app`, custom domains preview, localhost,
 * 127.0.0.1, *.tuita.dev, etc.) est considéré comme non-prod → on ne sort
 * jamais du domaine courant sur un 401.
 */
function isProductionDomain(): boolean {
  return window.location.hostname === 'tuita.fr';
}

const REDIRECT_STORAGE_KEY = '__contractor_last_401_redirect';
const REDIRECT_COOLDOWN_MS = 10_000;

function shouldRedirectOn401(): boolean {
  try {
    const last = Number(sessionStorage.getItem(REDIRECT_STORAGE_KEY) ?? '0');
    const now = Date.now();
    if (now - last < REDIRECT_COOLDOWN_MS) {
      console.warn('401 redirect suppressed (cooldown) — persistent auth failure');
      return false;
    }
    sessionStorage.setItem(REDIRECT_STORAGE_KEY, String(now));
    return true;
  } catch {
    return true;
  }
}
