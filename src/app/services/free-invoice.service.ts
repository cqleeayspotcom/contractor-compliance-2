import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

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
  private base = `${environment.apiUrl}/contractor/invoices/free`;

  list(page = 1): Observable<FreeInvoiceListResponse> {
    const params = new HttpParams().set('page', String(page));
    return this.http.get<FreeInvoiceListResponse>(this.base, { withCredentials: true, params });
  }

  detail(uuid: string): Observable<{ data: FreeInvoiceRequestSummary }> {
    return this.http.get<{ data: FreeInvoiceRequestSummary }>(`${this.base}/${uuid}`, { withCredentials: true });
  }

  create(formData: FormData): Observable<{ data: FreeInvoiceRequestSummary }> {
    return this.http.post<{ data: FreeInvoiceRequestSummary }>(`${this.base}/request`, formData, { withCredentials: true });
  }

  getEligibleMissions(): Observable<EligibleMission[]> {
    return this.http.get<EligibleMission[]>(
      `${this.base}/eligible-missions`,
      { withCredentials: true },
    );
  }

  cancel(uuid: string): Observable<unknown> {
    return this.http.post(`${this.base}/${uuid}/cancel`, {}, { withCredentials: true });
  }

  upload(uuid: string, pdf: File): Observable<{ data: FreeInvoiceUploadResult }> {
    const fd = new FormData();
    fd.append('pdf', pdf);
    return this.http.post<{ data: FreeInvoiceUploadResult }>(
      `${this.base}/${uuid}/upload`,
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
