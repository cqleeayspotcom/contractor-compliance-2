import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

import { Api } from '../api/api';
import { adminInvoicesShow } from '../api/fn/admin-invoices/admin-invoices-show';
import { adminInvoicesAuditTrail } from '../api/fn/admin-invoices/admin-invoices-audit-trail';
import { adminInvoicesPendingValidation } from '../api/fn/admin-invoices/admin-invoices-pending-validation';
import { adminInvoicesReadyToPay } from '../api/fn/admin-invoices/admin-invoices-ready-to-pay';
import { adminInvoicesPaymentInProgress } from '../api/fn/admin-invoices/admin-invoices-payment-in-progress';
import { adminInvoicesPaidDisputed } from '../api/fn/admin-invoices/admin-invoices-paid-disputed';
import { adminInvoicesStatsStuckCounts } from '../api/fn/admin-invoices/admin-invoices-stats-stuck-counts';
import { adminInvoicesPdf } from '../api/fn/admin-invoices/admin-invoices-pdf';
import { adminInvoicesList } from '../api/fn/admin-invoices/admin-invoices-list';
import { adminInvoicesMarkPaymentInProgress } from '../api/fn/admin-invoices/admin-invoices-mark-payment-in-progress';
import { adminInvoicesMarkPaid } from '../api/fn/admin-invoices/admin-invoices-mark-paid';
import { adminInvoicesReopen } from '../api/fn/admin-invoices/admin-invoices-reopen';
import { adminInvoicesResolveDispute } from '../api/fn/admin-invoices/admin-invoices-resolve-dispute';
import { adminInvoicesAddNote } from '../api/fn/admin-invoices/admin-invoices-add-note';
import { adminInvoicesValidate } from '../api/fn/admin-invoices/admin-invoices-validate';
import { adminInvoicesReject } from '../api/fn/admin-invoices/admin-invoices-reject';
import { adminInvoicesCancel } from '../api/fn/admin-invoices/admin-invoices-cancel';
import { adminInvoicesDispute } from '../api/fn/admin-invoices/admin-invoices-dispute';
import { adminInvoicesExpire } from '../api/fn/admin-invoices/admin-invoices-expire';
import { adminInvoicesExport } from '../api/fn/admin-invoices/admin-invoices-export';
import { adminInvoicesTodayPayments } from '../api/fn/admin-invoices/admin-invoices-today-payments';
import { adminInvoicesStatsByValidator } from '../api/fn/admin-invoices/admin-invoices-stats-by-validator';
import { adminInvoicesStatsPipeline } from '../api/fn/admin-invoices/admin-invoices-stats-pipeline';
import { adminInvoicesSendValidatorReminder } from '../api/fn/admin-invoices/admin-invoices-send-validator-reminder';

/**
 * Admin Invoice Service
 *
 * Encapsule les endpoints /contractor-compliance/admin/invoices/* via le SDK
 * auto-généré. Le header Authorization Bearer est injecté globalement par
 * admin-key.interceptor.ts (cf. app.config.ts) depuis
 * sessionStorage['tuita_admin_token']. Si le token manque, l'appel part sans
 * header -> 401/403 -> redirect /admin/login via le composant appelant +
 * adminAuthGuard.
 *
 * Pourquoi `api.invoke` partout : on s'aligne sur le pattern unique du SDK
 * (le body de la SuccessEnvelope est déjà `{ data, meta? }`), ce qui évite de
 * ré-importer les helpers `unwrapData/unwrapDataMeta` à chaque appel.
 * Exceptions documentées : recherche full-text + actions optimistic-locking
 * dont les params ne sont pas exposés par la spec OpenAPI (cf. ci-dessous).
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
  /** @deprecated pivot 2026-05-13 — usé plus, remplacé par missing_validations (count-based). */
  validator_missing?: 'compliance' | 'production' | 'accounting';
  /** Pivot 2026-05-13 — nombre d'approbations manquantes (1, 2 ou 3 = aucune). */
  missing_validations?: 1 | 2 | 3;
  /** Pivot 2026-05-13 — factures stuck depuis > N jours (basé sur created_at). */
  stale_days?: number;
  plan?: 'free' | 'pro';
  paid_disputed?: boolean;
  stuck?: boolean;
  /**
   * Onglet « À valider » en file par admin : exclut les factures déjà votées
   * par l'admin courant. L'identité est résolue côté backend via le Bearer
   * OAuth2 — rien n'est transmis dans la query à part le booléen.
   */
  exclude_self_validated?: boolean;
  /**
   * Tri server-side. Deux conventions supportées par le backend
   * (cf. WithAdminInvoiceFilters::applySort) :
   *  - Legacy : 'oldest' | 'newest' | 'amount_desc' | 'amount_asc'
   *  - Standard : nom de colonne whitelistée ('created_at', 'updated_at',
   *    'amount', 'status', 'number', 'mission_ref', 'paid_disputed_at') —
   *    combiné à `direction`.
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
  // NEW 2026-05-07 — search/list endpoint enrichment
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
 * Détail complet retourné par GET /admin/invoices/{uuid}.
 * Beaucoup plus riche que AdminInvoice (utilisé dans les listes).
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
    validator_type?: string | null; // legacy, peut être absent
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
   * Contexte 360° du contractor pour que les 3 validateurs voient toutes
   * les infos métier réunies sans naviguer ailleurs.
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

/** Les 3 décisions comptables possibles pour clôturer un litige (parité backend). */
export type DisputeResolution = 'credit_note_issued' | 'amicable_refund' | 'no_action';

export interface ResolveDisputeBody {
  resolution: DisputeResolution;
  /** Justification comptable — 20 caractères minimum, exigé par le backend. */
  notes: string;
}

export interface AddNoteBody {
  content: string;
  category?: string;
}

/**
 * Décision d'un validateur sur une facture. `decision` est obligatoire :
 * `approved` compte une approbation vers le quorum, `rejected` rejette.
 */
export interface ValidateBody {
  decision: 'approved' | 'rejected';
  /** Code de motif structuré (préféré à `reason`). */
  reason_code?: string;
  /** Motif texte libre (fallback de `reason_code`). */
  reason?: string;
  /** ID de corrélation (généré côté backend si absent). */
  correlation_id?: string;
}

export interface RejectBody {
  /** Motif du rejet — obligatoire côté backend. */
  reason: string;
}

export interface DisputeBody {
  /** Motif du litige — obligatoire côté backend. */
  reason: string;
}

/**
 * Forme du body renvoyé par les endpoints listing du SDK (SuccessEnvelope).
 * On caste localement car le SDK généré retourne `JsonObject` opaque.
 */
type ListEnvelope = { data: AdminInvoice[]; meta?: PaginatedInvoices['meta'] };

@Injectable({ providedIn: 'root' })
export class AdminInvoiceService {
  private readonly api = inject(Api);

  // ---------------------------------------------------------------------
  // Lists
  // ---------------------------------------------------------------------

  listPendingValidation(page = 1, perPage = 20, opts: { stuck?: boolean } = {}): Observable<PaginatedInvoices> {
    // `api.invoke` renvoie directement le body `{ data, meta }` — pas besoin d'unwrap.
    return from(this.api.invoke(adminInvoicesPendingValidation, { page, per_page: perPage, stuck: opts.stuck }) as Promise<ListEnvelope>);
  }

  listReadyToPay(page = 1, perPage = 20, opts: { stuck?: boolean } = {}): Observable<PaginatedInvoices> {
    return from(this.api.invoke(adminInvoicesReadyToPay, { page, per_page: perPage, stuck: opts.stuck }) as Promise<ListEnvelope>);
  }

  listPaymentInProgress(page = 1, perPage = 20, opts: { stuck?: boolean } = {}): Observable<PaginatedInvoices> {
    return from(this.api.invoke(adminInvoicesPaymentInProgress, { page, per_page: perPage, stuck: opts.stuck }) as Promise<ListEnvelope>);
  }

  listPaidDisputed(page = 1, perPage = 20): Observable<PaginatedInvoices> {
    return from(this.api.invoke(adminInvoicesPaidDisputed, { page, per_page: perPage }) as Promise<ListEnvelope>);
  }

  // Signature `{ data }` préservée pour ne pas casser les consommateurs
  // (cf. contractor-admin.component.ts qui lit `res.data`).
  getStuckCounts(): Observable<{ data: StuckCounts }> {
    return from(this.api.invoke(adminInvoicesStatsStuckCounts) as Promise<{ data: StuckCounts }>).pipe(
      map(body => ({ data: body.data })),
    );
  }

  // ---------------------------------------------------------------------
  // Single invoice
  // ---------------------------------------------------------------------

  getInvoice(uuid: string): Observable<{ data: AdminInvoice }> {
    return from(this.api.invoke(adminInvoicesShow, { uuid }) as Promise<{ data: AdminInvoice }>);
  }

  /** Vue super-admin : invoice + relations + validations + items + mission_snapshot + dispute. */
  getInvoiceDetail(uuid: string): Observable<{ data: InvoiceDetail }> {
    return from(this.api.invoke(adminInvoicesShow, { uuid }) as Promise<{ data: InvoiceDetail }>);
  }

  /**
   * Stream le PDF en blob.
   *
   * Pourquoi pas `<iframe src>` direct : le Bearer admin passe par header
   * (interceptor), pas par query string — il faut donc fetch via HttpClient
   * + objectURL côté composant. Le SDK fn retourne déjà un Blob brut (pas
   * d'enveloppe JSON) ; on utilise `invoke$Response` pour récupérer le body.
   */
  downloadInvoicePdf(uuid: string, inline = true): Observable<Blob> {
    return from(
      this.api
        .invoke$Response(adminInvoicesPdf, { uuid, inline })
        .then(r => r.body as unknown as Blob),
    );
  }

  getAuditTrail(uuid: string): Observable<{ data: AuditTrailDetail }> {
    return from(this.api.invoke(adminInvoicesAuditTrail, { uuid }) as Promise<{ data: AuditTrailDetail }>);
  }

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------

  /**
   * Recherche full-text + filtres riches (status[], dates, montants, plan, etc.).
   *
   * Migration SDK (2026-05-20) : tous les filtres sont désormais déclarés dans
   * l'OpenAPI → `api.invoke` remplace le HttpClient manuel. Le param `status`
   * (array) est mappé sur la clé bracketée `status[]` attendue par le backend
   * (cf. AdminInvoiceController::buildFilters, branche `is_array($status)`).
   */
  searchInvoices(filters: InvoiceSearchFilters): Observable<PaginatedInvoices> {
    // FIX 2026-05-20 (audit Claude) : alignement noms params front ↔ backend.
    // Le backend lit `min_amount`, `max_amount`, `missing_approvals`,
    // `pending_since`, `blocked`. Le service envoyait historiquement
    // `amount_min`, `amount_max`, `missing_validations`, `stale_days`. Tous
    // ces params étaient SILENCIEUSEMENT IGNORÉS par le backend (pas de 422
    // ni log), si bien que la search bar, les chips ≥3j/7j/14j, les sliders
    // €, le filtre « bloquées » et les chips Approbations 0/3 1/3 2/3 ne
    // filtraient rien. On accepte les deux noms côté interface (rétrocompat)
    // mais on n'envoie au backend que les noms qu'il comprend.
    const params = {
      q: filters.q || undefined,
      'status[]': filters.status?.length ? filters.status : undefined,
      contractor_phone: filters.contractor_phone || undefined,
      contractor_siren: filters.contractor_siren || undefined,
      mission_ref: filters.mission_ref || undefined,
      // accepte les deux variantes côté interface ; émet vers le backend les
      // noms qu'il reconnaît.
      min_amount: (filters as any).min_amount ?? filters.amount_min,
      max_amount: (filters as any).max_amount ?? filters.amount_max,
      date_from: filters.date_from || undefined,
      date_to: filters.date_to || undefined,
      validator_missing: filters.validator_missing,
      missing_approvals: (filters as any).missing_approvals ?? filters.missing_validations,
      pending_since: (filters as any).pending_since ?? filters.stale_days,
      plan: filters.plan,
      paid_disputed: filters.paid_disputed,
      stuck: filters.stuck,
      exclude_self_validated: filters.exclude_self_validated || undefined,
      blocked: (filters as any).blocked,
      sort: filters.sort || undefined,
      direction: filters.direction,
      page: filters.page,
      per_page: filters.per_page,
    };
    return from(this.api.invoke(adminInvoicesList, params) as Promise<PaginatedInvoices>);
  }

  /**
   * Actions admin via SDK typé : l'identité de l'admin est résolue côté
   * backend via le Bearer OAuth2 (jamais transmise dans le body). Le
   * paramètre `_ifUnchangedSince` reste sur la signature pour ne pas casser
   * les appelants existants ; il est volontairement ignoré.
   */
  markPaymentInProgress(uuid: string, _body?: MarkPaymentInProgressBody, _ifUnchangedSince?: string): Observable<unknown> {
    // Transition pure côté backend : aucun body attendu.
    return from(this.api.invoke(adminInvoicesMarkPaymentInProgress, {
      uuid,
    }) as Promise<unknown>);
  }

  markPaid(uuid: string, body: MarkPaidBody, _ifUnchangedSince?: string): Observable<unknown> {
    // Body SDK = { payment_ref, paid_at?, fast_path? } — `skip_in_progress`
    // et `reason` du fast path partent en plus, le backend les ignore.
    return from(this.api.invoke(adminInvoicesMarkPaid, {
      uuid,
      body: body as unknown as { payment_ref: string; paid_at?: string },
    }) as Promise<unknown>);
  }

  reopen(uuid: string, body: ReopenBody, _ifUnchangedSince?: string): Observable<unknown> {
    return from(this.api.invoke(adminInvoicesReopen, { uuid, body }) as Promise<unknown>);
  }

  /**
   * Clôture un litige. Le backend `resolveDisputeAction` exige `resolution`
   * (énumération comptable fermée) + `notes` (≥ 20 caractères) — les deux
   * sont enregistrés dans l'audit trail.
   */
  resolveDispute(uuid: string, body: ResolveDisputeBody, _ifUnchangedSince?: string): Observable<unknown> {
    return from(this.api.invoke(adminInvoicesResolveDispute, {
      uuid,
      body,
    }) as Promise<unknown>);
  }

  addNote(uuid: string, body: AddNoteBody, _ifUnchangedSince?: string): Observable<unknown> {
    return from(this.api.invoke(adminInvoicesAddNote, {
      uuid,
      body: { content: body.content },
    }) as Promise<unknown>);
  }

  /**
   * Décision d'un validateur (approuve / rejette) — action centrale du flow
   * 3-validateurs (`POST /admin/invoices/:uuid/validate`). Le backend
   * transitionne la facture une fois le quorum d'approbations atteint.
   */
  validate(uuid: string, body: ValidateBody): Observable<unknown> {
    return from(this.api.invoke(adminInvoicesValidate, { uuid, body }) as Promise<unknown>);
  }

  /** Rejet direct d'une facture (force-reject admin, motif obligatoire). */
  reject(uuid: string, body: RejectBody): Observable<unknown> {
    return from(this.api.invoke(adminInvoicesReject, { uuid, body }) as Promise<unknown>);
  }

  /** Annule une facture : sortie de pipeline sans paiement. */
  cancel(uuid: string): Observable<unknown> {
    return from(this.api.invoke(adminInvoicesCancel, { uuid }) as Promise<unknown>);
  }

  /** Ouvre un litige sur une facture payée (paid → disputed), motif obligatoire. */
  dispute(uuid: string, body: DisputeBody): Observable<unknown> {
    return from(this.api.invoke(adminInvoicesDispute, { uuid, body }) as Promise<unknown>);
  }

  /** Marque une facture expirée (délai de validation dépassé). */
  expire(uuid: string): Observable<unknown> {
    return from(this.api.invoke(adminInvoicesExpire, { uuid }) as Promise<unknown>);
  }

  /** Relance par email les validateurs n'ayant pas encore statué. */
  sendValidatorReminder(uuid: string): Observable<unknown> {
    return from(this.api.invoke(adminInvoicesSendValidatorReminder, { uuid }) as Promise<unknown>);
  }

  /** Export compta des factures (réponse JSON enveloppée). */
  exportInvoices(): Observable<unknown> {
    return from(this.api.invoke(adminInvoicesExport) as Promise<{ data: unknown }>).pipe(
      map(body => body.data),
    );
  }

  /** Paiements du jour — dashboard trésorerie. */
  getTodayPayments(): Observable<unknown> {
    return from(this.api.invoke(adminInvoicesTodayPayments) as Promise<{ data: unknown }>).pipe(
      map(body => body.data),
    );
  }

  /** Stats d'activité par validateur (compliance / production / accounting). */
  getStatsByValidator(): Observable<unknown> {
    return from(this.api.invoke(adminInvoicesStatsByValidator) as Promise<{ data: unknown }>).pipe(
      map(body => body.data),
    );
  }

  /** Stats du pipeline de validation (volumétrie par statut). */
  getStatsPipeline(): Observable<unknown> {
    return from(this.api.invoke(adminInvoicesStatsPipeline) as Promise<{ data: unknown }>).pipe(
      map(body => body.data),
    );
  }
}

