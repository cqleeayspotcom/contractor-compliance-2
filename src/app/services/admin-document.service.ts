import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiConfiguration } from '../api/api-configuration';
import { unwrapData } from '../core/api-envelope';
import { adminDocumentsShow } from '../api/fn/admin-documents/admin-documents-show';
import { adminDocumentsFile } from '../api/fn/admin-documents/admin-documents-file';

/**
 * Admin Document Service
 *
 * Wraps GET /contractor-compliance/admin/documents/{uuid} endpoints. Le header
 * X-Tuita-Admin-Key est injecte globalement par admin-key.interceptor.ts.
 *
 * Read-only by design â€” no mutating endpoints. Politique zero-manuel.
 *
 * NOTE migration SDK : adminDocumentsShow est branche via Api.invoke (typage
 * JsonObject -> cast vers DocumentDetail). downloadDocumentFile garde
 * HttpClient car le SDK fn `adminDocumentsFile` ne supporte pas le query
 * param `?inline=1`.
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

@Injectable({ providedIn: 'root' })
export class AdminDocumentService {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfiguration);

  /**
   * Vue admin (read-only) d'un document : metadata + OCR fields + version
   * history. Pas d'action exposee.
   */
  getDocument(uuid: string): Observable<{ data: DocumentDetail }> {
    return adminDocumentsShow(this.http, this.apiConfig.rootUrl, { uuid }).pipe(
      unwrapData<DocumentDetail>(),
      map(data => ({ data })),
    );
  }

  /**
   * Stream le fichier dechiffre en blob (l'admin key passe par header donc
   * impossible de mettre l'URL directe dans <iframe src> â€” il faut fetch +
   * URL.createObjectURL). `inline=true` => Content-Disposition inline.
   *
   * Garde HttpClient car le SDK fn adminDocumentsFile ne supporte pas le
   * query param `inline`.
   */
  downloadDocumentFile(uuid: string, inline = true): Observable<Blob> {
    const url = adminDocumentsFile.PATH.replace('{uuid}', encodeURIComponent(uuid));
    const suffix = inline ? '?inline=1' : '';
    return this.http.get(`${url}${suffix}`, {
      responseType: 'blob',
    });
  }
}
