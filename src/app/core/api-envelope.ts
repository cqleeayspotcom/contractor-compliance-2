import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { StrictHttpResponse } from '../api/strict-http-response';

/**
 * Enveloppe canonique côté backend (cf. trait PHP `ApiEnvelope`).
 *
 *   Succès : { data: <payload>, meta?: <pagination> }
 *   Erreur : { error: { code, message, details? } }   — interceptée par errorInterceptor
 *
 * Ce module fournit les helpers RxJS pour déballer le payload côté frontend
 * SANS répéter `(res.body as { data: X }).data` dans chaque service.
 *
 * ATTENTION : ce fichier vit dans `src/app/core/` (PAS dans `src/app/api/`)
 * parce que `src/app/api/` est régénéré par `npm run generate-api` avec
 * `removeStaleFiles: true` — tout fichier non-généré y est supprimé.
 */

export interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/**
 * Opérateur RxJS qui extrait le `data` d'une réponse SDK enveloppée.
 *
 * ```ts
 * return invoicesList(this.http, this.rootUrl, params).pipe(unwrapData<Invoice[]>());
 * ```
 */
export function unwrapData<T>() {
  return (source: Observable<StrictHttpResponse<unknown>>): Observable<T> =>
    source.pipe(map((res) => (res.body as Envelope<T>).data));
}

/**
 * Variante qui retourne `{ data, meta }` séparés — utile pour les listings
 * paginés où `meta` contient total/page/per_page/last_page.
 *
 * ```ts
 * return adminInvoicesList(this.http, this.rootUrl, params).pipe(unwrapDataMeta<Invoice[]>());
 * ```
 */
export function unwrapDataMeta<T, M = Record<string, unknown>>() {
  return (
    source: Observable<StrictHttpResponse<unknown>>,
  ): Observable<{ data: T; meta: M | undefined }> =>
    source.pipe(
      map((res) => {
        const body = res.body as { data: T; meta?: M };
        return { data: body.data, meta: body.meta };
      }),
    );
}
