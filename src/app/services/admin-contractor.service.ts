import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

/**
 * Coerce un filtre booléen tolérant (`boolean | number | undefined`) vers
 * `boolean | undefined` : `undefined`/`null` restent omis (le RequestBuilder
 * SDK ne sérialise pas les params absents), toute autre valeur est castée.
 */
function toBool(v: boolean | number | undefined): boolean | undefined {
  return v === undefined || v === null ? undefined : Boolean(v);
}
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
 * Le header Authorization Bearer est injecté globalement par
 * admin-key.interceptor.ts. Les 401/403 sont gérés par le composant appelant
 * (purge sessionStorage + redirect /admin/login).
 *
 * 100% SDK : toutes les routes passent par le SDK généré (src/app/api/fn/...).
 * Tous les filtres (BrowseQuery + ListQuery : search, sort/dir, document_type,
 * without_invoice, include_old_versions, etc.) sont déclarés dans l'OpenAPI —
 * plus aucun fallback HttpClient manuel. Seule exception conservée : le
 * téléchargement binaire blob (`fetchDocumentBlob`, responseType: 'blob').
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

/**
 * Ligne de la table « Documents » du back-office contractor.
 *
 * Les noms de clés suivent STRICTEMENT le payload de
 * `AdminContractorsController::documentsAction` (backend Laminas). Toute
 * divergence de nom casse silencieusement l'affichage : la colonne reste vide
 * ou affiche « vundefined ».
 */
export interface ContractorDocumentRow {
  uuid: string;
  type: string;
  status: string;
  failure_reason: string | null;
  failure_detail: string | null;
  version: number;
  is_current_version: boolean;
  superseded_by_id: number | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  original_filename: string | null;
  issued_at: string | null;
  expires_at: string | null;
  uploaded_at: string | null;
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

// ---------- Reshape backend → frontend ----------
// Le backend Laminas (AdminContractorsController::showAction) renvoie une
// forme historique {user, session_active, company, compliance, documents,
// kyc, invoices, stripe, audit_trail} qui ne matche pas la forme
// ContractorDetail attendue par les composants. On reshape ici pour
// présenter `identity / compliance / kyc.summary / invoices.summary /
// purchases.summary` sans toucher au backend.

interface RawContractorDetail {
  phone?: string | null;
  user?: {
    uuid?: string | null;
    id?: string | null;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    plan?: string | null;
    created_at?: string | null;
  } | null;
  session_active?: { account_state?: string | null; plan?: string | null } | null;
  company?: {
    uuid?: string | null;
    siren?: string | null;
    company_name?: string | null;
  } | null;
  compliance?: {
    score?: number | null;
    status?: string | null;
  } | null;
  documents?: Array<{ status?: string | null; expires_at?: string | null }> | null;
  kyc?: {
    uuid?: string | null;
    status?: string | null;
    verified_at?: string | null;
  } | null;
  invoices?: {
    counts_by_status?: Record<string, number> | null;
  } | null;
}

function reshapeContractorDetail(phone: string, raw: RawContractorDetail | null | undefined): ContractorDetail {
  const safe = raw ?? {};
  const user = safe.user ?? {};
  const company = safe.company ?? null;
  const session = safe.session_active ?? null;
  const docs = Array.isArray(safe.documents) ? safe.documents : [];
  const invoiceCounts = safe.invoices?.counts_by_status ?? {};

  const docStatusCount = (status: string): number =>
    docs.filter(d => (d?.status ?? '') === status).length;
  const docExpiredCount = docs.filter(d => {
    const exp = d?.expires_at;
    if (!exp) return false;
    return new Date(exp).getTime() < Date.now();
  }).length;
  const docVerified = docStatusCount('verified');
  const docPending = docStatusCount('pending');
  const docRejected = docStatusCount('rejected');

  return {
    identity: {
      phone: safe.phone ?? phone,
      first_name: user.first_name ?? null,
      last_name: user.last_name ?? null,
      company_name: company?.company_name ?? null,
      siren: company?.siren ?? null,
      plan: user.plan ?? session?.plan ?? null,
      account_state: session?.account_state ?? null,
      user_uuid: user.uuid ?? user.id ?? null,
      created_at: user.created_at ?? null,
      company: company
        ? {
            uuid: company.uuid ?? '',
            name: company.company_name ?? '',
            siren: company.siren ?? null,
            is_tuita_internal: false,
          }
        : null,
    },
    compliance: {
      score: Number(safe.compliance?.score ?? 0),
      is_compliant: (safe.compliance?.status ?? '') === 'compliant',
      documents: {
        summary: {
          verified: docVerified,
          pending: docPending,
          rejected: docRejected,
          expired: docExpiredCount,
          missing: 0,
          total: docs.length,
        },
      },
    },
    kyc: {
      summary: {
        total: safe.kyc ? 1 : 0,
        approved: safe.kyc?.status === 'approved' ? 1 : 0,
        rejected: safe.kyc?.status === 'rejected' ? 1 : 0,
        pending: safe.kyc && safe.kyc.status !== 'approved' && safe.kyc.status !== 'rejected' ? 1 : 0,
        latest: safe.kyc
          ? {
              uuid: safe.kyc.uuid ?? '',
              status: safe.kyc.status ?? 'unknown',
              biometric_provider: null,
              created_at: null,
              completed_at: safe.kyc.verified_at ?? null,
            }
          : null,
      },
    },
    invoices: {
      summary: {
        total: Object.values(invoiceCounts).reduce((acc, n) => acc + (Number(n) || 0), 0),
        paid_total_amount: 0,
        pending_count: Number(invoiceCounts['pending_payment_validation'] ?? 0),
        ready_to_pay_count: Number(invoiceCounts['ready_to_pay'] ?? 0),
        payment_in_progress_count: Number(invoiceCounts['payment_in_progress'] ?? 0),
        rejected_count: Number(invoiceCounts['rejected'] ?? 0),
      },
    },
    purchases: {
      summary: {
        total: 0,
        completed: 0,
        pending: 0,
        failed: 0,
        total_amount_eur: 0,
      },
    },
  };
}

@Injectable({ providedIn: 'root' })
export class AdminContractorService {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfiguration);

  /** Reconstruit `{ data, meta }` (forme `Paginated<T>`) Ã  partir d'une rÃ©ponse SDK enveloppÃ©e. */
  // ATTENTION : les sous-listes contractor (documents, kyc-sessions, invoices,
  // purchases, missions) renvoient le payload sous `data.items` — et NON `data`
  // comme tableau brut (contrairement a la liste principale `indexAction`).
  // On extrait donc `.items` ici ; sinon `state.rows` recoit un objet sans
  // `.length` et la table n'affiche aucune ligne.
  private toPaginated<T>(
    source$: Observable<import('../api/strict-http-response').StrictHttpResponse<unknown>>,
  ): Observable<Paginated<T>> {
    return source$.pipe(
      unwrapDataMeta<{ items?: T[] }, PaginatedMeta>(),
      map(({ data, meta }) => ({
        data: data?.items ?? [],
        meta: meta as PaginatedMeta,
      })),
    );
  }

  /**
   * Browse paginé : liste tous les contractors avec filtres + facets.
   *
   * 100% SDK : tous les filtres de `BrowseQuery` sont déclarés dans l'OpenAPI
   * → `adminContractorsList` les sérialise via le RequestBuilder généré.
   */
  list(query: BrowseQuery = {}): Observable<ContractorBrowseResponse> {
    return adminContractorsList(this.http, this.apiConfig.rootUrl, {
      page: query.page,
      per_page: query.per_page,
      q: query.q || undefined,
      account_state: query.account_state || undefined,
      plan: query.plan || undefined,
      kyc_status: query.kyc_status || undefined,
      compliance: query.compliance || undefined,
      has_active_invoice: toBool(query.has_active_invoice),
      has_stuck_invoice: toBool(query.has_stuck_invoice),
      city: query.city || undefined,
      department: query.department || undefined,
      created_after: query.created_after || undefined,
      created_before: query.created_before || undefined,
      sort: query.sort || undefined,
      direction: query.direction || undefined,
    }).pipe(
      map((r) => {
        // L'enveloppe canonique du module est `{ data, meta }` ; les facets
        // sont rangees dans `meta.facets`. On les remonte au niveau attendu
        // par le composant (`ContractorBrowseResponse.facets`).
        const env = (r.body ?? {}) as unknown as {
          data?: ContractorListRow[];
          meta?: (PaginatedMeta & { facets?: ContractorBrowseFacets }) | null;
        };
        const meta = (env.meta ?? {}) as PaginatedMeta & { facets?: ContractorBrowseFacets };
        return {
          data: env.data ?? [],
          meta,
          facets: meta.facets ?? {
            by_account_state: {},
            by_plan: {},
            by_kyc: {},
            by_compliance: {},
          },
        };
      }),
    );
  }

  getContractor(phone: string): Observable<{ data: ContractorDetail }> {
    return adminContractorsShow(this.http, this.apiConfig.rootUrl, { phone }).pipe(
      unwrapData<RawContractorDetail>(),
      map(raw => ({ data: reshapeContractorDetail(phone, raw) })),
    );
  }

  /**
   * Mappe `ListQuery` (frontend) → params SDK des sous-listes contractor.
   * Tous ces params sont déclarés dans l'OpenAPI → plus de fallback HttpClient.
   */
  private subParams(phone: string, query: ListQuery): {
    phone: string;
    page?: number;
    per_page?: number;
    search?: string;
    status?: string;
    type?: string;
    document_type?: string;
    without_invoice?: boolean;
    sort?: string;
    dir?: 'asc' | 'desc';
    include_old_versions?: boolean;
  } {
    return {
      phone,
      page: query.page,
      per_page: query.per_page,
      // Chaînes vides → undefined : le RequestBuilder SDK n'émet pas les
      // params absents, on évite donc un `?search=` parasite dans l'URL.
      search: query.search || undefined,
      status: query.status || undefined,
      type: query.type || undefined,
      document_type: query.document_type || undefined,
      without_invoice: toBool(query.without_invoice),
      sort: query.sort || undefined,
      dir: query.dir || undefined,
      include_old_versions: toBool(query.include_old_versions),
    };
  }

  listDocuments(phone: string, query: ListQuery = {}): Observable<Paginated<ContractorDocumentRow>> {
    return this.toPaginated<ContractorDocumentRow>(
      adminContractorsDocuments(this.http, this.apiConfig.rootUrl, this.subParams(phone, query)),
    );
  }

  listKycSessions(phone: string, query: ListQuery = {}): Observable<Paginated<ContractorKycRow>> {
    return this.toPaginated<ContractorKycRow>(
      adminContractorsKycSessions(this.http, this.apiConfig.rootUrl, this.subParams(phone, query)),
    );
  }

  listInvoices(phone: string, query: ListQuery = {}): Observable<Paginated<ContractorInvoiceRow>> {
    return this.toPaginated<ContractorInvoiceRow>(
      adminContractorsInvoices(this.http, this.apiConfig.rootUrl, this.subParams(phone, query)),
    );
  }

  listPurchases(phone: string, query: ListQuery = {}): Observable<Paginated<ContractorPurchaseRow>> {
    return this.toPaginated<ContractorPurchaseRow>(
      adminContractorsPurchases(this.http, this.apiConfig.rootUrl, this.subParams(phone, query)),
    );
  }

  listMissions(phone: string, query: ListQuery = {}): Observable<Paginated<ContractorMissionRow>> {
    return this.toPaginated<ContractorMissionRow>(
      adminContractorsMissions(this.http, this.apiConfig.rootUrl, this.subParams(phone, query)),
    );
  }

  /**
   * Stream un document via le Bearer OAuth2 admin (impossible avec un simple
   * <iframe> cross-origin si le token n'est pas en query). On fetch en blob ->
   * object URL, que le composant peut donner à un <iframe> ou à un <a download>.
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
