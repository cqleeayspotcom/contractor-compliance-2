import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { map, timeout } from 'rxjs/operators';
import { MissionOffer } from '../models/mission-offer.model';
import { Api } from '../api/api';
import { ApiConfiguration } from '../api/api-configuration';
import { dashboardIndex } from '../api/fn/dashboard/dashboard-index';
import { profileBankDetailsUpdate } from '../api/fn/profile/profile-bank-details-update';
import { documentsList } from '../api/fn/documents/documents-list';
import { documentsUpload } from '../api/fn/documents/documents-upload';
import { documentsDownload } from '../api/fn/documents/documents-download';
import { documentsPurchase } from '../api/fn/documents/documents-purchase';
import { documentsGet } from '../api/fn/documents/documents-get';
import { kycChallenge } from '../api/fn/kyc/kyc-challenge';
import { kycVideo } from '../api/fn/kyc/kyc-video';
import { kycStatus } from '../api/fn/kyc/kyc-status';
import { billingSubscription } from '../api/fn/billing/billing-subscription';
import { billingSubscribe } from '../api/fn/billing/billing-subscribe';
import { billingCancel } from '../api/fn/billing/billing-cancel';
import { billingPaymentHistory } from '../api/fn/billing/billing-payment-history';
import { invoicesList } from '../api/fn/invoices/invoices-list';
import { invoicesUpload } from '../api/fn/invoices/invoices-upload';
import { invoicesPdf } from '../api/fn/invoices/invoices-pdf';
import { invoicesShow } from '../api/fn/invoices/invoices-show';
import { invoicesTimeline } from '../api/fn/invoices/invoices-timeline';
import { certificationQcmStart } from '../api/fn/certification/certification-qcm-start';
import { certificationQcmHeartbeat } from '../api/fn/certification/certification-qcm-heartbeat';
import { certificationQcmSubmit } from '../api/fn/certification/certification-qcm-submit';
import { certificationStatus } from '../api/fn/certification/certification-status';
import { missionsActive } from '../api/fn/missions/missions-active';
import { missionsHistory } from '../api/fn/missions/missions-history';
import { missionsShow } from '../api/fn/missions/missions-show';
import { missionsOffers } from '../api/fn/missions/missions-offers';
import { unwrapDataMeta } from '../core/api-envelope';

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

@Injectable({ providedIn: 'root' })
export class ContractorApiService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(Api);
  private readonly apiConfig = inject(ApiConfiguration);

  /**
   * Racine d'URL pour les exceptions a l'usage du SDK (upload multipart, blob
   * binaire, polling) ou on garde HttpClient direct mais on construit l'URL
   * via le `.PATH` du SDK pour qu'un renommage backend casse a la compilation.
   */
  private get rootUrl(): string {
    return this.api.rootUrl ?? this.apiConfig.rootUrl ?? '';
  }

  // --- Dashboard ---

  getDashboard(): Observable<ContractorDashboard> {
    return from(
      this.api.invoke(dashboardIndex) as Promise<{ data: ContractorDashboard }>
    ).pipe(map((res) => res.data));
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
    return from(
      this.api.invoke(profileBankDetailsUpdate, { body: payload as any }) as Promise<{
        data: { bank_details: ContractorBankDetails };
      }>
    ).pipe(map((res) => res.data.bank_details));
  }

  // --- Documents ---

  getDocuments(params?: {
    status?: string;
    type?: string;
    page?: number;
  }): Observable<PaginatedResponse<ContractorDocument>> {
    return documentsList(this.http, this.rootUrl, {
      status: params?.status,
      type: params?.type,
      page: params?.page,
    }).pipe(
      unwrapDataMeta<ContractorDocument[], PaginatedResponse<ContractorDocument>['meta']>(),
      map(({ data, meta }) => ({
        success: true,
        data,
        meta: meta ?? { current_page: 1, total: data.length, per_page: data.length, last_page: 1 },
      })),
    );
  }

  uploadDocument(file: File, type?: string): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (type) formData.append('type', type);

    // Exception SDK : upload multipart synchrone (hardcode backend). On garde
    // HttpClient direct pour pouvoir streamer le FormData natif + appliquer le
    // `timeout()` cote rxjs. L'URL est derivee du PATH du SDK pour qu'un
    // renommage backend casse a la compilation (cf. documentsUpload.PATH).
    return this.http.post(`${this.rootUrl}${documentsUpload.PATH}`, formData).pipe(
      timeout(SYNC_UPLOAD_TIMEOUT_MS),
    );
  }

  /**
   * Rï¿½cupï¿½re l'ï¿½tat courant d'un document via GET /documents/:uuid. L'upload
   * Tuita est synchrone (verdict final dans la rï¿½ponse), mais cette mï¿½thode
   * reste utile au polling dï¿½fensif cï¿½tï¿½ composants pour rafraï¿½chir les
   * statuts aprï¿½s navigation arriï¿½re ou refresh.
   */
  getDocumentStatus(uuid: string): Observable<any> {
    return from(
      this.api.invoke(documentsGet, { uuid }) as Promise<{ data: any }>
    ).pipe(map((res) => res.data));
  }

  /** Achat unitaire d'un document Pappers (KBIS, URSSAF, fiscale, statuts). */
  purchaseDocument(documentType: string, siren: string): Observable<any> {
    return from(
      this.api.invoke(documentsPurchase, {
        body: { document_type: documentType, siren } as any,
      }) as Promise<{ data: any }>
    ).pipe(map((res) => res.data));
  }

  /**
   * Tï¿½lï¿½charge le fichier source d'un document via `/documents/:uuid/file`
   * (route officielle backend Tuita, qui retourne le blob signï¿½ HMAC).
   */
  downloadDocument(uuid: string): Observable<Blob> {
    // Exception SDK : blob binaire (HttpClient gere `responseType: 'blob'`,
    // pas le SDK invoke). URL derivee du PATH SDK pour rester aligne sur
    // la spec en cas de rename.
    const path = documentsDownload.PATH.replace('{uuid}', uuid);
    return this.http.get(`${this.rootUrl}${path}`, {
      responseType: 'blob',
    });
  }

  /** @deprecated Utiliser purchaseDocument('kbis', siren). */
  purchaseKbis(siren: string): Observable<any> {
    return this.purchaseDocument('kbis', siren);
  }

  // --- KYC ---

  generateChallenge(): Observable<KycChallenge> {
    // mode=direct : on enregistre la vidÃ©o depuis le mÃªme device (webcam desktop
    // ou camÃ©ra mobile), pas de QR-scan intermÃ©diaire. Sans ce flag, le backend
    // considÃ¨re que le desktop doit gÃ©nÃ©rer un QR (is_direct=false) et refuse
    // l'upload direct â†’ "Challenge token invalide".
    return from(
      this.api.invoke(kycChallenge, { body: { mode: 'direct' } }) as Promise<{ data: any }>
    ).pipe(
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

    // Exception SDK : upload multipart binaire (video MediaRecorder). URL
    // derivee du PATH SDK pour rester synchro avec un rename backend.
    return this.http.post(`${this.rootUrl}${kycVideo.PATH}`, formData);
  }

  getKycStatus(): Observable<KycStatus> {
    return from(
      this.api.invoke(kycStatus) as Promise<{ data: KycStatus }>
    ).pipe(map((res) => res.data));
  }

  // --- Billing ---

  /**
   * Renvoie le plan courant du contractor + le catalogue des plans (free/paid).
   *
   * Pourquoi le catalogue est codï¿½ ici : le backend Tuita expose uniquement
   * `/billing/subscription` (plan courant) ï¿½ il n'y a pas de catalogue dynamique
   * ï¿½ 2 entrï¿½es seulement (Freemium gratuit + Tuita Pro 99ï¿½/mois alignï¿½ sur
   * `PLAN_PRICE_EUR`). Inliner ï¿½vite un endpoint trivial et reste la source de
   * vï¿½ritï¿½ tant qu'il n'y a pas de tiers de prix supplï¿½mentaires.
   */
  getBillingPlan(): Observable<{ current_plan: string; plans: BillingPlan[] }> {
    return from(
      this.api.invoke(billingSubscription) as Promise<{
        data: { plan?: string; current_plan?: string };
      }>
    ).pipe(
      map((res) => {
        const currentPlan = res.data?.current_plan ?? res.data?.plan ?? 'free';
        const plans: BillingPlan[] = [
          { code: 'free', label: 'Freemium', price_eur_month: 0 } as unknown as BillingPlan,
          { code: 'paid', label: 'Tuita Pro', price_eur_month: 99 } as unknown as BillingPlan,
        ];
        return { current_plan: currentPlan, plans };
      }),
    );
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
    return from(
      this.api.invoke(billingSubscribe, { body: { plan } as any }) as Promise<{
        data: {
          embedded_checkout?: { client_secret: string; publishable_key: string };
        };
      }>
    ).pipe(map((res) => res.data));
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
    return from(
      // Route backend Tuita : `/billing/payment-history` (cf. domaine 02-documents).
      this.api.invoke(billingPaymentHistory) as Promise<{
        data: {
          payments: PaymentRecord[];
          summary: {
            total_spent_eur: number;
            subscriptions_eur: number;
            purchases_eur: number;
            current_plan: string;
          };
        };
      }>
    ).pipe(map((res) => res.data));
  }

  cancelSubscription(): Observable<{
    plan: string;
    effective_at: string;
    cancellation_scheduled?: boolean;
    message: string;
  }> {
    return from(
      this.api.invoke(billingCancel) as Promise<{
        data: {
          plan: string;
          effective_at: string;
          cancellation_scheduled?: boolean;
          message: string;
        };
      }>
    ).pipe(map((res) => res.data));
  }

  // --- Invoices ---

  getInvoices(params?: {
    status?: string;
    page?: number;
    per_page?: number;
  }): Observable<PaginatedResponse<any>> {
    return invoicesList(this.http, this.rootUrl, {
      status: params?.status,
      page: params?.page,
      per_page: params?.per_page,
    }).pipe(
      unwrapDataMeta<any[], PaginatedResponse<any>['meta']>(),
      map(({ data, meta }) => ({
        success: true,
        data,
        meta: meta ?? { current_page: 1, total: data.length, per_page: data.length, last_page: 1 },
      })),
    );
  }

  /**
   * Detail facture (pipeline + timeline). Backend: GET /invoices/{uuid}.
   */
  getInvoice(uuid: string): Observable<any> {
    return from(this.api.invoke(invoicesShow, { uuid }) as Promise<any>).pipe(
      map((res: any) => res?.data ?? res),
    );
  }

  uploadInvoice(file: File, missionRef: string, amountTtc: number): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mission_ref', missionRef);
    formData.append('amount_ttc', amountTtc.toString());

    // Exception SDK : upload multipart synchrone. La reponse contient
    // rejection_reason + rejection_details si la facture est rejetee. URL
    // derivee du PATH SDK pour suivre un rename backend.
    return this.http.post(`${this.rootUrl}${invoicesUpload.PATH}`, formData).pipe(
      timeout(SYNC_UPLOAD_TIMEOUT_MS),
    );
  }

  /**
   * Reupload d'une facture dï¿½jï¿½ rejetï¿½e : pas de route dï¿½diï¿½e cï¿½tï¿½ Tuita,
   * on rejoue `POST /invoices/upload`. Le backend dï¿½tecte le doublon sur la
   * mï¿½me mission et remplace la facture prï¿½cï¿½dente. Le paramï¿½tre
   * `invoiceUuid` est ignorï¿½ (conservï¿½ pour compatibilitï¿½ composants).
   */
  reuploadInvoice(_invoiceUuid: string, file: File, missionRef?: string, amountTtc?: number): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (missionRef) formData.append('mission_ref', missionRef);
    if (amountTtc != null) formData.append('amount_ttc', String(amountTtc));
    // Exception SDK : meme route que uploadInvoice (multipart synchrone).
    return this.http.post(`${this.rootUrl}${invoicesUpload.PATH}`, formData).pipe(
      timeout(SYNC_UPLOAD_TIMEOUT_MS),
    );
  }

  downloadInvoicePdf(uuid: string): Observable<Blob> {
    // Exception SDK : blob binaire. URL derivee du PATH SDK.
    const path = invoicesPdf.PATH.replace('{uuid}', uuid);
    return this.http.get(`${this.rootUrl}${path}`, {
      responseType: 'blob',
    });
  }

  /**
   * Polling leger du statut d'une facture pendant l'upload async.
   * Retourne { status, phase, rejection_reason?, rejection_details?,
   * pages_count?, validator_summary, processing_elapsed_seconds, ... }.
   */
  /**
   * Statut courant d'une facture. L'upload est synchrone cï¿½tï¿½ Tuita
   * (verdict dans la rï¿½ponse de `/invoices/upload`) ï¿½ on relit donc la
   * timeline `/invoices/:uuid/timeline` qui expose `status` + `phase`
   * pour les ï¿½crans qui rafraï¿½chissent aprï¿½s navigation.
   */
  getInvoiceStatus(uuid: string): Observable<any> {
    return from(
      this.api.invoke(invoicesTimeline, { uuid }) as Promise<{ data: any }>
    ).pipe(map((res) => res.data));
  }

  // --- Certification ---
  //
  // Backend Tuita : routes sous `/certification/qcm/*` :
  //   - POST /certification/qcm/start
  //   - POST /certification/qcm/:attempt/heartbeat
  //   - POST /certification/qcm/:attempt/submit
  // Pas de route sï¿½parï¿½e "save answers" : le draft est persistï¿½ localement
  // cï¿½tï¿½ composant, le submit final fait foi.

  startCertification(): Observable<{ attempt_uuid: string; attempt_number: number; started_at: string; partial_answers: Record<string, string> }> {
    return from(this.api.invoke(certificationQcmStart) as Promise<any>).pipe(
      map((res) => res.data),
    );
  }

  // NOTE : le SDK type `attempt: number` mais l'identifiant cï¿½tï¿½ backend
  // est un UUID (string). On passe via cast ï¿½ le request-builder sï¿½rialise
  // la valeur telle quelle dans l'URL path.
  heartbeatCertification(attemptUuid: string): Observable<void> {
    return from(
      this.api.invoke(certificationQcmHeartbeat, { attempt: attemptUuid as unknown as number }) as unknown as Promise<void>
    );
  }

  completeCertification(attemptUuid: string, answers: Record<number, string>): Observable<{ score: number; passed: boolean; total?: number; wrong_questions?: number[] }> {
    return from(
      this.api.invoke(certificationQcmSubmit, {
        attempt: attemptUuid as unknown as number,
        body: { answers } as any,
      }) as Promise<any>
    ).pipe(map((res) => res.data));
  }

  getCertificationStatus(): Observable<{
    completed: boolean;
    completed_at: string | null;
    score: number;
    attempt_count?: number;
    last_attempt?: { uuid: string; started_at: string; completed_at: string | null; abandoned_at: string | null; score: number | null; passed: boolean | null } | null;
  }> {
    return from(this.api.invoke(certificationStatus) as Promise<any>).pipe(
      map((res) => res.data),
    );
  }

  // --- Missions ---

  getMissions(statusOrQuery?: string | MissionsQuery): Observable<MissionsResponse> {
    const query: MissionsQuery = typeof statusOrQuery === 'string'
      ? { status: statusOrQuery }
      : (statusOrQuery ?? {});

    const invoiceStatusValue = query.invoice_status
      ? (Array.isArray(query.invoice_status) ? query.invoice_status.join(',') : query.invoice_status)
      : undefined;

    const sdkParams = {
      status: query.status,
      search: query.search,
      invoice_status: invoiceStatusValue,
      page: query.page,
      per_page: query.per_page,
    };

    // Backend Tuita : pas de route `/missions` agregee. On route par defaut
    // sur `/missions/active`, et `/missions/history` quand `status=history`.
    const fn = query.status === 'history' ? missionsHistory : missionsActive;
    return fn(this.http, this.rootUrl, sdkParams).pipe(
      unwrapDataMeta<ContractorMission[], MissionsResponse['meta']>(),
      map(({ data, meta }) => ({
        success: true,
        data,
        meta: meta ?? { total: data.length, completed: 0, invoiceable: 0, invoiced: 0 },
      })),
    );
  }

  getMission(mid: string): Observable<ContractorMission> {
    // Backend Tuita : route paramï¿½trï¿½e `/missions/:ref`.
    return from(
      this.api.invoke(missionsShow, { ref: mid }) as Promise<{ data: ContractorMission }>
    ).pipe(map((res) => res.data));
  }

  // Backend Tuita : seule la liste des offres est exposï¿½e via `/missions/offers`.
  // L'acceptation/refus d'une offre passe par le workflow backoffice Tuita
  // (dispatch FOM) ï¿½ pas de route contractor pour accepter/refuser une offre
  // individuelle. La page de dï¿½tail offre redirige donc vers la liste.

  listMissionOffers(): Observable<{ data: MissionOffer[]; can_accept?: boolean }> {
    return from(
      this.api.invoke(missionsOffers) as Promise<{
        data: { data: MissionOffer[]; can_accept?: boolean };
      }>
    ).pipe(map((res) => res.data));
  }
}
