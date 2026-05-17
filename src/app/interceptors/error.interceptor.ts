import {
  HttpInterceptorFn,
  HttpErrorResponse
} from '@angular/common/http';
import { inject } from '@angular/core';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';

const ERROR_DISPLAY_DURATION = 4000;
const NETWORK_ERROR_DURATION = 6000;

/**
 * URLs where 404 is expected and should NOT trigger a snackbar.
 * These are normal responses when the contractor profile is not yet created.
 */
const SILENT_404_PATTERNS = [
  '/contractor-compliance/dashboard',
  '/contractor-compliance/documents',
  '/contractor-compliance/billing',
  '/contractor-compliance/invoices',
  '/contractor-compliance/missions',
  '/contractor-compliance/kyc/status',
  '/contractor-compliance/certification/status',
];

/**
 * URLs pour lesquelles un 429 ne doit PAS dÃ©clencher de snackbar :
 * ce sont des endpoints de polling automatique (dashboard, list docs,
 * status docs, status invoices) â€” le composant gÃ¨re dÃ©jÃ  la backoff en
 * stoppant son timer. Inonder l'utilisateur de Â« Trop de requÃªtes Â» sur
 * un poll auto n'a aucune valeur pour lui (il n'a rien dÃ©clenchÃ©).
 */
const SILENT_429_PATTERNS = [
  '/contractor-compliance/dashboard',
  '/contractor-compliance/documents',
  '/contractor-compliance/invoices',
  '/contractor-compliance/kyc/status',
  '/contractor-compliance/certification/status',
];

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const snackBar = inject(MatSnackBar);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (shouldShowError(error, req.url)) {
        showSnackBar(snackBar, error);
      }
      return throwError(() => error);
    })
  );
};

function shouldShowError(error: HttpErrorResponse, url: string): boolean {
  // Never show snackbar for 401 (handled by cookie interceptor redirect)
  if (error.status === 401) return false;

  // Don't show 404 for expected API endpoints
  if (error.status === 404) {
    return !SILENT_404_PATTERNS.some(pattern => url.includes(pattern));
  }

  // Don't show 429 on auto-polling endpoints (silencieux, le composant gÃ¨re le backoff)
  if (error.status === 429) {
    return !SILENT_429_PATTERNS.some(pattern => url.includes(pattern));
  }

  // Don't show for 422 (handled at component level)
  if (error.status === 422) return false;

  // Don't show for 403 (gated states like account_not_verified â€” handled at component level
  // with a dedicated empty state, no need to double up with a snackbar).
  if (error.status === 403) return false;

  return true;
}

function showSnackBar(snackBar: MatSnackBar, error: HttpErrorResponse): void {
  const message = getErrorMessage(error);
  const duration = error.status >= 500 || error.status === 0 ? NETWORK_ERROR_DURATION : ERROR_DISPLAY_DURATION;

  snackBar.open(message, 'OK', {
    duration,
    panelClass: ['tuita-snackbar'],
    horizontalPosition: 'center',
    verticalPosition: 'top',
  });
}

function getErrorMessage(error: HttpErrorResponse): string {
  if (error.error instanceof ErrorEvent) {
    return 'Erreur de connexion. VÃ©rifiez votre internet.';
  }

  // Try to extract a meaningful message from the backend
  const backendMsg = error.error?.error?.message || error.error?.message;
  if (backendMsg && typeof backendMsg === 'string') {
    return backendMsg;
  }

  switch (error.status) {
    case 400: return 'RequÃªte invalide.';
    case 403: return 'AccÃ¨s refusÃ©.';
    case 404: return 'Ressource non trouvÃ©e.';
    case 409: return 'Conflit de donnÃ©es.';
    case 429: return 'Trop de requÃªtes. RÃ©essayez dans quelques instants.';
    case 500: return 'Erreur serveur. RÃ©essayez plus tard.';
    case 502: case 503: case 504: return 'Service temporairement indisponible.';
    default: return 'Une erreur est survenue.';
  }
}
