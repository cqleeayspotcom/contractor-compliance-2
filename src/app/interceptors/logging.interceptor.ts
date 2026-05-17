import {
  HttpInterceptorFn,
  HttpResponse
} from '@angular/common/http';
import { tap } from 'rxjs';

/**
 * Logging configuration
 */
const LOGGING_CONFIG = {
  enabled: true,
  logHeaders: false,
  logBody: true,
  logTiming: true,
  colorizeLogs: true,
  minDuration: 100
};

const LOG_COLORS = {
  request: '#2196F3',
  response: '#4CAF50',
  error: '#F44336',
  slow: '#FF9800',
  info: '#9E9E9E'
};

/**
 * Logging Interceptor (functional style)
 * Logs all API requests and responses in development mode
 */
export const loggingInterceptor: HttpInterceptorFn = (req, next) => {
  const isDevelopment = checkIsDevelopment();

  if (!isDevelopment || !LOGGING_CONFIG.enabled) {
    return next(req);
  }

  const startTime = performance.now();
  const requestId = generateRequestId();

  logRequest(req, requestId);

  return next(req).pipe(
    tap({
      next: (event) => {
        if (event instanceof HttpResponse) {
          const duration = performance.now() - startTime;
          logResponse(event, req, requestId, duration);
        }
      },
      error: (error) => {
        const duration = performance.now() - startTime;
        logError(error, req, requestId, duration);
      }
    })
  );
};

function colorStyle(color: string): string {
  return LOGGING_CONFIG.colorizeLogs ? `color: ${color}; font-weight: 500;` : '';
}

function logRequest(request: any, requestId: string): void {
  const style = colorStyle(LOG_COLORS.request);
  const { method, urlWithParams } = request;
  console.group(`%c${requestId} → ${method} ${urlWithParams}`, style);
  console.log('%c[Request Details]', style, { method, url: urlWithParams, timestamp: new Date().toISOString() });
  if (LOGGING_CONFIG.logHeaders) console.log('%c[Headers]', style, request.headers);
  if (LOGGING_CONFIG.logBody && request.body) console.log('%c[Body]', style, request.body);
  console.groupEnd();
}

function logResponse(event: HttpResponse<unknown>, request: any, requestId: string, duration: number): void {
  if (LOGGING_CONFIG.minDuration > 0 && duration < LOGGING_CONFIG.minDuration) return;
  const isSlow = duration > 1000;
  const style = colorStyle(isSlow ? LOG_COLORS.slow : LOG_COLORS.response);
  const statusColor = getStatusColor(event.status);
  console.group(`%c${requestId} ← ${event.status} ${event.statusText} (${duration.toFixed(0)}ms)`, style);
  console.log(`%c[Status] ${event.status} ${event.statusText}`, `color: ${statusColor}; font-weight: bold;`);
  console.log('%c[Timing]', style, { duration: `${duration.toFixed(2)}ms`, slow: isSlow });
  if (LOGGING_CONFIG.logHeaders) console.log('%c[Headers]', style, event.headers);
  if (LOGGING_CONFIG.logBody && event.body) console.log('%c[Body]', style, event.body);
  console.groupEnd();
}

function logError(error: any, request: any, requestId: string, duration: number): void {
  const style = colorStyle(LOG_COLORS.error);
  console.group(`%c${requestId} ✗ ERROR (${duration.toFixed(0)}ms)`, style);
  console.log('%c[Request]', style, { method: request.method, url: request.urlWithParams });
  console.log('%c[Error]', style, { status: error.status, statusText: error.statusText, message: error.message, error: error.error });
  console.groupEnd();
}

function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return '#4CAF50';
  if (status >= 300 && status < 400) return '#2196F3';
  if (status >= 400 && status < 500) return '#FF9800';
  if (status >= 500) return '#F44336';
  return '#9E9E9E';
}

function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `REQ-${timestamp}-${random}`.toUpperCase();
}

function checkIsDevelopment(): boolean {
  if (typeof window === 'undefined') return false;
  const isLocalhost = window.location.hostname === 'localhost' ||
                      window.location.hostname === '127.0.0.1' ||
                      window.location.hostname === '[::1]';
  const hasDevFlag = (window as any).__DEV__ || (window as any).DEBUG;
  return isLocalhost || hasDevFlag;
}

/**
 * Utility class for logging configuration
 */
export class LoggingConfig {
  static setEnabled(enabled: boolean): void { LOGGING_CONFIG.enabled = enabled; }
  static setMinDuration(duration: number): void { LOGGING_CONFIG.minDuration = duration; }
  static setLogHeaders(logHeaders: boolean): void { LOGGING_CONFIG.logHeaders = logHeaders; }
  static setLogBody(logBody: boolean): void { LOGGING_CONFIG.logBody = logBody; }
}
