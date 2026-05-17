import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';

/**
 * Admin Document Service
 *
 * Wraps GET /contractor-compliance/admin/documents/{uuid} endpoints with the
 * X-Tuita-Admin-Key header read from sessionStorage (key 'tuita_admin_key',
 * same convention as AdminInvoiceService).
 *
 * Read-only by design â€” no mutating endpoints. Politique zero-manuel.
 */

export type DocumentStatus =
  | 'pending'
  | 'processing'
  | 'verified'
  | 'rejected'
  | 'expired'
  | 'legally_outdated';

export interface DocumentDetailDoc {
  uuid: string;
  type: string | null;
  type_label: string | null;
  status: DocumentStatus | string | null;
  status_label: string | null;
  original_filename: string | null;
  mime_type: string | null;
  is_pdf: boolean;
  is_image: boolean;
  document_version: number;
  is_current_version: boolean;
  expires_at: string | null;
  verified_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  rejection_details: string | null;
  created_at: string | null;
  updated_at: string | null;
  has_face_photo: boolean;
}

export interface DocumentDetailOwner {
  company_uuid: string | null;
  company_name: string | null;
  company_siren: string | null;
}

export interface DocumentPreviousVersion {
  uuid: string;
  document_version: number;
  status: string;
  rejection_reason: string | null;
  created_at: string | null;
}

export interface DocumentSupersededBy {
  uuid: string;
  version: number;
}

export interface DocumentDetail {
  document: DocumentDetailDoc;
  owner: DocumentDetailOwner | null;
  /** OCR extracted fields (free-form). Null if no verification was attached. */
  extracted_data: Record<string, unknown> | null;
  ocr_provider: string | null;
  ocr_confidence: number | null;
  previous_versions: DocumentPreviousVersion[];
  superseded_by: DocumentSupersededBy | null;
}

const BASE_URL = '/contractor-compliance/admin/documents';
const SESSION_KEY = 'tuita_admin_key';

@Injectable({ providedIn: 'root' })
export class AdminDocumentService {
  private readonly http = inject(HttpClient);

  private headers(): HttpHeaders {
    const key = sessionStorage.getItem(SESSION_KEY);
    if (!key) {
      throw new Error('admin_api_key_missing');
    }
    return new HttpHeaders({ 'X-Tuita-Admin-Key': key });
  }

  private safeHeaders(): { headers: HttpHeaders } | null {
    try {
      return { headers: this.headers() };
    } catch {
      return null;
    }
  }

  /**
   * Vue admin (read-only) d'un document : metadata + OCR fields + version
   * history. Pas d'action exposÃ©e.
   */
  getDocument(uuid: string): Observable<{ data: DocumentDetail }> {
    const opts = this.safeHeaders();
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    return this.http.get<{ data: DocumentDetail }>(`${BASE_URL}/${uuid}`, opts);
  }

  /**
   * Stream le fichier dÃ©chiffrÃ© en blob (l'admin key passe par header donc
   * impossible de mettre l'URL directe dans <iframe src> â€” il faut fetch +
   * URL.createObjectURL). `inline=true` => Content-Disposition inline.
   */
  downloadDocumentFile(uuid: string, inline = true): Observable<Blob> {
    const opts = this.safeHeaders();
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    const suffix = inline ? '?inline=1' : '';
    return this.http.get(`${BASE_URL}/${uuid}/file${suffix}`, {
      ...opts,
      responseType: 'blob',
    });
  }
}
