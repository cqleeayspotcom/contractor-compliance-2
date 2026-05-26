import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  effect,
  DestroyRef,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { ContractorSessionService } from '../../services/contractor-session.service';
import {
  ContractorApiService,
  ContractorBankDetails,
  ContractorDashboard,
  DocumentRequirement,
} from '../../services/contractor-api.service';
import { IdentityFileFusionService } from '../../services/identity-file-fusion.service';
import { PricingService } from '../../services/pricing.service';
import {
  DocumentQuickActionsDialogComponent,
  QuickActionsDialogData,
  QuickActionsResult,
} from '../contractor-documents/document-quick-actions-dialog.component';
import {
  StripeEmbeddedCheckoutDialogComponent,
  StripeEmbeddedCheckoutDialogData,
  StripeEmbeddedCheckoutDialogResult,
} from '../../components/stripe-embedded-checkout-dialog.component';
import {
  DocumentScannerDialogComponent,
  DocumentScannerDialogData,
  DocumentScannerDialogResult,
} from '../../components/document-scanner-dialog/document-scanner-dialog.component';
import { DocumentScannerService } from '../../services/document-scanner.service';
import {
  OnboardingVideoDialogComponent,
  OnboardingVideoDialogData,
} from '../../components/onboarding-video-dialog/onboarding-video-dialog.component';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

/**
 * Limite stricte côté backend = 10 MB (nginx `client_max_body_size`). On
 * filtre côté client AVANT d'envoyer pour 2 raisons :
 *  (1) éviter un 413 silencieux qui laisse l'artisan croire à un bug OCR ;
 *  (2) ne pas faire tourner le scanner client (jscanify + OpenCV) ni la
 *      fusion PDF sur un fichier qu'on sait condamné.
 * On exprime la valeur en MB binaires (Mo = 1024²) — c'est ce que les API
 * banques/photos utilisent dans leurs hint UI, ça matche les attentes.
 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_MB_LABEL = '10 Mo';

interface StepConfig {
  type: string;
  emoji: string;
  title: string;
  hint: string;
  /**
   * Vidéo dédiée à l'étape. Aujourd'hui toutes pointent vers la même
   * `Intégration_Tuita_tuita.mp4` ; quand la prod livrera des vidéos par
   * étape il suffira de remplacer les chemins ci-dessous.
   */
  video: string;
  /**
   * `true` UNIQUEMENT pour les pièces d'identité physiques où le format
   * recto + verso justifie deux photos prises au téléphone, fusionnées en un
   * PDF mono-fichier côté client (cf. `IdentityFileFusionService`).
   *
   * ⚠️  NE JAMAIS activer ce flag sur un document administratif (KBIS, extrait
   * INPI, URSSAF, RC, RIB, attestations…). Ces documents DOIVENT atteindre le
   * backend bit-pour-bit identiques à l'original — QR codes, signatures, hash
   * provider, EXIF — pour préserver l'authenticité forensique en cas de
   * litige ou tentative de fraude. Une refonte client casse cette chaîne.
   */
  twoSided?: boolean;
  /**
   * Bloc complémentaire affiché DANS LA MÊME étape, à côté du bloc principal,
   * comme dropzone optionnelle toujours visible (pas de gate oui/non —
   * règle UX low-literacy : zéro question intermédiaire entre l'artisan et
   * l'action). Cas d'usage : assurances pro où la RC Pro est obligatoire
   * (bloc principal) et la décennale est optionnelle (bloc secondaire). Les
   * deux types sont distincts côté backend (`rc` vs `assurance_decennale`).
   */
  secondary?: {
    /** Type backend du document secondaire (ex: `assurance_decennale`). */
    type: string;
    /** Titre du bloc secondaire (distinct du titre principal). */
    title: string;
    /** Hint sous le titre, court et concret (pas de jargon juridique). */
    hint: string;
    /** Phrase de réassurance affichée comme micro-badge "bonus". */
    badgeHint: string;
  };
  /**
   * Étape « saisie manuelle » au lieu d'un upload de document. Utilisé pour le
   * RIB : depuis 2026-05-13 le contractor tape Titulaire / IBAN / BIC dans un
   * formulaire (cf. `PATCH /contractor-compliance/profile/bank-details`) — plus de
   * PDF à fournir, plus d'OCR à passer. Quand cette clé est définie, le
   * template rend le formulaire à la place de la dropzone.
   */
  formStep?: 'bank_details';
  /**
   * Lien externe affiché sous la vidéo du tutoriel. Cas URSSAF : on ne sait
   * pas récupérer l'attestation pour l'artisan (pas de provider type Pappers),
   * donc on le pousse vers la page officielle urssaf.fr. S'ouvre dans un
   * nouvel onglet — ne ferme pas le dialog, l'artisan revient déposer son PDF
   * ensuite.
   */
  helpLink?: {
    url: string;
    label: string;
  };
}

/**
 * Variantes de pièce d'identité proposées dans le step CNI.
 *
 * L'artisan choisit visuellement (cartes) laquelle il a sous la main. Chaque
 * variante détermine deux choses au moment de l'upload :
 *   1. Le `type` envoyé au backend (slug de `DocumentType`).
 *   2. Si on déclenche le flow recto/verso (2 photos fusionnées en PDF via
 *      `IdentityFileFusionService`) ou un upload single-shot.
 *
 * L'équivalence légale entre ces types est gérée côté backend dans
 * `ContractorDashboardController::DOCUMENT_TYPE_ALIASES` — uploader un
 * passeport satisfait la requirement `cni` (et inversement).
 *
 * UX cible (artisans BTP, faible littératie) : grosses cartes, icône
 * Material reconnaissable d'un coup d'œil, label court, sous-titre 1 ligne.
 * Voir feedback mémoire `feedback_ux_low_literacy_artisans.md`.
 *
 * Pour ajouter une 3ème variante (ex: titre de séjour) :
 *   1. Câbler le pipeline OCR côté backend (cf. en-tête de `DocumentType`)
 *   2. Étendre `DOCUMENT_TYPE_ALIASES` côté backend (symétrique des 2 sens)
 *   3. Ajouter une entrée dans la liste ci-dessous — l'UI suit automatiquement
 */
interface IdentityVariant {
  /** Slug backend (doit exister dans `App\Enums\DocumentType`). */
  type: string;
  /** Libellé de la carte, court et reconnaissable. */
  label: string;
  /** Sous-titre 1 ligne — précise la pièce sans jargon. */
  hint: string;
  /** Icône Material affichée en gros dans la carte. */
  matIcon: string;
  /**
   * `true` → flow recto + verso (2 photos, fusion PDF côté client).
   * `false` → 1 seule photo (passeport : la page avec le visage suffit).
   */
  twoSided: boolean;
}

const IDENTITY_VARIANTS: readonly IdentityVariant[] = [
  {
    type: 'cni',
    label: "Carte d'identité",
    hint: 'Ta pièce d\'identité.',
    matIcon: 'badge',
    twoSided: true,
  },
  {
    type: 'passport',
    label: 'Passeport',
    hint: 'La page avec ta photo.',
    matIcon: 'menu_book',
    twoSided: false,
  },
];

/**
 * Variantes de justificatif d'immatriculation proposées dans le step KBIS.
 *
 * Trois formats légaux co-existent en France selon l'historique de la boîte :
 *   - **Extrait INPI (RNE)** : nouveau format depuis 2023 (Guichet unique INPI).
 *     Sert TOUTES les formes juridiques (société + auto-entrepreneur). Format
 *     officiel principal aujourd'hui — celui qu'on pousse à l'achat 9,99 €.
 *   - **Kbis** : ancien format Infogreffe pour les sociétés (SARL, SAS, EURL…).
 *     Plus délivré en certifié par Pappers (seuls greffiers/Infogreffe peuvent).
 *     Toujours accepté en BDD pour rétrocompat — l'artisan qui en a un valide
 *     l'uploade tel quel.
 *   - **Avis SIRENE (INSEE)** : avis de situation, sert souvent pour les
 *     auto-entrepreneurs / micro-entrepreneurs qui n'ont pas de Kbis.
 *
 * Côté backend OCR, les 3 slugs sont aliasés (cf.
 * `OcrPromptRegistry::TYPE_ALIASES`, `OcrDocumentRules::evaluate()`) — uploader
 * l'un satisfait la requirement `kbis`. Côté UX, on doit montrer les 3 cartes
 * pour qu'un artisan reconnaisse visuellement le papier qu'il a sous la main
 * (règle low-literacy : zéro phrase technique « KBIS, avis SIRENE ou extrait
 * INPI — au choix » qui suppose qu'il connaît les 3 termes).
 *
 * Aucune variante n'est `twoSided` — c'est toujours un PDF officiel single-shot.
 */
const IMMATRICULATION_VARIANTS: readonly IdentityVariant[] = [
  {
    type: 'extrait_inpi',
    label: 'Extrait INPI',
    hint: 'Le nouveau format officiel (RNE, depuis 2023).',
    matIcon: 'verified',
    twoSided: false,
  },
  {
    type: 'kbis',
    label: 'Kbis',
    hint: 'L\'ancien format Infogreffe (sociétés).',
    matIcon: 'description',
    twoSided: false,
  },
  {
    type: 'avis_sirene',
    label: 'Avis SIRENE',
    hint: 'L\'avis INSEE (souvent pour les auto-entrepreneurs).',
    matIcon: 'badge',
    twoSided: false,
  },
];

/**
 * Map step.config.type → liste de variantes à proposer. Vide si le step n'a
 * pas de sélecteur (URSSAF, RC, RIB — un seul format possible).
 *
 * Ajouter une nouvelle entrée ici suffit à activer le picker pour ce step ;
 * l'UI suit automatiquement (template @if showIdentityVariantPicker()).
 */
const VARIANTS_BY_STEP_TYPE: Record<string, readonly IdentityVariant[]> = {
  cni: IDENTITY_VARIANTS,
  kbis: IMMATRICULATION_VARIANTS,
};

/**
 * Tous les slugs backend qu'un step peut accepter. Pour un step à variantes,
 * ce sont les slugs de toutes les cartes. Sinon, juste le slug canonique.
 *
 * Pourquoi cette fonction existe : le dashboard renvoie une DocumentRequirement
 * par slug uploadé (extrait_inpi OU kbis OU avis_sirene), pas une par step.
 * Sans expansion, lookup direct par cfg.type rate quand l'artisan a uploadé
 * une variante autre que le slug canonique (cas réel : INPI sur step 'kbis').
 */
function getRequirementTypesForStep(cfgType: string): readonly string[] {
  const variants = VARIANTS_BY_STEP_TYPE[cfgType];
  if (variants && variants.length > 0) {
    return variants.map((v) => v.type);
  }
  return [cfgType];
}

/**
 * Verdict frontend rendu à l'utilisateur après un upload. Distinct du
 * status backend brut : on regroupe les 8 statuts DocumentStatus en 4
 * familles UX (succès / erreur / info bleue / attente grise).
 *
 *   - 'verified'  → succès vert, auto-advance
 *   - 'rejected'  → erreur rouge, l'artisan doit réessayer
 *   - 'info'      → information neutre (ex: doc deja a jour)
 *   - 'pending'   → traitement en cours (OCR, revue manuelle)
 */
export interface UploadVerdict {
  type: 'verified' | 'rejected' | 'info' | 'pending';
  message: string;
  code?: string | null;
}

/**
 * Map un status backend DocumentStatus + failure_detail vers un UploadVerdict
 * UX. Source unique de mapping back→front — toute nouvelle valeur de
 * DocumentStatus doit etre ajoutee ici sinon l'artisan ne verra rien
 * (silence bug observe 2026-05-18 sur status='superseded').
 *
 * Le backend renvoie failure_detail en FR (cf. OcrDocumentRules + setFailure
 * de ProcessOcrJob). On l'utilise tel quel quand present, sinon fallback FR
 * cote front pour ne JAMAIS laisser l'utilisateur sans feedback.
 */
export function interpretUploadStatus(
  status: string | undefined | null,
  failureDetail?: string | null,
  failureReason?: string | null,
): UploadVerdict {
  const detail = failureDetail?.trim() || null;
  const code = failureReason?.trim() || null;
  switch (status) {
    case 'verified':
      return { type: 'verified', message: 'Document validé !', code };
    case 'rejected':
      return {
        type: 'rejected',
        message:
          detail
          ?? 'Le document a été refusé. Vérifie qu\'il est bien lisible et réessaie.',
        code,
      };
    case 'expired':
      return {
        type: 'rejected',
        message:
          detail
          ?? 'Ce document est expiré. Téléverse une version à jour.',
        code: code ?? 'document_expired',
      };
    case 'legally_outdated':
      return {
        type: 'rejected',
        message:
          detail
          ?? 'Ce document est trop ancien pour être accepté. Téléverse une version récente.',
        code: code ?? 'document_legally_outdated',
      };
    case 'superseded':
      return {
        type: 'info',
        message:
          detail
          ?? 'Tu as déjà une version plus récente de ce document — on garde la plus récente.',
        code: code ?? 'document_superseded',
      };
    case 'pending':
    case 'processing':
      return {
        type: 'pending',
        message: 'On vérifie ton document…',
        code: code ?? null,
      };
    case 'pending_manual_review':
      return {
        type: 'pending',
        message:
          detail
          ?? 'Document reçu, en cours de vérification manuelle. Tu recevras un email dès qu\'il est validé.',
        code: code ?? 'document_pending_manual_review',
      };
    default:
      // Filet de sécurité : un nouveau statut backend non encore mappé ne
      // doit jamais produire de silence côté UX. On affiche un message
      // générique mais on remonte le code pour qu'il apparaisse dans la
      // console interceptor (debug support).
      return {
        type: 'pending',
        message: detail ?? 'Document reçu, en cours de traitement.',
        code: code ?? (status ? `unknown_status:${status}` : 'unknown_status'),
      };
  }
}

/**
 * Sélectionne la "meilleure" requirement pour un step parmi ses variantes
 * acceptées. Priorité : verified > processing > pending > rejected > expired.
 * Permet au step d'être marqué `done` dès qu'UNE variante est verified.
 */
function pickBestRequirementForStep(
  cfgType: string,
  byType: Map<string, DocumentRequirement>,
): DocumentRequirement | null {
  const STATUS_PRIORITY: readonly string[] = [
    'verified',
    'processing',
    'pending',
    'rejected',
    'expired',
  ];
  const fallback = STATUS_PRIORITY.length;
  let best: DocumentRequirement | null = null;
  let bestRank = fallback;
  for (const slug of getRequirementTypesForStep(cfgType)) {
    const r = byType.get(slug);
    if (!r) continue;
    const rank = STATUS_PRIORITY.indexOf(r.status ?? '');
    const effective = rank === -1 ? fallback : rank;
    if (effective < bestRank) {
      best = r;
      bestRank = effective;
    }
  }
  return best;
}

/**
 * Une vidéo dédiée par papier (4-6s chacune, fade in/out). L'artisan voit
 * uniquement la portion qui le concerne au moment où il la regarde.
 *
 * Découpées depuis la vidéo maître `Intégration_Tuita_tuita.mp4` via
 * `tuita-video-gen/split_chapters.py` (timestamps ancrés sur les silences
 * détectés dans la voix-off).
 */
const STEP_VIDEO_BY_TYPE: Record<string, string> = {
  cni:    'assets/videos/onboarding-doc-cni.mp4',
  kbis:   'assets/videos/onboarding-doc-kbis.mp4',
  // Vidéo dédiée 28 s qui explique pas-à-pas les 3 parcours (AE / indép /
  // employeur) pour aller chercher l'attestation sur urssaf.fr. Remplace
  // l'ancien clip court de 4 s qui ne faisait que mentionner le papier.
  urssaf: 'assets/videos/onboarding-doc-urssaf-howto.mp4',
  assurance_decennale: 'assets/videos/onboarding-doc-rc.mp4',
  rib:    'assets/videos/onboarding-doc-rib.mp4',
};

/**
 * Ordre fixe des étapes — pensé pour l'artisan :
 *   1. Identité d'abord (débloque tout le reste, dont le KYC)
 *   2. Immatriculation (push achat 9,99 € au bon moment, livraison 30 s)
 *   3. URSSAF (souvent à demander → skip facile, reprend plus tard)
 *   4. Assurances : RC Pro (obligatoire) + décennale BTP optionnelle dans le
 *      même step — la décennale est derrière un gate oui/non, c'est un doc
 *      DISTINCT de la RC Pro (art. 1792 CC, couvre 10 ans post-réception).
 *   5. RIB (le plus simple → sentiment d'accomplissement final)
 *
 * Les types qui n'apparaissent pas dans cette liste sont ignorés du stepper —
 * gérés en page `/documents` classique pour les cas avancés (statuts, qualibat,
 * RC pro complète...).
 */
const STEP_ORDER: StepConfig[] = [
  {
    type: 'cni',
    emoji: '🪪',
    title: 'Ta pièce d\'identité',
    hint: 'Prends une photo du recto et une du verso de ta CNI.',
    video: STEP_VIDEO_BY_TYPE['cni'],
    twoSided: true,
  },
  {
    // 3 formats légaux co-existent (extrait INPI / Kbis / avis SIRENE) — cf.
    // `IMMATRICULATION_VARIANTS`. L'artisan choisit visuellement la carte qui
    // correspond au papier qu'il a, on bascule alors le type backend envoyé.
    type: 'kbis',
    emoji: '📋',
    title: 'Ton justificatif d\'immatriculation',
    hint: 'Choisis le papier que tu as sous la main.',
    video: STEP_VIDEO_BY_TYPE['kbis'],
  },
  {
    type: 'urssaf',
    emoji: '🏛️',
    title: 'Ton attestation URSSAF',
    hint: 'L\'attestation de vigilance, datée de <strong>moins de 6 mois</strong>.',
    video: STEP_VIDEO_BY_TYPE['urssaf'],
    helpLink: {
      url: 'https://www.urssaf.fr/accueil/independant/gerer-developper-activite/obtenir-attestation.html',
      label: 'Voir comment l\'obtenir sur urssaf.fr',
    },
  },
  {
    // Bloc principal = RC Pro (obligatoire). La garantie décennale est dans
    // le `secondary` ci-dessous, dropzone toujours visible (pas de gate oui/non).
    // Deux documents DISTINCTS côté backend (`rc` vs `assurance_decennale`).
    type: 'rc',
    emoji: '🛡️',
    title: 'Tes assurances pro',
    hint: 'Ta RC Pro est obligatoire. Si tu as aussi une décennale BTP, ajoute-la à droite - c\'est un bonus.',
    video: STEP_VIDEO_BY_TYPE['assurance_decennale'],
    secondary: {
      type: 'assurance_decennale',
      title: 'Décennale BTP',
      hint: 'Couvre tes chantiers 10 ans après livraison. Optionnelle.',
      badgeHint: 'Booste ton score.',
    },
  },
  {
    // Plus d'upload de RIB depuis 2026-05-13. Le contractor saisit Titulaire /
    // IBAN / BIC dans un formulaire — backend valide format + checksum + cross-
    // check vs identité KYC (anti-fraude virement vers un tiers).
    type: 'rib',
    emoji: '💳',
    title: 'Tes coordonnées bancaires',
    hint: 'Saisis le compte sur lequel tu veux être payé. Tu dois en être le titulaire.',
    video: STEP_VIDEO_BY_TYPE['rib'],
    formStep: 'bank_details',
  },
];

const SKIP_STORAGE_KEY = 'tuita.upload-stepper.skipped';

/**
 * Clés des steps dont la vidéo a déjà été regardée en mode popup au moins une
 * fois. Persiste entre sessions (localStorage) — l'idée est de respecter
 * l'artisan : si on lui a ouvert la même vidéo de force et qu'il l'a fermée,
 * on n'a aucune raison de la lui re-pousser au prochain passage sur le step.
 * Le bouton « Revoir la vidéo » reste disponible côté template — c'est lui
 * qui décide quand re-regarder. Stocké sous forme de tableau de slugs
 * (`step.config.type`) plutôt que d'index, pour rester stable si l'ordre des
 * étapes évolue (`STEP_ORDER`).
 */
const WATCHED_VIDEOS_STORAGE_KEY = 'tuita.upload-stepper.videos-watched';

interface StepView {
  config: StepConfig;
  requirement: DocumentRequirement | null;
  index: number;
  total: number;
  done: boolean;
  rejected: boolean;
  skipped: boolean;
  /** Doc verified mais qui expire dans ≤ 30 j — à renouveler. */
  expiringSoon: boolean;
  /**
   * Doc déjà expiré (status='expired'). Inclus dans `rejected` pour la
   * sémantique « step pas validé » mais distingué ici pour afficher
   * l'icône horloge dans le dot — l'artisan doit comprendre « à renouveler »,
   * pas « rejet OCR à corriger ».
   */
  expired: boolean;
}

/**
 * Stepper d'upload guidé — affiché au contractor pendant l'onboarding pour
 * remplacer la page `/documents` qui présente tout en même temps. Une étape
 * à la fois, une vidéo en haut, une grosse zone de dépôt au centre, deux
 * boutons d'action en bas. Volontairement minimaliste.
 *
 * Reprise : à chaque visite, on saute aux étapes dont le doc est déjà
 * `verified` côté backend (les marque ✓). On peut aussi "passer pour l'instant"
 * — la décision est mémorisée en localStorage le temps de la session.
 */
@Component({
  selector: 'app-onboarding-upload-stepper',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './onboarding-upload-stepper.component.html',
  styleUrl: './onboarding-upload-stepper.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingUploadStepperComponent implements OnInit {
  private readonly session = inject(ContractorSessionService);
  private readonly api = inject(ContractorApiService);
  private readonly fusion = inject(IdentityFileFusionService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pricing = inject(PricingService);
  // FIX-027 — Injecté ici pour précharger OpenCV en arrière-plan dès que
  // l'artisan choisit CNI/passeport (cf. `selectIdentityVariant`).
  private readonly scanner = inject(DocumentScannerService);

  /** Prix unitaire d'un justificatif d'immatriculation officiel (extrait INPI). */
  extraitInpiPriceLabel(): string {
    return this.pricing.priceLabelFor('extrait_inpi');
  }

  readonly dashboard = toSignal<ContractorDashboard | null>(this.session.dashboard$, {
    initialValue: null,
  });

  /** Index de l'étape courante (0..STEP_ORDER.length). */
  readonly currentIndex = signal<number>(0);

  /** Upload en cours sur cette étape. */
  readonly isUploading = signal<boolean>(false);

  /**
   * Récupération du document officiel en cours côté backend après paiement
   * Stripe — le job `ProcessDocumentPurchase` tourne en async sur Horizon, on
   * poll le dashboard jusqu'à voir l'étape courante passer en `verified`
   * (typiquement < 10 s) ou timeout. Tant que c'est `true`, on remplace la
   * dropzone par une bannière « 🕐 Récupération en cours » pour éviter que
   * l'artisan re-déclenche un upload manuel inutile.
   */
  readonly isPurchasePolling = signal<boolean>(false);

  /** Handle du setInterval de polling (nettoyé sur destroy + sur arrêt). */
  private purchasePollHandle: ReturnType<typeof setInterval> | null = null;

  /** Dernier verdict reçu (pour afficher succès/échec sur l'étape courante). */
  readonly lastVerdict = signal<UploadVerdict | null>(null);

  /**
   * Verdict spécifique au dernier upload du bloc secondaire (séparé du
   * verdict principal pour ne pas mélanger les retours). Reset au
   * changement d'étape.
   */
  readonly secondaryVerdict = signal<UploadVerdict | null>(null);

  /** Upload en cours sur le bloc secondaire (distinct du principal). */
  readonly isUploadingSecondary = signal<boolean>(false);

  /**
   * Status du document secondaire calculé depuis le dashboard (ex: décennale
   * VERIFIED après upload réussi). Permet d'afficher un badge "✓ ajouté"
   * dans le bloc secondaire au lieu de la dropzone.
   */
  readonly secondaryStatus = computed<string | null>(() => {
    const sec = this.currentStep()?.config.secondary;
    if (!sec) return null;
    const items = this.dashboard()?.documents?.items ?? [];
    return items.find((it) => it.type === sec.type)?.status ?? null;
  });

  readonly secondaryDone = computed<boolean>(() => this.secondaryStatus() === 'verified');

  /**
   * `true` si la décennale a été auto-dérivée de la RC Pro `rc_complete` du
   * contractor (le backend a cloné le PDF de la RC vers un Document
   * `assurance_decennale` VERIFIED). On affiche alors « Incluse dans votre RC
   * Pro ✓ » au lieu de « Décennale ajoutée ✓ » — l'artisan n'a rien uploadé,
   * c'est la même attestation qui couvre les deux garanties.
   */
  readonly secondaryDerivedFromRc = computed<boolean>(() => {
    const sec = this.currentStep()?.config.secondary;
    if (!sec) return false;
    const items = this.dashboard()?.documents?.items ?? [];
    const item = items.find((it) => it.type === sec.type);
    return !!item?.derived_from_rc_complete;
  });

  // ---------------------------------------------------------------------------
  // Saisie manuelle RIB (formStep === 'bank_details')
  //
  // Le contractor saisit Titulaire / IBAN / BIC dans un formulaire. Le backend
  // valide format + checksum mod-97 + cross-check titulaire vs identité KYC.
  // L'idée pédagogique : un seul écran, gros champs, hint sous chaque input,
  // bouton « Enregistrer » qui passe l'étape une fois validée côté serveur.
  // ---------------------------------------------------------------------------

  readonly bankHolder = signal<string>('');
  readonly bankIban = signal<string>('');
  readonly bankBic = signal<string>('');
  readonly isSavingBankDetails = signal<boolean>(false);
  /**
   * Erreurs renvoyées par le backend, mappées sur les 3 champs. Vide quand la
   * saisie est encore propre. Reset à chaque tentative de submit + à chaque
   * changement d'étape (`resetStepLocalState`).
   */
  readonly bankErrors = signal<{ account_holder?: string; iban?: string; bic?: string }>({});
  /**
   * Flag d'hydratation : on copie le dashboard dans les signaux une seule
   * fois par session pour ne pas écraser ce que l'artisan est en train de
   * taper si le polling du dashboard rafraîchit en cours de saisie.
   */
  private bankFormHydrated = false;

  /** Pré-remplit le formulaire depuis le dashboard si le contractor a déjà
   * sauvegardé ses coordonnées (ex: il revient sur l'étape après l'avoir
   * skippée puis terminée plus tard). */
  private hydrateBankFormFromDashboard(): void {
    if (this.bankFormHydrated) return;
    const bd = this.dashboard()?.bank_details;
    if (!bd) return;
    if (bd.account_holder) this.bankHolder.set(bd.account_holder);
    if (bd.iban) this.bankIban.set(bd.iban);
    if (bd.bic) this.bankBic.set(bd.bic);
    this.bankFormHydrated = true;
  }

  readonly canSubmitBankDetails = computed<boolean>(() => {
    return (
      this.bankHolder().trim().length >= 2 &&
      this.bankIban().replace(/\s+/g, '').length >= 14 &&
      this.bankBic().replace(/\s+/g, '').length >= 8 &&
      !this.isSavingBankDetails()
    );
  });

  submitBankDetails(): void {
    if (!this.canSubmitBankDetails()) return;
    this.isSavingBankDetails.set(true);
    this.bankErrors.set({});

    this.api
      .updateBankDetails({
        account_holder: this.bankHolder().trim(),
        iban: this.bankIban().trim(),
        bic: this.bankBic().trim(),
      })
      .subscribe({
        next: () => {
          this.isSavingBankDetails.set(false);
          this.session.refreshDashboard();
          this.snack.open('✓ Coordonnées enregistrées - étape suivante...', '', {
            duration: 2500,
            panelClass: ['tuita-snackbar', 'snack-success'],
          });
          this.cancelPendingAdvance();
          this.advanceTimer = setTimeout(() => {
            this.advanceTimer = null;
            this.advance();
          }, 1200);
        },
        error: (err: unknown) => {
          this.isSavingBankDetails.set(false);
          const e = err as {
            error?: {
              errors?: Record<string, string[]>;
              error?: { message?: string };
              message?: string;
            };
          };
          const fieldErrors = e?.error?.errors ?? {};
          this.bankErrors.set({
            account_holder: fieldErrors['account_holder']?.[0],
            iban: fieldErrors['iban']?.[0],
            bic: fieldErrors['bic']?.[0],
          });
          const generic =
            e?.error?.error?.message ??
            e?.error?.message ??
            'Impossible d\'enregistrer. Vérifie tes saisies.';
          this.snack.open(generic, 'OK', {
            duration: 6000,
            panelClass: ['tuita-snackbar', 'snack-error'],
          });
        },
      });
  }

  /**
   * Timer du auto-advance après un upload réussi. Conservé pour pouvoir
   * l'annuler si l'utilisateur navigue manuellement (Précédent / Suivant /
   * clic pastille) ou si le composant est détruit avant l'expiration.
   */
  private advanceTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Index du dernier step pour lequel l'auto-open de la vidéo a été déclenché.
   * Garde anti double-dispatch : l'effect peut tirer plusieurs fois pour le
   * même step (init + setup des signaux source). Une vraie navigation change
   * `step.index` → l'effect ré-ouvre légitimement.
   */
  private lastAutoOpenedStepIndex = -1;

  /**
   * Slugs (`step.config.type`) dont la vidéo a déjà été ouverte en popup au
   * moins une fois. Hydraté depuis localStorage au démarrage, persiste à
   * chaque fermeture de dialog. Utilisé par l'effect d'auto-open pour
   * éviter de re-pousser la même vidéo à chaque ré-entrée sur le step.
   */
  private readonly watchedVideoTypes = this.loadWatchedVideoTypes();

  constructor() {
    this.destroyRef.onDestroy(() => this.cancelPendingAdvance());

    // Auto-open du dialog vidéo à la première entrée sur un step donné. Si
    // l'artisan a déjà fermé cette vidéo une fois (state persisté en
    // localStorage), on ne re-pousse plus le popup — il peut toujours la
    // revoir manuellement via le bouton « Revoir la vidéo ». Le bouton
    // « J'ai compris » reste disabled jusqu'à la fin de la lecture
    // (forceWatch=true) la première fois.
    effect(() => {
      const step = this.currentStep();
      if (!step || step.index === this.lastAutoOpenedStepIndex) return;
      this.lastAutoOpenedStepIndex = step.index;
      if (this.watchedVideoTypes.has(step.config.type)) return;
      this.openVideoDialog(step, true);
    });

    // Hydrate les champs de saisie RIB depuis le dashboard quand on entre sur
    // l'étape. Idempotent (`bankFormHydrated`) → pas d'écrasement pendant la
    // saisie en cours si le dashboard se rafraîchit.
    effect(() => {
      const step = this.currentStep();
      if (step?.config.formStep === 'bank_details') {
        this.hydrateBankFormFromDashboard();
      }
    });
  }

  private openVideoDialog(step: StepView, forceWatch: boolean): void {
    const data: OnboardingVideoDialogData = {
      videoUrl: step.config.video,
      stepTitle: step.config.title,
      stepNumber: step.index + 1,
      totalSteps: step.total,
      forceWatch,
      helpLink: step.config.helpLink,
    };
    const ref = this.dialog.open<
      OnboardingVideoDialogComponent,
      OnboardingVideoDialogData
    >(OnboardingVideoDialogComponent, {
      data,
      // Largeur gérée 100% en CSS (cf. styles.scss .onboarding-video-dialog) :
      // 100vw edge-to-edge mobile/tablette, capé à 880px centré sur desktop.
      // Si on impose width: '100vw' ici, le pane reste positionné comme 100vw
      // et le CSS qui le rétrécit le laisse plaqué à gauche au lieu de centrer.
      maxWidth: '100vw',
      panelClass: 'onboarding-video-dialog',
      disableClose: true,
      autoFocus: false,
      restoreFocus: true,
    });
    // Une fois la vidéo fermée (lecture finie, sortie de secours × ou bouton
    // « J'ai compris »), on retient que l'artisan l'a vue → plus d'auto-open
    // sur ce step. Le bouton « Revoir la vidéo » reste son seul moyen de la
    // ré-ouvrir ensuite.
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.markVideoWatched(step.config.type));
  }

  private loadWatchedVideoTypes(): Set<string> {
    try {
      const raw = localStorage.getItem(WATCHED_VIDEOS_STORAGE_KEY);
      if (!raw) return new Set<string>();
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed)
        ? new Set(parsed.filter((v): v is string => typeof v === 'string'))
        : new Set<string>();
    } catch {
      return new Set<string>();
    }
  }

  private markVideoWatched(stepType: string): void {
    if (this.watchedVideoTypes.has(stepType)) return;
    this.watchedVideoTypes.add(stepType);
    try {
      localStorage.setItem(
        WATCHED_VIDEOS_STORAGE_KEY,
        JSON.stringify([...this.watchedVideoTypes]),
      );
    } catch {
      // localStorage indisponible (quota, mode privé Safari…) — non bloquant,
      // l'artisan reverra juste la vidéo au prochain démarrage.
    }
  }

  /** Ré-ouvre le dialog vidéo à la demande (bouton « Revoir la vidéo »).
   * Bouton « J'ai compris » actif d'emblée — l'artisan a déjà passé le gate. */
  replayVideoModal(): void {
    const step = this.currentStep();
    if (step) {
      this.openVideoDialog(step, false);
    }
  }

  private cancelPendingAdvance(): void {
    if (this.advanceTimer !== null) {
      clearTimeout(this.advanceTimer);
      this.advanceTimer = null;
    }
  }

  // --- Slots recto / verso (uniquement utilisés par les steps `twoSided`). ---
  /** Photo du recto (côté visage de la CNI). */
  readonly rectoFile = signal<File | null>(null);
  /** Photo du verso (côté MRZ `<<<` de la CNI). */
  readonly versoFile = signal<File | null>(null);
  /**
   * Mode capture guidée : un seul tap sur « Prendre mes 2 photos » ouvre la
   * caméra recto, puis enchaîne automatiquement la caméra verso dès que la
   * première photo est prise. Sur desktop, le file picker s'ouvre en cascade
   * de la même façon (capture est ignoré, mais le chaînage reste utile).
   */
  private guidedCaptureActive = false;

  readonly canSubmitTwoSided = computed<boolean>(
    () => this.rectoFile() !== null && this.versoFile() !== null,
  );

  /** Set des types skippés cette session (localStorage). */
  private readonly skippedTypes = signal<Set<string>>(new Set(this.loadSkipped()));

  readonly steps = computed<StepView[]>(() => {
    const items = this.dashboard()?.documents?.items ?? [];
    const byType = new Map<string, DocumentRequirement>();
    for (const it of items) {
      byType.set(it.type, it);
    }
    const bankDetails = this.dashboard()?.bank_details ?? null;
    const bankFilled = !!(
      bankDetails?.account_holder &&
      bankDetails?.iban &&
      bankDetails?.bic
    );
    const skipped = this.skippedTypes();
    return STEP_ORDER.map((cfg, i) => {
      // Étape « saisie manuelle » (RIB) : pas de DocumentRequirement côté
      // backend. Le « done » dépend uniquement de la présence des 3 champs
      // sur la Company. Pas de notion d'expiration ni de rejet OCR.
      if (cfg.formStep === 'bank_details') {
        return {
          config: cfg,
          requirement: null,
          index: i,
          total: STEP_ORDER.length,
          done: bankFilled,
          rejected: false,
          skipped: skipped.has(cfg.type),
          expiringSoon: false,
          expired: false,
        };
      }
      // Un step peut accepter plusieurs slugs backend (cf.
      // VARIANTS_BY_STEP_TYPE : cni|passport, extrait_inpi|kbis|avis_sirene).
      // On prend la "meilleure" requirement parmi les variantes : verified >
      // processing > pending > rejected > expired > missing. Sans cette
      // agrégation, uploader un extrait INPI laisse byType.get('kbis') à null
      // et le step "Immatriculation" reste éternellement à 'missing'.
      const req = pickBestRequirementForStep(cfg.type, byType);
      const status = req?.status ?? 'missing';
      const days = req?.days_until_expiry;
      const expiringSoon =
        status === 'verified' && days !== null && days !== undefined && days <= 30;
      return {
        config: cfg,
        requirement: req,
        index: i,
        total: STEP_ORDER.length,
        done: status === 'verified',
        rejected: status === 'rejected' || status === 'expired',
        skipped: skipped.has(cfg.type),
        expiringSoon,
        expired: status === 'expired',
      };
    });
  });

  readonly currentStep = computed<StepView | null>(() => {
    return this.steps()[this.currentIndex()] ?? null;
  });

  /** Étape courante = saisie manuelle RIB (formulaire 3 champs). */
  readonly isCurrentBankDetailsStep = computed<boolean>(() => {
    return this.currentStep()?.config.formStep === 'bank_details';
  });

  /** Tous les steps faits ? */
  readonly allDone = computed<boolean>(() => {
    return this.steps().every((s) => s.done);
  });

  /**
   * Le document de l'étape courante est `verified` mais expire dans
   * ≤ 30 j → l'artisan vient renouveler. On lui montre la dropzone
   * (et plus le message « rien à refaire ») pour qu'il puisse uploader
   * la version à jour directement.
   */
  readonly currentStepIsExpiring = computed<boolean>(() => {
    const step = this.currentStep();
    const req = step?.requirement;
    if (!req || req.status !== 'verified') return false;
    const days = req.days_until_expiry;
    return days !== null && days !== undefined && days <= 30;
  });

  /** Nb de jours avant expiration du doc de l'étape courante (ou null). */
  readonly currentStepDaysUntilExpiry = computed<number | null>(() => {
    return this.currentStep()?.requirement?.days_until_expiry ?? null;
  });

  /** Le doc de l'étape courante a déjà expiré (status='expired'). */
  readonly currentStepExpired = computed<boolean>(() => {
    return this.currentStep()?.requirement?.status === 'expired';
  });

  /**
   * Mode « remplacer » activé manuellement par l'artisan sur l'étape
   * courante (changement de RIB, MAJ KBIS, etc.). Permet de révéler la
   * dropzone même quand le doc est déjà `verified` et non-expirant.
   * Se réinitialise à chaque changement d'étape (cf. `resetStepLocalState`).
   */
  readonly replaceMode = signal<boolean>(false);

  toggleReplaceMode(): void {
    this.replaceMode.update((v) => !v);
  }

  // ---------------------------------------------------------------------------
  // Variantes de step (CNI/Passeport, extrait INPI/Kbis/avis SIRENE, …).
  // Pilotées par la map `VARIANTS_BY_STEP_TYPE` — un step a un picker dès qu'il
  // y figure. Ajouter une entrée à la map suffit à activer le sélecteur (UI +
  // routing du type backend), aucun code spécifique par step.
  // ---------------------------------------------------------------------------

  /**
   * Liste de variantes pour le step COURANT (ou tableau vide si pas de picker).
   * Exposée au template pour boucler dessus.
   */
  readonly identityVariants = computed<readonly IdentityVariant[]>(() => {
    const type = this.currentStep()?.config.type;
    return type ? (VARIANTS_BY_STEP_TYPE[type] ?? []) : [];
  });

  /**
   * Variante choisie par l'artisan sur le step courant. `null` tant qu'il n'a
   * pas cliqué sur une carte → on affiche le sélecteur, pas la zone d'upload.
   * Réinitialisé à chaque changement d'étape (cf. `resetStepLocalState`).
   */
  readonly identityVariant = signal<IdentityVariant | null>(null);

  /**
   * `true` si on doit afficher le sélecteur de variante plutôt que la zone
   * d'upload. Vrai dès que le step courant a une liste de variantes ET que
   * l'artisan n'a pas encore choisi.
   */
  readonly showIdentityVariantPicker = computed<boolean>(() => {
    return this.identityVariants().length > 0 && this.identityVariant() === null;
  });

  /**
   * Type backend à envoyer pour l'upload du step courant.
   *
   * Quand le step propose des variantes (CNI, immatriculation), retourne le
   * type de la variante choisie. Sinon, retombe sur le `type` du step.
   */
  readonly currentUploadType = computed<string>(() => {
    const step = this.currentStep();
    if (!step) return '';
    const selected = this.identityVariant();
    if (selected && this.identityVariants().length > 0) {
      return selected.type;
    }
    return step.config.type;
  });

  /**
   * `true` quand on doit afficher le pipeline « 1 photo guidée + scanner
   * jscanify » (cas passeport : page photo/MRZ, single-shot mais l'artisan
   * la prend au téléphone donc on a besoin de la caméra arrière + auto-crop).
   * N'apparaît QUE sur le step pièce d'identité (`cni`), pas sur les
   * variantes d'immatriculation (KBIS / extrait INPI / avis SIRENE) qui
   * restent en dropzone bit-pour-bit (intégrité forensique des docs admin).
   */
  readonly currentSingleShotIdentity = computed<boolean>(() => {
    const step = this.currentStep();
    if (!step || step.config.type !== 'cni') return false;
    const selected = this.identityVariant();
    return selected !== null && !selected.twoSided;
  });

  /**
   * `true` si le step courant utilise le flow recto/verso (2 photos fusionnées
   * en PDF côté client). Sur les steps à variantes, dépend de la variante
   * sélectionnée (passeport = 1 seule photo, on bypass la fusion).
   */
  readonly currentTwoSided = computed<boolean>(() => {
    const step = this.currentStep();
    if (!step) return false;
    const selected = this.identityVariant();
    if (selected && this.identityVariants().length > 0) {
      return selected.twoSided;
    }
    return step.config.twoSided ?? false;
  });

  /**
   * L'artisan clique sur une carte de variante. Reset les slots recto/verso
   * pour qu'un changement d'avis ne mélange pas une photo de CNI avec un
   * passeport sélectionné après coup.
   *
   * FIX-027 v2 — Préchargement BYTES-ONLY OpenCV.js sans forcer la compile
   * WASM (qui bloque le main thread 2-30 s). On utilise `<link rel="prefetch">`
   * pour mettre les bytes en cache navigateur pendant que l'artisan lit la
   * page et prend sa photo. La compile WASM se fera au moment réel d'usage
   * dans le dialog scanner — mais en partant du cache disque, c'est 5-10×
   * plus rapide qu'un download+compile depuis zéro.
   *
   * Le `loadEngine()` (qui DÉCLENCHE la compile) reste appelé uniquement
   * dans le dialog scanner ngOnInit, avec un état 'loading' visible et un
   * fallback "envoyer telle quelle" si jamais ça traîne.
   */
  selectIdentityVariant(variant: IdentityVariant): void {
    this.identityVariant.set(variant);
    this.lastVerdict.set(null);
    this.rectoFile.set(null);
    this.versoFile.set(null);

    // Préchargement BYTES-ONLY (link prefetch) — n'évalue PAS le script,
    // ne déclenche PAS la compile WASM. Pas de freeze main thread.
    this.scanner.prefetchOpencvScript();
  }

  /**
   * Retour au sélecteur de variante depuis l'écran d'upload — utile si
   * l'artisan a cliqué sur la mauvaise carte.
   */
  clearIdentityVariant(): void {
    this.identityVariant.set(null);
    this.rectoFile.set(null);
    this.versoFile.set(null);
    this.lastVerdict.set(null);
  }

  /**
   * Date d'expiration formatée FR (jj/mm/aaaa) pour l'étape courante.
   * Permet à l'artisan de vérifier visuellement quel document on parle.
   */
  readonly currentStepExpiryDateLabel = computed<string | null>(() => {
    const iso = this.currentStep()?.requirement?.expires_at;
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  });

  ngOnInit(): void {
    // Nettoyage du polling d'achat Pappers si le composant est détruit
    // pendant qu'un setInterval tourne (navigation, hot reload, etc.).
    this.destroyRef.onDestroy(() => this.stopPurchasePolling());

    // Resume : à l'ARRIVÉE UNIQUEMENT, jump à la première étape non-faite
    // (en sautant celles déjà skippées cette session). Si tout est validé,
    // on enchaîne direct sur le KYC.
    //
    // ⚠️  Ne PAS rejouer ce calcul sur les émissions suivantes : un upload
    // déclenche `refreshDashboard()` → nouvelle émission → si on
    // re-positionnait `currentIndex` ici, l'artisan qui upload sur l'étape 3
    // serait téléporté sur l'étape 1 dès qu'un rejet revient.
    let resumed = false;
    this.session.dashboard$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (resumed || !this.dashboard()) return;
        resumed = true;
        // Si au moins un doc verified expire dans les 30 j, on NE redirige
        // pas — l'artisan vient justement renouveler une pièce. Le stepper
        // doit rester ouvert pour qu'il puisse re-uploader la version à jour.
        const items = this.dashboard()?.documents?.items ?? [];
        const hasExpiringSoon = items.some(
          (it) =>
            it.status === 'verified' &&
            it.days_until_expiry !== null &&
            it.days_until_expiry !== undefined &&
            it.days_until_expiry <= 30,
        );
        if (this.allDone() && !hasExpiringSoon) {
          // Tous les documents sont validés. Deux cas :
          //   1. Le KYC vidéo n'est pas encore approuvé → on enchaîne sur /kyc
          //      (cas onboarding initial : docs OK, identité à faire ensuite).
          //   2. Le KYC est déjà approved → l'artisan est entièrement à jour,
          //      le router-link "Mes documents" du dashboard l'a juste amené
          //      ici pour gérer ses pièces. Pas de raison de le téléporter
          //      vers /kyc déjà validé. On le renvoie sur le dashboard avec
          //      un mot rassurant.
          const kycStatus = this.dashboard()?.kyc?.status;
          if (kycStatus === 'approved') {
            // Pas de snackbar ici : ouvrir un toast en plein cycle de routing
            // (synchrone, juste avant `router.navigate`) déclenche un
            // ExpressionChangedAfterItHasBeenCheckedError sur le
            // `MatSnackBarContainer`. La navigation vers /dashboard suffit
            // comme confirmation visuelle pour l'artisan.
            void this.router.navigate(['/dashboard']);
            return;
          }
          void this.router.navigate(['/kyc']);
          return;
        }
        const firstPending = this.steps().findIndex((s) => !s.done && !s.skipped);
        const firstAtAll = this.steps().findIndex((s) => !s.done);
        // Si rien à uploader mais un doc expire bientôt, on positionne le
        // stepper directement sur ce doc — l'artisan vient pour ça.
        const firstExpiring = this.steps().findIndex(
          (s) =>
            s.requirement?.status === 'verified' &&
            s.requirement.days_until_expiry !== null &&
            s.requirement.days_until_expiry !== undefined &&
            s.requirement.days_until_expiry <= 30,
        );
        const target =
          firstPending !== -1 ? firstPending
          : firstAtAll !== -1 ? firstAtAll
          : firstExpiring !== -1 ? firstExpiring
          : 0;
        this.currentIndex.set(target);
      });
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    if (this.isUploading()) return;
    const file = ev.dataTransfer?.files?.[0];
    if (file) this.upload(file);
  }

  onDragOver(ev: DragEvent): void {
    ev.preventDefault();
  }

  onFileSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.upload(file);
    input.value = '';
  }

  private upload(file: File): void {
    const step = this.currentStep();
    if (!step) return;

    this.isUploading.set(true);
    this.lastVerdict.set(null);
    // currentUploadType() honore la variante CNI/passeport choisie par l'artisan
    // sur le step pièce d'identité. Sur les autres steps, retombe sur step.config.type.
    this.dispatchUploadCall(file, this.currentUploadType());
  }

  /**
   * Workflow recto + verso (CNI). Fusionne deux photos prises au téléphone en
   * un PDF mono-fichier puis enchaîne sur l'upload classique. La fusion ne
   * s'applique QU'aux pièces d'identité — les documents administratifs
   * doivent rester bit-pour-bit identiques à l'original (cf. `StepConfig.twoSided`).
   */
  async submitTwoSided(): Promise<void> {
    const recto = this.rectoFile();
    const verso = this.versoFile();
    const step = this.currentStep();
    if (!recto || !verso || !step) return;

    this.isUploading.set(true);
    this.lastVerdict.set(null);

    let merged: File;
    try {
      merged = await this.fusion.fuseToPdf([recto, verso]);
    } catch (err: unknown) {
      this.isUploading.set(false);
      const msg = err instanceof Error
        ? err.message
        : 'Impossible de préparer le document. Réessaie avec deux photos prises à l\'instant.';
      this.lastVerdict.set({ type: 'rejected', message: msg });
      return;
    }

    this.dispatchUploadCall(merged, this.currentUploadType());
  }

  /**
   * Chemin alternatif sur la step CNI : l'artisan possède déjà un fichier
   * scanné (PDF ou image) avec recto + verso ensemble — pas besoin de re-prendre
   * deux photos. Le fichier est envoyé bit-pour-bit au backend, AUCUNE fusion
   * ni re-encodage côté client (préserve les métadonnées scanner, signatures
   * électroniques éventuelles, intégrité forensique).
   */
  async submitDirectFile(file: File): Promise<void> {
    const step = this.currentStep();
    if (!step) return;

    const isPdf = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');
    if (!isPdf && !isImage) {
      this.lastVerdict.set({
        type: 'rejected',
        message: 'Format non supporté. Utilise un PDF ou une image.',
      });
      return;
    }

    // P1-6 — garde taille fichier (10 Mo max côté backend).
    if (!this.guardFileSize(file)) {
      return;
    }

    // Le mode "fichier complet" remplace les éventuelles photos déjà déposées
    // dans les slots recto/verso — pas de mix entre les deux pipelines.
    this.rectoFile.set(null);
    this.versoFile.set(null);

    this.isUploading.set(true);
    this.lastVerdict.set(null);
    this.dispatchUploadCall(file, this.currentUploadType());
  }

  /**
   * Passeport — capture caméra single-shot guidée. L'artisan tape sur la
   * dropzone, son téléphone ouvre la caméra arrière (via `capture="environment"`),
   * il photographie la page avec sa photo + MRZ, jscanify détecte les 4 coins
   * et redresse la perspective. Au "Valider" du dialog scanner, on enchaîne
   * directement sur l'upload — pas besoin d'un bouton « Envoyer » séparé
   * comme pour la CNI recto/verso (1 seul fichier, validation visuelle déjà
   * faite dans le scanner). Sur PDF ou si le scanner est indispo, fallback
   * bit-pour-bit comme partout ailleurs.
   */
  async onPassportFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;

    if (!this.guardFileSize(file)) return;

    let processed: File | null = file;
    if (file.type.startsWith('image/')) {
      processed = await this.runScanner(file, 'passeport');
    }
    if (processed === null) return;

    this.isUploading.set(true);
    this.lastVerdict.set(null);
    this.dispatchUploadCall(processed, this.currentUploadType());
  }

  /** Handler `<input type="file">` du chemin alternatif (PDF / scan complet). */
  onDirectFileSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.submitDirectFile(file);
  }

  /**
   * Sélectionne ou remplace un slot recto/verso. Chaque slot accepte une seule
   * image — un nouvel upload remplace silencieusement le précédent.
   *
   * Pour les images (cas dominant : photo prise au téléphone), on passe
   * d'abord par le scanner client jscanify qui détecte les 4 coins du
   * document, redresse la perspective et exporte un JPEG propre. L'artisan
   * peut ajuster les coins à la main si la détection auto rate. PDF déjà
   * fournis (cas rare ici, mais possible via `submitDirectFile`) ne sont
   * jamais altérés — règle bit-pour-bit pour les docs admin.
   */
  async onSlotFile(side: 'recto' | 'verso', ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    // Reset immédiatement pour permettre la re-sélection du même fichier.
    input.value = '';

    if (!file) {
      if (side === 'recto') this.rectoFile.set(null);
      else this.versoFile.set(null);
      return;
    }

    // P1-6 — garde taille AVANT scanner/fusion : si l'iPhone livre un ProRAW
    // de 25 Mo, autant le dire tout de suite à l'artisan plutôt que de faire
    // tourner OpenCV dessus pour rien.
    if (!this.guardFileSize(file)) {
      if (side === 'recto') this.rectoFile.set(null);
      else this.versoFile.set(null);
      this.guidedCaptureActive = false;
      return;
    }

    let processed: File | null = file;
    if (file.type.startsWith('image/')) {
      processed = await this.runScanner(file, side === 'recto' ? 'Recto' : 'Verso');
    }
    if (processed === null) {
      // Utilisateur a annulé → on vide le slot et coupe le chaînage guidé,
      // sinon on lui ouvre la caméra verso alors que le recto n'est pas posé.
      if (side === 'recto') this.rectoFile.set(null);
      else this.versoFile.set(null);
      this.guidedCaptureActive = false;
      return;
    }

    if (side === 'recto') this.rectoFile.set(processed);
    else this.versoFile.set(processed);

    // Chaînage guidé : si l'artisan a démarré le mode « 2 photos d'un coup »
    // et vient de prendre le recto, on ouvre automatiquement la caméra verso.
    if (this.guidedCaptureActive && side === 'recto') {
      this.guidedCaptureActive = false;
      this.snack.open('Maintenant le verso (côté chevrons <<<)', '', {
        duration: 2500,
        panelClass: ['tuita-snackbar'],
      });
      // Petit délai pour laisser le snackbar apparaître + l'input verso être
      // prêt après le change event recto. setTimeout(0) suffit en général,
      // mais on laisse 250 ms pour fluidité visuelle sur mobile.
      setTimeout(() => this.triggerVersoCapture(), 250);
    }
  }

  /**
   * P1-6 — Garde stricte sur la taille des fichiers uploadés.
   *
   * Refuse silencieusement (avec snackbar explicite) tout fichier > 10 Mo.
   * Sans ce check, le navigateur envoie quand même, nginx renvoie un 413
   * en clair → l'artisan voit « erreur réseau » et pense que c'est l'OCR
   * qui a planté. Mieux vaut un message proactif qui guide vers la solution
   * (reprendre la photo en JPEG normal, pas en ProRAW).
   *
   * @returns `true` si le fichier est sous la limite (upload autorisé).
   *          `false` après avoir affiché le snackbar (upload annulé).
   */
  private guardFileSize(file: File): boolean {
    if (file.size <= MAX_UPLOAD_BYTES) {
      return true;
    }
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    this.snack.open(
      `Fichier trop volumineux (${sizeMb} Mo). Limite : ${MAX_UPLOAD_MB_LABEL}. ` +
        'Reprends une photo en mode JPEG normal (désactive « ProRAW » sur iPhone).',
      'OK',
      { duration: 6000, panelClass: ['tuita-snackbar'] },
    );
    return false;
  }

  /**
   * Ouvre le scanner client (jscanify + OpenCV.js, lazy-load). Retourne :
   *   - le File rogné + redressé (JPEG) si validation utilisateur
   *   - le File original si l'utilisateur a choisi « envoyer telle quelle »
   *     (fallback, ex: scanner indisponible)
   *   - `null` si l'utilisateur a cliqué « reprendre la photo »
   */
  private async runScanner(file: File, label: string): Promise<File | null> {
    const ref = this.dialog.open<
      DocumentScannerDialogComponent,
      DocumentScannerDialogData,
      DocumentScannerDialogResult
    >(DocumentScannerDialogComponent, {
      data: { file, title: `Recadrer le ${label.toLowerCase()}` },
      panelClass: 'document-scanner-dialog-panel',
      maxWidth: '780px',
      width: '95vw',
      disableClose: true,
      autoFocus: false,
    });
    const result = await firstValueFrom(ref.afterClosed());
    if (!result || result === 'cancel') return null;
    if (result === 'fallback') return file;
    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([result.blob], `${baseName || 'photo'}-scan.jpg`, {
      type: 'image/jpeg',
    });
  }

  /**
   * Démarre la capture guidée : ouvre la caméra recto. Quand l'artisan prend
   * la photo, `onSlotFile('recto', ...)` enchaîne automatiquement sur la
   * caméra verso (cf. flag `guidedCaptureActive`).
   */
  startGuidedCapture(): void {
    if (this.isUploading()) return;
    this.guidedCaptureActive = true;
    this.triggerInputClick('rectoFileInput');
  }

  private triggerVersoCapture(): void {
    this.triggerInputClick('versoFileInput');
  }

  private triggerInputClick(testId: string): void {
    const el = document.querySelector<HTMLInputElement>(
      `input[data-testid="${testId}"]`,
    );
    el?.click();
  }

  clearSlot(side: 'recto' | 'verso'): void {
    if (side === 'recto') this.rectoFile.set(null);
    else this.versoFile.set(null);
  }

  /**
   * Met en forme une erreur d'upload pour l'artisan : message explicite +
   * code machine entre crochets quand le backend en fournit un. Sans ça il
   * voyait juste « Validation failed. » et n'avait aucun moyen de comprendre
   * que c'était par exemple le type de document qui était mal envoyé.
   */
  private formatUploadError(err: unknown): string {
    const e = err as {
      status?: number;
      error?: {
        message?: string;
        error?: { code?: string; message?: string };
        errors?: Record<string, string[]>;
      };
    };
    const status = e?.status;
    const body = e?.error;
    const apiErr = body?.error;

    const code = apiErr?.code ?? null;
    const codedMessage = apiErr?.message ?? null;

    // Erreurs de validation Laravel (422) — on aplatit les messages champ par
    // champ pour que l'artisan voie « type : la valeur est invalide ».
    // On NE montre PAS le code machine [validation_failed] à l'user : il est
    // déjà loggé en console (cf. error.interceptor.ts) pour le support.
    const fieldErrors = body?.errors;
    if (fieldErrors && typeof fieldErrors === 'object') {
      const flat = Object.entries(fieldErrors)
        .map(([field, msgs]) => `${field} : ${(msgs ?? []).join(', ')}`)
        .join(' • ');
      if (flat) {
        return flat;
      }
    }

    // FIX-042 — Sur erreur serveur 5xx : on N'AFFICHE JAMAIS le message brut
    // backend ("Internal server error", stack traces, etc.) à l'artisan.
    // Le contractor voit un message FR clair "côté technique, pas de ta faute".
    // Le détail technique reste loggé en console (cf. error.interceptor.ts)
    // pour que le support puisse investiguer via le correlation_id.
    if (status !== undefined && status >= 500) {
      return 'Erreur côté Tuita - pas de ta faute. Réessaie dans un instant. Si ça persiste, contacte le support.';
    }

    // Microcopy user-facing : on retourne UNIQUEMENT le message FR du backend,
    // sans préfixer par le code machine entre crochets. Le code reste
    // disponible dans `code` côté composant pour faire du routing UX (CTA
    // contextuel), mais l'artisan ne voit jamais un identifiant technique.
    if (codedMessage) {
      return codedMessage;
    }
    if (body?.message) {
      // Pour 4xx on garde le message backend (Laravel l'a déjà francisé sur
      // notre code via ApiException) mais on NE met PAS de "(HTTP XXX)"
      // suffix — pas de friction technique côté artisan.
      return body.message;
    }
    return status && status >= 500
      ? 'Erreur côté Tuita - pas de ta faute. Réessaie dans un instant.'
      : 'L\'envoi a échoué. Réessaie dans un instant.';
  }

  private dispatchUploadCall(file: File, type: string, target: 'primary' | 'secondary' = 'primary'): void {
    const setUploading = target === 'primary' ? this.isUploading : this.isUploadingSecondary;
    const setVerdict = target === 'primary' ? this.lastVerdict : this.secondaryVerdict;

    this.api.uploadDocument(file, type).subscribe({
      next: (res: unknown) => {
        setUploading.set(false);
        const r = res as {
          data?: {
            status?: string;
            failure_detail?: string;
            failure_reason?: string;
            document?: { status?: string; failure_detail?: string; failure_reason?: string };
          };
          status?: string;
          failure_detail?: string;
          failure_reason?: string;
        };
        const doc = r?.data?.document;
        const status = doc?.status ?? r?.data?.status ?? r?.status;
        const detail = doc?.failure_detail ?? r?.data?.failure_detail ?? r?.failure_detail;
        const reason = doc?.failure_reason ?? r?.data?.failure_reason ?? r?.failure_reason;
        const verdict = interpretUploadStatus(status, detail, reason);
        setVerdict.set(verdict);

        if (verdict.type === 'verified') {
          // Auto-advance UNIQUEMENT pour le bloc principal — un upload
          // secondaire (ex: décennale) ne change pas d'étape, l'artisan
          // doit cliquer "Suivant" lui-même.
          if (target === 'primary') {
            // ⚠️ Garde anti court-circuit du bloc bonus : si l'étape a un
            // `secondary` (ex: décennale) pas encore VERIFIED, on n'auto-avance
            // PAS. Sinon l'artisan rate la dropzone bonus à côté et la décennale
            // est perdue — un badge `decennale_verified` en moins et des
            // missions gros œuvre bloquées côté tuita.fr.
            const step = this.currentStep();
            const hasUnresolvedSecondary =
              !!step?.config.secondary && !this.secondaryDone();

            if (hasUnresolvedSecondary) {
              this.snack.open(
                '✓ RC Pro validée - ajoute ta décennale à droite, ou clique Suivant.',
                '',
                {
                  duration: 5000,
                  panelClass: ['tuita-snackbar', 'snack-success'],
                },
              );
              this.session.refreshDashboard();
            } else {
              this.snack.open('✓ Document validé - étape suivante...', '', {
                duration: 2500,
                panelClass: ['tuita-snackbar', 'snack-success'],
              });
              this.session.refreshDashboard();
              this.cancelPendingAdvance();
              this.advanceTimer = setTimeout(() => {
                this.advanceTimer = null;
                this.advance();
              }, 1500);
            }
          } else {
            this.snack.open('✓ Décennale ajoutée à ton dossier !', '', {
              duration: 2500,
              panelClass: ['tuita-snackbar', 'snack-success'],
            });
            this.session.refreshDashboard();
          }
        } else if (verdict.type === 'rejected') {
          // Microcopy user-facing : on n'expose PAS le code machine `reason`
          // dans le message visible. Il est conservé sur le verdict pour
          // la console interceptor (debug support).
          this.snack.open(verdict.message, 'OK', {
            duration: 8000,
            panelClass: ['tuita-snackbar', 'snack-error'],
          });
          this.session.refreshDashboard();
        } else if (verdict.type === 'info') {
          // Cas neutre (ex: superseded — version plus récente déjà en base).
          // On ne bloque pas l'artisan, on l'informe et on refresh pour qu'il
          // voie le ✓ de l'étape passer.
          this.snack.open(verdict.message, '', {
            duration: 5000,
            panelClass: ['tuita-snackbar'],
          });
          this.session.refreshDashboard();
        } else {
          // verdict.type === 'pending' : OCR en cours / revue manuelle.
          // L'artisan voit le banner verdict + on refresh le dashboard pour
          // que l'étape se mette à jour quand le worker aura traité.
          this.snack.open(verdict.message, '', {
            duration: 4000,
            panelClass: ['tuita-snackbar'],
          });
          this.session.refreshDashboard();
        }
      },
      error: (err: unknown) => {
        setUploading.set(false);
        const msg = this.formatUploadError(err);
        setVerdict.set({ type: 'rejected', message: msg });
        this.snack.open(msg, 'OK', {
          duration: 8000,
          panelClass: ['tuita-snackbar', 'snack-error'],
        });
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Bloc secondaire (ex: décennale dans le step assurances)
  // ---------------------------------------------------------------------------

  onSecondaryFileSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const sec = this.currentStep()?.config.secondary;
    if (!sec) return;
    this.isUploadingSecondary.set(true);
    this.secondaryVerdict.set(null);
    this.dispatchUploadCall(file, sec.type, 'secondary');
  }

  onSecondaryDrop(ev: DragEvent): void {
    ev.preventDefault();
    if (this.isUploadingSecondary()) return;
    const file = ev.dataTransfer?.files?.[0];
    if (!file) return;
    const sec = this.currentStep()?.config.secondary;
    if (!sec) return;
    this.isUploadingSecondary.set(true);
    this.secondaryVerdict.set(null);
    this.dispatchUploadCall(file, sec.type, 'secondary');
  }

  /**
   * Bouton "Récupérer l'officiel — 9,99 €" sur l'étape immatriculation.
   * Réutilise le dialog d'achat existant qui gère SIREN + Stripe Checkout.
   */
  openPurchase(): void {
    const step = this.currentStep();
    if (!step) return;
    const sessionSiren = this.dashboard()?.contractor?.siren ?? null;

    const ref = this.dialog.open<
      DocumentQuickActionsDialogComponent,
      QuickActionsDialogData,
      QuickActionsResult
    >(DocumentQuickActionsDialogComponent, {
      data: {
        siren: sessionSiren,
        existingDoc: null,
      },
      width: '760px',
      maxWidth: '94vw',
      autoFocus: false,
      restoreFocus: true,
      disableClose: true,
      panelClass: 'quick-actions-dialog-panel',
    });
    ref.afterClosed().subscribe((result) => {
      if (result?.action === 'purchase') {
        this.runPurchase(result.docType, result.siren);
      }
    });
  }

  /**
   * Lance l'achat officiel : appel `purchaseDocument` → ouvre Stripe Embedded
   * Checkout. Au succès, refresh le dashboard — le doc arrivera VERIFIED via
   * Pappers et l'étape sera marquée ✓ automatiquement par le polling implicite
   * du dashboard.
   */
  private runPurchase(docType: 'extrait_inpi' | 'kbis' | 'avis_sirene', siren: string): void {
    const cleanSiren = (siren ?? '').replace(/\s+/g, '');
    if (!/^\d{9}$/.test(cleanSiren)) {
      this.snack.open('SIREN invalide - vérifie les 9 chiffres.', 'OK', {
        duration: 6000,
        panelClass: ['tuita-snackbar', 'snack-error'],
      });
      return;
    }

    this.api.purchaseDocument(docType, cleanSiren).subscribe({
      next: (res: unknown) => {
        const data = (res as { data?: { embedded_checkout?: { client_secret?: string; publishable_key?: string } } })?.data ?? {};
        const embedded = data.embedded_checkout;
        if (embedded?.client_secret && embedded?.publishable_key) {
          this.openStripeDialog(embedded.client_secret, embedded.publishable_key, docType);
          return;
        }
        // Dev / gratuit : la livraison tourne déjà côté backend.
        this.session.refreshDashboard();
        this.snack.open('Document en cours de récupération...', '', {
          duration: 4000,
          panelClass: ['tuita-snackbar'],
        });
      },
      error: (err: unknown) => {
        const message =
          (err as { error?: { error?: { message?: string } } })?.error?.error?.message ??
          "Erreur lors de l'achat. Réessaie dans un instant.";
        this.snack.open(message, 'OK', {
          duration: 8000,
          panelClass: ['tuita-snackbar', 'snack-error'],
        });
      },
    });
  }

  private openStripeDialog(
    clientSecret: string,
    publishableKey: string,
    docType: 'extrait_inpi' | 'kbis' | 'avis_sirene',
  ): void {
    const labels: Record<typeof docType, string> = {
      extrait_inpi: "Extrait d'immatriculation officiel",
      kbis: 'KBIS',
      avis_sirene: 'Avis SIRENE',
    };
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
        title: `Paiement sécurisé - ${labels[docType]}`,
        subtitle: 'Confirmez votre achat pour lancer la délivrance du document officiel.',
      },
    });
    ref.afterClosed().subscribe((result) => {
      if (result?.status === 'complete') {
        // L'ancien verdict OCR (souvent `kbis_not_original` sur un upload
        // manuel antérieur) n'est plus pertinent — le contractor vient de
        // payer pour un PDF officiel Pappers qui bypasse l'OCR côté backend.
        // Sans ce reset, la bannière orange « Document refusé » reste à
        // l'écran et l'artisan croit avoir payé pour rien (incident 2026-05-14).
        this.lastVerdict.set(null);
        this.snack.open(
          'Paiement confirmé - récupération du document en cours...',
          '',
          { duration: 4000, panelClass: ['tuita-snackbar', 'snack-success'] },
        );
        // `ProcessDocumentPurchase` tourne en async sur Horizon : le doc
        // VERIFIED n'existe pas encore en BDD au moment où ce callback se
        // déclenche. On poll le dashboard jusqu'à voir l'étape passer en
        // `verified`, puis on auto-télécharge le PDF officiel pour fermer
        // proprement la boucle « j'ai payé → j'ai reçu mon document ».
        this.startPurchasePolling(docType);
      }
    });
  }

  /**
   * Lance le polling du dashboard après un paiement Stripe confirmé.
   *
   * Le job backend `ProcessDocumentPurchase` (Horizon, queue `documents`)
   * télécharge le PDF via Pappers, le chiffre, le stocke S3 puis crée un
   * `Document` en `VERIFIED` direct (bypass OCR, source officielle). Tout ça
   * prend typiquement 2-8 s mais peut grimper si Pappers est lent. On poll
   * toutes les 3 s pendant max 60 s, puis on rend la main au cas de timeout.
   *
   * Idempotent : un éventuel polling précédent est arrêté avant de relancer.
   */
  private startPurchasePolling(docType: 'extrait_inpi' | 'kbis' | 'avis_sirene'): void {
    this.stopPurchasePolling();
    this.isPurchasePolling.set(true);

    const POLL_INTERVAL_MS = 3000;
    const POLL_TIMEOUT_MS = 60_000;
    const targetType = this.currentStep()?.config.type ?? '';
    const startedAt = Date.now();

    // Refresh immédiat — sur un Pappers très rapide (~1 s), le doc peut déjà
    // être en BDD avant même le premier tick d'intervalle.
    this.session.refreshDashboard();

    this.purchasePollHandle = setInterval(() => {
      const step = this.steps().find((s) => s.config.type === targetType);
      if (step?.done) {
        this.stopPurchasePolling();
        this.triggerAutomaticDownload(step.requirement?.document_uuid ?? null, docType);
        return;
      }
      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        this.stopPurchasePolling();
        this.snack.open(
          "Toujours en cours côté serveur. Recharge la page dans une minute si rien n'a changé.",
          'OK',
          { duration: 8000, panelClass: ['tuita-snackbar', 'snack-warn'] },
        );
        return;
      }
      this.session.refreshDashboard();
    }, POLL_INTERVAL_MS);
  }

  /** Arrête le polling en cours (idempotent). Appelé sur succès, timeout, destroy. */
  private stopPurchasePolling(): void {
    if (this.purchasePollHandle !== null) {
      clearInterval(this.purchasePollHandle);
      this.purchasePollHandle = null;
    }
    this.isPurchasePolling.set(false);
  }

  /**
   * Déclenche le téléchargement automatique du PDF officiel dès que le doc
   * a atterri en BDD côté backend. L'artisan voit son extrait
   * s'ouvrir/se télécharger sans avoir à cliquer — feedback immédiat « j'ai
   * bien reçu mon document contre mes 9,99 € ». Fail-soft : si le download
   * échoue (ex. blob endpoint indisponible), on garde la confirmation
   * d'achat, le PDF reste accessible depuis l'onglet « Mes documents ».
   */
  private triggerAutomaticDownload(
    documentUuid: string | null,
    docType: 'extrait_inpi' | 'kbis' | 'avis_sirene',
  ): void {
    const labels: Record<typeof docType, string> = {
      extrait_inpi: "Extrait d'immatriculation officiel",
      kbis: 'KBIS',
      avis_sirene: 'Avis SIRENE',
    };
    this.snack.open(
      `${labels[docType]} reçu - téléchargement en cours...`,
      '',
      { duration: 4000, panelClass: ['tuita-snackbar', 'snack-success'] },
    );

    if (!documentUuid) {
      // Cas rare : dashboard pas encore enrichi avec le document_uuid (race
      // côté backend serializer). Skip silencieux — le doc est validé, le
      // contractor le retrouvera dans /documents.
      return;
    }

    this.api.downloadDocument(documentUuid).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${labels[docType]}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      },
      error: () => {
        // Fail-soft volontaire (cf. JSDoc). Pas de toast d'erreur — on ne
        // veut pas inquiéter l'artisan alors que le doc est livré + visible
        // dans /documents.
      },
    });
  }

  /** Petit helper template : seul l'extrait d'immatriculation est achetable au sens stepper. */
  isCurrentPurchasable(): boolean {
    const t = this.currentStep()?.config.type;
    return t === 'kbis' || t === 'extrait_inpi' || t === 'avis_sirene';
  }

  later(): void {
    const step = this.currentStep();
    if (!step) return;
    const next = new Set(this.skippedTypes());
    next.add(step.config.type);
    this.skippedTypes.set(next);
    this.persistSkipped(next);
    this.advance();
  }

  previous(): void {
    const i = this.currentIndex();
    if (i > 0) {
      this.currentIndex.set(i - 1);
      this.resetStepLocalState();
    }
  }

  next(): void {
    // Garde anti-bypass silencieux : si l'étape courante n'est PAS validée
    // (pas de doc uploadé / pas de RIB sauvegardé) ET pas encore skippée
    // explicitement, on refuse d'avancer en silence. L'artisan doit choisir :
    //   - déposer le document attendu (action principale)
    //   - OU cliquer « Je le ferai plus tard » pour skip volontaire
    //
    // Sans cette garde, un clic « Suivant » faisait avancer silencieusement
    // sans tracer le skip — l'artisan se retrouvait à la fin du stepper avec
    // une compliance KO sans comprendre pourquoi.
    const step = this.currentStep();
    if (step && !step.done && !this.skippedTypes().has(step.config.type)) {
      const docKind = step.config.type === 'cni'
        ? 'ta pièce d\'identité'
        : (step.config.type === 'bank' ? 'tes coordonnées bancaires' : 'le document');
      this.snack.open(
        `Pour avancer : dépose ${docKind} ou clique « Je le ferai plus tard » si tu ne l'as pas sous la main.`,
        'OK',
        {
          duration: 5000,
          panelClass: ['tuita-snackbar', 'snack-warn'],
        },
      );
      return;
    }
    this.advance();
  }

  private advance(): void {
    const i = this.currentIndex();
    const total = STEP_ORDER.length;
    if (i + 1 >= total) {
      // Fin du stepper. Garde dure : on ne redirige vers /kyc que si la CNI
      // est `verified`. Sans pièce d'identité validée, le KYC vidéo n'a pas
      // de photo de visage à comparer — la session échouerait côté backend.
      const cniStep = this.steps().find((s) => s.config.type === 'cni');
      if (!cniStep?.done) {
        const cniIndex = STEP_ORDER.findIndex((s) => s.type === 'cni');
        this.currentIndex.set(cniIndex >= 0 ? cniIndex : 0);
        this.resetStepLocalState();
        this.snack.open(
          'Dépose d\'abord ta pièce d\'identité - sans elle, on ne peut pas vérifier ton identité en vidéo.',
          'OK',
          {
            duration: 6000,
            panelClass: ['tuita-snackbar', 'snack-error'],
          },
        );
        return;
      }
      // Si le KYC est déjà approved (cas renouvellement / mise à jour
      // d'un doc expirant), pas de raison de re-rediriger vers /kyc qui
      // affichera « identité déjà vérifiée ». On revient sur le dashboard.
      const kycStatus = this.dashboard()?.kyc?.status;
      if (kycStatus === 'approved') {
        void this.router.navigate(['/dashboard']);
        return;
      }
      this.snack.open('Étape documents terminée - passons à l\'identité.', '', {
        duration: 3500,
        panelClass: ['tuita-snackbar', 'snack-success'],
      });
      void this.router.navigate(['/kyc']);
      return;
    }
    this.currentIndex.set(i + 1);
    this.resetStepLocalState();
  }

  /**
   * Indique si une étape est verrouillée pour la navigation directe.
   *
   * Règle : une étape est verrouillée si elle est devant l'étape courante
   * ET qu'une des étapes intermédiaires n'est ni `done` ni `skipped`.
   *
   * Utilisée par le template pour griser visuellement le dot + afficher
   * un cadenas. La méthode `goTo()` applique la même règle en runtime
   * (défense en profondeur — même si quelqu'un force le clic via devtools,
   * la nav est bloquée et un toast warn est affiché).
   *
   * Cf. BUG-013 + commentaire utilisateur 2026-05-13 (« le stepper doit
   * rester bloqué incrémentalement »).
   */
  isStepLocked(index: number): boolean {
    const currentIdx = this.currentIndex();
    // Reculer ou rester sur place : jamais verrouillé.
    if (index <= currentIdx) return false;

    // Avancer : on doit traverser toutes les étapes entre courante et cible.
    const allSteps = this.steps();
    for (let i = currentIdx; i < index; i++) {
      const s = allSteps[i];
      if (!s) continue;
      const isSkipped = this.skippedTypes().has(s.config.type);
      if (!s.done && !isSkipped) {
        return true;
      }
    }
    return false;
  }

  goTo(index: number): void {
    if (index < 0 || index >= STEP_ORDER.length) return;
    const currentIdx = this.currentIndex();

    // Reculer est TOUJOURS autorisé (l'artisan veut revoir une étape déjà
    // faite, corriger un upload, vérifier ce qu'il a déposé). On laisse
    // passer sans contrainte.
    if (index <= currentIdx) {
      this.currentIndex.set(index);
      this.resetStepLocalState();
      return;
    }

    // ════════════════════════════════════════════════════════════════════
    // GARDE — ordre d'avancement forcé (sécurité onboarding)
    // ════════════════════════════════════════════════════════════════════
    // Avancer N'EST autorisé QUE si toutes les étapes intermédiaires entre
    // la position actuelle et la cible sont soit `done` (validée), soit
    // `skipped` explicitement par l'artisan.
    //
    // Sans cette garde, l'artisan pouvait sauter à étape 5 RIB sans avoir
    // validé étape 1 CNI — ce qui ouvrait des failles de cross-check
    // (impossible de vérifier que le titulaire RIB correspond à l'identité
    // tant que la CNI n'est pas validée).
    //
    // Le backend tient aussi sa ligne (cf. ContractorProfileController::
    // updateBankDetails qui refuse RIB si pas de pièce d'identité
    // VERIFIED) — défense en profondeur.
    const allSteps = this.steps();
    for (let i = currentIdx; i < index; i++) {
      const s = allSteps[i];
      if (!s) continue;
      const isSkipped = this.skippedTypes().has(s.config.type);
      if (!s.done && !isSkipped) {
        const label = s.config.title ?? `Étape ${i + 1}`;
        this.snack.open(
          `Tu dois d'abord valider l'étape ${i + 1} - "${label}" - ou la skipper avec « Je le ferai plus tard ».`,
          'OK',
          {
            duration: 5500,
            panelClass: ['tuita-snackbar', 'snack-warn'],
          },
        );
        return;
      }
    }

    this.currentIndex.set(index);
    this.resetStepLocalState();
  }

  /**
   * Réinitialise l'état local lié à une étape (verdict + slots recto/verso).
   * Évite qu'un retour en arrière ne ré-affiche une vieille photo CNI ou un
   * verdict obsolète.
   */
  private resetStepLocalState(): void {
    this.cancelPendingAdvance();
    this.lastVerdict.set(null);
    this.rectoFile.set(null);
    this.versoFile.set(null);
    this.secondaryVerdict.set(null);
    this.isUploadingSecondary.set(false);
    this.replaceMode.set(false);
    this.identityVariant.set(null);
    // Bank form : on garde la valeur saisie (l'artisan peut revenir en
    // arrière et finir sa saisie). On reset uniquement les erreurs serveur
    // qui sont contextuelles à la dernière soumission.
    this.bankErrors.set({});
  }

  // ---------------------------------------------------------------------------
  // Persistence "skip cette session"
  // ---------------------------------------------------------------------------

  private loadSkipped(): string[] {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return [];
      const raw = window.localStorage.getItem(SKIP_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  private persistSkipped(set: Set<string>): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(SKIP_STORAGE_KEY, JSON.stringify([...set]));
    } catch {
      // Pas critique : on perd juste l'état "skip" au refresh.
    }
  }
}
