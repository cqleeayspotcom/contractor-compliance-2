import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

const BASE_URL = '/contractor-compliance/admin/free-invoices';

@Injectable({ providedIn: 'root' })
export class AdminFreeInvoiceService {
  private readonly http = inject(HttpClient);

  private headers(): HttpHeaders {
    return new HttpHeaders({ 'X-Tuita-Admin-Key': sessionStorage.getItem('tuita_admin_key') ?? '' });
  }

  pending(): Observable<{ data: any[] }> {
    return this.http.get<{ data: any[] }>(`${BASE_URL}/pending`, { headers: this.headers() });
  }

  list(params: Record<string, string> = {}): Observable<{ data: any[] }> {
    return this.http.get<{ data: any[] }>(BASE_URL, { headers: this.headers(), params });
  }

  detail(uuid: string): Observable<{ data: any }> {
    return this.http.get<{ data: any }>(`${BASE_URL}/${uuid}`, { headers: this.headers() });
  }

  approve(uuid: string, body: { amount_authorized_ttc: number; comment?: string }): Observable<unknown> {
    return this.http.post(`${BASE_URL}/${uuid}/approve`, body, { headers: this.headers() });
  }

  reject(uuid: string, reason: string): Observable<unknown> {
    return this.http.post(`${BASE_URL}/${uuid}/reject`, { reason }, { headers: this.headers() });
  }

  /**
   * Fetch an attachment as a Blob and return an object URL.
   * Uses fetch + X-Tuita-Admin-Key header (option 1 â€” blob pattern like admin-kyc.service).
   */
  fetchAttachmentBlob(uuid: string, index: number): Observable<Blob> {
    return this.http.get(`${BASE_URL}/${uuid}/attachments/${index}`, {
      headers: this.headers(),
      responseType: 'blob',
    });
  }
}
