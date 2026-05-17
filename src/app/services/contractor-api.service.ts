import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, timeout } from 'rxjs/operators';
import { MissionOffer } from '../models/mission-offer.model';

export type { MissionOffer } from '../models/mission-offer.model';

/**
 * Timeout HTTP pour les uploads (documents admin + factures freemium).
 *
 * Upload synchrone en prod (hardcode 2026-04-24 â€” cf. backend/config/compliance.php) :
 * l'endpoint execute l'OCR 2 passes + les regles metier + cross-check mission
 * INLINE dans la requete et retourne 200 OK avec le verdict final. Typique
 * 10-40 s, jusqu'a ~120 s pour un PDF lourd sur connexion mobile 3G chantier.
 * Deadline PHP cote backend : 180 s (compliance.sync_upload_deadline_seconds).
 * On laisse 150 s cote client pour rester sous cette deadline avec marge reseau.
 */
const SYNC_UPLOAD_TIMEOUT_MS = 150_000;

// --- Types for contractor API responses ---

export interface ContractorDashboard {
  contractor: {
    phone: string;
    firstName: string;
    lastName: string;
    companyName: string;
    siren: string;
  };
  compliance: {
    score: number;
    global_status: string;
    is_verified: boolean;
  };
  billing: {
    plan: 'free' | 'paid';
    can_upgrade: boolean;
  };
  /**
   * CoordonnÃ©es bancaires saisies manuellement par le contractor (cf.
   * `PATCH /contractor-compliance/profile/bank-details`). Remplace l'ancien upload
   * de RIB qui passait par le pipeline OCR. Toutes les clÃ©s peuvent Ãªtre
   * null tant que le contractor n'a pas validÃ© son formulaire. Optionnel
   * dans l'interface pour rester rÃ©trocompatible avec les fixtures de tests
   * qui prÃ©dÃ©dent l'ajout du champ.
   */
  bank_details?: ContractorBankDetails;
  documents: {
    total_required: number;
    verified: number;
    missing: number;
    pending: number;
    expired: number;
    rejected: number;
    items: DocumentRequirement[];
  };
  kyc: {
    status: string;
    can_start: boolean;
    /**
     * true si la CNI ou le passeport du contractor est uploade ET VERIFIED.
     * Pre-requis obligatoire pour demarrer la video KYC (le face matching
     * compare la frame video a la photo du visage extraite par l'OCR de la
     * piece d'identite â€” sans VERIFIED, pas de face photo).
     */
    identity_doc_verified: boolean;
    last_attempt_at: string | null;
  };
  certification: {
    completed: boolean;
    completed_at: string | null;
  };
  account_state: string;
  missions_count: number;
  next_action: string;
  missions?: {
    completed: number;
    invoiceable: number;
  };
  invoices?: {
    total: number;
    validating: number;
    pending_payment_validation: number;
    ready_to_pay: number;
    payment_in_progress: number;
    paid: number;
    rejected: number;
  };
}

export interface ContractorBankDetails {
  account_holder: string | null;
  iban: string | null;
  bic: string | null;
}

export interface DocumentRequirement {
  type: string;
  label: string;
  status: string;
  expires_at: string | null;
  days_until_expiry: number | null;
  can_purchase: boolean;
  purchase_price_eur: number | null;
  document_uuid: string | null;
  /**
   * `true` pour les documents non exigÃ©s mais qui boostent le score s'ils
   * sont uploadÃ©s (ex: assurance_decennale). Ces items apparaissent dans
   * la liste mais ne comptent pas dans `total_required` / `missing`.
   */
  is_bonus?: boolean;
  /**
   * `true` quand ce document a Ã©tÃ© auto-crÃ©Ã© Ã  partir d'une RC Pro
   * `rc_complete` (RC + DÃ©cennale combinÃ©es dans un mÃªme PDF). Utile au
   * stepper pour afficher Â« Incluse dans votre RC Pro âœ“ Â» au lieu de
   * Â« AjoutÃ©e âœ“ Â».
   */
  derived_from_rc_complete?: boolean;
  /** UUID du document source (la RC Pro) quand `derived_from_rc_complete=true`. */
  source_document_uuid?: string | null;
}

export interface ContractorDocument {
  uuid: string;
  type: string;
  status: string;
  /**
   * `true` quand ce document est une dÃ©cennale auto-dÃ©rivÃ©e d'une RC Pro
   * `rc_complete` â€” le PDF est partagÃ© avec la RC source. Le frontend
   * affiche une mention Â« Incluse dans votre attestation RC Pro Â».
   */
  derived_from_rc_complete?: boolean;
  source_document_uuid?: string | null;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_at: string;
  expires_at: string | null;
  detected_type: string | null;
  detection_confidence: number | null;
  is_current_version: boolean;
  verified_at: string | null;
  failure_reason: string | null;
  failure_detail: string | null;
  verification_result: any | null;
}

export interface KycChallenge {
  session_uuid: string;
  challenge_token: string;
  challenge: string;
  challenge_2: string;
  challenges: { order: number; action: string; label: string; hint?: string; icon?: string }[];
  expires_at: string;
  expires_in: number;
  device_type: string;
  video_max_duration_seconds: number;
}

export interface KycStatus {
  status: string;
  liveness_passed: boolean;
  face_match_score: number | null;
  completed_at: string | null;
  failure_reason?: string | null;
  failure_detail?: string | null;
  debug?: KycDebugPayload | null;
}

export interface KycDebugPayload {
  biometric_provider: string | null;
  biometric_result: Record<string, unknown> | null;
  liveness_result: Record<string, unknown> | null;
  retry_count: number | null;
  last_retried_at: string | null;
  thresholds: {
    face_match: number;
    face_match_mobile: number;
    face_match_desktop: number;
    liveness: number;
  };
}

export interface ContractorMission {
  mid: string;
  caseNumber: string;
  missionTitle: string;
  operationType: string;
  operationTypeLabel: string;
  price: number;
  targetAddress: string;
  city: string;
  visitDateConfirmed: string | null;
  signedAt: string | null;
  canRun: boolean;
  invoice_status:
    | 'none'
    | 'validating'            // freemium : OCR en cours (quasi jamais vu cÃ´tÃ© UI depuis sync upload)
    | 'pending_validation'    // pipeline unifiÃ© : triple validation Tuita en cours
    | 'ready_to_pay'          // les 3 validateurs OK, drapeau "Ã  payer"
    | 'paying'                // virement lancÃ© par la compta Tuita
    | 'paid'                  // virement confirmÃ© cÃ´tÃ© banque (terminal)
    | 'uploaded'              // freemium gÃ©nÃ©rique (statuts legacy)
    | 'auto_generated'        // Pro gÃ©nÃ©rique (statuts legacy)
    | 'rejected';
  // RenseignÃ©s par le backend uniquement lorsqu'une facture existe pour cette
  // mission (cf. ContractorMissionController::enrichInvoiceStatus). Permettent
  // d'ouvrir le panel latÃ©ral de visualisation sans appel supplÃ©mentaire.
  invoice_uuid?: string;
  invoice_number?: string | null;
}

export interface MissionsResponse {
  success: boolean;
  data: ContractorMission[];
  meta: {
    total: number;
    completed: number;
    invoiceable: number;
    invoiced: number;
    // Stats specifiques aux missions REALISEES (signedAt + visite passee)
    realized?: number;
    realized_to_invoice?: number;
    invoice_status_counts?: Record<string, number>;
    // Pagination (presents si page/per_page demandes au backend)
    current_page?: number;
    last_page?: number;
    per_page?: number;
    filtered_total?: number;
  };
}

export interface MissionsQuery {
  status?: string;
  search?: string;
  invoice_status?: string | string[];
  page?: number;
  per_page?: number;
}

export interface BillingPlan {
  id: string;
  name: string;
  price_eur_month: number;
  features: string[];
  limitations: string[];
}

export interface PaymentRecord {
  id: string;
  date: string;
  type: 'subscription' | 'purchase';
  description: string;
  amount_eur: number;
  status: string;
  document_type?: string;
  stripe_payment_intent_id?: string;
  invoice_url?: string;
  invoice_pdf?: string;
}

export interface PurchasableDocument {
  document_type: string;
  label: string;
  price_eur: number;
  source: string;
  description: string;
}

export interface PurchasableCatalog {
  documents: PurchasableDocument[];
  payment_method: string;
  currency: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: {
    current_page: number;
    total: number;
    per_page: number;
    last_page: number;
    unread_count?: number;
  };
}

/** Historique d'achats â€” ligne de liste (customer-facing, pas d'infos internes). */
export interface ContractorPurchase {
  uuid: string;
  created_at: string;
  completed_at: string | null;
  document_type: string;
  label: string;
  siren: string;
  status: 'pending' | 'completed' | 'failed';
  status_label: string;
  price_eur: number;
  document_uuid: string | null;
  document_download_url: string | null;
  stripe_receipt_url: string | null;
}

/** DÃ©tail d'un achat avec timeline humaine. */
export interface ContractorPurchaseDetail extends ContractorPurchase {
  timeline: Array<{
    step: string;
    label: string;
    description: string;
    at: string | null;
    state: 'done' | 'in_progress' | 'error';
  }>;
}

@Injectable({ providedIn: 'root' })
export class ContractorApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/contractor-compliance';

  // --- Dashboard ---

  getDashboard(): Observable<ContractorDashboard> {
    return this.http.get<{ data: ContractorDashboard }>(`${this.baseUrl}/dashboard`).pipe(
      map(res => res.data)
    );
  }

  /**
   * Sauvegarde les coordonnÃ©es bancaires saisies manuellement dans
   * l'onboarding (Titulaire / IBAN / BIC). Le backend valide :
   *  - IBAN FR + checksum mod-97
   *  - BIC format 8 ou 11 caractÃ¨res
   *  - Titulaire â‰ˆ identitÃ© contractor (anti-fraude virement vers un tiers).
   *
   * En cas d'erreur, l'API renvoie un 422 avec `errors.account_holder|iban|bic`
   * â€” l'UI affiche le message du champ correspondant.
   */
  updateBankDetails(payload: {
    account_holder: string;
    iban: string;
    bic: string;
  }): Observable<ContractorBankDetails> {
    return this.http
      .patch<{ data: { bank_details: ContractorBankDetails } }>(
        `${this.baseUrl}/profile/bank-details`,
        payload,
      )
      .pipe(map((res) => res.data.bank_details));
  }

  // --- Documents ---

  getDocuments(params?: {
    status?: string;
    type?: string;
    page?: number;
  }): Observable<PaginatedResponse<ContractorDocument>> {
    let httpParams = new HttpParams();
    if (params?.status) httpParams = httpParams.set('status', params.status);
    if (params?.type) httpParams = httpParams.set('type', params.type);
    if (params?.page) httpParams = httpParams.set('page', params.page.toString());

    return this.http.get<PaginatedResponse<ContractorDocument>>(
      `${this.baseUrl}/documents`,
      { params: httpParams }
    );
  }

  uploadDocument(file: File, type?: string): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (type) formData.append('type', type);

    // Endpoint synchrone (hardcode backend) : la reponse contient deja le
    // verdict final (verified/rejected + failure_reason). On laisse 150 s
    // pour couvrir les PDF lourds ; le spinner cote UI doit informer
    // "jusqu'a 1 minute" pour caler les attentes.
    return this.http.post(`${this.baseUrl}/documents/upload`, formData).pipe(
      timeout(SYNC_UPLOAD_TIMEOUT_MS),
    );
  }

  getDocumentStatus(uuid: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/documents/${uuid}/status`);
  }

  /** Catalogue des documents achetables via Pappers (types + prix). */
  getPurchasableCatalog(): Observable<PurchasableCatalog> {
    return this.http.get<{ data: PurchasableCatalog }>(
      `${this.baseUrl}/documents/purchasable`
    ).pipe(map(res => res.data));
  }

  /** Achat unitaire d'un document Pappers (KBIS, URSSAF, fiscale, statuts). */
  purchaseDocument(documentType: string, siren: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/documents/purchase`, {
      document_type: documentType,
      siren,
    });
  }

  /** Achat groupe de plusieurs documents en un seul paiement Stripe. */
  purchaseBundle(documentTypes: string[], siren: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/documents/purchase-bundle`, {
      documents: documentTypes,
      siren,
    });
  }

  /** Telecharger un document dechiffre (PDF stream). */
  downloadDocument(uuid: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/documents/${uuid}/download`, {
      responseType: 'blob',
    });
  }

  // --- Historique des achats officiels (read-only, contractor-scoped) ---

  getPurchaseHistory(params?: {
    status?: 'pending' | 'completed' | 'failed';
    document_type?: string;
    since?: string;
    per_page?: number;
    page?: number;
  }): Observable<PaginatedResponse<ContractorPurchase>> {
    let httpParams = new HttpParams();
    if (params?.status) httpParams = httpParams.set('status', params.status);
    if (params?.document_type) httpParams = httpParams.set('document_type', params.document_type);
    if (params?.since) httpParams = httpParams.set('since', params.since);
    if (params?.per_page) httpParams = httpParams.set('per_page', params.per_page.toString());
    if (params?.page) httpParams = httpParams.set('page', params.page.toString());

    return this.http.get<PaginatedResponse<ContractorPurchase>>(
      `${this.baseUrl}/documents/purchases`,
      { params: httpParams }
    );
  }

  getPurchaseDetail(uuid: string): Observable<ContractorPurchaseDetail> {
    return this.http.get<{ data: ContractorPurchaseDetail }>(
      `${this.baseUrl}/documents/purchases/${uuid}`
    ).pipe(map(res => res.data));
  }

  contactPurchaseSupport(uuid: string, message?: string): Observable<{ status: string; message: string }> {
    return this.http.post<{ data: { status: string; message: string } }>(
      `${this.baseUrl}/documents/purchases/${uuid}/contact-support`,
      { message: message ?? null }
    ).pipe(map(res => res.data));
  }

  /** @deprecated Utiliser purchaseDocument('kbis', siren). */
  purchaseKbis(siren: string): Observable<any> {
    return this.purchaseDocument('kbis', siren);
  }

  purchaseCni(firstName: string, lastName: string, birthDate: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/documents/purchase-cni`, {
      first_name: firstName,
      last_name: lastName,
      birth_date: birthDate,
    });
  }

  // --- KYC ---

  generateChallenge(): Observable<KycChallenge> {
    // mode=direct : on enregistre la vidÃ©o depuis le mÃªme device (webcam desktop
    // ou camÃ©ra mobile), pas de QR-scan intermÃ©diaire. Sans ce flag, le backend
    // considÃ¨re que le desktop doit gÃ©nÃ©rer un QR (is_direct=false) et refuse
    // l'upload direct â†’ "Challenge token invalide".
    return this.http.post<{ data: any }>(`${this.baseUrl}/kyc/challenge`, { mode: 'direct' }).pipe(
      map(res => {
        const d = res.data;
        // Chaque challenge a un label principal + un hint explicite ("votre
        // gauche" = ta gauche Ã  toi, pas celle de l'observateur) + une icone
        // Material. Le systÃ¨me de validation MediaPipe Face Mesh est exigeant :
        // un mouvement timide n'est pas dÃ©tectÃ©, il faut le geste franc.
        // Consignes ultra courtes, style chantier â€” artisans BTP pressÃ©s, lues
        // d'un coup d'Å“il sur un mobile ou Ã©cran de bureau. RÃ¨gle : 3 mots max
        // sur le label, une mini-consigne tactique d'une ligne. Pas de prose.
        const challengeMeta: Record<string, { label: string; hint: string; icon: string }> = {
          turn_left: {
            label: 'TÃªte Ã  gauche',
            hint: 'Tournez franchement, comme si on vous appelait Ã  votre gauche',
            icon: 'keyboard_arrow_left',
          },
          turn_right: {
            label: 'TÃªte Ã  droite',
            hint: 'Tournez franchement, comme si on vous appelait Ã  votre droite',
            icon: 'keyboard_arrow_right',
          },
          look_up: {
            label: 'Regardez en haut',
            hint: 'Levez bien le menton vers le plafond',
            icon: 'keyboard_arrow_up',
          },
          look_down: {
            label: 'Regardez en bas',
            hint: 'Baissez bien le menton vers vos pieds',
            icon: 'keyboard_arrow_down',
          },
          nod: {
            label: 'Hochez la tÃªte',
            hint: 'Un Â« oui Â» franc : haut, bas',
            icon: 'swap_vert',
          },
          smile: {
            label: 'Souriez',
            hint: 'Grand sourire, montrez les dents',
            icon: 'sentiment_very_satisfied',
          },
          blink: {
            label: 'Clignez des yeux',
            hint: 'Fermez 1 seconde, puis rouvrez',
            icon: 'visibility',
          },
          open_mouth: {
            label: 'Ouvrez la bouche',
            hint: 'Grand Â« Ah Â», pas juste entrouvrir',
            icon: 'record_voice_over',
          },
        };
        const build = (action: string, order: number) => {
          const meta = challengeMeta[action] ?? { label: action, hint: '', icon: 'help_outline' };
          return { order, action, label: meta.label, hint: meta.hint, icon: meta.icon };
        };
        return {
          ...d,
          video_max_duration_seconds: d.video_max_duration_seconds ?? 10,
          challenges: [
            build(d.challenge, 1),
            build(d.challenge_2, 2),
          ],
        } as KycChallenge;
      })
    );
  }

  submitVideo(video: File, challengeToken: string): Observable<any> {
    const formData = new FormData();
    formData.append('video', video);
    formData.append('challenge_token', challengeToken);

    return this.http.post(`${this.baseUrl}/kyc/video`, formData);
  }

  getKycStatus(): Observable<KycStatus> {
    return this.http.get<{ data: KycStatus }>(`${this.baseUrl}/kyc/status`).pipe(
      map(res => res.data)
    );
  }

  // --- Billing ---

  getBillingPlan(): Observable<{ current_plan: string; plans: BillingPlan[] }> {
    // Le backend retourne `price_eur`, on normalise en `price_eur_month` cote front.
    return this.http.get<{ data: { current_plan: string; plans: Array<BillingPlan & { price_eur?: number }> } }>(
      `${this.baseUrl}/billing/plan`
    ).pipe(map(res => ({
      current_plan: res.data.current_plan,
      plans: res.data.plans.map(p => ({
        ...p,
        price_eur_month: p.price_eur_month ?? p.price_eur ?? 0,
      })),
    })));
  }

  /**
   * Souscrit un plan (actuellement `paid` â†’ Tuita Pro 99â‚¬/mois).
   *
   * Backend renvoie dÃ©sormais `embedded_checkout: { client_secret, publishable_key }`
   * â€” le frontend ouvre un MatDialog contenant Stripe Embedded Checkout au
   * lieu de rediriger vers le hosted-page Stripe.
   */
  subscribe(plan: string): Observable<{
    embedded_checkout?: { client_secret: string; publishable_key: string };
  }> {
    return this.http.post<{ data: {
      embedded_checkout?: { client_secret: string; publishable_key: string };
    } }>(
      `${this.baseUrl}/billing/subscribe`,
      { plan }
    ).pipe(map(res => res.data));
  }

  getPaymentHistory(): Observable<{
    payments: PaymentRecord[];
    summary: {
      total_spent_eur: number;
      subscriptions_eur: number;
      purchases_eur: number;
      current_plan: string;
    };
  }> {
    return this.http.get<{ data: {
      payments: PaymentRecord[];
      summary: {
        total_spent_eur: number;
        subscriptions_eur: number;
        purchases_eur: number;
        current_plan: string;
      };
    } }>(
      `${this.baseUrl}/billing/payments`
    ).pipe(map(res => res.data));
  }

  cancelSubscription(): Observable<{
    plan: string;
    effective_at: string;
    cancellation_scheduled?: boolean;
    message: string;
  }> {
    return this.http.post<{ data: {
      plan: string;
      effective_at: string;
      cancellation_scheduled?: boolean;
      message: string;
    } }>(
      `${this.baseUrl}/billing/cancel`,
      {}
    ).pipe(map(res => res.data));
  }

  // --- Invoices ---

  getInvoices(params?: {
    status?: string;
    page?: number;
    per_page?: number;
  }): Observable<PaginatedResponse<any>> {
    let httpParams = new HttpParams();
    if (params?.status) httpParams = httpParams.set('status', params.status);
    if (params?.page) httpParams = httpParams.set('page', params.page.toString());
    if (params?.per_page) httpParams = httpParams.set('per_page', params.per_page.toString());

    return this.http.get<PaginatedResponse<any>>(
      `${this.baseUrl}/invoices`,
      { params: httpParams }
    );
  }

  /**
   * Detail facture (pipeline + timeline). Backend: GET /invoices/{uuid}.
   */
  getInvoice(uuid: string): Observable<any> {
    return this.http.get<{ data: any }>(`${this.baseUrl}/invoices/${uuid}`).pipe(
      map(res => res?.data ?? res),
    );
  }

  uploadInvoice(file: File, missionRef: string, amountTtc: number): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mission_ref', missionRef);
    formData.append('amount_ttc', amountTtc.toString());

    // Endpoint synchrone (OCR Mistral + regles metier + cross-check mission
    // snapshot executes inline). La reponse contient rejection_reason +
    // rejection_details si la facture est rejetee.
    return this.http.post(`${this.baseUrl}/invoices/upload`, formData).pipe(
      timeout(SYNC_UPLOAD_TIMEOUT_MS),
    );
  }

  reuploadInvoice(invoiceUuid: string, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);

    // Reupload synchrone aussi (meme pipeline que upload).
    return this.http.post(`${this.baseUrl}/invoices/${invoiceUuid}/reupload`, formData).pipe(
      timeout(SYNC_UPLOAD_TIMEOUT_MS),
    );
  }

  downloadInvoicePdf(uuid: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/invoices/${uuid}/pdf`, {
      responseType: 'blob',
    });
  }

  /**
   * Polling leger du statut d'une facture pendant l'upload async.
   * Retourne { status, phase, rejection_reason?, rejection_details?,
   * pages_count?, validator_summary, processing_elapsed_seconds, ... }.
   */
  getInvoiceStatus(uuid: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/invoices/${uuid}/status`);
  }

  // --- Certification ---

  startCertification(): Observable<{ attempt_uuid: string; attempt_number: number; started_at: string; partial_answers: Record<string, string> }> {
    return this.http.post<any>(`${this.baseUrl}/certification/start`, {}).pipe(
      map(res => res.data)
    );
  }

  heartbeatCertification(attemptUuid: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/certification/heartbeat`, { attempt_uuid: attemptUuid });
  }

  /**
   * Sauvegarde le brouillon des rÃ©ponses du QCM. DebouncÃ© cÃ´tÃ© composant.
   * Le serveur ne calcule jamais le score sur ce payload â€” c'est strictement
   * de la persistance UI pour permettre la reprise (refresh, autre device).
   */
  saveCertificationAnswers(attemptUuid: string, answers: Record<number, string>): Observable<void> {
    return this.http.patch<void>(`${this.baseUrl}/certification/answers`, {
      attempt_uuid: attemptUuid,
      answers,
    });
  }

  completeCertification(attemptUuid: string, answers: Record<number, string>): Observable<{ score: number; passed: boolean; total?: number; wrong_questions?: number[] }> {
    return this.http.post<any>(`${this.baseUrl}/certification/complete`, { attempt_uuid: attemptUuid, answers }).pipe(
      map(res => res.data)
    );
  }

  getCertificationStatus(): Observable<{
    completed: boolean;
    completed_at: string | null;
    score: number;
    attempt_count?: number;
    last_attempt?: { uuid: string; started_at: string; completed_at: string | null; abandoned_at: string | null; score: number | null; passed: boolean | null } | null;
  }> {
    return this.http.get<any>(`${this.baseUrl}/certification/status`).pipe(
      map(res => res.data)
    );
  }

  // --- Missions ---

  getMissions(statusOrQuery?: string | MissionsQuery): Observable<MissionsResponse> {
    const query: MissionsQuery = typeof statusOrQuery === 'string'
      ? { status: statusOrQuery }
      : (statusOrQuery ?? {});

    let httpParams = new HttpParams();
    if (query.status) httpParams = httpParams.set('status', query.status);
    if (query.search) httpParams = httpParams.set('search', query.search);
    if (query.invoice_status) {
      const value = Array.isArray(query.invoice_status)
        ? query.invoice_status.join(',')
        : query.invoice_status;
      if (value) httpParams = httpParams.set('invoice_status', value);
    }
    if (query.page != null) httpParams = httpParams.set('page', String(query.page));
    if (query.per_page != null) httpParams = httpParams.set('per_page', String(query.per_page));

    return this.http.get<MissionsResponse>(`${this.baseUrl}/missions`, { params: httpParams });
  }

  getMission(mid: string): Observable<ContractorMission> {
    return this.http.get<{ data: ContractorMission }>(`${this.baseUrl}/missions/${mid}`).pipe(
      map(res => res.data)
    );
  }

  simulateMissionComplete(mid: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/missions/${mid}/simulate-complete`, {});
  }

  listMissionOffers(): Observable<{ data: MissionOffer[]; can_accept?: boolean }> {
    return this.http.get<{ data: MissionOffer[]; can_accept?: boolean }>(`${this.baseUrl}/mission-offers`);
  }

  getMissionOffer(ref: string): Observable<{ data: MissionOffer; can_accept?: boolean }> {
    return this.http.get<{ data: MissionOffer; can_accept?: boolean }>(`${this.baseUrl}/mission-offers/${encodeURIComponent(ref)}`);
  }

  acceptMissionOffer(ref: string): Observable<{ data: { ok: boolean; mission_ref?: string } }> {
    return this.http.post<{ data: { ok: boolean; mission_ref?: string } }>(
      `${this.baseUrl}/mission-offers/${encodeURIComponent(ref)}/accept`, {}
    );
  }

  declineMissionOffer(ref: string, reason?: string): Observable<{ data: { ok: boolean } }> {
    return this.http.post<{ data: { ok: boolean } }>(
      `${this.baseUrl}/mission-offers/${encodeURIComponent(ref)}/decline`,
      reason ? { reason } : {}
    );
  }
}
