import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { Api } from '../api/api';
import { adminContractorsShow } from '../api/fn/admin-contractors/admin-contractors-show';
import { adminContractorsDocuments } from '../api/fn/admin-contractors/admin-contractors-documents';
import { adminContractorsKycSessions } from '../api/fn/admin-contractors/admin-contractors-kyc-sessions';
import { adminContractorsInvoices } from '../api/fn/admin-contractors/admin-contractors-invoices';
import { adminContractorsPurchases } from '../api/fn/admin-contractors/admin-contractors-purchases';
import { adminContractorsMissions } from '../api/fn/admin-contractors/admin-contractors-missions';

/**
 * Admin Contractor Service
 *
 * Wraps GET /contractor-compliance/admin/contractors/{phone} (summary) +
 * /documents /kyc-sessions /invoices /purchases (paginated).
 *
 * Le header X-Tuita-Admin-Key est injecté globalement par
 * admin-key.interceptor.ts. Les 401/403 sont gérés par contractorCookieInterceptor
 * (redirect /login).
 *
 * NOTE migration SDK : les endpoints GET sont branches via Api.invoke (cast
 * JsonObject -> shape typee). fetchDocumentBlob garde HttpClient car le SDK
 * fn `adminDocumentsFile` ne supporte pas le query param `inline`.
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
   * Mappe vers `?include_old_versions=1` cote backend
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

@Injectable({ providedIn: 'root' })
export class AdminContractorService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(Api);

  private toParams(query?: ListQuery): HttpParams | undefined {
    if (!query) return undefined;
    let params = new HttpParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') {
        params = params.set(k, String(v));
      }
    }
    return params;
  }

  /**
   * Browse pagine : liste tous les contractors avec filtres + facets.
   *
   * NOTE : le SDK fn adminContractorsList ne declare pas de query params,
   * mais le backend Tuita les accepte. En attendant la regeneration de
   * l'OpenAPI on garde HttpClient pour preserver le contrat existant.
   */
  list(query: BrowseQuery = {}): Observable<ContractorBrowseResponse> {
    const params = this.toParams(query as unknown as ListQuery);
    return this.http.get<ContractorBrowseResponse>(
      '/contractor-compliance/admin/contractors',
      params ? { params } : {},
    );
  }

  getContractor(phone: string): Observable<{ data: ContractorDetail }> {
    return from(this.api.invoke(adminContractorsShow, { phone })).pipe(
      map(r => r as unknown as { data: ContractorDetail })
    );
  }

  listDocuments(phone: string, query: ListQuery = {}): Observable<Paginated<ContractorDocumentRow>> {
    // SDK fn n'accepte pas de query params (page/per_page/include_old_versions);
    // on garde HttpClient quand `query` est non-vide.
    const hasQuery = Object.values(query).some(v => v !== undefined && v !== null && v !== '');
    if (hasQuery) {
      return this.http.get<Paginated<ContractorDocumentRow>>(
        `/contractor-compliance/admin/contractors/${encodeURIComponent(phone)}/documents`,
        { params: this.toParams(query) },
      );
    }
    return from(this.api.invoke(adminContractorsDocuments, { phone })).pipe(
      map(r => r as unknown as Paginated<ContractorDocumentRow>)
    );
  }

  listKycSessions(phone: string, query: ListQuery = {}): Observable<Paginated<ContractorKycRow>> {
    const hasQuery = Object.values(query).some(v => v !== undefined && v !== null && v !== '');
    if (hasQuery) {
      return this.http.get<Paginated<ContractorKycRow>>(
        `/contractor-compliance/admin/contractors/${encodeURIComponent(phone)}/kyc-sessions`,
        { params: this.toParams(query) },
      );
    }
    return from(this.api.invoke(adminContractorsKycSessions, { phone })).pipe(
      map(r => r as unknown as Paginated<ContractorKycRow>)
    );
  }

  listInvoices(phone: string, query: ListQuery = {}): Observable<Paginated<ContractorInvoiceRow>> {
    const hasQuery = Object.values(query).some(v => v !== undefined && v !== null && v !== '');
    if (hasQuery) {
      return this.http.get<Paginated<ContractorInvoiceRow>>(
        `/contractor-compliance/admin/contractors/${encodeURIComponent(phone)}/invoices`,
        { params: this.toParams(query) },
      );
    }
    return from(this.api.invoke(adminContractorsInvoices, { phone })).pipe(
      map(r => r as unknown as Paginated<ContractorInvoiceRow>)
    );
  }

  listPurchases(phone: string, query: ListQuery = {}): Observable<Paginated<ContractorPurchaseRow>> {
    const hasQuery = Object.values(query).some(v => v !== undefined && v !== null && v !== '');
    if (hasQuery) {
      return this.http.get<Paginated<ContractorPurchaseRow>>(
        `/contractor-compliance/admin/contractors/${encodeURIComponent(phone)}/purchases`,
        { params: this.toParams(query) },
      );
    }
    return from(this.api.invoke(adminContractorsPurchases, { phone })).pipe(
      map(r => r as unknown as Paginated<ContractorPurchaseRow>)
    );
  }

  listMissions(phone: string, query: ListQuery = {}): Observable<Paginated<ContractorMissionRow>> {
    const hasQuery = Object.values(query).some(v => v !== undefined && v !== null && v !== '');
    if (hasQuery) {
      return this.http.get<Paginated<ContractorMissionRow>>(
        `/contractor-compliance/admin/contractors/${encodeURIComponent(phone)}/missions`,
        { params: this.toParams(query) },
      );
    }
    return from(this.api.invoke(adminContractorsMissions, { phone })).pipe(
      map(r => r as unknown as Paginated<ContractorMissionRow>)
    );
  }

  /**
   * Stream un document via X-Tuita-Admin-Key (impossible avec un simple <iframe>
   * cross-origin si la cle n'est pas en query). On fetch en blob -> object URL,
   * que le composant peut donner a un <iframe> ou a un <a download>.
   *
   * Garde HttpClient car le SDK fn adminDocumentsFile ne supporte pas le
   * query param `inline`.
   */
  fetchDocumentBlob(uuid: string, inline = true): Observable<Blob> {
    const params = inline ? new HttpParams().set('inline', '1') : undefined;
    return this.http.get(`/contractor-compliance/admin/documents/${encodeURIComponent(uuid)}/file`, {
      params,
      responseType: 'blob',
    });
  }
}
