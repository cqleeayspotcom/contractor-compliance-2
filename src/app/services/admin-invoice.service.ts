import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';

/**
 * Admin Invoice Service
 *
 * Wraps the /contractor-compliance/admin/invoices/* endpoints with the
 * X-Tuita-Admin-Key header read from sessionStorage (key 'tuita_admin_key',
 * same convention as ContractorAdminComponent).
 *
 * Each method returns an Observable to fit the consumer's preferred
 * subscription pattern. The consumer is responsible for handling 401/403
 * (the spec says: clear sessionStorage + redirect to /admin).
 */

export type InvoiceStatus =
  | 'validating'
  | 'draft'
  | 'pending_payment_validation'
  | 'ready_to_pay'
  | 'payment_in_progress'
  | 'paid'
  | 'rejected'
  | 'cancelled';

export interface Rib {
  status: 'verified_fresh' | 'verified_stale' | 'missing';
  iban: string | null;
  iban_holder: string | null;
  bic: string | null;
  bank_name: string | null;
  verified_at: string | null;
}

export interface ContractorStatus {
  compliance_score: number;
  is_compliant: boolean;
  kyc_status: string;
  kyc_failure_reason: string | null;
  account_state: string;
  plan: string;
  documents_summary: { verified: number; pending: number; rejected: number; expired: number };
  revenue_total_paid_eur: number;
  last_invoice_at: string | null;
}

export interface MissionSnapshotInfo {
  expected_amount_ttc: number;
  completed_at: string | null;
  deviation_pct: number | null;
}

export interface InvoiceSearchFilters {
  q?: string;
  status?: string[];
  contractor_phone?: string;
  contractor_siren?: string;
  mission_ref?: string;
  amount_min?: number;
  amount_max?: number;
  date_from?: string;   // YYYY-MM-DD
  date_to?: string;
  /** @deprecated pivot 2026-05-13 â€” usÃ© plus, remplacÃ© par missing_validations (count-based). */
  validator_missing?: 'compliance' | 'production' | 'accounting';
  /** Pivot 2026-05-13 â€” nombre d'approbations manquantes (1, 2 ou 3 = aucune). */
  missing_validations?: 1 | 2 | 3;
  /** Pivot 2026-05-13 â€” factures stuck depuis > N jours (basÃ© sur created_at). */
  stale_days?: number;
  plan?: 'free' | 'pro';
  paid_disputed?: boolean;
  stuck?: boolean;
  /**
   * Tri server-side. Deux conventions supportÃ©es par le backend
   * (cf. WithAdminInvoiceFilters::applySort) :
   *  - Legacy : 'oldest' | 'newest' | 'amount_desc' | 'amount_asc'
   *  - Standard : nom de colonne whitelistÃ©e ('created_at', 'updated_at',
   *    'amount', 'status', 'number', 'mission_ref', 'paid_disputed_at') â€”
   *    combinÃ© Ã  `direction`.
   */
  sort?: string;
  direction?: 'asc' | 'desc';
  page?: number;
  per_page?: number;
}

export interface AdminInvoice {
  uuid: string;
  number?: string | null;
  mission_ref?: string | null;
  amount_ttc?: number | string | null;
  amount_ht?: number | string | null;
  amount_tva?: number | null;
  status: InvoiceStatus | string;
  paid_disputed_at?: string | null;
  paid_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  contractor_phone?: string | null;
  contractor_company_name?: string | null;
  contractor_siren?: string | null;
  contractor_plan?: string | null;
  validations?: Array<{
    validator_type: 'compliance' | 'production' | 'accounting';
    status: 'approved' | 'rejected';
    validated_at?: string | null;
    validated_by_email?: string | null;
    comment?: string | null;
  }>;
  // NEW 2026-05-07 â€” search/list endpoint enrichment
  rib?: Rib;
  contractor_status?: ContractorStatus;
  mission_snapshot?: MissionSnapshotInfo | null;
  validations_received?: string[];
  validations_missing?: string[];
  age_days?: number | null;
  // Free-form additional fields tolerated
  [key: string]: unknown;
}

export interface PaginatedInvoices {
  data: AdminInvoice[];
  meta?: {
    current_page?: number;
    last_page?: number;
    per_page?: number;
    total?: number;
    total_amount_ttc?: number;
    sort?: string;
    statuses?: string[];
  };
  links?: Record<string, string | null>;
}

/**
 * DÃ©tail complet retournÃ© par GET /admin/invoices/{uuid}.
 * Beaucoup plus riche que AdminInvoice (utilisÃ© dans les listes).
 */
export interface InvoiceDetail {
  invoice: {
    uuid: string;
    number?: string | null;
    status: string;
    status_label?: string | null;
    mission_ref?: string | null;
    amount_ht?: number | null;
    amount_tva?: number | null;
    amount_ttc?: number | null;
    currency?: string | null;
    from_company?: { uuid: string; name: string; siren?: string | null } | null;
    to_company?: { uuid: string; name: string; siren?: string | null; is_tuita_internal?: boolean } | null;
    created_at?: string | null;
    issued_at?: string | null;
    validated_at?: string | null;
    payment_launched_at?: string | null;
    paid_at?: string | null;
    rejection_reason?: string | null;
    rejection_details?: string | null;
    pages_count?: number | null;
    auto_retry_count?: number | null;
    reopen_count?: number | null;
    payment_ref_masked?: string | null;
  };
  items?: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total_ht: number;
  }>;
  reopened_from?: {
    uuid: string;
    number?: string | null;
    rejection_reason?: string | null;
    rejected_at?: string | null;
  } | null;
  /** Pivot 2026-05-13 : plus de validator_type, juste un compte d'approbations distinctes. */
  approvals_count?: number;
  approvals_required?: number;
  payment_validations?: Array<{
    uuid: string;
    status: 'approved' | 'rejected';
    source?: 'webhook' | 'admin_ui';
    validator_type?: string | null; // legacy, peut Ãªtre absent
    validated_by_email: string;
    validated_by_name: string;
    validated_at: string;
    comment?: string | null;
  }>;
  admin_notes?: Array<{
    uuid: string;
    content: string;
    category?: string | null;
    author_email?: string | null;
    created_at?: string | null;
  }>;
  webhooks_sent?: {
    rejected?: string | null;
    ready_to_pay?: string | null;
    payment_in_progress?: string | null;
    paid?: string | null;
    reopened?: string | null;
  };
  webhook_logs?: Array<{
    uuid: string;
    event_type: string;
    status: string;
    attempts: number;
    response_status?: number | null;
    response_ms?: number | null;
    last_error?: string | null;
    created_at?: string | null;
    sent_at?: string | null;
  }>;
  mission_snapshot?: {
    mission_ref: string;
    expected_amount_ttc: number;
    completed_at?: string | null;
  } | null;
  dispute?: {
    disputed_at: string;
    reason?: string | null;
    resolved_at?: string | null;
    resolution?: string | null;
  } | null;
  /**
   * Contexte 360Â° du contractor pour que les 3 validateurs voient toutes
   * les infos mÃ©tier rÃ©unies sans naviguer ailleurs.
   */
  contractor_context?: {
    identity: {
      phone?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      company_name?: string | null;
      siren?: string | null;
      plan?: string | null;
      account_state?: string | null;
      user_uuid?: string | null;
    };
    compliance: {
      score: number;
      is_compliant: boolean;
      documents: {
        verified: number;
        pending: number;
        rejected: number;
        expired: number;
      };
    };
    kyc: {
      uuid: string;
      status: string;
      failure_reason?: string | null;
      completed_at?: string | null;
      rematched_against_document_id?: number | null;
      rematch_score?: number | null;
    } | null;
  } | null;
}

export interface AuditTrailValidation {
  validator_type: 'production' | 'compliance' | 'accounting' | string;
  status: 'approved' | 'rejected' | string;
  validated_by_email?: string | null;
  validated_by_name?: string | null;
  validated_at: string;
  comment?: string | null;
}

export interface AuditTrailWebhooksSent {
  rejected?: string | null;
  ready_to_pay?: string | null;
  payment_in_progress?: string | null;
  paid?: string | null;
  reopened?: string | null;
}

export interface AuditTrailDetail {
  invoice: {
    uuid: string;
    number?: string | null;
    status: string;
    mission_ref?: string | null;
    amount_ttc?: number | null;
    from_company?: string | null;
    to_company?: string | null;
    created_at?: string | null;
    issued_at?: string | null;
    validated_at?: string | null;
    paid_at?: string | null;
    payment_ref_masked?: string | null;
  };
  reopened_from?: {
    uuid: string;
    number?: string | null;
    rejection_reason?: string | null;
  } | null;
  reopen_count?: number | null;
  payment_validations: AuditTrailValidation[];
  webhooks_sent: AuditTrailWebhooksSent;
  dispute?: {
    disputed_at: string;
    reason?: string | null;
    resolved_at?: string | null;
    resolution?: string | null;
  } | null;
}

export interface StuckCounts {
  validating?: number;
  pending_payment_validation_no_webhook?: number;
  pending_payment_validation_old?: number;
  ready_to_pay_old?: number;
  payment_in_progress_old?: number;
  [key: string]: number | undefined;
}

export interface MarkPaymentInProgressBody {
  payment_ref: string;
}

export interface MarkPaidBody {
  paid_at: string;
  payment_ref: string;
  skip_in_progress?: boolean;
  reason?: string;
}

export interface ReopenBody {
  reason: string;
}

export interface ResolveDisputeBody {
  resolution: string;
}

export interface ForceResendWebhookBody {
  event_type: 'rejected' | 'ready_to_pay' | 'payment_in_progress' | 'paid';
  reason: string;
}

export interface AddNoteBody {
  content: string;
  category?: string;
}

const BASE_URL = '/contractor-compliance/admin/invoices';
const SESSION_KEY = 'tuita_admin_key';

@Injectable({ providedIn: 'root' })
export class AdminInvoiceService {
  private readonly http = inject(HttpClient);

  private headers(): HttpHeaders {
    const key = sessionStorage.getItem(SESSION_KEY);
    if (!key) {
      // Surface explicit error -- caller should redirect to /admin
      throw new Error('admin_api_key_missing');
    }
    return new HttpHeaders({ 'X-Tuita-Admin-Key': key });
  }

  /**
   * Wrap a synchronous-throwing headers() call into an Observable error so
   * subscribers can route the missing-key case through their normal error
   * channel.
   */
  private safeHeaders(): { headers: HttpHeaders } | null {
    try {
      return { headers: this.headers() };
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------
  // Lists
  // ---------------------------------------------------------------------

  listPendingValidation(page = 1, perPage = 20, opts: { stuck?: boolean } = {}): Observable<PaginatedInvoices> {
    return this.list('/pending-validation', page, perPage, opts);
  }

  listReadyToPay(page = 1, perPage = 20, opts: { stuck?: boolean } = {}): Observable<PaginatedInvoices> {
    return this.list('/ready-to-pay', page, perPage, opts);
  }

  listPaymentInProgress(page = 1, perPage = 20, opts: { stuck?: boolean } = {}): Observable<PaginatedInvoices> {
    return this.list('/payment-in-progress', page, perPage, opts);
  }

  listPaidDisputed(page = 1, perPage = 20): Observable<PaginatedInvoices> {
    return this.list('/paid-disputed', page, perPage);
  }

  /**
   * "Tout" tab -- the backend has no dedicated /all endpoint, so we
   * issue the same call to /pending-validation by default and let
   * the caller switch to other endpoints if needed. The component
   * uses a different strategy (concatenated calls); this method is
   * kept for completeness but unused on the "all" tab.
   */
  list(path: string, page = 1, perPage = 20, extra: { stuck?: boolean } = {}): Observable<PaginatedInvoices> {
    const opts = this.safeHeaders();
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    let params = new HttpParams()
      .set('page', String(page))
      .set('per_page', String(perPage));
    if (extra.stuck) {
      params = params.set('stuck', '1');
    }
    return this.http.get<PaginatedInvoices>(`${BASE_URL}${path}`, {
      ...opts,
      params,
    });
  }

  getStuckCounts(): Observable<{ data: StuckCounts }> {
    const opts = this.safeHeaders();
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    return this.http.get<{ data: StuckCounts }>(`${BASE_URL}/stuck/counts`, opts);
  }

  // ---------------------------------------------------------------------
  // Single invoice
  // ---------------------------------------------------------------------

  getInvoice(uuid: string): Observable<{ data: AdminInvoice }> {
    const opts = this.safeHeaders();
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    return this.http.get<{ data: AdminInvoice }>(`${BASE_URL}/${uuid}`, opts);
  }

  /** Vue super-admin : invoice + relations + validations + items + webhooks + mission_snapshot + dispute. */
  getInvoiceDetail(uuid: string): Observable<{ data: InvoiceDetail }> {
    const opts = this.safeHeaders();
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    return this.http.get<{ data: InvoiceDetail }>(`${BASE_URL}/${uuid}`, opts);
  }

  /**
   * Stream le PDF en blob (l'admin key passe par header donc impossible
   * de mettre l'URL directe dans <iframe src> â€” il faut fetch + objectURL).
   */
  downloadInvoicePdf(uuid: string, inline = true): Observable<Blob> {
    const opts = this.safeHeaders();
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    const suffix = inline ? '?inline=1' : '';
    return this.http.get(`${BASE_URL}/${uuid}/pdf${suffix}`, {
      ...opts,
      responseType: 'blob',
    });
  }

  getAuditTrail(uuid: string): Observable<{ data: AuditTrailDetail }> {
    const opts = this.safeHeaders();
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    return this.http.get<{ data: AuditTrailDetail }>(
      `${BASE_URL}/${uuid}/audit-trail`,
      opts,
    );
  }

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------

  /**
   * Endpoint unifiÃ© multi-statut avec recherche full-text + filtres riches.
   * NEW 2026-05-07.
   */
  searchInvoices(filters: InvoiceSearchFilters): Observable<PaginatedInvoices> {
    const opts = this.safeHeaders();
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    let params = new HttpParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v === null || v === undefined || v === '') return;
      if (Array.isArray(v)) {
        v.forEach(item => { params = params.append(`${k}[]`, String(item)); });
      } else {
        params = params.set(k, String(v));
      }
    });
    return this.http.get<PaginatedInvoices>(BASE_URL, { ...opts, params });
  }

  markPaymentInProgress(uuid: string, body: MarkPaymentInProgressBody, ifUnchangedSince?: string): Observable<unknown> {
    const opts = this.safeHeaders();
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    const headers = ifUnchangedSince
      ? opts.headers.set('If-Unchanged-Since', ifUnchangedSince)
      : opts.headers;
    return this.http.post(`${BASE_URL}/${uuid}/mark-payment-in-progress`, body, { headers });
  }

  markPaid(uuid: string, body: MarkPaidBody, ifUnchangedSince?: string): Observable<unknown> {
    const opts = this.safeHeaders();
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    const headers = ifUnchangedSince
      ? opts.headers.set('If-Unchanged-Since', ifUnchangedSince)
      : opts.headers;
    return this.http.post(`${BASE_URL}/${uuid}/mark-paid`, body, { headers });
  }

  reopen(uuid: string, body: ReopenBody, ifUnchangedSince?: string): Observable<unknown> {
    const opts = this.safeHeaders();
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    const headers = ifUnchangedSince
      ? opts.headers.set('If-Unchanged-Since', ifUnchangedSince)
      : opts.headers;
    return this.http.post(`${BASE_URL}/${uuid}/reopen`, body, { headers });
  }

  resolveDispute(uuid: string, body: ResolveDisputeBody, ifUnchangedSince?: string): Observable<unknown> {
    const opts = this.safeHeaders();
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    const headers = ifUnchangedSince
      ? opts.headers.set('If-Unchanged-Since', ifUnchangedSince)
      : opts.headers;
    return this.http.post(`${BASE_URL}/${uuid}/resolve-dispute`, body, { headers });
  }

  forceResendWebhook(uuid: string, body: ForceResendWebhookBody, ifUnchangedSince?: string): Observable<unknown> {
    const opts = this.safeHeaders();
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    const headers = ifUnchangedSince
      ? opts.headers.set('If-Unchanged-Since', ifUnchangedSince)
      : opts.headers;
    return this.http.post(`${BASE_URL}/${uuid}/force-resend-webhook`, body, { headers });
  }

  addNote(uuid: string, body: AddNoteBody, ifUnchangedSince?: string): Observable<unknown> {
    const opts = this.safeHeaders();
    if (!opts) return throwError(() => new Error('admin_api_key_missing'));
    const headers = ifUnchangedSince
      ? opts.headers.set('If-Unchanged-Since', ifUnchangedSince)
      : opts.headers;
    return this.http.post(`${BASE_URL}/${uuid}/add-note`, body, { headers });
  }
}
