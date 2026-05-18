import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { Api } from '../api/api';
import { ApiConfiguration } from '../api/api-configuration';
import { unwrapData } from '../core/api-envelope';
import { adminFreeInvoicesPending } from '../api/fn/admin-free-invoices/admin-free-invoices-pending';
import { adminFreeInvoicesGet } from '../api/fn/admin-free-invoices/admin-free-invoices-get';
import { adminFreeInvoicesReject } from '../api/fn/admin-free-invoices/admin-free-invoices-reject';
import { adminFreeInvoicesList } from '../api/fn/admin-free-invoices/admin-free-invoices-list';
import { adminFreeInvoicesApprove } from '../api/fn/admin-free-invoices/admin-free-invoices-approve';
import { adminFreeInvoicesAttachments } from '../api/fn/admin-free-invoices/admin-free-invoices-attachments';

/**
 * AdminFreeInvoiceService
 *
 * Wrapper KEEP avec SDK a l'interieur : on caste les retours SDK (JsonObject)
 * vers la shape attendue par le UI, et on conserve HttpClient pour les
 * endpoints non couverts par le SDK (list avec query params, approve avec
 * body, attachment-by-index en blob).
 *
 * Le header X-Tuita-Admin-Key est injecte globalement par admin-key.interceptor.ts.
 */

@Injectable({ providedIn: 'root' })
export class AdminFreeInvoiceService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(Api);
  private readonly apiConfig = inject(ApiConfiguration);

  pending(): Observable<{ data: any[] }> {
    return adminFreeInvoicesPending(this.http, this.apiConfig.rootUrl).pipe(
      unwrapData<any[]>(),
      map(data => ({ data })),
    );
  }

  list(params: { status?: string; page?: number; per_page?: number } = {}): Observable<{ data: any[] }> {
    return adminFreeInvoicesList(this.http, this.apiConfig.rootUrl, params).pipe(
      unwrapData<any[]>(),
      map(data => ({ data })),
    );
  }

  detail(uuid: string): Observable<{ data: any }> {
    return adminFreeInvoicesGet(this.http, this.apiConfig.rootUrl, { uuid }).pipe(
      unwrapData<any>(),
      map(data => ({ data })),
    );
  }

  approve(uuid: string, body: { amount_authorized_ttc: number; comment?: string }): Observable<unknown> {
    return from(this.api.invoke(adminFreeInvoicesApprove, { uuid, body: body as any }));
  }

  reject(uuid: string, reason: string): Observable<unknown> {
    return from(this.api.invoke(adminFreeInvoicesReject, { uuid, body: { reason } as any }));
  }

  /**
   * Fetch an attachment as a Blob and return an object URL.
   *
   * Le SDK fn `adminFreeInvoicesAttachments` retourne la liste des attachments
   * (JsonObject) et n'expose pas l'endpoint indexe `/attachments/{index}` en
   * blob â€” choix architectural assumÃ© : HttpClient direct pour ce blob.
   */
  fetchAttachmentBlob(uuid: string, index: number): Observable<Blob> {
    const base = adminFreeInvoicesAttachments.PATH.replace('{uuid}', encodeURIComponent(uuid));
    return this.http.get(`${base}/${index}`, {
      responseType: 'blob',
    });
  }
}
