import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  OnDestroy,
  signal,
  computed,
  effect,
  DestroyRef,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { EMPTY, Subject, catchError, interval, switchMap, takeUntil } from 'rxjs';

import { BackButtonComponent } from '../../components/shared/back-button/back-button.component';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ContractorApiService, ContractorDocument, DocumentRequirement } from '../../services/contractor-api.service';
import { ContractorSessionService } from '../../services/contractor-session.service';
import {
  DocumentStatusEvent,
  RealtimeService,
} from '../../services/realtime.service';
import { RefreshService } from '../../services/refresh.service';
import { PricingService } from '../../services/pricing.service';
import { rejectionMessage, DocumentRejectionCopy } from './document-rejection-messages';
import {
  DocumentQuickActionsDialogComponent,
  QuickActionsResult,
} from './document-quick-actions-dialog.component';
import {
  StripeEmbeddedCheckoutDialogComponent,
  StripeEmbeddedCheckoutDialogData,
  StripeEmbeddedCheckoutDialogResult,
} from '../../components/stripe-embedded-checkout-dialog.component';

/**
 * État UI d'un document en cours d'upload + analyse OCR async.
 * Hydraté par le polling /documents/{uuid}/status + WebSocket Reverb.
 */
interface UploadedDoc {
  uuid: string;
  fileName: string;
  declaredType: string | null;
  detectedType: string | null;
  status: string;
  phase: string;
  failureReason: string | null;
  failureDetail: string | null;
  rejectionCopy: DocumentRejectionCopy | null;
  verificationScore: number | null;
  extractedSummary: Record<string, string> | null;
  elapsedSeconds: number | null;
  isFinal: boolean;
  startedAt: number;
  error: string | null;
}

const POLL_INTERVAL_MS = 1500;

const DOC_TYPE_ICONS: Record<string, string> = {
  kbis: 'description',
  extrait_inpi: 'description',
  avis_sirene: 'description',
  rc: 'shield',
  urssaf: 'receipt_long',
  cni: 'badge',
  assurance_decennale: 'gavel',
  rib: 'account_balance',
  passeport: 'badge',
  titre_sejour: 'badge',
  attestation_fiscale: 'receipt_long',
  attestation_regularite_fiscale: 'receipt_long',
  attestation_regularite_sociale: 'receipt_long',
  statuts: 'article',
};

@Component({
  selector: 'app-contractor-documents',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    BackButtonComponent,
  ],
  templateUrl: './contractor-documents.component.html',
  styleUrl: './contractor-documents.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorDocumentsComponent implements OnInit, OnDestroy {
  private readonly api = inject(ContractorApiService);
  private readonly session = inject(ContractorSessionService);
  private readonly realtime = inject(RealtimeService);
  private readonly refreshBus = inject(RefreshService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly pricing = inject(PricingService);

  /** Prix unitaire d'un justificatif d'immatriculation officiel (extrait INPI). */
  extraitInpiPriceLabel(): string {
    return this.pricing.priceLabelFor('extrait_inpi');
  }

  private listLoadInFlight = false;
  private pendingListReload = false;

  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;

  /** Ouvre le file picker. Le feedback visuel pendant l'upload est porté
   *  par la bannière flottante (`.floating-progress`) en haut de page. */
  triggerUpload(): void {
    this.fileInputRef?.nativeElement.click();
  }

  /** Seuil (jours) en deçà duquel on alerte qu'un document va expirer. */
  private static readonly EXPIRY_WARN_DAYS = 30;

  /**
   * Types de documents achetables officiellement pour prouver
   * l'immatriculation. L'offre unifiée 2026-04 pousse `extrait_inpi` (RNE,
   * successeur du KBIS depuis 2023, valable société ET auto-entrepreneur).
   * `kbis` (ancien format) et `avis_sirene` sont conservés pour rétro-compat
   * et reconnaissance des docs historiques déjà en base.
   */
  private readonly PURCHASABLE_DOC_TYPES: ReadonlySet<string> = new Set([
    'extrait_inpi',
    'kbis',
    'avis_sirene',
  ]);

  readonly documents = signal<ContractorDocument[]>([]);
  readonly requirements = signal<DocumentRequirement[]>([]);
  readonly isLoading = signal(true);
  readonly isRefreshing = signal(false);

  /**
   * Requirements que le contractor n'a PAS encore fournis (status 'missing'
   * ou 'incomplete'). La source est le dashboard backend — ces entrées ne
   * sont pas dans `documents()` car aucun Document n'a encore été créé.
   */
  readonly missingRequirements = computed<DocumentRequirement[]>(() => {
    // Tri : obligatoires d'abord (`is_bonus` falsy), bonus optionnels ensuite.
    // Évite que la décennale (optionnelle) ne pollue la liste des pièces
    // vraiment manquantes pour la conformité.
    return this.requirements()
      .filter((r) => r.status === 'missing' || r.status === 'incomplete')
      .sort((a, b) => Number(a.is_bonus ?? false) - Number(b.is_bonus ?? false));
  });

  // --- Upload state ---
  readonly uploadedDocs = signal<UploadedDoc[]>([]);
  readonly selectedFiles = signal<File[]>([]);
  readonly acceptedDocsExpanded = signal(false);
  readonly isUploading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly hasPendingUploads = computed(() =>
    this.uploadedDocs().some(d => !d.isFinal),
  );

  /**
   * Documents triés par urgence : ceux qui demandent une action remontent
   * en haut de la liste — l'artisan voit immédiatement ce sur quoi
   * intervenir, sans avoir à scroller.
   *
   * Ordre :
   *   1. rejected (action bloquante)
   *   2. expired (compliance KO)
   *   3. expiring_soon (à renouveler ≤30j)
   *   4. processing/pending (en cours)
   *   5. verified (tout va bien) — date la plus proche d'expiration en haut
   */
  readonly documentsByPriority = computed<ContractorDocument[]>(() => {
    const priority = (d: ContractorDocument): number => {
      if (d.status === 'rejected') return 0;
      if (d.status === 'expired' || d.status === 'legally_outdated') return 1;
      if (this.isExpiringSoon(d)) return 2;
      if (d.status === 'processing' || d.status === 'pending') return 3;
      return 4;
    };
    return [...this.documents()].sort((a, b) => {
      const pa = priority(a);
      const pb = priority(b);
      if (pa !== pb) return pa - pb;
      // Tie-break : date d'expiration la plus proche en haut (utile pour
      // les VERIFIED — on voit le RIB qui expire dans 60 j avant celui à 1 an).
      const da = this.daysUntilExpiry(a) ?? Number.MAX_SAFE_INTEGER;
      const db = this.daysUntilExpiry(b) ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    });
  });

  /**
   * Documents vérifiés qui expirent dans ≤30 jours (status='expired' est
   * géré séparément — ici on cible la fenêtre d'alerte préventive).
   */
  readonly expiringSoonDocs = computed<ContractorDocument[]>(() => {
    return this.documents().filter(d => this.isExpiringSoon(d));
  });

  readonly hasProcessing = computed(() =>
    this.documents().some(d => d.status === 'processing' || d.status === 'pending')
  );

  /**
   * Justificatif d'immatriculation VERIFIED courant (KBIS ou Avis SIRENE).
   * Utilisé pour proposer le téléchargement dans le modal d'actions rapides.
   * Null si le contractor n'a encore rien de validé.
   */
  readonly currentImmatriculationDoc = computed<ContractorDocument | null>(() => {
    return (
      this.documents().find(
        d => d.status === 'verified' && this.isPurchasableDocType(d.type),
      ) ?? null
    );
  });

  /**
   * SIREN connu du contractor, dans l'ordre de priorité :
   *   1. Session contractor (fourni par tuita.fr au login)
   *   2. SIREN extrait par OCR d'un doc VERIFIED (KBIS, INPI, URSSAF...)
   *   3. null → l'artisan doit le saisir via le champ inline du CTA d'achat
   *
   * Signal séparé de `extractSirenFromDocs()` (méthode privée) pour permettre
   * au template de réagir aux changements de `documents()` (un upload qui
   * passe VERIFIED hydrate automatiquement le CTA d'achat).
   */
  readonly knownSiren = computed<string | null>(() => {
    const fromSession = this.session.contractor?.siren ?? null;
    if (fromSession) {
      const clean = fromSession.replace(/\s+/g, '');
      if (/^\d{9}$/.test(clean)) return clean;
    }
    // Fallback : scan des docs VERIFIED en signal-aware (re-trigger sur ajout).
    for (const doc of this.documents()) {
      if ((doc.status ?? '').toString() !== 'verified') continue;
      const vr = (doc as { verification_result?: { extracted_data?: Record<string, unknown> } })
        .verification_result;
      const data = vr?.extracted_data;
      const rawSiren = data?.['siren'];
      if (typeof rawSiren === 'string') {
        const clean = rawSiren.replace(/\s+/g, '');
        if (/^\d{9}$/.test(clean)) return clean;
      }
      const rawSiret = data?.['siret'];
      if (typeof rawSiret === 'string') {
        const clean = rawSiret.replace(/\s+/g, '');
        if (/^\d{14}$/.test(clean)) return clean.slice(0, 9);
      }
    }
    return null;
  });

  /**
   * Vrai dès qu'on a un SIREN exploitable côté session ou docs vérifiés.
   * Si faux → le CTA d'achat affiche le champ de saisie SIREN inline,
   * pas de surprise au clic.
   */
  readonly hasKnownSiren = computed<boolean>(() => this.knownSiren() !== null);

  /**
   * SIREN tapé manuellement par le contractor dans le champ inline du CTA
   * d'achat. N'écrase pas `knownSiren` côté session — c'est juste le buffer
   * de saisie tant qu'on n'a pas encore le SIREN.
   */
  readonly sirenInlineInput = signal<string>('');

  /** True dès que le SIREN inline est un bloc valide de 9 chiffres. */
  readonly hasValidSirenInline = computed<boolean>(() => {
    const s = this.sirenInlineInput().replace(/\s+/g, '');
    return /^\d{9}$/.test(s);
  });

  /** Map uuid → subject pour contrôler l'arrêt du polling par doc uploadé. */
  private readonly stopPolls = new Map<string, Subject<void>>();

  readonly purchaseBanner = signal<'success' | 'cancelled' | null>(null);

  /**
   * Toast "Votre document est prêt" affiché après qu'un achat redirigé
   * (`/documents?purchase=success`) ait abouti et que le backend ait livré
   * le nouveau Document via ProcessDocumentPurchase. Rassure le contractor
   * et l'invite à cliquer « Télécharger » sur la carte qui vient d'apparaître.
   */
  readonly purchaseArrivalToast = signal<{ uuid: string; label: string } | null>(null);

  /** True pendant le polling post-redirect Stripe (spinner banner). */
  readonly isPollingPurchaseArrival = signal(false);

  constructor() {
    // Auto-poll de la liste tant qu'au moins un doc est en `processing` ou
    // `pending`. Couvre les docs livrés par Pappers (qui atterrissent dans
    // documents() sans passer par uploadedDocs, donc hors du polling
    // individuel startStatusPolling). Stoppe seul dès que tous les docs
    // sont en statut final. Cleanup automatique via DestroyRef du composant.
    effect((onCleanup) => {
      if (!this.hasProcessing()) return;
      const id = setInterval(() => this.loadDocuments(), 3000);
      onCleanup(() => clearInterval(id));
    });
  }

  ngOnInit(): void {
    // Retour depuis Stripe Checkout : backend redirige vers
    // /documents?purchase=success|cancelled apres paiement.
    const purchase = this.route.snapshot.queryParamMap.get('purchase');
    if (purchase === 'success' || purchase === 'cancelled') {
      this.purchaseBanner.set(purchase);
      setTimeout(() => this.purchaseBanner.set(null), 8000);
    }

    this.loadDocuments();

    // Si le contractor revient via redirect Stripe (?purchase=success), on
    // polle la liste pour attraper l'arrivée du nouveau doc (webhook Stripe
    // → ProcessDocumentPurchase → Document en BDD, ~2-8 s mais jusqu'à 60 s
    // si Pappers est lent). Une fois arrivé, on affiche un toast "prêt" et
    // on scrolle vers la nouvelle carte. Pas de double-polling avec le flow
    // Embedded Checkout — celui-ci utilise déjà pollUntilDocumentDelivered()
    // avant fermeture du dialog.
    if (purchase === 'success') {
      this.startPostRedirectPurchasePolling();
    }

    // Les requirements (docs attendus + leur statut) vivent côté dashboard.
    // L'artisan DOIT voir la liste des docs à fournir dès qu'il arrive sur
    // /documents — sinon il ne sait pas quoi uploader. Normalement le
    // dashboard est pré-chargé par APP_INITIALIZER, mais on filet-de-sécu
    // avec un refresh si la valeur courante est null (cas d'échec silencieux).
    this.session.dashboard$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(dashboard => {
        this.requirements.set(dashboard?.documents.items ?? []);
      });

    // `contractor` est null tant que le dashboard n'a pas été chargé —
    // signal simple qu'on doit retaper le backend.
    if (this.session.contractor === null) {
      this.session.refreshDashboard();
    }

    const channelId =
      (this.session.contractor as any)?.companyId
      ?? this.session.contractor?.phone
      ?? null;
    this.realtime.connect(channelId);

    this.realtime
      .onDocumentStatusChanged()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(ev => this.handleRealtimeEvent(ev));

    this.refreshBus.refresh$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refresh());
  }

  ngOnDestroy(): void {
    this.stopPolls.forEach(s => { s.next(); s.complete(); });
    this.stopPolls.clear();
    this.realtime.disconnect();
  }

  // --- Liste des documents ---

  loadDocuments(): void {
    if (this.listLoadInFlight) {
      this.pendingListReload = true;
      return;
    }
    this.listLoadInFlight = true;
    // isLoading = spinner plein ecran (masque TOUT le contenu via @if dans le
    // template). On ne l'active qu'au PREMIER chargement (documents vide).
    // Les refresh ulterieurs restent silencieux — les cards existantes ne
    // disparaissent pas, le polling docs/dashboard ne fait pas "clignoter"
    // la page.
    if (this.documents().length === 0) {
      this.isLoading.set(true);
    }
    this.api.getDocuments().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        this.documents.set(res.data);
        this.isLoading.set(false);
        this.isRefreshing.set(false);
        this.listLoadInFlight = false;
        if (!this.hasProcessing()) {
          this.session.refreshDashboard();
        }
        if (this.pendingListReload) {
          this.pendingListReload = false;
          setTimeout(() => this.loadDocuments(), 600);
        }
      },
      error: () => {
        this.isLoading.set(false);
        this.isRefreshing.set(false);
        this.listLoadInFlight = false;
        this.pendingListReload = false;
      },
    });
  }

  refresh(): void {
    // Partage le guard listLoadInFlight avec loadDocuments() : empeche un
    // spam du bouton refresh de declencher 2 GET paralleles.
    if (this.listLoadInFlight) return;
    this.listLoadInFlight = true;
    this.isRefreshing.set(true);
    this.api.getDocuments().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        this.documents.set(res.data);
        this.isRefreshing.set(false);
        this.listLoadInFlight = false;
        if (!this.hasProcessing()) {
          this.session.refreshDashboard();
        }
      },
      error: () => {
        this.isRefreshing.set(false);
        this.listLoadInFlight = false;
      },
    });
  }

  downloadListDoc(event: Event, doc: ContractorDocument): void {
    event.stopPropagation();
    this.api.downloadDocument(doc.uuid).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = window.document.createElement('a');
        a.href = url;
        a.download = doc.file_name ?? 'document.pdf';
        a.click();
        window.URL.revokeObjectURL(url);
      },
    });
  }

  /**
   * Codes de rejet qui peuvent être résolus par l'achat d'un justificatif
   * d'immatriculation officiel. Pour ces codes, quand le doc déclaré/détecté
   * est bien un justificatif d'immatriculation, on propose l'achat officiel
   * en plus du simple reupload.
   *
   * Exclus volontairement :
   * - `document_type_mismatch` : l'utilisateur a uploadé le mauvais type,
   *   acheter un KBIS ne règle rien
   * - `company_closed` / `company_out_of_sector` : propriétés permanentes,
   *   pas réglables par un nouvel achat
   * - `company_verification_unavailable` : transitoire, retry suffit
   * - `statuts_unreadable` : statuts non inclus dans le parcours Tuita
   */
  private readonly PURCHASE_FIXABLE_CODES: ReadonlySet<string> = new Set([
    'kbis_not_original',
    'avis_sirene_invalid',
    'ocr_low_confidence',
    'ocr_failed',
    'document_type_unknown',
    'company_not_found',
    'company_name_mismatch',
    // P2-3 (2026-05-12) — Extrait daté de plus de 3 mois. La règle métier
    // `evaluateKbis` rejette si `issue_date < now() - 3 mois` (configurable
    // via setting `compliance.kbis_max_age_months`). Le CTA achat INPI à
    // jour règle le problème en 30 s.
    'kbis_too_old',
    // P2-6 (2026-05-12) — Document détecté comme "Déclaration de
    // modification RCS" (acte intermédiaire, pas un extrait courant).
    // L'achat d'un extrait INPI fournit le bon document.
    'rcs_modification_not_extract',
  ]);

  /**
   * Un doc rejeté est éligible à un rachat officiel si :
   * 1. son type (déclaré ou détecté) est un justificatif d'immatriculation
   *    (extrait INPI, KBIS ancien format ou Avis de situation INSEE), ET
   * 2. le code de rejet fait partie de ceux qu'un nouveau doc officiel
   *    peut effectivement régler.
   *
   * On teste type ET code — pas l'un sans l'autre — sinon un RIB illisible
   * proposerait l'achat d'un justificatif d'immatriculation, ce qui n'a
   * aucun sens.
   */
  isPurchasableRejection(
    code: string | null | undefined,
    docType: string | null | undefined,
  ): boolean {
    if (!code || !docType) return false;
    if (!this.PURCHASABLE_DOC_TYPES.has(docType)) return false;
    return this.PURCHASE_FIXABLE_CODES.has(code);
  }

  /**
   * Déclenche l'achat officiel d'un justificatif d'immatriculation pour un
   * document qui va expirer (≤30j) ou qui vient d'expirer, à partir du
   * type du document existant. Même chemin réseau pour tout achat (rejet
   * ou expiration), le type est dérivé du doc (`detected_type ?? type`
   * côté liste, `detectedType ?? declaredType` côté upload live) et
   * validé via `PURCHASABLE_DOC_TYPES`.
   */
  purchaseDocumentByType(docType: string | null | undefined, sirenOverride?: string): void {
    if (!docType || !this.PURCHASABLE_DOC_TYPES.has(docType)) return;
    this.runPurchase(docType, sirenOverride);
  }

  /**
   * Icône Material pour un requirement manquant (réutilise la map des docs
   * existants). Fallback `description` (page de document générique) plutôt que
   * `help_outline` qui suggère à l'artisan que c'est lui qui devrait deviner
   * — ce qui est faux : c'est un doc qu'on lui demande, pas un mystère.
   */
  requirementIcon(type: string): string {
    return DOC_TYPE_ICONS[type] ?? 'description';
  }

  /**
   * Achat 1-clic du justificatif d'immatriculation officiel (extrait INPI).
   * Si on a déjà un SIREN (session ou OCR d'un doc vérifié), on lance Stripe
   * directement. Sinon on retombe sur le modal pour demander la saisie.
   * Post-paiement : le backend télécharge le PDF via Pappers, le stocke S3
   * et l'ingère dans le pipeline OCR — le doc apparaît VERIFIED tout seul.
   */
  quickPurchaseImmatriculation(): void {
    const siren = this.session.contractor?.siren ?? this.extractSirenFromDocs();
    if (siren && /^\d{9}$/.test(siren.replace(/\s+/g, ''))) {
      this.purchaseDocumentByType('extrait_inpi', siren);
      return;
    }
    this.openQuickActionsDialog();
  }

  /**
   * Sanitize la saisie SIREN inline du CTA d'achat : ne garde que les
   * chiffres et borne à 9 caractères. Évite à l'artisan de coller un SIRET
   * complet (14 chiffres) ou de mettre des espaces / tirets.
   */
  onSirenInlineChange(raw: string): void {
    const digits = (raw ?? '').replace(/\D/g, '').slice(0, 9);
    this.sirenInlineInput.set(digits);
  }

  /**
   * Lance l'achat direct depuis le CTA inline une fois le SIREN saisi
   * (9 chiffres valides). Bypasse le modal puisque l'artisan a déjà fait
   * sa saisie ici — pas de friction supplémentaire.
   */
  submitInlineSirenPurchase(): void {
    const siren = this.sirenInlineInput().replace(/\s+/g, '');
    if (!/^\d{9}$/.test(siren)) return;
    this.purchaseDocumentByType('extrait_inpi', siren);
  }

  /**
   * Ouvre le modal d'actions rapides sur le justificatif d'immatriculation :
   * upload manuel, achat officiel du justificatif (offre unifiée 9,99 €),
   * ou téléchargement du doc existant. Un seul point d'entrée UI → moins
   * de bruit visuel.
   */
  openQuickActionsDialog(): void {
    const existing = this.currentImmatriculationDoc();
    const ref = this.dialog.open<
      DocumentQuickActionsDialogComponent,
      { siren: string | null; existingDoc: { uuid: string; label: string; fileName: string } | null },
      QuickActionsResult
    >(DocumentQuickActionsDialogComponent, {
      width: '760px',
      maxWidth: '96vw',
      panelClass: 'qad-dialog-panel',
      disableClose: true,
      data: {
        // Source du SIREN, dans l'ordre :
        //   1. session contractor (fourni par tuita.fr au login)
        //   2. SIREN extrait par OCR d'un doc verified déjà uploadé
        //      (cas : le contractor a uploadé son KBIS/INPI manuellement
        //       sans qu'on ait pu le récupérer de la session)
        //   3. null → le modal demande la saisie au contractor
        siren: this.session.contractor?.siren
          ?? this.extractSirenFromDocs()
          ?? null,
        existingDoc: existing
          ? {
              uuid: existing.uuid,
              label: this.typeLabel(existing.type),
              fileName: existing.file_name,
            }
          : null,
      },
    });

    ref.afterClosed().subscribe(result => {
      if (!result || result.action === 'close') return;
      if (result.action === 'purchase') {
        // Le modal renvoie le SIREN (celui de la session si déjà connu, ou
        // celui saisi par le contractor lors de son premier achat).
        this.purchaseDocumentByType(result.docType, result.siren);
        return;
      }
      if (result.action === 'download') {
        this.api.downloadDocument(result.uuid).subscribe({
          next: (blob: Blob) => {
            const doc = this.documents().find(d => d.uuid === result.uuid);
            const url = window.URL.createObjectURL(blob);
            const a = window.document.createElement('a');
            a.href = url;
            a.download = doc?.file_name ?? 'justificatif.pdf';
            a.click();
            window.URL.revokeObjectURL(url);
          },
        });
      }
    });
  }

  /**
   * Appel HTTP partagé : stocke le SIREN, spinner, Stripe Embedded Checkout
   * en dialog OU rafraîchissement direct en mode gratuit/dev (livraison
   * déjà lancée côté backend).
   *
   * Contrat backend (post-migration hosted → embedded) :
   *   data.embedded_checkout?: { client_secret, publishable_key }
   *   - présent  : paiement requis → on ouvre le dialog embedded.
   *   - absent   : dev/free → la livraison tourne déjà, on refresh.
   */
  /**
   * Tente de récupérer le SIREN depuis un document VERIFIED déjà uploadé
   * (extrait INPI, KBIS ancien format, Avis SIRENE, URSSAF, statuts). Source :
   * `verification_result` exposé par le backend — cf. `DocumentResource`.
   *
   * On restreint volontairement aux types d'immatriculation : un SIRET extrait
   * d'un RIB (banque émettrice) ou d'une facture fournisseur n'est pas le
   * SIRET du contractor → ne JAMAIS le pré-remplir pour un achat à 9,99 €.
   */
  private static readonly SIREN_SOURCE_DOC_TYPES = new Set<string>([
    'extrait_inpi',
    'kbis',
    'avis_sirene',
    'urssaf',
    'statuts',
  ]);

  private extractSirenFromDocs(): string | null {
    for (const doc of this.documents()) {
      const status = (doc.status ?? '').toString();
      if (status !== 'verified') continue;
      const type = (doc.detected_type ?? doc.type ?? '').toString();
      if (!ContractorDocumentsComponent.SIREN_SOURCE_DOC_TYPES.has(type)) continue;
      const vr = (doc as { verification_result?: { extracted_data?: Record<string, unknown> } })
        .verification_result;
      const data = vr?.extracted_data;
      const rawSiren = data?.['siren'];
      if (typeof rawSiren === 'string') {
        const clean = rawSiren.replace(/\s+/g, '');
        if (/^\d{9}$/.test(clean)) return clean;
      }
      // SIRET (14) contient le SIREN (9 premiers chiffres)
      const rawSiret = data?.['siret'];
      if (typeof rawSiret === 'string') {
        const clean = rawSiret.replace(/\s+/g, '');
        if (/^\d{14}$/.test(clean)) return clean.slice(0, 9);
      }
    }
    return null;
  }

  private runPurchase(docType: string, sirenOverride?: string): void {
    // Priorité résolution SIREN :
    //   1. override explicite (modal ou CTA inline qui vient de le saisir)
    //   2. SIREN de la session contractor (tuita.fr)
    //   3. SIREN extrait d'un doc VERIFIED (OCR KBIS / INPI / URSSAF)
    // Si rien des trois, on ne devrait JAMAIS arriver ici depuis le template
    // (les CTA exigent un SIREN connu ou la saisie inline). Filet de sécu
    // pour un appel programmatique inattendu — message clair, pas de crash.
    const rawSiren =
      sirenOverride
      ?? this.session.contractor?.siren
      ?? this.knownSiren()
      ?? '';
    const siren = rawSiren.replace(/\s+/g, '');
    if (!/^\d{9}$/.test(siren)) {
      this.errorMessage.set(
        'Indique d\'abord ton SIREN (9 chiffres) avant de récupérer ton justificatif.',
      );
      return;
    }

    this.isUploading.set(true);
    this.errorMessage.set(null);

    this.api.purchaseDocument(docType, siren).subscribe({
      next: (res: any) => {
        const data = res?.data ?? {};
        this.isUploading.set(false);

        const purchaseUuid: string | null = data.purchase_uuid ?? null;
        const embedded = data.embedded_checkout;
        if (embedded?.client_secret && embedded?.publishable_key) {
          this.openStripeDialog(
            embedded.client_secret,
            embedded.publishable_key,
            docType,
            purchaseUuid,
          );
          return;
        }

        // Dev / gratuit : la livraison tourne deja cote backend. On polle
        // le statut de l'achat plutot que la liste docs — on detecte ainsi
        // un echec Pappers (status=failed) sans timeout silencieux.
        if (purchaseUuid) {
          this.pollPurchaseStatus(purchaseUuid);
        } else {
          this.loadDocuments();
          this.session.refreshDashboard();
        }
      },
      error: (err: any) => {
        this.isUploading.set(false);
        const message = this.formatPurchaseError(err);
        this.errorMessage.set(message);
        // Le modal d'achat est déjà fermé quand le backend rejette le SIREN
        // (not_found / closed / name_mismatch / lookup_unavailable). Sans
        // snackbar le contractor risque de ne rien remarquer — on rend l'erreur
        // bloquante pendant 8 s pour qu'il ait le temps de la lire.
        this.snack.open(message, 'OK', { duration: 8000, panelClass: 'snackbar-error' });
      },
    });
  }

  /**
   * Traduit les codes d'erreur backend de l'endpoint /documents/purchase en
   * messages FR concrets et actionnables pour artisan BTP.
   *
   * Filet de sécurité : si le backend renvoie un code machine au lieu d'un
   * message FR, on prend le relais ici plutôt que d'afficher `company_not_found`
   * brut. Si le backend renvoie déjà un message FR clair (cas nominal), on le
   * laisse passer en priorité — seulement pour les codes connus ou un fallback
   * neutre quand rien n'est lisible.
   */
  private formatPurchaseError(err: any): string {
    const code: string | undefined = err?.error?.error?.code;
    const backendMessage: string | undefined = err?.error?.error?.message;

    // Mapping des codes connus → message FR low-literacy.
    const codeToMessage: Record<string, string> = {
      'company_not_found':
        "Le SIREN que tu as saisi n'existe pas dans le registre officiel. Vérifie les 9 chiffres (pas les 14 du SIRET).",
      'company_closed':
        "Cette entreprise est radiée d'après le registre officiel. Tu ne peux pas commander de document pour une entreprise fermée.",
      'company_name_mismatch':
        "Le nom de l'entreprise enregistré ne correspond pas à ce SIREN. Contacte le support si c'est une erreur.",
      'company_verification_unavailable':
        "Le service de vérification d'entreprise est en panne pour quelques minutes. Réessaie dans 5 minutes.",
      'siren.not_found':
        "Le SIREN que tu as saisi n'existe pas. Vérifie les 9 chiffres.",
      'siren.lookup_unavailable':
        "On n'arrive pas à joindre le registre officiel pour le moment. Réessaie dans 5 minutes.",
      'siren_invalid':
        "Le SIREN doit faire exactement 9 chiffres (pas 14 comme le SIRET).",
      'company_out_of_sector':
        "Cette entreprise n'est pas enregistrée dans le BTP. Tuita ne traite que le bâtiment.",
    };

    if (code && codeToMessage[code]) {
      return codeToMessage[code];
    }
    // Si le backend a renvoyé un message FR qui n'est pas juste le code brut.
    if (backendMessage && backendMessage !== code) {
      return backendMessage;
    }
    return "Erreur lors de l'achat. Réessaie dans un instant.";
  }

  /**
   * Ouvre le dialog Stripe Embedded Checkout avec les secrets fournis par
   * le backend. Sur complétion → refresh liste + dashboard. Sur annulation,
   * rien à faire (l'achat n'a pas été lancé côté Pappers).
   */
  private openStripeDialog(
    clientSecret: string,
    publishableKey: string,
    docType: string,
    purchaseUuid: string | null,
  ): void {
    const label = this.typeLabel(docType);
    const ref = this.dialog.open<
      StripeEmbeddedCheckoutDialogComponent,
      StripeEmbeddedCheckoutDialogData,
      StripeEmbeddedCheckoutDialogResult
    >(StripeEmbeddedCheckoutDialogComponent, {
      width: '820px',
      maxWidth: '96vw',
      maxHeight: '90vh',
      disableClose: true,
      panelClass: 'stripe-embedded-dialog-panel',
      data: {
        clientSecret,
        publishableKey,
        title: `Paiement sécurisé - ${label}`,
        subtitle: 'Confirmez votre achat pour lancer la délivrance du document officiel.',
      },
    });

    // On capture le count courant pour détecter l'arrivée du nouveau document
    // livré par ProcessDocumentPurchase (webhook Stripe → job Pappers → Document).
    const countBeforePurchase = this.documents().length;

    ref.afterClosed().subscribe(result => {
      if (result?.status === 'complete') {
        // Stripe a confirmé le paiement côté client (callback onComplete).
        // Backend : webhook `checkout.session.completed` → ProcessDocumentPurchase
        // → Pappers API → Document créé. Délai 2-8s en happy path, mais peut
        // échouer (Pappers down, SIREN inconnu, etc.). On polle le STATUT de
        // l'achat — pas la liste docs — pour détecter un `failed` explicite
        // et le remonter au contractor au lieu d'un timeout silencieux.
        if (purchaseUuid) {
          this.pollPurchaseStatus(purchaseUuid);
        } else {
          this.pollUntilDocumentDelivered(countBeforePurchase);
        }
        this.session.refreshDashboard();
      }
    });
  }

  /**
   * Polling post-paiement sur le statut du DocumentPurchase. On surveille
   * pending → completed | failed et on prévient le contractor en conséquence
   * (toast). Évite le scénario silencieux où Pappers échoue (503, SIREN
   * invalide, etc.) et le contractor n'a aucun feedback après avoir payé.
   *
   * Backoff total ≈ 25 s — au-delà l'achat est encore `pending` côté backend
   * (Pappers très lent ou retry Horizon en cours). On affiche un toast
   * informatif sans déclarer l'échec : la livraison peut encore aboutir.
   */
  private pollPurchaseStatus(purchaseUuid: string): void {
    const delays = [1500, 2000, 2000, 3000, 4000, 5000, 7000];
    let attempt = 0;

    // Capture des UUIDs présents AVANT le démarrage du polling : nous permet
    // d'identifier la nouvelle card livrée par Pappers pour scroller dessus
    // et highlight visuellement (cf. branche 'completed').
    const initialUuids = new Set(this.documents().map(d => d.uuid));

    const tick = (): void => {
      this.api.getPurchaseDetail(purchaseUuid).subscribe({
        next: detail => {
          if (detail.status === 'completed') {
            this.session.refreshDashboard();
            // On rafraîchit la liste puis on identifie le nouveau document
            // pour pouvoir y scroller, l'animer, et offrir un download direct
            // depuis la snackbar — un user qui vient de payer 9,99 € mérite
            // un signal de succès net, pas un simple "OK" passif.
            this.api.getDocuments().subscribe({
              next: res => {
                this.documents.set(res.data);
                const arrived = res.data.find(d => !initialUuids.has(d.uuid));
                this.celebratePurchaseSuccess(detail.label, arrived?.uuid);
              },
              error: () => {
                // Fallback : si le reload list échoue on garde quand même la
                // notif de succès. Le user fera Refresh manuellement.
                this.celebratePurchaseSuccess(detail.label, undefined);
              },
            });
            return;
          }

          if (detail.status === 'failed') {
            this.loadDocuments();
            this.session.refreshDashboard();
            this.snack.open(
              `Échec de la récupération de ${detail.label.toLowerCase()}. Vous serez remboursé automatiquement sous 5 jours ouvrés.`,
              'OK',
              { duration: 12000, panelClass: ['snack-error'] },
            );
            return;
          }

          // Encore pending — on continue de poller.
          if (attempt < delays.length) {
            setTimeout(tick, delays[attempt]);
            attempt++;
            return;
          }

          // Timeout : le job Pappers tourne encore (ou est en retry Horizon).
          // On informe le contractor sans déclarer l'échec — un refresh manuel
          // ou la prochaine navigation affichera le doc une fois livré.
          this.snack.open(
            'La livraison du document prend plus de temps que prévu. Rechargez la page dans quelques minutes.',
            'OK',
            { duration: 8000 },
          );
        },
        error: () => {
          if (attempt < delays.length) {
            setTimeout(tick, delays[attempt]);
            attempt++;
          }
        },
      });
    };

    setTimeout(tick, 1500);
  }

  /**
   * Poll la liste des documents après paiement Stripe jusqu'à voir le nouveau
   * document livré par ProcessDocumentPurchase (via Pappers).
   * Backoff progressif pour couvrir les flux Pappers lents (API externe).
   */
  private pollUntilDocumentDelivered(countBeforePurchase: number): void {
    // Backoff : 2 s, 4 s, 7 s, 11 s, 16 s — total ~20 s
    const delays = [2000, 2000, 3000, 4000, 5000];
    let attempt = 0;

    const tick = (): void => {
      this.api.getDocuments().subscribe({
        next: res => {
          const freshCount = res.data.length;
          this.documents.set(res.data);
          // Nouveau doc arrivé → stop le polling. Le polling ciblé par doc
          // (startStatusPolling) prendra automatiquement le relais pour le
          // nouvel upload si son statut est 'processing'.
          if (freshCount > countBeforePurchase) {
            if (!this.hasProcessing()) {
              this.session.refreshDashboard();
            }
            return;
          }
          if (attempt < delays.length) {
            setTimeout(tick, delays[attempt]);
            attempt++;
          }
          // Sinon : timeout atteint — le user verra le doc arriver au
          // prochain refresh manuel ou à la prochaine navigation.
        },
        error: () => {
          if (attempt < delays.length) {
            setTimeout(tick, delays[attempt]);
            attempt++;
          }
        },
      });
    };

    // Premier refresh immédiat, puis backoff
    setTimeout(tick, 1500);
  }

  /**
   * Polling post-redirect Stripe : le contractor revient sur /documents via
   * redirect externe (pas via Embedded Checkout dialog). Le backend finit
   * d'encaisser (webhook checkout.session.completed → ProcessDocumentPurchase
   * → Pappers API → Document créé). On polle toutes les 2-3 s pendant 60 s
   * max, puis on affiche un toast quand un NOUVEAU doc purchased apparaît.
   *
   * Stratégie de détection : on capture la liste des UUIDs au T0 puis on
   * détecte le premier UUID nouveau qui arrive. Pas parfait si le contractor
   * avait déjà un doc en cours — mais c'est le cas rare, et le polling
   * ciblé par doc rattrape le reste.
   */
  private startPostRedirectPurchasePolling(): void {
    this.isPollingPurchaseArrival.set(true);

    // Snapshot du set d'UUIDs actuel (à T0, avant l'arrivée du doc acheté).
    // Si documents() est encore vide (loadDocuments async), on reste ouvert
    // au premier doc qui arrive avec un type achetable.
    const initialUuids = new Set(this.documents().map(d => d.uuid));
    const startedAt = Date.now();
    const MAX_DURATION_MS = 60_000;
    const POLL_EVERY_MS = 2_500;

    const tick = (): void => {
      if (Date.now() - startedAt > MAX_DURATION_MS) {
        this.isPollingPurchaseArrival.set(false);
        return;
      }

      this.api.getDocuments().subscribe({
        next: res => {
          this.documents.set(res.data);
          // Premier doc NOUVEAU + dont le type est un justificatif officiel
          // achetable → c'est celui qu'on attendait.
          const arrived = res.data.find(
            d =>
              !initialUuids.has(d.uuid)
              && this.isPurchasableDocType(d.type),
          );
          if (arrived) {
            this.isPollingPurchaseArrival.set(false);
            this.purchaseArrivalToast.set({
              uuid: arrived.uuid,
              label: this.typeLabel(arrived.type),
            });
            // Scroll + focus sur la nouvelle carte après rendu.
            setTimeout(() => this.scrollToDoc(arrived.uuid), 150);
            // Toast auto-dismiss après 12 s — l'info reste dans la liste
            // même si le toast disparaît.
            setTimeout(() => this.purchaseArrivalToast.set(null), 12_000);
            this.session.refreshDashboard();
            return;
          }
          setTimeout(tick, POLL_EVERY_MS);
        },
        error: () => {
          setTimeout(tick, POLL_EVERY_MS);
        },
      });
    };

    // Premier tick dans 2 s (laisse le temps à ProcessDocumentPurchase
    // d'être dispatché par le webhook Stripe).
    setTimeout(tick, 2_000);
  }

  /**
   * Signal de succès post-Stripe : on guide le user (1) un toast persistant
   * avec un bouton « Télécharger » direct, (2) un scroll automatique vers la
   * card livrée avec animation pour qu'il VOIE qu'elle est arrivée. Évite le
   * scénario où la snackbar se ferme et le user se demande où trouver son
   * document fraîchement payé. Bouton « Voir mes achats » en option pour
   * rappeler le centre d'historique.
   */
  private celebratePurchaseSuccess(label: string, uuid: string | undefined): void {
    if (uuid) {
      // Délai 150 ms pour laisser Angular rendre la nouvelle card avant scroll
      setTimeout(() => this.scrollToDoc(uuid), 150);
    }

    const ref = this.snack.open(
      `✓ ${label} récupéré - prêt à télécharger`,
      uuid ? 'Télécharger' : 'OK',
      {
        duration: 10000,
        panelClass: ['snack-success'],
        horizontalPosition: 'center',
        verticalPosition: 'top',
      },
    );

    if (uuid) {
      ref.onAction().subscribe(() => {
        const doc = this.documents().find(d => d.uuid === uuid);
        if (!doc) return;
        this.api.downloadDocument(uuid).subscribe({
          next: (blob: Blob) => {
            const url = window.URL.createObjectURL(blob);
            const a = window.document.createElement('a');
            a.href = url;
            a.download = doc.file_name ?? 'document.pdf';
            a.click();
            window.URL.revokeObjectURL(url);
          },
          error: () => {
            this.snack.open(
              'Téléchargement impossible - réessayez depuis la card du document.',
              'OK',
              { duration: 5000, panelClass: ['snack-error'] },
            );
          },
        });
      });
    }
  }

  /**
   * Scroll doux vers la carte correspondant au doc qui vient d'arriver.
   * Le HTML doit exposer `data-doc-uuid="{{ doc.uuid }}"` sur la card.
   */
  private scrollToDoc(uuid: string): void {
    const el = window.document.querySelector<HTMLElement>(
      `[data-doc-uuid="${uuid}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('doc-card--just-arrived');
      setTimeout(() => el.classList.remove('doc-card--just-arrived'), 4_000);
    }
  }

  /** Fermeture manuelle du toast "document prêt". */
  dismissPurchaseArrivalToast(): void {
    this.purchaseArrivalToast.set(null);
  }

  downloadUploadedDoc(uuid: string): void {
    if (uuid.startsWith('local-')) return;
    this.api.downloadDocument(uuid).subscribe({
      next: (blob: Blob) => {
        const doc = this.uploadedDocs().find(d => d.uuid === uuid);
        const url = window.URL.createObjectURL(blob);
        const a = window.document.createElement('a');
        a.href = url;
        a.download = doc?.fileName ?? 'document.pdf';
        a.click();
        window.URL.revokeObjectURL(url);
      },
    });
  }

  // --- Upload : file picker ---

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFiles(Array.from(input.files));
    }
    input.value = '';
  }

  private handleFiles(files: File[]): void {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    const accepted: File[] = [];
    const rejected: string[] = [];

    for (const file of files) {
      if (!allowed.includes(file.type)) {
        rejected.push(`${file.name} (format non supporte)`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        rejected.push(`${file.name} (> 10 Mo)`);
        continue;
      }
      accepted.push(file);
    }

    this.errorMessage.set(rejected.length > 0 ? `Ignore: ${rejected.join(', ')}` : null);
    this.selectedFiles.update(existing => [...existing, ...accepted]);

    // Auto-upload dès qu'un fichier est choisi — évite une étape "Envoyer"
    // sur mobile, flow plus direct pour un artisan. Le feedback visuel
    // (spinner) est rendu par la bannière flottante en haut de page.
    if (accepted.length > 0 && !this.isUploading()) {
      this.upload();
    }
  }

  removeFile(index: number): void {
    this.selectedFiles.update(files => files.filter((_, i) => i !== index));
  }

  clearAll(): void {
    this.selectedFiles.set([]);
    this.errorMessage.set(null);
  }

  upload(): void {
    const files = this.selectedFiles();
    if (files.length === 0) return;

    this.isUploading.set(true);
    this.errorMessage.set(null);

    let remaining = files.length;
    const finalizeOne = () => {
      remaining -= 1;
      if (remaining === 0) {
        this.isUploading.set(false);
        this.selectedFiles.set([]);
        this.session.refreshDashboard();
        this.loadDocuments();
      }
    };

    for (const file of files) {
      // startedAt posé AVANT le POST : en mode sync le POST bloque pendant
      // l'OCR (quelques centaines de ms si cache backend, jusqu'à 15 s sur
      // un nouveau doc). Sans ça, elapsedSeconds serait calculé à partir du
      // moment où la réponse arrive, donnant « Termine en 0 s » systémati-
      // quement (cf. bug 2026-04-22).
      const startedAt = Date.now();
      this.api.uploadDocument(file).subscribe({
        next: (res: any) => {
          const doc = res?.data?.document ?? res?.document ?? {};
          const uuid = doc.uuid;
          if (!uuid) {
            this.pushDoc({
              uuid: `local-${Date.now()}-${file.name}`,
              fileName: file.name,
              status: 'error',
              error: 'Réponse serveur invalide.',
              isFinal: true,
              startedAt,
            });
            finalizeOne();
            return;
          }

          const initialStatus = doc.status ?? 'pending';
          const isFinal = this.isFinalStatus(initialStatus);
          // Précision décimale : OCR cache backend peut répondre en ~300 ms,
          // un `Math.floor((Date.now() - startedAt) / 1000)` donnerait 0.
          const elapsedSeconds = (Date.now() - startedAt) / 1000;
          this.pushDoc({
            uuid,
            fileName: file.name,
            declaredType: doc.type ?? null,
            detectedType: doc.detected_type ?? null,
            status: initialStatus,
            failureReason: doc.failure_reason ?? null,
            failureDetail: doc.failure_detail ?? null,
            verificationScore: typeof doc.verification_score === 'number' ? doc.verification_score : null,
            extractedSummary: doc.extracted_data_summary ?? null,
            phase: isFinal ? 'done' : 'queued',
            isFinal,
            startedAt,
            elapsedSeconds: isFinal ? elapsedSeconds : 0,
          });

          // Mode sync (backend 2026-04-22) : la reponse porte deja le verdict final.
          // On skip le polling si final pour eviter une requete reseau inutile.
          // Pas de loadDocuments/refreshDashboard ici — finalizeOne s'en charge
          // UNE SEULE FOIS quand tous les uploads sont termines (evite N*2 req
          // paralleles qui saturent le throttle 60/60 du backend).
          if (!isFinal) {
            this.startStatusPolling(uuid);
          }
          finalizeOne();
        },
        error: (err: any) => {
          const msg =
            err?.name === 'TimeoutError'
              ? 'Upload trop long (connexion instable ?). Réessaie.'
              : this.formatPurchaseError(err);
          this.pushDoc({
            uuid: `local-${Date.now()}-${file.name}`,
            fileName: file.name,
            status: 'error',
            error: msg,
            isFinal: true,
            startedAt,
            elapsedSeconds: (Date.now() - startedAt) / 1000,
          });
          finalizeOne();
        },
      });
    }
  }

  private pushDoc(
    partial: Partial<UploadedDoc> & { uuid: string; fileName: string; status: string },
  ): void {
    const now = Date.now();
    const defaults: UploadedDoc = {
      uuid: partial.uuid,
      fileName: partial.fileName,
      declaredType: null,
      detectedType: null,
      status: partial.status,
      phase: partial.status === 'error' ? 'done' : 'queued',
      failureReason: null,
      failureDetail: null,
      rejectionCopy: null,
      verificationScore: null,
      extractedSummary: null,
      elapsedSeconds: 0,
      isFinal: false,
      startedAt: now,
      error: null,
    };
    const merged: UploadedDoc = { ...defaults, ...partial };
    merged.isFinal = partial.isFinal ?? this.isFinalStatus(merged.status);
    merged.rejectionCopy = rejectionMessage(merged.failureReason, this.extraitInpiPriceLabel());

    this.uploadedDocs.update(docs => {
      const filtered = docs.filter(d => d.uuid !== merged.uuid);
      return [merged, ...filtered];
    });
  }

  private handleRealtimeEvent(ev: DocumentStatusEvent): void {
    const doc = this.uploadedDocs().find(d => d.uuid === ev.uuid);
    if (!doc) return;
    this.applyStatus(ev.uuid, {
      status: ev.status,
      detected_type: ev.detected_type,
      failure_reason: ev.failure_reason,
      failure_detail: ev.failure_detail,
      verification_score: ev.verification_score,
      ocr_phase: ev.ocr_phase,
    });

    // Si le WebSocket livre le verdict final avant le prochain tick HTTP,
    // on coupe le polling tout de suite — inutile d'aller chercher ce que
    // l'on sait déjà. Le polling HTTP redondant réapparaît visuellement
    // dans la console comme un call "après que le statut est connu".
    if (this.isFinalStatus(ev.status)) {
      this.stopPollFor(ev.uuid);
    }
  }

  /** Arrête le polling HTTP pour un uuid donné, si actif. Idempotent. */
  private stopPollFor(uuid: string): void {
    const stop$ = this.stopPolls.get(uuid);
    if (!stop$) return;
    stop$.next();
    stop$.complete();
    this.stopPolls.delete(uuid);
  }

  private startStatusPolling(uuid: string): void {
    if (this.stopPolls.has(uuid)) return;

    const stop$ = new Subject<void>();
    this.stopPolls.set(uuid, stop$);

    interval(POLL_INTERVAL_MS)
      .pipe(
        // takeUntil EN PREMIER : coupe l'amont (interval) dès que stop$
        // émet, donc plus aucun nouveau tick ne déclenche d'HTTP call.
        // Avec takeWhile on filtrait SEULEMENT les valeurs downstream :
        // le tick suivant firait quand même sa requête avant d'être
        // droppée, d'où l'impression que le polling continue après
        // qu'un statut final est connu.
        takeUntil(stop$),
        switchMap(() =>
          this.api.getDocumentStatus(uuid).pipe(
            catchError(err => {
              // 404 : doc supprimé/introuvable cote backend — fin de partie.
              if (err?.status === 404) {
                this.markError(uuid, 'Document introuvable.');
                this.stopPollFor(uuid);
              }
              // 429 : throttle atteint, on arrete le polling pour laisser la
              // fenetre glissante se vider (sinon le tick 1.5 s continue a
              // consommer inutilement des jetons backend). Le realtime
              // WebSocket (canal contractor.*) prendra le relais.
              if (err?.status === 429) {
                this.stopPollFor(uuid);
              }
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (res: any) => {
          const data = res?.data;
          if (!data) return;
          this.applyStatus(uuid, data);
          // On regarde data.status directement plutôt que de relire le
          // signal : plus explicite, et on est sûr d'agir sur la valeur
          // qui vient juste d'arriver (pas sur un merge antérieur).
          const status = data.status ?? this.uploadedDocs().find(d => d.uuid === uuid)?.status;
          if (status && this.isFinalStatus(status)) {
            this.stopPollFor(uuid);
            // Si d'autres docs sont aussi en train de finaliser, dedupe
            // au niveau de loadDocuments (guard listLoadInFlight).
            this.loadDocuments();
            if (this.stopPolls.size === 0) {
              this.session.refreshDashboard();
            }
          }
        },
      });
  }

  private applyStatus(uuid: string, data: any): void {
    this.uploadedDocs.update(docs =>
      docs.map(d => {
        if (d.uuid !== uuid) return d;
        const elapsed = (Date.now() - d.startedAt) / 1000;
        const status = data.status ?? d.status;
        const isFinal = this.isFinalStatus(status);
        const failureReason = data.failure_reason ?? null;
        return {
          ...d,
          status,
          phase: data.ocr_phase ?? d.phase,
          detectedType: data.detected_type ?? d.detectedType,
          failureReason,
          failureDetail: data.failure_detail ?? null,
          rejectionCopy: rejectionMessage(failureReason, this.extraitInpiPriceLabel()),
          verificationScore: typeof data.verification_score === 'number' ? data.verification_score : null,
          extractedSummary: data.extracted_data_summary ?? null,
          elapsedSeconds: data.processing_elapsed_seconds ?? elapsed,
          isFinal,
        };
      }),
    );
  }

  private markError(uuid: string, message: string): void {
    this.uploadedDocs.update(docs =>
      docs.map(d =>
        d.uuid === uuid ? { ...d, error: message, isFinal: true, status: 'error' } : d,
      ),
    );
  }

  private isFinalStatus(status: string): boolean {
    return ['verified', 'rejected', 'expired', 'legally_outdated', 'error'].includes(status);
  }

  removeUploadedDoc(uuid: string): void {
    this.stopPollFor(uuid);
    this.uploadedDocs.update(docs => docs.filter(d => d.uuid !== uuid));
  }

  // --- Helpers UI ---

  docIcon(type: string): string {
    return DOC_TYPE_ICONS[type] ?? 'description';
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      verified: 'Vérifié',
      pending: 'En attente',
      processing: 'En cours',
      missing: 'Manquant',
      expired: 'Expiré',
      rejected: 'Refusé',
      error: 'Échec',
      legally_outdated: 'Trop ancien',
    };
    return labels[status] ?? status;
  }

  statusClass(status: string): string {
    switch (status) {
      case 'verified': return 'status-badge--green';
      case 'missing': case 'rejected': case 'error': return 'status-badge--red';
      case 'pending': case 'processing': return 'status-badge--orange';
      case 'expired': case 'legally_outdated': return 'status-badge--yellow';
      default: return 'status-badge--grey';
    }
  }

  typeLabel(type: string | null | undefined): string {
    if (!type) return '';
    const labels: Record<string, string> = {
      kbis: "Justificatif d'immatriculation",
      extrait_inpi: "Justificatif d'immatriculation",
      rc: 'RC Pro',
      urssaf: 'Attestation URSSAF',
      cni: 'Pièce d\'identité',
      passeport: 'Passeport',
      titre_sejour: 'Titre de séjour',
      assurance_decennale: 'Assurance décennale',
      rib: 'RIB',
      attestation_fiscale: 'Attestation fiscale',
      attestation_regularite_fiscale: 'Attestation de régularité fiscale',
      attestation_regularite_sociale: 'Attestation de régularité sociale',
      statuts: 'Statuts de la société',
      certification: 'Certification',
      avis_sirene: 'Avis de situation INSEE',
      other: 'Type à confirmer',
    };
    return labels[type] ?? type;
  }

  typeEmoji(type: string | null | undefined): string {
    if (!type) return '📎';
    const map: Record<string, string> = {
      kbis: '📄',
      extrait_inpi: '📄',
      cni: '🪪',
      passeport: '🪪',
      rc: '🛡️',
      urssaf: '✅',
      rib: '🏦',
      assurance_decennale: '🛡️',
      certification: '🏅',
      avis_sirene: '📋',
      statuts: '📑',
    };
    return map[type] ?? '📎';
  }

  statusIcon(status: string): string {
    switch (status) {
      case 'verified': return 'check_circle';
      case 'rejected':
      case 'error': return 'error';
      case 'expired':
      case 'legally_outdated': return 'schedule';
      default: return 'hourglass_top';
    }
  }

  phaseLabel(phase: string): string {
    // Labels concrets pour artisan BTP — pas de jargon backend (OCR, règles
    // métier, URSSAF en ligne). On dit CE qu'on fait, pas COMMENT.
    const labels: Record<string, string> = {
      queued: 'En attente...',
      ocr_running: 'On lit ton document...',
      rules_evaluating: 'On vérifie les infos...',
      online_check_running: 'On vérifie auprès des impôts...',
      done: 'Terminé',
    };
    return labels[phase] ?? phase;
  }

  extractedFieldLabel(key: string): string {
    const labels: Record<string, string> = {
      siren: 'SIREN',
      siret: 'SIRET',
      denomination: 'Dénomination',
      date_emission: 'Émis le',
      date_validite: 'Valable jusqu\'au',
      periode: 'Période',
      titulaire: 'Titulaire',
      iban_masked: 'IBAN',
      bic: 'BIC',
      banque: 'Banque',
      nom: 'Nom',
      prenom: 'Prénom',
      date_naissance: 'Né(e) le',
      date_expiration: 'Expire le',
      numero: 'Numéro',
      assureur: 'Assureur',
      numero_contrat: 'Contrat N°',
      date_debut: 'Début',
      date_fin: 'Fin',
      type_detecte: 'Type détecté',
    };
    return labels[key] ?? key;
  }

  extractedEntries(summary: Record<string, string> | null): Array<{ key: string; value: string }> {
    if (!summary) return [];
    return Object.entries(summary).map(([key, value]) => ({ key, value }));
  }

  formatElapsed(seconds: number | null): string {
    if (seconds === null || seconds < 0) return '';
    // Arrondi seconde : minimum 1 s (évite « 0 s » sur réponse OCR < 1 s).
    const total = Math.max(1, Math.round(seconds));
    if (total < 60) return `${total} s`;
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m} min ${s.toString().padStart(2, '0')} s`;
  }

  formatFileSize(bytes: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' o';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
    return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
  }

  daysSinceExpiry(doc: ContractorDocument): number | null {
    if (!doc.expires_at) return null;
    const diff = Date.now() - new Date(doc.expires_at).getTime();
    return diff > 0 ? Math.floor(diff / 86_400_000) : null;
  }

  /** Nombre de jours jusqu'à expiration (positif = pas encore expiré). */
  daysUntilExpiry(doc: ContractorDocument): number | null {
    if (!doc.expires_at) return null;
    const diff = new Date(doc.expires_at).getTime() - Date.now();
    return diff > 0 ? Math.floor(diff / 86_400_000) : null;
  }

  /**
   * Document vérifié qui expire dans les 30 jours — on veut proposer le
   * rachat direct sans attendre l'expiration effective.
   */
  isExpiringSoon(doc: ContractorDocument): boolean {
    if (doc.status !== 'verified') return false;
    const days = this.daysUntilExpiry(doc);
    return days !== null && days <= ContractorDocumentsComponent.EXPIRY_WARN_DAYS;
  }

  /** Le type fait-il partie des documents achetables dans le parcours Tuita ? */
  isPurchasableDocType(type: string | null | undefined): boolean {
    return !!type && this.PURCHASABLE_DOC_TYPES.has(type);
  }

  trackByUuid(_index: number, doc: ContractorDocument | UploadedDoc): string {
    return doc.uuid;
  }

  rejectionCopy(doc: ContractorDocument): DocumentRejectionCopy | null {
    return rejectionMessage(doc.failure_reason, this.extraitInpiPriceLabel());
  }
}
