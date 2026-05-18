import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiConfiguration } from '../api/api-configuration';
import { unwrapData, unwrapDataMeta } from '../core/api-envelope';
import { adminContractorsShow } from '../api/fn/admin-contractors/admin-contractors-show';
import { adminContractorsList } from '../api/fn/admin-contractors/admin-contractors-list';
import { adminContractorsDocuments } from '../api/fn/admin-contractors/admin-contractors-documents';
import { adminContractorsKycSessions } from '../api/fn/admin-contractors/admin-contractors-kyc-sessions';
import { adminContractorsInvoices } from '../api/fn/admin-contractors/admin-contractors-invoices';
import { adminContractorsPurchases } from '../api/fn/admin-contractors/admin-contractors-purchases';
import { adminContractorsMissions } from '../api/fn/admin-contractors/admin-contractors-missions';
import { adminDocumentsFile } from '../api/fn/admin-documents/admin-documents-file';

/**
 * Admin Contractor Service
 *
 * Wraps GET /contractor-compliance/admin/contractors/{phone} (summary) +
 * /documents /kyc-sessions /invoices /purchases (paginated).
 *
 * Le header X-Tuita-Admin-Key est injectÃ© globalement par
 * admin-key.interceptor.ts. Les 401/403 sont gÃ©rÃ©s par contractorCookieInterceptor
 * (redirect /login).
 *
 * Regle SDK first : toute route HTTP passe par le SDK genere
 * (src/app/api/fn/...). Quand un param hors spec OpenAPI est requis
 * (ex: include_old_versions, sort/dir, document_type, without_invoice...),
 * on retombe sur HttpClient mais l'URL vient toujours de `<fn>.PATH`
 * (jamais hardcodee). Idem pour le binaire blob (responseType).
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

/**
 * Keys exposed par le SDK fn adminContractorsList ET partages avec BrowseQuery
 * sous le meme nom. BrowseQuery utilise `q`/`account_state` la ou le SDK
 * attend `search`/`status`, donc seuls les 4 ci-dessous matchent sans mapping.
 */
const SDK_LIST_KEYS = ['page', 'per_page', 'sort', 'direction'] as const;
/** Keys exposed by the SDK fns documents/invoices/missions. */
const SDK_SUB_LIST_KEYS = ['page', 'per_page', 'status'] as const;
/** Keys exposed by the SDK fns kyc-sessions/purchases (page/per_page only). */
const SDK_MIN_LIST_KEYS = ['page', 'per_page'] as const;

@Injectable({ providedIn: 'root' })
export class AdminContractorService {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfiguration);

  /** Reconstruit `{ data, meta }` (forme `Paginated<T>`) Ã  partir d'une rÃ©ponse SDK enveloppÃ©e. */
  private toPaginated<T>(
    source$: Observable<import('../api/strict-http-response').StrictHttpResponse<unknown>>,
  ): Observable<Paginated<T>> {
    return source$.pipe(
      unwrapDataMeta<T[], PaginatedMeta>(),
      map(({ data, meta }) => ({ data, meta: meta as PaginatedMeta })),
    );
  }

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
   * Renvoie `true` si `query` contient au moins une cle hors `allowed`
   * (param hors spec OpenAPI -> on doit retomber sur HttpClient).
   */
  private hasExtraKeys(query: object, allowed: readonly string[]): boolean {
    return Object.entries(query as Record<string, unknown>).some(
      ([k, v]) =>
        v !== undefined && v !== null && v !== '' && !allowed.includes(k),
    );
  }

  /**
   * Browse pagine : liste tous les contractors avec filtres + facets.
   *
   * BrowseQuery contient des filtres hors spec OpenAPI (q, account_state,
   * kyc_status, compliance, has_active_invoice, etc.). Si l'un d'eux est
   * present, on retombe sur HttpClient avec l'URL `adminContractorsList.PATH`
   * (jamais hardcodee). Sinon on passe par le SDK.
   */
  list(query: BrowseQuery = {}): Observable<ContractorBrowseResponse> {
    if (this.hasExtraKeys(query, SDK_LIST_KEYS)) {
      const params = this.toParams(query as unknown as ListQuery);
      return this.http.get<ContractorBrowseResponse>(
        adminContractorsList.PATH,
        params ? { params } : {},
      );
    }
    return adminContractorsList(this.http, this.apiConfig.rootUrl, {
      page: query.page,
      per_page: query.per_page,
      sort: query.sort,
      direction: query.direction,
    }).pipe(map(r => r.body as unknown as ContractorBrowseResponse));
  }

  getContractor(phone: string): Observable<{ data: ContractorDetail }> {
    return adminContractorsShow(this.http, this.apiConfig.rootUrl, { phone }).pipe(
      unwrapData<ContractorDetail>(),
      map(data => ({ data })),
    );
  }

  listDocuments(phone: string, query: ListQuery = {}): Observable<Paginated<ContractorDocumentRow>> {
    if (this.hasExtraKeys(query, SDK_SUB_LIST_KEYS)) {
      // include_old_versions / type / document_type / sort / dir / search :
      // hors spec OpenAPI -> HttpClient + .PATH.replace.
      return this.http.get<Paginated<ContractorDocumentRow>>(
        adminContractorsDocuments.PATH.replace('{phone}', encodeURIComponent(phone)),
        { params: this.toParams(query) },
      );
    }
    return this.toPaginated<ContractorDocumentRow>(
      adminContractorsDocuments(this.http, this.apiConfig.rootUrl, {
        phone,
        page: query.page,
        per_page: query.per_page,
        status: query.status,
      }),
    );
  }

  listKycSessions(phone: string, query: ListQuery = {}): Observable<Paginated<ContractorKycRow>> {
    if (this.hasExtraKeys(query, SDK_MIN_LIST_KEYS)) {
      return this.http.get<Paginated<ContractorKycRow>>(
        adminContractorsKycSessions.PATH.replace('{phone}', encodeURIComponent(phone)),
        { params: this.toParams(query) },
      );
    }
    return this.toPaginated<ContractorKycRow>(
      adminContractorsKycSessions(this.http, this.apiConfig.rootUrl, {
        phone,
        page: query.page,
        per_page: query.per_page,
      }),
    );
  }

  listInvoices(phone: string, query: ListQuery = {}): Observable<Paginated<ContractorInvoiceRow>> {
    if (this.hasExtraKeys(query, SDK_SUB_LIST_KEYS)) {
      return this.http.get<Paginated<ContractorInvoiceRow>>(
        adminContractorsInvoices.PATH.replace('{phone}', encodeURIComponent(phone)),
        { params: this.toParams(query) },
      );
    }
    return this.toPaginated<ContractorInvoiceRow>(
      adminContractorsInvoices(this.http, this.apiConfig.rootUrl, {
        phone,
        page: query.page,
        per_page: query.per_page,
        status: query.status,
      }),
    );
  }

  listPurchases(phone: string, query: ListQuery = {}): Observable<Paginated<ContractorPurchaseRow>> {
    if (this.hasExtraKeys(query, SDK_MIN_LIST_KEYS)) {
      return this.http.get<Paginated<ContractorPurchaseRow>>(
        adminContractorsPurchases.PATH.replace('{phone}', encodeURIComponent(phone)),
        { params: this.toParams(query) },
      );
    }
    return this.toPaginated<ContractorPurchaseRow>(
      adminContractorsPurchases(this.http, this.apiConfig.rootUrl, {
        phone,
        page: query.page,
        per_page: query.per_page,
      }),
    );
  }

  listMissions(phone: string, query: ListQuery = {}): Observable<Paginated<ContractorMissionRow>> {
    if (this.hasExtraKeys(query, SDK_SUB_LIST_KEYS)) {
      return this.http.get<Paginated<ContractorMissionRow>>(
        adminContractorsMissions.PATH.replace('{phone}', encodeURIComponent(phone)),
        { params: this.toParams(query) },
      );
    }
    return this.toPaginated<ContractorMissionRow>(
      adminContractorsMissions(this.http, this.apiConfig.rootUrl, {
        phone,
        page: query.page,
        per_page: query.per_page,
        status: query.status,
      }),
    );
  }

  /**
   * Stream un document via X-Tuita-Admin-Key (impossible avec un simple <iframe>
   * cross-origin si la cle n'est pas en query). On fetch en blob -> object URL,
   * que le composant peut donner a un <iframe> ou a un <a download>.
   *
   * Exception SDK : binaire (responseType: 'blob') -> on garde HttpClient,
   * mais l'URL vient de `adminDocumentsFile.PATH` (jamais hardcodee).
   */
  fetchDocumentBlob(uuid: string, inline = true): Observable<Blob> {
    const params = inline ? new HttpParams().set('inline', '1') : undefined;
    return this.http.get(
      adminDocumentsFile.PATH.replace('{uuid}', encodeURIComponent(uuid)),
      {
        params,
        responseType: 'blob',
      },
    );
  }
}
