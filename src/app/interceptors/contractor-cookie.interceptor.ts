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
        // PROD : la page de login Tuita vit sur tuita.fr → redirect externe.
        // NON-PROD (localhost, staging *.run.app, preview…) : la page
        // tuita.fr/contractor/login n'est pas servie par le monolithe local
        // (juste l'API /contractor/auth/{pin,login}). On reste donc dans
        // l'app sur /login, qui appelle directement l'API Tuita via le
        // proxy Angular (cf. proxy.conf.json).
        if (isProductionDomain()) {
          window.location.href = 'https://tuita.fr/contractor/login';
        } else {
          window.location.assign('/login');
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
  // POURQUOI : sur ces endpoints, un 401 = code invalide. Pas de redirect,
  // le composant gère (snackbar). Couvre legacy + Tuita natif (PIN SMS).
  return (
    url.includes('/auth/request-code') ||
    url.includes('/auth/verify-code') ||
    url.includes('/signup/verify-code') ||
    url.endsWith('/signup') ||
    url.includes('/contractor/auth/pin') ||
    url.includes('/contractor/auth/login')
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
const REDIRECT_COOLDOWN_MS = 2_000;

/**
 * Le cooldown protège uniquement contre un loop infini si /login lui-même
 * renvoie un 401 (cas extrême). On stocke le timestamp en sessionStorage
 * mais on autorise le redirect dès qu'on n'est plus sur /login — sinon
 * un reload de l'app dans la fenêtre 10s laisse l'utilisateur bloqué sur
 * /dashboard avec « Session expirée ».
 */
function shouldRedirectOn401(): boolean {
  try {
    const onLogin = window.location.pathname.startsWith('/login');
    if (!onLogin) {
      sessionStorage.setItem(REDIRECT_STORAGE_KEY, String(Date.now()));
      return true;
    }
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
