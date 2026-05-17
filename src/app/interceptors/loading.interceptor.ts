import {
  HttpInterceptorFn,
  HttpRequest
} from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { LoadingService } from '../services/loading.service';

/**
 * URLs that should skip the loading indicator
 */
const SKIP_LOADING_URLS = [
  '/health',
  '/ping',
  '/status',
  '/api/users/me/preferences',
  '/analytics/track'
];

/**
 * Request methods that should skip loading
 */
const SKIP_LOADING_METHODS = ['HEAD', 'OPTIONS'];

/**
 * Loading Interceptor (functional style)
 * Shows a loading indicator during HTTP requests
 */
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loadingService = inject(LoadingService);

  if (shouldSkipLoading(req)) {
    return next(req);
  }

  loadingService.showForRequest(req.url);

  return next(req).pipe(
    finalize(() => {
      loadingService.hideForRequest(req.url);
    })
  );
};

function shouldSkipLoading(request: HttpRequest<unknown>): boolean {
  if (SKIP_LOADING_METHODS.includes(request.method)) {
    return true;
  }
  return SKIP_LOADING_URLS.some((url) => request.url.includes(url));
}
