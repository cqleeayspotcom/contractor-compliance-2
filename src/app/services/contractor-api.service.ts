import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, throwError, timer } from 'rxjs';
import { catchError, map, mergeMap, timeout } from 'rxjs/operators';
import { MissionOffer } from '../api/models/mission-offer';
import { ContractorMission } from '../api/models/contractor-mission';
import { MissionsMeta } from '../api/models/missions-meta';
import { Api } from '../api/api';
import { ApiConfiguration } from '../api/api-configuration';
import { dashboardIndex } from '../api/fn/dashboard/dashboard-index';
import { profileBankDetailsUpdate } from '../api/fn/profile/profile-bank-details-update';
import { documentsList } from '../api/fn/documents/documents-list';
import { documentsUpload } from '../api/fn/documents/documents-upload';
import { documentsDownload } from '../api/fn/documents/documents-download';
import { documentsPurchase } from '../api/fn/documents/documents-purchase';
import { documentsGet } from '../api/fn/documents/documents-get';
import { documentsPurchasable } from '../api/fn/documents/documents-purchasable';
import { documentsPurchases } from '../api/fn/documents/documents-purchases';
import { documentsPurchaseBundle } from '../api/fn/documents/documents-purchase-bundle';
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
import { invoicesReupload } from '../api/fn/invoices/invoices-reupload';
import { certificationQcmStart } from '../api/fn/certification/certification-qcm-start';
import { certificationStatus } from '../api/fn/certification/certification-status';
import { certificationComplete } from '../api/fn/certification/certification-complete';
import { certificationHeartbeat } from '../api/fn/certification/certification-heartbeat';
import { certificationAnswers } from '../api/fn/certification/certification-answers';
import { missionsActive } from '../api/fn/missions/missions-active';
import { missionsHistory } from '../api/fn/missions/missions-history';
import { missionsShow } from '../api/fn/missions/missions-show';
import { missionsOffers } from '../api/fn/missions/missions-offers';
import { unwrapDataMeta } from '../core/api-envelope';

// Types missions : depuis le chantier 8, le SDK ng-openapi-gen génère des
// modèles fortement typés à partir de l'OpenAPI backend. On les ré-exporte
// pour préserver les imports existants (`MissionOffer`, `ContractorMission`,
// etc.) côté composants, sans avoir à toucher 30 fichiers.
export type { MissionOffer } from '../api/models/mission-offer';
export type { ContractorMission } from '../api/models/contractor-mission';
export type { MissionsMeta } from '../api/models/missions-meta';

/**
 * Timeout HTTP pour les uploads (documents admin + factures freemium).
 *
 * Upload synchrone en prod (hardcode 2026-04-24 — cf. backend/config/compliance.php) :
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
   * Coordonnées bancaires saisies manuellement par le contractor (cf.
   * `PATCH /contractor-compliance/profile/bank-details`). Remplace l'ancien upload
   * de RIB qui passait par le pipeline OCR. Toutes les clés peuvent être
   * null tant que le contractor n'a pas validé son formulaire. Optionnel
   * dans l'interface pour rester rétrocompatible avec les fixtures de tests
   * qui prédédent l'ajout du champ.
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
     * piece d'identite — sans VERIFIED, pas de face photo).
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
   * `true` pour les documents non exigés mais qui boostent le score s'ils
   * sont uploadés (ex: assurance_decennale). Ces items apparaissent dans
   * la liste mais ne comptent pas dans `total_required` / `missing`.
   */
  is_bonus?: boolean;
  /**
   * `true` quand ce document a été auto-créé à partir d'une RC Pro
   * `rc_complete` (RC + Décennale combinées dans un même PDF). Utile au
   * stepper pour afficher « Incluse dans votre RC Pro âœ“ » au lieu de
   * « Ajoutée âœ“ ».
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
   * `true` quand ce document est une décennale auto-dérivée d'une RC Pro
   * `rc_complete` — le PDF est partagé avec la RC source. Le frontend
   * affiche une mention « Incluse dans votre attestation RC Pro ».
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
  /** ISO 8601 — expiration du jeton mobile (QR), utilisé pour la régénération préventive. */
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
  /** Vrai quand le mobile a scanné le QR mais n'a pas encore soumis la vidéo. */
  phone_connected?: boolean;
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

// ContractorMission est désormais typée par le SDK ng-openapi-gen
// (cf. chantier 8 - OpenAPI enrichi). On garde l'enveloppe de réponse
// utilisée par les composants (data + meta). Le type des items vient du SDK.
export interface MissionsResponse {
  success: boolean;
  data: ContractorMission[];
  meta: MissionsMeta;
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
   * Sauvegarde les coordonnées bancaires saisies manuellement dans
   * l'onboarding (Titulaire / IBAN / BIC). Le backend valide :
   *  - IBAN FR + checksum mod-97
   *  - BIC format 8 ou 11 caractères
   *  - Titulaire â‰ˆ identité contractor (anti-fraude virement vers un tiers).
   *
   * En cas d'erreur, l'API renvoie un 422 avec `errors.account_holder|iban|bic`
   * — l'UI affiche le message du champ correspondant.
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

  getDocuments(_params?: {
    status?: string;
    type?: string;
    page?: number;
  }): Observable<PaginatedResponse<ContractorDocument>> {
    // Le backend (ContractorDocumentController::listAction) ne pagine ni ne
    // filtre la liste — volume < 20 docs/contractor, le filtrage se fait côté
    // composant. La signature garde status/type/page pour compat appelants.
    return documentsList(this.http, this.rootUrl, {}).pipe(
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

  /**
   * Catalogue des documents achetables (KBIS, URSSAF, attestation fiscale,
   * statuts, etc.) avec métadonnées prix + descriptions. Sert l'écran
   * « Acheter un document » côté contractor.
   */
  getPurchasableDocuments(): Observable<any> {
    return from(this.api.invoke(documentsPurchasable) as Promise<{ data: any }>).pipe(
      map((res) => res.data),
    );
  }

  /**
   * Historique des achats de documents du contractor (lignes
   * service_additional_payment scopées sur lui).
   */
  getDocumentPurchases(page = 1, perPage = 20): Observable<PaginatedResponse<any>> {
    return documentsPurchases(this.http, this.rootUrl, { page, per_page: perPage }).pipe(
      unwrapDataMeta<any[], PaginatedResponse<any>['meta']>(),
      map(({ data, meta }) => ({
        success: true,
        data,
        meta: meta ?? { current_page: page, total: data.length, per_page: perPage, last_page: 1 },
      })),
    );
  }

  /**
   * Achat groupé (bundle) : un seul paiement Stripe couvre plusieurs documents
   * Pappers en une transaction. Le backend retourne le client_secret de
   * Stripe Embedded Checkout (idem `subscribe`).
   */
  purchaseDocumentBundle(documentTypes: string[], siren: string): Observable<any> {
    return from(
      this.api.invoke(documentsPurchaseBundle, {
        body: { document_types: documentTypes, siren } as any,
      }) as Promise<{ data: any }>,
    ).pipe(map((res) => res.data));
  }

  // --- KYC ---

  generateChallenge(): Observable<KycChallenge> {
    // mode=direct : on enregistre la vidéo depuis le même device (webcam desktop
    // ou caméra mobile), pas de QR-scan intermédiaire. Sans ce flag, le backend
    // considère que le desktop doit générer un QR (is_direct=false) et refuse
    // l'upload direct → "Challenge token invalide".
    return from(
      this.api.invoke(kycChallenge, { body: { mode: 'direct' } }) as Promise<{ data: any }>
    ).pipe(
      map(res => {
        const d = res.data;
        // Chaque challenge a un label principal + un hint explicite ("votre
        // gauche" = ta gauche à toi, pas celle de l'observateur) + une icone
        // Material. Le système de validation MediaPipe Face Mesh est exigeant :
        // un mouvement timide n'est pas détecté, il faut le geste franc.
        // Consignes ultra courtes, style chantier — artisans BTP pressés, lues
        // d'un coup d'Å“il sur un mobile ou écran de bureau. Règle : 3 mots max
        // sur le label, une mini-consigne tactique d'une ligne. Pas de prose.
        const challengeMeta: Record<string, { label: string; hint: string; icon: string }> = {
          turn_left: {
            label: 'Tête à gauche',
            hint: 'Tournez franchement, comme si on vous appelait à votre gauche',
            icon: 'keyboard_arrow_left',
          },
          turn_right: {
            label: 'Tête à droite',
            hint: 'Tournez franchement, comme si on vous appelait à votre droite',
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
            label: 'Hochez la tête',
            hint: 'Un « oui » franc : haut, bas',
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
            hint: 'Grand « Ah », pas juste entrouvrir',
            icon: 'record_voice_over',
          },
        };
        const build = (action: string, order: number) => {
          const meta = challengeMeta[action] ?? { label: action, hint: '', icon: 'help_outline' };
          return { order, action, label: meta.label, hint: meta.hint, icon: meta.icon };
        };
        return {
          ...d,
          challenge_token: d.challenge_token ?? d.token,
          session_uuid: d.session_uuid ?? d.kyc_session_uuid,
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
      this.api.invoke(kycStatus) as Promise<{ data?: KycStatus } | undefined>
    ).pipe(
      // Filet : si le backend renvoie une enveloppe vide / inattendue (cas
      // observé après un 401 intercepté qui résout en undefined côté SDK),
      // on synthétise un statut neutre `pending` plutôt que de propager
      // `undefined` au subscriber qui crasherait sur `status.status`.
      map((res) => (res?.data ?? { status: 'pending', phone_connected: false } as KycStatus))
    );
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
   * Souscrit un plan (actuellement `paid` → Tuita Pro 99€/mois).
   *
   * Backend renvoie désormais `embedded_checkout: { client_secret, publishable_key }`
   * — le frontend ouvre un MatDialog contenant Stripe Embedded Checkout au
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
   * Reupload d'une facture déjà rejetée via la route dédiée Tuita
   * `POST /invoices/{uuid}/reupload` : transitionne `rejected` →
   * `pending_payment_validation` avec un event timeline « reuploaded ».
   *
   * Exception SDK : upload multipart synchrone (le SDK ne stream pas le
   * FormData), URL dérivée du PATH du SDK pour suivre un rename backend.
   */
  reuploadInvoice(invoiceUuid: string, file: File, _missionRef?: string, _amountTtc?: number): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    const path = invoicesReupload.PATH.replace('{uuid}', encodeURIComponent(invoiceUuid));
    return this.http.post(`${this.rootUrl}${path}`, formData).pipe(
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
  // Le backend identifie la tentative QCM par `attempt_uuid` dans le CORPS
  // JSON, jamais par un segment d'URL (la PK QcmAttempt est un UUID) :
  //   - POST  /certification/qcm/start  -> demarre / reprend une tentative
  //   - POST  /certification/heartbeat  -> body { attempt_uuid }
  //   - POST  /certification/complete   -> body { attempt_uuid, answers }
  //   - PATCH /certification/answers    -> body { attempt_uuid, answers } (brouillon)

  startCertification(): Observable<{ attempt_uuid: string; attempt_number: number; started_at: string; partial_answers: Record<string, string> }> {
    const call = () =>
      from(this.api.invoke(certificationQcmStart) as Promise<any>).pipe(
        map((res) => res.data),
      );

    // POURQUOI ce retry-on-409 : depuis l'ajout de la contrainte UNIQUE
    // `uniq_qcm_active_per_user` (entité QcmAttempt, MAJ schéma 2026-05-24),
    // un démarrage concurrent du QCM (double-tab, double-clic, Angular
    // StrictMode dev qui rejoue ngOnInit, perte réseau + retry navigateur)
    // peut renvoyer 409 sur les requêtes "race losers" : le back tente
    // l'INSERT, échoue sur la contrainte, fait un re-fetch — mais si la
    // requête GAGNANTE n'a pas encore committé sa transaction au moment
    // du re-fetch, le back retourne 409. 250 ms suffit largement pour
    // que la transaction gagnante commit ; on retente alors et on tombe
    // sur la branche "attempt actif déjà existant" du controller, qui
    // renvoie l'attempt_uuid avec succès.
    //
    // Limité à 1 retry pour éviter les boucles si le 409 vient d'une autre
    // cause (cas peu probable mais on garde un comportement borné).
    return call().pipe(
      catchError((err) => {
        if (err?.status === 409) {
          return timer(250).pipe(mergeMap(() => call()));
        }
        return throwError(() => err);
      }),
    );
  }

  heartbeatCertification(attemptUuid: string): Observable<void> {
    return from(
      this.api.invoke(certificationHeartbeat, { body: { attempt_uuid: attemptUuid } }) as unknown as Promise<void>
    );
  }

  completeCertification(attemptUuid: string, answers: Record<number, string>): Observable<{ score: number; passed: boolean; total?: number; wrong_questions?: number[] }> {
    return from(
      this.api.invoke(certificationComplete, {
        body: { attempt_uuid: attemptUuid, answers: answers as Record<string, string> },
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

  /**
   * Sauvegarde un brouillon partiel des réponses QCM (PATCH /certification/answers).
   * Ne clôture pas la tentative ; le backend exige `attempt_uuid` dans le body.
   */
  saveCertificationAnswers(attemptUuid: string, answers: Record<string, string>): Observable<any> {
    return from(
      this.api.invoke(certificationAnswers, { body: { attempt_uuid: attemptUuid, answers } }) as Promise<any>,
    ).pipe(map((res) => res?.data ?? res));
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
      unwrapDataMeta<ContractorMission[], MissionsMeta>(),
      map(({ data, meta }) => ({
        success: true,
        data,
        // Le backend renvoie toujours un meta complet depuis le chantier 8.
        // En cas d'absence (anomalie réseau), on synthétise un meta minimal
        // qui respecte le contrat MissionsMeta.
        meta: meta ?? {
          total: data.length,
          filtered_total: data.length,
          page: 1,
          per_page: data.length || 20,
          last_page: 1,
          realized: 0,
          realized_to_invoice: 0,
          invoice_status_counts: {},
        },
      })),
    );
  }

  getMission(mid: string): Observable<ContractorMission> {
    // Backend : GET /missions/show?ref=... (ref en query, pas en chemin, pour
    // supporter les réfs Tuita à slashes ex « 14000//Simon-4 »).
    return from(
      this.api.invoke(missionsShow, { ref: mid }) as Promise<{ data: ContractorMission }>
    ).pipe(map((res) => res.data));
  }

  // Backend Tuita : seule la liste des offres est exposï¿½e via `/missions/offers`.
  // L'acceptation/refus d'une offre passe par le workflow backoffice Tuita
  // (dispatch FOM) ï¿½ pas de route contractor pour accepter/refuser une offre
  // individuelle. La page de dï¿½tail offre redirige donc vers la liste.

  listMissionOffers(): Observable<{ data: MissionOffer[]; can_accept?: boolean }> {
    // Depuis le chantier 8, le SDK retourne MissionOffersListResponse :
    //   { data: MissionOffer[], meta: { ..., can_accept: boolean, links: ... } }
    // Le contrat consommateur côté composant reste `{ data, can_accept? }`.
    return from(
      this.api.invoke(missionsOffers) as Promise<{
        data: MissionOffer[];
        meta: { can_accept?: boolean };
      }>
    ).pipe(
      map((res) => ({ data: res.data, can_accept: res.meta?.can_accept })),
    );
  }
}
