import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { Api } from '../api/api';
import { ApiConfiguration } from '../api/api-configuration';
import { invoicesFreeGet } from '../api/fn/invoices-free/invoices-free-get';
import { invoicesFreeCancel } from '../api/fn/invoices-free/invoices-free-cancel';
import { invoicesFreeEligibleMissions } from '../api/fn/invoices-free/invoices-free-eligible-missions';
import { invoicesFreeList } from '../api/fn/invoices-free/invoices-free-list';
import { invoicesFreeRequest } from '../api/fn/invoices-free/invoices-free-request';
import { invoicesFreeUpload } from '../api/fn/invoices-free/invoices-free-upload';

// Routes backend Tuita : `/contractor-compliance/invoices/free*`. On passe
// par le proxy Angular (pas d'environment.apiUrl ici, le SDK pose la base).

export type FreeInvoiceStatus =
  | 'pending_admin_approval'
  | 'authorized'
  | 'rejected'
  | 'expired'
  | 'consumed'
  | 'cancelled';

export interface FreeInvoiceRequestSummary {
  uuid: string;
  subject: string;
  requested_amount_ttc: number;
  amount_authorized_ttc: number | null;
  status: FreeInvoiceStatus;
  rejected_reason: string | null;
  authorized_at: string | null;
  expires_at: string | null;
  created_at: string;
  invoice_uuid: string | null;
  invoice_status: string | null;
  /**
   * Si la dernière facture uploadée a été rejetée par le pipeline OCR
   * (montant non exact, destinataire ≠ Tuita, etc.), la raison est exposée ici
   * pour aider le contractor à corriger avant de re-uploader.
   * `null` si aucune facture précédente OU si la dernière n'est pas rejetée.
   */
  last_invoice_rejection_reason: string | null;
  last_invoice_rejection_details: string[] | null;
}

export interface EligibleMission {
  mission_ref: string;
  mission_title: string | null;
  expected_amount_ttc: string | null;
  completed_at: string;
  city: string | null;
}

@Injectable({ providedIn: 'root' })
export class FreeInvoiceService {
  private http = inject(HttpClient);
  private api = inject(Api);
  private apiConfig = inject(ApiConfiguration);

  list(page = 1): Observable<FreeInvoiceListResponse> {
    return from(
      this.api.invoke(invoicesFreeList, { page }),
    ) as Observable<FreeInvoiceListResponse>;
  }

  detail(uuid: string): Observable<{ data: FreeInvoiceRequestSummary }> {
    return from(this.api.invoke(invoicesFreeGet, { uuid }) as Promise<{ data: FreeInvoiceRequestSummary }>);
  }

  // upload progress: HttpClient direct, SDK ne gère pas (FormData multipart
  // avec subject + requested_amount_ttc + mission_ref + pdf; le SDK ne typifie
  // que `file?: Blob` côté body).
  create(formData: FormData): Observable<{ data: FreeInvoiceRequestSummary }> {
    const url = `${this.apiConfig.rootUrl}${invoicesFreeRequest.PATH}`;
    return this.http.post<{ data: FreeInvoiceRequestSummary }>(url, formData, { withCredentials: true });
  }

  getEligibleMissions(): Observable<EligibleMission[]> {
    return from(
      this.api.invoke(invoicesFreeEligibleMissions) as Promise<{ data: EligibleMission[] }>,
    ).pipe(map((res) => res.data));
  }

  cancel(uuid: string): Observable<unknown> {
    return from(this.api.invoke(invoicesFreeCancel, { uuid }));
  }

  // upload progress: HttpClient direct, SDK ne gère pas la progression upload
  // (le SDK invocation passe par Promise → pas de stream d'événements
  // HttpEventType.UploadProgress).
  upload(uuid: string, pdf: File): Observable<{ data: FreeInvoiceUploadResult }> {
    const fd = new FormData();
    fd.append('pdf', pdf);
    const url = `${this.apiConfig.rootUrl}${invoicesFreeUpload.PATH.replace('{uuid}', encodeURIComponent(uuid))}`;
    return this.http.post<{ data: FreeInvoiceUploadResult }>(
      url,
      fd,
      { withCredentials: true },
    );
  }
}

export interface FreeInvoiceListMeta {
  total: number;
  per_page: number;
}

export interface FreeInvoiceListResponse {
  data: FreeInvoiceRequestSummary[];
  meta?: FreeInvoiceListMeta;
}

export interface FreeInvoiceUploadResult {
  invoice_uuid: string;
  invoice_status: string;
  document_uuid?: string;
  amount_ttc?: number;
  rejection_reason?: string | null;
  rejection_details?: string[] | null;
  pages_count?: number | null;
  mode?: 'sync' | 'async';
  message?: string;
}
