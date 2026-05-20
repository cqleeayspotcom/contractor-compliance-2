import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';

import { Api } from '../api/api';
import { adminFreeInvoicesPending } from '../api/fn/admin-free-invoices/admin-free-invoices-pending';
import { adminFreeInvoicesGet } from '../api/fn/admin-free-invoices/admin-free-invoices-get';
import { adminFreeInvoicesReject } from '../api/fn/admin-free-invoices/admin-free-invoices-reject';
import { adminFreeInvoicesList } from '../api/fn/admin-free-invoices/admin-free-invoices-list';
import { adminFreeInvoicesApprove } from '../api/fn/admin-free-invoices/admin-free-invoices-approve';
import { adminFreeInvoicesAttachments } from '../api/fn/admin-free-invoices/admin-free-invoices-attachments';

/**
 * AdminFreeInvoiceService
 *
 * Encapsule les endpoints /contractor-compliance/admin/free-invoices/* via le
 * SDK auto-généré (pattern `api.invoke(fn, params)`). Les retours du SDK sont
 * castés vers la shape attendue par le UI (les payloads `JsonObject` du SDK
 * sont opaques côté types).
 *
 * Le header Authorization Bearer est injecté globalement par
 * admin-key.interceptor.ts.
 */

@Injectable({ providedIn: 'root' })
export class AdminFreeInvoiceService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(Api);

  pending(): Observable<{ data: any[] }> {
    return from(this.api.invoke(adminFreeInvoicesPending) as Promise<{ data: any[] }>);
  }

  list(params: { status?: string; page?: number; per_page?: number } = {}): Observable<{ data: any[] }> {
    return from(this.api.invoke(adminFreeInvoicesList, params) as Promise<{ data: any[] }>);
  }

  detail(uuid: string): Observable<{ data: any }> {
    return from(this.api.invoke(adminFreeInvoicesGet, { uuid }) as Promise<{ data: any }>);
  }

  /**
   * Approuve une demande de facture libre. F4 : le front n'envoie PAS de
   * montant autorisé — le backend `FreeInvoiceService::approve` fige le montant
   * autorisé sur le montant demandé. Seuls une note interne et une durée de
   * validité (`ttl_hours`) optionnelles sont transmises.
   */
  approve(uuid: string, body: { note?: string; ttl_hours?: number }): Observable<unknown> {
    return from(this.api.invoke(adminFreeInvoicesApprove, { uuid, body: body as any }));
  }

  reject(uuid: string, reason: string): Observable<unknown> {
    return from(this.api.invoke(adminFreeInvoicesReject, { uuid, body: { reason } as any }));
  }

  /**
   * Fetch le PDF d'une demande en Blob (object URL construit côté composant).
   *
   * Une demande de facture libre n'a qu'UN seul PDF (colonne `pdf_path`
   * unique côté backend) — la route admin `/attachments` le sert directement,
   * sans segment d'index. HttpClient direct sur `.PATH` du SDK car le endpoint
   * renvoie un binaire (responseType blob), pas du JSON. Le Bearer est injecté
   * par l'interceptor.
   */
  fetchAttachmentBlob(uuid: string): Observable<Blob> {
    const url = adminFreeInvoicesAttachments.PATH.replace('{uuid}', encodeURIComponent(uuid));
    return this.http.get(url, {
      responseType: 'blob',
    });
  }
}
