import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { Api } from '../api/api';
import { ApiConfiguration } from '../api/api-configuration';
import { invoicesFreeGet } from '../api/fn/invoices-free/invoices-free-get';
import { invoicesFreeCancel } from '../api/fn/invoices-free/invoices-free-cancel';
import { invoicesFreeEligibleMissions } from '../api/fn/invoices-free/invoices-free-eligible-missions';
import { invoicesFreeList } from '../api/fn/invoices-free/invoices-free-list';
import { invoicesFreeRequest } from '../api/fn/invoices-free/invoices-free-request';
import { invoicesFreeUpload } from '../api/fn/invoices-free/invoices-free-upload';
import { invoicesFreeStatus } from '../api/fn/invoices-free/invoices-free-status';

// Routes backend Tuita : `/contractor-compliance/invoices/free*`. On passe
// par le proxy Angular (pas d'environment.apiUrl ici, le SDK pose la base).

// Statuts renvoyés par le backend (FreeInvoiceRequest::STATUS_*). On colle aux
// valeurs réelles : le couple historique `pending_admin_approval`/`authorized`
// n'a jamais existé côté serveur (c'était `pending_approval`/`approved`).
export type FreeInvoiceStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'consumed'
  | 'cancelled'
  | 'awaiting_payment'
  | 'paid';

/**
 * Demande de facture libre — reflète EXACTEMENT le payload backend
 * `FreeInvoiceService::serialize()` (liste + détail, contractor comme admin).
 *
 * Invariant montants : tous les montants sont exprimés en CENTIMES entiers
 * (`*_cents`) — le backend ne manipule jamais d'euros décimaux. La conversion
 * en euros pour l'affichage se fait côté template (`/ 100`).
 */
export interface FreeInvoiceRequestSummary {
  uuid: string;
  status: FreeInvoiceStatus;
  user_id: string;
  client_name: string;
  client_email: string | null;
  amount_ttc_cents: number;
  amount_authorized_ttc_cents: number | null;
  description: string;
  mission_refs: string[];
  approved_at: string | null;
  approved_by_admin_email: string | null;
  approve_note: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
  rejected_by_admin_email: string | null;
  cancelled_at: string | null;
  expires_at: string | null;
  attachments_count: number;
  pdf_path: string | null;
  created_at: string;
}

/**
 * Réponse de création (`POST /invoices/free/request`) : le backend
 * `requestAction()` ne renvoie qu'un sous-ensemble, pas le summary complet.
 */
export interface FreeInvoiceCreateResult {
  uuid: string;
  status: FreeInvoiceStatus;
  expires_at: string | null;
}

/**
 * Payload de l'endpoint de polling `GET /invoices/free/{uuid}/status`
 * (`FreeInvoiceService::getStatusForContractor`). Forme distincte du summary :
 * il enrichit avec le verdict OCR de la facture fille.
 */
export interface FreeInvoiceStatusPayload {
  free_invoice_uuid: string;
  free_invoice_status: FreeInvoiceStatus;
  invoice_uuid: string | null;
  invoice_status: string | null;
  invoice_status_internal: string | null;
  rejection: unknown | null;
  ocr_confidence: number | null;
  updated_at: string;
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
  private api = inject(Api);
  private apiConfig = inject(ApiConfiguration);

  list(page = 1): Observable<FreeInvoiceListResponse> {
    return from(
      this.api.invoke(invoicesFreeList, { page }),
    ) as Observable<FreeInvoiceListResponse>;
  }

  detail(uuid: string): Observable<{ data: FreeInvoiceRequestSummary }> {
    return from(this.api.invoke(invoicesFreeGet, { uuid }) as Promise<{ data: FreeInvoiceRequestSummary }>);
  }

  /**
   * Crée une demande de facture libre. Corps JSON — le backend
   * `createRequest()` n'accepte aucun fichier à cette étape : le PDF de la
   * facture s'uploade APRÈS l'approbation Tuita via `upload()`. Montant
   * attendu en centimes (le dialog convertit les euros saisis).
   */
  create(body: {
    client_name: string;
    description: string;
    amount_ttc_cents: number;
    mission_refs?: string[];
  }): Observable<{ data: FreeInvoiceCreateResult }> {
    return from(this.api.invoke(invoicesFreeRequest, { body }) as Promise<{ data: FreeInvoiceCreateResult }>);
  }

  getEligibleMissions(): Observable<EligibleMission[]> {
    return from(
      this.api.invoke(invoicesFreeEligibleMissions) as Promise<{ data: EligibleMission[] }>,
    ).pipe(map((res) => res.data));
  }

  cancel(uuid: string): Observable<unknown> {
    return from(this.api.invoke(invoicesFreeCancel, { uuid }));
  }

  /**
   * Polling léger du statut d'une facture libre pendant l'upload async
   * (OCR + validation Cyndi). Retourne le bloc complet
   * `FreeInvoiceRequestSummary` actualisé pour rafraîchir l'UI sans
   * recharger la liste.
   */
  status(uuid: string): Observable<FreeInvoiceStatusPayload> {
    return from(
      this.api.invoke(invoicesFreeStatus, { uuid }) as Promise<{ data: FreeInvoiceStatusPayload }>,
    ).pipe(map((res) => res.data));
  }

  // upload progress: HttpClient direct, SDK ne gère pas la progression upload
  // (le SDK invocation passe par Promise → pas de stream d'événements
  // HttpEventType.UploadProgress).
  upload(uuid: string, pdf: File): Observable<{ data: FreeInvoiceUploadResult }> {
    const fd = new FormData();
    fd.append('pdf', pdf);
    const url = `${this.apiConfig.rootUrl}${invoicesFreeUpload.PATH.replace('{uuid}', encodeURIComponent(uuid))}`;
    return this.http.post<{ data: FreeInvoiceUploadResult }>(
      url,
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
