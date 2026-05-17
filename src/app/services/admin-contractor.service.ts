import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';

/**
 * Admin Contractor Service
 *
 * Wraps GET /contractor-compliance/admin/contractors/{phone} (summary) +
 * /documents /kyc-sessions /invoices /purchases (paginated).
 *
 * X-Tuita-Admin-Key header read from sessionStorage. safeHeaders() retourne
 * null si la clÃ© manque (le caller doit rediriger /admin). 401/403 sont Ã 
 * intercepter par le composant pour clear sessionStorage.
 */

// ---------- Summary ----------

export interface ContractorIdentity {
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  siren: string | null;
  plan: string | null;
  account_state: string | null;
  user_uuid: string | null;
  created_at: string | null;
  company: {
    uuid: string;
    name: string;
    siren: string | null;
    is_tuita_internal: boolean;
  } | null;
}

export interface ContractorDocumentsSummary {
  verified: number;
  pending: number;
  rejected: number;
  expired: number;
  missing: number;
  total: number;
}

export interface ContractorCompliance {
  score: number;
  is_compliant: boolean;
  documents: { summary: ContractorDocumentsSummary };
}

export interface ContractorKycSummary {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  latest: {
    uuid: string;
    status: string;
    biometric_provider: string | null;
    created_at: string | null;
    completed_at: string | null;
  } | null;
}

export interface ContractorInvoicesSummary {
  total: number;
  paid_total_amount: number;
  pending_count: number;
  ready_to_pay_count: number;
  payment_in_progress_count: number;
  rejected_count: number;
}

export interface ContractorPurchasesSummary {
  total: number;
  completed: number;
  pending: number;
  failed: number;
  total_amount_eur: number;
}

export interface ContractorDetail {
  identity: ContractorIdentity;
  compliance: ContractorCompliance;
  kyc: { summary: ContractorKycSummary };
  invoices: { summary: ContractorInvoicesSummary };
  purchases: { summary: ContractorPurchasesSummary };
}

// ---------- Paginated rows ----------

export interface PaginatedMeta {
  total: number;
  current_page: number;
  per_page: number;
  last_page: number;
  from: number | null;
  to: number | null;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginatedMeta;
}

export interface ContractorDocumentRow {
  uuid: string;
  type: string;
  status: string;
  expires_at: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  rejection_details: string | null;
  original_filename: string | null;
  document_version: number;
  is_current_version: boolean;
  mime_type: string | null;
  file_size_bytes: number | null;
  created_at: string | null;
  preview_url: string;
  download_url: string;
  detail_url: string;
}

export interface ContractorKycRow {
  uuid: string;
  user_id: number | null;
  contractor_phone: string | null;
  contractor_first_name: string | null;
  contractor_last_name: string | null;
  status: string;
  failure_reason: string | null;
  failure_detail: string | null;
  biometric_provider: string | null;
  biometric_result: Record<string, unknown> | null;
  liveness_score: number | null;
  face_match_score: number | null;
  retry_count: number;
  last_retried_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
}

export interface ContractorInvoiceRow {
  uuid: string;
  number: string | null;
  status: string;
  amount_ttc: number | null;
  amount_ht: number | null;
  mission_ref: string | null;
  issued_at: string | null;
  paid_at: string | null;
  rejection_reason: string | null;
  created_at: string | null;
}

export interface ContractorPurchaseRow {
  uuid: string;
  document_type: string;
  siren: string | null;
  source: string | null;
  status: string;
  price_eur: number;
  paid_at: string | null;
  completed_at: string | null;
  refunded_at: string | null;
  error_message: string | null;
  has_document: boolean;
  created_at: string | null;
}

export interface ContractorMissionRow {
  mission_ref: string;
  mission_title: string | null;
  operation_type: string | null;
  city: string | null;
  expected_amount_ttc: number;
  completed_at: string | null;
  created_at: string | null;
  invoice: {
    uuid: string;
    status: string;
    amount_ttc: number | null;
  } | null;
  has_active_invoice: boolean;
}

export interface ListQuery {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
  type?: string;
  document_type?: string;
  without_invoice?: boolean | number;
  sort?: string;
  dir?: 'asc' | 'desc';
  /**
   * Inclure les anciennes versions des documents (re-uploads, renouvellements).
   * MappÃ© vers `?include_old_versions=1` cÃ´tÃ© backend
   * (cf. AdminContractorController::documents).
   */
  include_old_versions?: boolean | number;
}

// ---------- Browse list (admin top-level) ----------

export interface ContractorListRow {
  phone: string;
  user_uuid: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company_name: string | null;
  siren: string | null;
  city: string | null;
  department: string | null;
  plan: string | null;
  account_state: string | null;
  compliance_score: number;
  kyc_status: 'approved' | 'rejected' | 'pending' | 'none';
  active_invoices_count: number;
  stuck_invoices_count: number;
  certified_at: string | null;
  created_at: string | null;
  last_activity_at: string | null;
  detail_url: string;
}

export interface ContractorBrowseFacets {
  by_account_state: Record<string, number>;
  by_plan: Record<string, number>;
  by_kyc: Record<string, number>;
  by_compliance: Record<string, number>;
}

export interface ContractorBrowseResponse {
  data: ContractorListRow[];
  meta: PaginatedMeta;
  facets: ContractorBrowseFacets;
}

export interface BrowseQuery {
  page?: number;
  per_page?: number;
  q?: string;
  account_state?: string;
  plan?: string;
  kyc_status?: 'approved' | 'rejected' | 'pending' | 'none';
  compliance?: 'compliant' | 'partial' | 'blocked';
  has_active_invoice?: boolean | number;
  has_stuck_invoice?: boolean | number;
  city?: string;
  department?: string;
  created_after?: string;
  created_before?: string;
  sort?: 'created_at' | 'name' | 'compliance_score' | 'last_activity';
  direction?: 'asc' | 'desc';
}

const BASE_URL = '/contractor-compliance/admin/contractors';
const SESSION_KEY = 'tuita_admin_key';

@Injectable({ providedIn: 'root' })
export class AdminContractorService {
  private readonly http = inject(HttpClient);

  private headers(): HttpHeaders {
    const key = sessionStorage.getItem(SESSION_KEY);
    if (!key) {
      throw new Error('admin_api_key_missing');
    }
    return new HttpHeaders({ 'X-Tuita-Admin-Key': key });
  }

  private safeOpts(query?: ListQuery): { headers: HttpHeaders; params?: HttpParams } | null {
    let headers: HttpHeaders;
    try {
      headers = this.headers();
    } catch {
      return null;
    }
    if (!query) return { headers };
    let params = new HttpParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') {
        params = params.set(k, String(v));
      }
    }
    return { headers, params };
  }

  /**
   * Browse paginÃ© : liste tous les contractors avec filtres + facets.
   */
  list(query: BrowseQuery = {}): Observable<ContractorBrowseResponse> {
    const opts = this.safeOpts(query as unknown as ListQuery);
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    return this.http.get<ContractorBrowseResponse>(BASE_URL, opts);
  }

  getContractor(phone: string): Observable<{ data: ContractorDetail }> {
    const opts = this.safeOpts();
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    return this.http.get<{ data: ContractorDetail }>(
      `${BASE_URL}/${encodeURIComponent(phone)}`,
      opts,
    );
  }

  listDocuments(phone: string, query: ListQuery = {}): Observable<Paginated<ContractorDocumentRow>> {
    const opts = this.safeOpts(query);
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    return this.http.get<Paginated<ContractorDocumentRow>>(
      `${BASE_URL}/${encodeURIComponent(phone)}/documents`,
      opts,
    );
  }

  listKycSessions(phone: string, query: ListQuery = {}): Observable<Paginated<ContractorKycRow>> {
    const opts = this.safeOpts(query);
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    return this.http.get<Paginated<ContractorKycRow>>(
      `${BASE_URL}/${encodeURIComponent(phone)}/kyc-sessions`,
      opts,
    );
  }

  listInvoices(phone: string, query: ListQuery = {}): Observable<Paginated<ContractorInvoiceRow>> {
    const opts = this.safeOpts(query);
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    return this.http.get<Paginated<ContractorInvoiceRow>>(
      `${BASE_URL}/${encodeURIComponent(phone)}/invoices`,
      opts,
    );
  }

  listPurchases(phone: string, query: ListQuery = {}): Observable<Paginated<ContractorPurchaseRow>> {
    const opts = this.safeOpts(query);
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    return this.http.get<Paginated<ContractorPurchaseRow>>(
      `${BASE_URL}/${encodeURIComponent(phone)}/purchases`,
      opts,
    );
  }

  listMissions(phone: string, query: ListQuery = {}): Observable<Paginated<ContractorMissionRow>> {
    const opts = this.safeOpts(query);
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    return this.http.get<Paginated<ContractorMissionRow>>(
      `${BASE_URL}/${encodeURIComponent(phone)}/missions`,
      opts,
    );
  }

  /**
   * Stream un document via X-Tuita-Admin-Key (impossible avec un simple <iframe>
   * cross-origin si la clÃ© n'est pas en query). On fetch en blob â†’ object URL,
   * que le composant peut donner Ã  un <iframe> ou Ã  un <a download>.
   */
  fetchDocumentBlob(uuid: string, inline = true): Observable<Blob> {
    const opts = this.safeOpts({ ...(inline ? { inline: '1' } : {}) } as unknown as ListQuery);
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    return this.http.get(`/contractor-compliance/admin/documents/${encodeURIComponent(uuid)}/file`, {
      headers: opts.headers,
      params: opts.params,
      responseType: 'blob',
    });
  }
}
