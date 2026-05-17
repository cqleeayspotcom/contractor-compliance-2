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
 * Limite stricte cÃ´tÃ© backend = 10 MB (nginx `client_max_body_size`). On
 * filtre cÃ´tÃ© client AVANT d'envoyer pour 2 raisons :
 *  (1) Ã©viter un 413 silencieux qui laisse l'artisan croire Ã  un bug OCR ;
 *  (2) ne pas faire tourner le scanner client (jscanify + OpenCV) ni la
 *      fusion PDF sur un fichier qu'on sait condamnÃ©.
 * On exprime la valeur en MB binaires (Mo = 1024Â²) â€” c'est ce que les API
 * banques/photos utilisent dans leurs hint UI, Ã§a matche les attentes.
 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_MB_LABEL = '10 Mo';

interface StepConfig {
  type: string;
  emoji: string;
  title: string;
  hint: string;
  /**
   * VidÃ©o dÃ©diÃ©e Ã  l'Ã©tape. Aujourd'hui toutes pointent vers la mÃªme
   * `IntÃ©gration_Tuita_tuita.mp4` ; quand la prod livrera des vidÃ©os par
   * Ã©tape il suffira de remplacer les chemins ci-dessous.
   */
  video: string;
  /**
   * `true` UNIQUEMENT pour les piÃ¨ces d'identitÃ© physiques oÃ¹ le format
   * recto + verso justifie deux photos prises au tÃ©lÃ©phone, fusionnÃ©es en un
   * PDF mono-fichier cÃ´tÃ© client (cf. `IdentityFileFusionService`).
   *
   * âš ï¸  NE JAMAIS activer ce flag sur un document administratif (KBIS, extrait
   * INPI, URSSAF, RC, RIB, attestationsâ€¦). Ces documents DOIVENT atteindre le
   * backend bit-pour-bit identiques Ã  l'original â€” QR codes, signatures, hash
   * provider, EXIF â€” pour prÃ©server l'authenticitÃ© forensique en cas de
   * litige ou tentative de fraude. Une refonte client casse cette chaÃ®ne.
   */
  twoSided?: boolean;
  /**
   * Bloc complÃ©mentaire affichÃ© DANS LA MÃŠME Ã©tape, Ã  cÃ´tÃ© du bloc principal,
   * comme dropzone optionnelle toujours visible (pas de gate oui/non â€”
   * rÃ¨gle UX low-literacy : zÃ©ro question intermÃ©diaire entre l'artisan et
   * l'action). Cas d'usage : assurances pro oÃ¹ la RC Pro est obligatoire
   * (bloc principal) et la dÃ©cennale est optionnelle (bloc secondaire). Les
   * deux types sont distincts cÃ´tÃ© backend (`rc` vs `assurance_decennale`).
   */
  secondary?: {
    /** Type backend du document secondaire (ex: `assurance_decennale`). */
    type: string;
    /** Titre du bloc secondaire (distinct du titre principal). */
    title: string;
    /** Hint sous le titre, court et concret (pas de jargon juridique). */
    hint: string;
    /** Phrase de rÃ©assurance affichÃ©e comme micro-badge "bonus". */
    badgeHint: string;
  };
  /**
   * Ã‰tape Â« saisie manuelle Â» au lieu d'un upload de document. UtilisÃ© pour le
   * RIB : depuis 2026-05-13 le contractor tape Titulaire / IBAN / BIC dans un
   * formulaire (cf. `PATCH /contractor-compliance/profile/bank-details`) â€” plus de
   * PDF Ã  fournir, plus d'OCR Ã  passer. Quand cette clÃ© est dÃ©finie, le
   * template rend le formulaire Ã  la place de la dropzone.
   */
  formStep?: 'bank_details';
  /**
   * Lien externe affichÃ© sous la vidÃ©o du tutoriel. Cas URSSAF : on ne sait
   * pas rÃ©cupÃ©rer l'attestation pour l'artisan (pas de provider type Pappers),
   * donc on le pousse vers la page officielle urssaf.fr. S'ouvre dans un
   * nouvel onglet â€” ne ferme pas le dialog, l'artisan revient dÃ©poser son PDF
   * ensuite.
   */
  helpLink?: {
    url: string;
    label: string;
  };
}

/**
 * Variantes de piÃ¨ce d'identitÃ© proposÃ©es dans le step CNI.
 *
 * L'artisan choisit visuellement (cartes) laquelle il a sous la main. Chaque
 * variante dÃ©termine deux choses au moment de l'upload :
 *   1. Le `type` envoyÃ© au backend (slug de `DocumentType`).
 *   2. Si on dÃ©clenche le flow recto/verso (2 photos fusionnÃ©es en PDF via
 *      `IdentityFileFusionService`) ou un upload single-shot.
 *
 * L'Ã©quivalence lÃ©gale entre ces types est gÃ©rÃ©e cÃ´tÃ© backend dans
 * `ContractorDashboardController::DOCUMENT_TYPE_ALIASES` â€” uploader un
 * passeport satisfait la requirement `cni` (et inversement).
 *
 * UX cible (artisans BTP, faible littÃ©ratie) : grosses cartes, icÃ´ne
 * Material reconnaissable d'un coup d'Å“il, label court, sous-titre 1 ligne.
 * Voir feedback mÃ©moire `feedback_ux_low_literacy_artisans.md`.
 *
 * Pour ajouter une 3Ã¨me variante (ex: titre de sÃ©jour) :
 *   1. CÃ¢bler le pipeline OCR cÃ´tÃ© backend (cf. en-tÃªte de `DocumentType`)
 *   2. Ã‰tendre `DOCUMENT_TYPE_ALIASES` cÃ´tÃ© backend (symÃ©trique des 2 sens)
 *   3. Ajouter une entrÃ©e dans la liste ci-dessous â€” l'UI suit automatiquement
 */
interface IdentityVariant {
  /** Slug backend (doit exister dans `App\Enums\DocumentType`). */
  type: string;
  /** LibellÃ© de la carte, court et reconnaissable. */
  label: string;
  /** Sous-titre 1 ligne â€” prÃ©cise la piÃ¨ce sans jargon. */
  hint: string;
  /** IcÃ´ne Material affichÃ©e en gros dans la carte. */
  matIcon: string;
  /**
   * `true` â†’ flow recto + verso (2 photos, fusion PDF cÃ´tÃ© client).
   * `false` â†’ 1 seule photo (passeport : la page avec le visage suffit).
   */
  twoSided: boolean;
}

const IDENTITY_VARIANTS: readonly IdentityVariant[] = [
  {
    type: 'cni',
    label: "Carte d'identitÃ©",
    hint: 'Ta piÃ¨ce d\'identitÃ©.',
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
 * Variantes de justificatif d'immatriculation proposÃ©es dans le step KBIS.
 *
 * Trois formats lÃ©gaux co-existent en France selon l'historique de la boÃ®te :
 *   - **Extrait INPI (RNE)** : nouveau format depuis 2023 (Guichet unique INPI).
 *     Sert TOUTES les formes juridiques (sociÃ©tÃ© + auto-entrepreneur). Format
 *     officiel principal aujourd'hui â€” celui qu'on pousse Ã  l'achat 9,99 â‚¬.
 *   - **Kbis** : ancien format Infogreffe pour les sociÃ©tÃ©s (SARL, SAS, EURLâ€¦).
 *     Plus dÃ©livrÃ© en certifiÃ© par Pappers (seuls greffiers/Infogreffe peuvent).
 *     Toujours acceptÃ© en BDD pour rÃ©trocompat â€” l'artisan qui en a un valide
 *     l'uploade tel quel.
 *   - **Avis SIRENE (INSEE)** : avis de situation, sert souvent pour les
 *     auto-entrepreneurs / micro-entrepreneurs qui n'ont pas de Kbis.
 *
 * CÃ´tÃ© backend OCR, les 3 slugs sont aliasÃ©s (cf.
 * `OcrPromptRegistry::TYPE_ALIASES`, `OcrDocumentRules::evaluate()`) â€” uploader
 * l'un satisfait la requirement `kbis`. CÃ´tÃ© UX, on doit montrer les 3 cartes
 * pour qu'un artisan reconnaisse visuellement le papier qu'il a sous la main
 * (rÃ¨gle low-literacy : zÃ©ro phrase technique Â« KBIS, avis SIRENE ou extrait
 * INPI â€” au choix Â» qui suppose qu'il connaÃ®t les 3 termes).
 *
 * Aucune variante n'est `twoSided` â€” c'est toujours un PDF officiel single-shot.
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
    hint: 'L\'ancien format Infogreffe (sociÃ©tÃ©s).',
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
 * Map step.config.type â†’ liste de variantes Ã  proposer. Vide si le step n'a
 * pas de sÃ©lecteur (URSSAF, RC, RIB â€” un seul format possible).
 *
 * Ajouter une nouvelle entrÃ©e ici suffit Ã  activer le picker pour ce step ;
 * l'UI suit automatiquement (template @if showIdentityVariantPicker()).
 */
const VARIANTS_BY_STEP_TYPE: Record<string, readonly IdentityVariant[]> = {
  cni: IDENTITY_VARIANTS,
  kbis: IMMATRICULATION_VARIANTS,
};

/**
 * Une vidÃ©o dÃ©diÃ©e par papier (4-6s chacune, fade in/out). L'artisan voit
 * uniquement la portion qui le concerne au moment oÃ¹ il la regarde.
 *
 * DÃ©coupÃ©es depuis la vidÃ©o maÃ®tre `IntÃ©gration_Tuita_tuita.mp4` via
 * `tuita-video-gen/split_chapters.py` (timestamps ancrÃ©s sur les silences
 * dÃ©tectÃ©s dans la voix-off).
 */
const STEP_VIDEO_BY_TYPE: Record<string, string> = {
  cni:    'assets/videos/onboarding-doc-cni.mp4',
  kbis:   'assets/videos/onboarding-doc-kbis.mp4',
  // VidÃ©o dÃ©diÃ©e 28 s qui explique pas-Ã -pas les 3 parcours (AE / indÃ©p /
  // employeur) pour aller chercher l'attestation sur urssaf.fr. Remplace
  // l'ancien clip court de 4 s qui ne faisait que mentionner le papier.
  urssaf: 'assets/videos/onboarding-doc-urssaf-howto.mp4',
  assurance_decennale: 'assets/videos/onboarding-doc-rc.mp4',
  rib:    'assets/videos/onboarding-doc-rib.mp4',
};

/**
 * Ordre fixe des Ã©tapes â€” pensÃ© pour l'artisan :
 *   1. IdentitÃ© d'abord (dÃ©bloque tout le reste, dont le KYC)
 *   2. Immatriculation (push achat 9,99 â‚¬ au bon moment, livraison 30 s)
 *   3. URSSAF (souvent Ã  demander â†’ skip facile, reprend plus tard)
 *   4. Assurances : RC Pro (obligatoire) + dÃ©cennale BTP optionnelle dans le
 *      mÃªme step â€” la dÃ©cennale est derriÃ¨re un gate oui/non, c'est un doc
 *      DISTINCT de la RC Pro (art. 1792 CC, couvre 10 ans post-rÃ©ception).
 *   5. RIB (le plus simple â†’ sentiment d'accomplissement final)
 *
 * Les types qui n'apparaissent pas dans cette liste sont ignorÃ©s du stepper â€”
 * gÃ©rÃ©s en page `/documents` classique pour les cas avancÃ©s (statuts, qualibat,
 * RC pro complÃ¨te...).
 */
const STEP_ORDER: StepConfig[] = [
  {
    type: 'cni',
    emoji: 'ðŸªª',
    title: 'Ta piÃ¨ce d\'identitÃ©',
    hint: 'Prends une photo du recto et une du verso de ta CNI.',
    video: STEP_VIDEO_BY_TYPE['cni'],
    twoSided: true,
  },
  {
    // 3 formats lÃ©gaux co-existent (extrait INPI / Kbis / avis SIRENE) â€” cf.
    // `IMMATRICULATION_VARIANTS`. L'artisan choisit visuellement la carte qui
    // correspond au papier qu'il a, on bascule alors le type backend envoyÃ©.
    type: 'kbis',
    emoji: 'ðŸ“‹',
    title: 'Ton justificatif d\'immatriculation',
    hint: 'Choisis le papier que tu as sous la main.',
    video: STEP_VIDEO_BY_TYPE['kbis'],
  },
  {
    type: 'urssaf',
    emoji: 'ðŸ›ï¸',
    title: 'Ton attestation URSSAF',
    hint: 'L\'attestation de vigilance, datÃ©e de <strong>moins de 6 mois</strong>.',
    video: STEP_VIDEO_BY_TYPE['urssaf'],
    helpLink: {
      url: 'https://www.urssaf.fr/accueil/independant/gerer-developper-activite/obtenir-attestation.html',
      label: 'Voir comment l\'obtenir sur urssaf.fr',
    },
  },
  {
    // Bloc principal = RC Pro (obligatoire). La garantie dÃ©cennale est dans
    // le `secondary` ci-dessous, dropzone toujours visible (pas de gate oui/non).
    // Deux documents DISTINCTS cÃ´tÃ© backend (`rc` vs `assurance_decennale`).
    type: 'rc',
    emoji: 'ðŸ›¡ï¸',
    title: 'Tes assurances pro',
    hint: 'Ta RC Pro est obligatoire. Si tu as aussi une dÃ©cennale BTP, ajoute-la Ã  droite - c\'est un bonus.',
    video: STEP_VIDEO_BY_TYPE['assurance_decennale'],
    secondary: {
      type: 'assurance_decennale',
      title: 'DÃ©cennale BTP',
      hint: 'Couvre tes chantiers 10 ans aprÃ¨s livraison. Optionnelle.',
      badgeHint: 'Booste ton score + badge Â« DÃ©cennale âœ“ Â» visible des donneurs d\'ordre.',
    },
  },
  {
    // Plus d'upload de RIB depuis 2026-05-13. Le contractor saisit Titulaire /
    // IBAN / BIC dans un formulaire â€” backend valide format + checksum + cross-
    // check vs identitÃ© KYC (anti-fraude virement vers un tiers).
    type: 'rib',
    emoji: 'ðŸ’³',
    title: 'Tes coordonnÃ©es bancaires',
    hint: 'Saisis le compte sur lequel tu veux Ãªtre payÃ©. Tu dois en Ãªtre le titulaire.',
    video: STEP_VIDEO_BY_TYPE['rib'],
    formStep: 'bank_details',
  },
];

const SKIP_STORAGE_KEY = 'tuita.upload-stepper.skipped';

/**
 * ClÃ©s des steps dont la vidÃ©o a dÃ©jÃ  Ã©tÃ© regardÃ©e en mode popup au moins une
 * fois. Persiste entre sessions (localStorage) â€” l'idÃ©e est de respecter
 * l'artisan : si on lui a ouvert la mÃªme vidÃ©o de force et qu'il l'a fermÃ©e,
 * on n'a aucune raison de la lui re-pousser au prochain passage sur le step.
 * Le bouton Â« Revoir la vidÃ©o Â» reste disponible cÃ´tÃ© template â€” c'est lui
 * qui dÃ©cide quand re-regarder. StockÃ© sous forme de tableau de slugs
 * (`step.config.type`) plutÃ´t que d'index, pour rester stable si l'ordre des
 * Ã©tapes Ã©volue (`STEP_ORDER`).
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
  /** Doc verified mais qui expire dans â‰¤ 30 j â€” Ã  renouveler. */
  expiringSoon: boolean;
  /**
   * Doc dÃ©jÃ  expirÃ© (status='expired'). Inclus dans `rejected` pour la
   * sÃ©mantique Â« step pas validÃ© Â» mais distinguÃ© ici pour afficher
   * l'icÃ´ne horloge dans le dot â€” l'artisan doit comprendre Â« Ã  renouveler Â»,
   * pas Â« rejet OCR Ã  corriger Â».
   */
  expired: boolean;
}

/**
 * Stepper d'upload guidÃ© â€” affichÃ© au contractor pendant l'onboarding pour
 * remplacer la page `/documents` qui prÃ©sente tout en mÃªme temps. Une Ã©tape
 * Ã  la fois, une vidÃ©o en haut, une grosse zone de dÃ©pÃ´t au centre, deux
 * boutons d'action en bas. Volontairement minimaliste.
 *
 * Reprise : Ã  chaque visite, on saute aux Ã©tapes dont le doc est dÃ©jÃ 
 * `verified` cÃ´tÃ© backend (les marque âœ“). On peut aussi "passer pour l'instant"
 * â€” la dÃ©cision est mÃ©morisÃ©e en localStorage le temps de la session.
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
  // FIX-027 â€” InjectÃ© ici pour prÃ©charger OpenCV en arriÃ¨re-plan dÃ¨s que
  // l'artisan choisit CNI/passeport (cf. `selectIdentityVariant`).
  private readonly scanner = inject(DocumentScannerService);

  /** Prix unitaire d'un justificatif d'immatriculation officiel (extrait INPI). */
  extraitInpiPriceLabel(): string {
    return this.pricing.priceLabelFor('extrait_inpi');
  }

  readonly dashboard = toSignal<ContractorDashboard | null>(this.session.dashboard$, {
    initialValue: null,
  });

  /** Index de l'Ã©tape courante (0..STEP_ORDER.length). */
  readonly currentIndex = signal<number>(0);

  /** Upload en cours sur cette Ã©tape. */
  readonly isUploading = signal<boolean>(false);

  /**
   * RÃ©cupÃ©ration du document officiel en cours cÃ´tÃ© backend aprÃ¨s paiement
   * Stripe â€” le job `ProcessDocumentPurchase` tourne en async sur Horizon, on
   * poll le dashboard jusqu'Ã  voir l'Ã©tape courante passer en `verified`
   * (typiquement < 10 s) ou timeout. Tant que c'est `true`, on remplace la
   * dropzone par une banniÃ¨re Â« ðŸ• RÃ©cupÃ©ration en cours Â» pour Ã©viter que
   * l'artisan re-dÃ©clenche un upload manuel inutile.
   */
  readonly isPurchasePolling = signal<boolean>(false);

  /** Handle du setInterval de polling (nettoyÃ© sur destroy + sur arrÃªt). */
  private purchasePollHandle: ReturnType<typeof setInterval> | null = null;

  /** Dernier verdict reÃ§u (pour afficher succÃ¨s/Ã©chec sur l'Ã©tape courante). */
  readonly lastVerdict = signal<{ type: 'verified' | 'rejected'; message: string; code?: string | null } | null>(null);

  /**
   * Verdict spÃ©cifique au dernier upload du bloc secondaire (sÃ©parÃ© du
   * verdict principal pour ne pas mÃ©langer les retours). Reset au
   * changement d'Ã©tape.
   */
  readonly secondaryVerdict = signal<{ type: 'verified' | 'rejected'; message: string; code?: string | null } | null>(null);

  /** Upload en cours sur le bloc secondaire (distinct du principal). */
  readonly isUploadingSecondary = signal<boolean>(false);

  /**
   * Status du document secondaire calculÃ© depuis le dashboard (ex: dÃ©cennale
   * VERIFIED aprÃ¨s upload rÃ©ussi). Permet d'afficher un badge "âœ“ ajoutÃ©"
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
   * `true` si la dÃ©cennale a Ã©tÃ© auto-dÃ©rivÃ©e de la RC Pro `rc_complete` du
   * contractor (le backend a clonÃ© le PDF de la RC vers un Document
   * `assurance_decennale` VERIFIED). On affiche alors Â« Incluse dans votre RC
   * Pro âœ“ Â» au lieu de Â« DÃ©cennale ajoutÃ©e âœ“ Â» â€” l'artisan n'a rien uploadÃ©,
   * c'est la mÃªme attestation qui couvre les deux garanties.
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
  // valide format + checksum mod-97 + cross-check titulaire vs identitÃ© KYC.
  // L'idÃ©e pÃ©dagogique : un seul Ã©cran, gros champs, hint sous chaque input,
  // bouton Â« Enregistrer Â» qui passe l'Ã©tape une fois validÃ©e cÃ´tÃ© serveur.
  // ---------------------------------------------------------------------------

  readonly bankHolder = signal<string>('');
  readonly bankIban = signal<string>('');
  readonly bankBic = signal<string>('');
  readonly isSavingBankDetails = signal<boolean>(false);
  /**
   * Erreurs renvoyÃ©es par le backend, mappÃ©es sur les 3 champs. Vide quand la
   * saisie est encore propre. Reset Ã  chaque tentative de submit + Ã  chaque
   * changement d'Ã©tape (`resetStepLocalState`).
   */
  readonly bankErrors = signal<{ account_holder?: string; iban?: string; bic?: string }>({});
  /**
   * Flag d'hydratation : on copie le dashboard dans les signaux une seule
   * fois par session pour ne pas Ã©craser ce que l'artisan est en train de
   * taper si le polling du dashboard rafraÃ®chit en cours de saisie.
   */
  private bankFormHydrated = false;

  /** PrÃ©-remplit le formulaire depuis le dashboard si le contractor a dÃ©jÃ 
   * sauvegardÃ© ses coordonnÃ©es (ex: il revient sur l'Ã©tape aprÃ¨s l'avoir
   * skippÃ©e puis terminÃ©e plus tard). */
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
          this.snack.open('âœ“ CoordonnÃ©es enregistrÃ©es - Ã©tape suivante...', '', {
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
            'Impossible d\'enregistrer. VÃ©rifie tes saisies.';
          this.snack.open(generic, 'OK', {
            duration: 6000,
            panelClass: ['tuita-snackbar', 'snack-error'],
          });
        },
      });
  }

  /**
   * Timer du auto-advance aprÃ¨s un upload rÃ©ussi. ConservÃ© pour pouvoir
   * l'annuler si l'utilisateur navigue manuellement (PrÃ©cÃ©dent / Suivant /
   * clic pastille) ou si le composant est dÃ©truit avant l'expiration.
   */
  private advanceTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Index du dernier step pour lequel l'auto-open de la vidÃ©o a Ã©tÃ© dÃ©clenchÃ©.
   * Garde anti double-dispatch : l'effect peut tirer plusieurs fois pour le
   * mÃªme step (init + setup des signaux source). Une vraie navigation change
   * `step.index` â†’ l'effect rÃ©-ouvre lÃ©gitimement.
   */
  private lastAutoOpenedStepIndex = -1;

  /**
   * Slugs (`step.config.type`) dont la vidÃ©o a dÃ©jÃ  Ã©tÃ© ouverte en popup au
   * moins une fois. HydratÃ© depuis localStorage au dÃ©marrage, persiste Ã 
   * chaque fermeture de dialog. UtilisÃ© par l'effect d'auto-open pour
   * Ã©viter de re-pousser la mÃªme vidÃ©o Ã  chaque rÃ©-entrÃ©e sur le step.
   */
  private readonly watchedVideoTypes = this.loadWatchedVideoTypes();

  constructor() {
    this.destroyRef.onDestroy(() => this.cancelPendingAdvance());

    // Auto-open du dialog vidÃ©o Ã  la premiÃ¨re entrÃ©e sur un step donnÃ©. Si
    // l'artisan a dÃ©jÃ  fermÃ© cette vidÃ©o une fois (state persistÃ© en
    // localStorage), on ne re-pousse plus le popup â€” il peut toujours la
    // revoir manuellement via le bouton Â« Revoir la vidÃ©o Â». Le bouton
    // Â« J'ai compris Â» reste disabled jusqu'Ã  la fin de la lecture
    // (forceWatch=true) la premiÃ¨re fois.
    effect(() => {
      const step = this.currentStep();
      if (!step || step.index === this.lastAutoOpenedStepIndex) return;
      this.lastAutoOpenedStepIndex = step.index;
      if (this.watchedVideoTypes.has(step.config.type)) return;
      this.openVideoDialog(step, true);
    });

    // Hydrate les champs de saisie RIB depuis le dashboard quand on entre sur
    // l'Ã©tape. Idempotent (`bankFormHydrated`) â†’ pas d'Ã©crasement pendant la
    // saisie en cours si le dashboard se rafraÃ®chit.
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
      // Largeur gÃ©rÃ©e 100% en CSS (cf. styles.scss .onboarding-video-dialog) :
      // 100vw edge-to-edge mobile/tablette, capÃ© Ã  880px centrÃ© sur desktop.
      // Si on impose width: '100vw' ici, le pane reste positionnÃ© comme 100vw
      // et le CSS qui le rÃ©trÃ©cit le laisse plaquÃ© Ã  gauche au lieu de centrer.
      maxWidth: '100vw',
      panelClass: 'onboarding-video-dialog',
      disableClose: true,
      autoFocus: false,
      restoreFocus: true,
    });
    // Une fois la vidÃ©o fermÃ©e (lecture finie, sortie de secours Ã— ou bouton
    // Â« J'ai compris Â»), on retient que l'artisan l'a vue â†’ plus d'auto-open
    // sur ce step. Le bouton Â« Revoir la vidÃ©o Â» reste son seul moyen de la
    // rÃ©-ouvrir ensuite.
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
      // localStorage indisponible (quota, mode privÃ© Safariâ€¦) â€” non bloquant,
      // l'artisan reverra juste la vidÃ©o au prochain dÃ©marrage.
    }
  }

  /** RÃ©-ouvre le dialog vidÃ©o Ã  la demande (bouton Â« Revoir la vidÃ©o Â»).
   * Bouton Â« J'ai compris Â» actif d'emblÃ©e â€” l'artisan a dÃ©jÃ  passÃ© le gate. */
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

  // --- Slots recto / verso (uniquement utilisÃ©s par les steps `twoSided`). ---
  /** Photo du recto (cÃ´tÃ© visage de la CNI). */
  readonly rectoFile = signal<File | null>(null);
  /** Photo du verso (cÃ´tÃ© MRZ `<<<` de la CNI). */
  readonly versoFile = signal<File | null>(null);
  /**
   * Mode capture guidÃ©e : un seul tap sur Â« Prendre mes 2 photos Â» ouvre la
   * camÃ©ra recto, puis enchaÃ®ne automatiquement la camÃ©ra verso dÃ¨s que la
   * premiÃ¨re photo est prise. Sur desktop, le file picker s'ouvre en cascade
   * de la mÃªme faÃ§on (capture est ignorÃ©, mais le chaÃ®nage reste utile).
   */
  private guidedCaptureActive = false;

  readonly canSubmitTwoSided = computed<boolean>(
    () => this.rectoFile() !== null && this.versoFile() !== null,
  );

  /** Set des types skippÃ©s cette session (localStorage). */
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
      // Ã‰tape Â« saisie manuelle Â» (RIB) : pas de DocumentRequirement cÃ´tÃ©
      // backend. Le Â« done Â» dÃ©pend uniquement de la prÃ©sence des 3 champs
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
      const req = byType.get(cfg.type) ?? null;
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

  /** Ã‰tape courante = saisie manuelle RIB (formulaire 3 champs). */
  readonly isCurrentBankDetailsStep = computed<boolean>(() => {
    return this.currentStep()?.config.formStep === 'bank_details';
  });

  /** Tous les steps faits ? */
  readonly allDone = computed<boolean>(() => {
    return this.steps().every((s) => s.done);
  });

  /**
   * Le document de l'Ã©tape courante est `verified` mais expire dans
   * â‰¤ 30 j â†’ l'artisan vient renouveler. On lui montre la dropzone
   * (et plus le message Â« rien Ã  refaire Â») pour qu'il puisse uploader
   * la version Ã  jour directement.
   */
  readonly currentStepIsExpiring = computed<boolean>(() => {
    const step = this.currentStep();
    const req = step?.requirement;
    if (!req || req.status !== 'verified') return false;
    const days = req.days_until_expiry;
    return days !== null && days !== undefined && days <= 30;
  });

  /** Nb de jours avant expiration du doc de l'Ã©tape courante (ou null). */
  readonly currentStepDaysUntilExpiry = computed<number | null>(() => {
    return this.currentStep()?.requirement?.days_until_expiry ?? null;
  });

  /** Le doc de l'Ã©tape courante a dÃ©jÃ  expirÃ© (status='expired'). */
  readonly currentStepExpired = computed<boolean>(() => {
    return this.currentStep()?.requirement?.status === 'expired';
  });

  /**
   * Mode Â« remplacer Â» activÃ© manuellement par l'artisan sur l'Ã©tape
   * courante (changement de RIB, MAJ KBIS, etc.). Permet de rÃ©vÃ©ler la
   * dropzone mÃªme quand le doc est dÃ©jÃ  `verified` et non-expirant.
   * Se rÃ©initialise Ã  chaque changement d'Ã©tape (cf. `resetStepLocalState`).
   */
  readonly replaceMode = signal<boolean>(false);

  toggleReplaceMode(): void {
    this.replaceMode.update((v) => !v);
  }

  // ---------------------------------------------------------------------------
  // Variantes de step (CNI/Passeport, extrait INPI/Kbis/avis SIRENE, â€¦).
  // PilotÃ©es par la map `VARIANTS_BY_STEP_TYPE` â€” un step a un picker dÃ¨s qu'il
  // y figure. Ajouter une entrÃ©e Ã  la map suffit Ã  activer le sÃ©lecteur (UI +
  // routing du type backend), aucun code spÃ©cifique par step.
  // ---------------------------------------------------------------------------

  /**
   * Liste de variantes pour le step COURANT (ou tableau vide si pas de picker).
   * ExposÃ©e au template pour boucler dessus.
   */
  readonly identityVariants = computed<readonly IdentityVariant[]>(() => {
    const type = this.currentStep()?.config.type;
    return type ? (VARIANTS_BY_STEP_TYPE[type] ?? []) : [];
  });

  /**
   * Variante choisie par l'artisan sur le step courant. `null` tant qu'il n'a
   * pas cliquÃ© sur une carte â†’ on affiche le sÃ©lecteur, pas la zone d'upload.
   * RÃ©initialisÃ© Ã  chaque changement d'Ã©tape (cf. `resetStepLocalState`).
   */
  readonly identityVariant = signal<IdentityVariant | null>(null);

  /**
   * `true` si on doit afficher le sÃ©lecteur de variante plutÃ´t que la zone
   * d'upload. Vrai dÃ¨s que le step courant a une liste de variantes ET que
   * l'artisan n'a pas encore choisi.
   */
  readonly showIdentityVariantPicker = computed<boolean>(() => {
    return this.identityVariants().length > 0 && this.identityVariant() === null;
  });

  /**
   * Type backend Ã  envoyer pour l'upload du step courant.
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
   * `true` quand on doit afficher le pipeline Â« 1 photo guidÃ©e + scanner
   * jscanify Â» (cas passeport : page photo/MRZ, single-shot mais l'artisan
   * la prend au tÃ©lÃ©phone donc on a besoin de la camÃ©ra arriÃ¨re + auto-crop).
   * N'apparaÃ®t QUE sur le step piÃ¨ce d'identitÃ© (`cni`), pas sur les
   * variantes d'immatriculation (KBIS / extrait INPI / avis SIRENE) qui
   * restent en dropzone bit-pour-bit (intÃ©gritÃ© forensique des docs admin).
   */
  readonly currentSingleShotIdentity = computed<boolean>(() => {
    const step = this.currentStep();
    if (!step || step.config.type !== 'cni') return false;
    const selected = this.identityVariant();
    return selected !== null && !selected.twoSided;
  });

  /**
   * `true` si le step courant utilise le flow recto/verso (2 photos fusionnÃ©es
   * en PDF cÃ´tÃ© client). Sur les steps Ã  variantes, dÃ©pend de la variante
   * sÃ©lectionnÃ©e (passeport = 1 seule photo, on bypass la fusion).
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
   * pour qu'un changement d'avis ne mÃ©lange pas une photo de CNI avec un
   * passeport sÃ©lectionnÃ© aprÃ¨s coup.
   *
   * FIX-027 v2 â€” PrÃ©chargement BYTES-ONLY OpenCV.js sans forcer la compile
   * WASM (qui bloque le main thread 2-30 s). On utilise `<link rel="prefetch">`
   * pour mettre les bytes en cache navigateur pendant que l'artisan lit la
   * page et prend sa photo. La compile WASM se fera au moment rÃ©el d'usage
   * dans le dialog scanner â€” mais en partant du cache disque, c'est 5-10Ã—
   * plus rapide qu'un download+compile depuis zÃ©ro.
   *
   * Le `loadEngine()` (qui DÃ‰CLENCHE la compile) reste appelÃ© uniquement
   * dans le dialog scanner ngOnInit, avec un Ã©tat 'loading' visible et un
   * fallback "envoyer telle quelle" si jamais Ã§a traÃ®ne.
   */
  selectIdentityVariant(variant: IdentityVariant): void {
    this.identityVariant.set(variant);
    this.lastVerdict.set(null);
    this.rectoFile.set(null);
    this.versoFile.set(null);

    // PrÃ©chargement BYTES-ONLY (link prefetch) â€” n'Ã©value PAS le script,
    // ne dÃ©clenche PAS la compile WASM. Pas de freeze main thread.
    this.scanner.prefetchOpencvScript();
  }

  /**
   * Retour au sÃ©lecteur de variante depuis l'Ã©cran d'upload â€” utile si
   * l'artisan a cliquÃ© sur la mauvaise carte.
   */
  clearIdentityVariant(): void {
    this.identityVariant.set(null);
    this.rectoFile.set(null);
    this.versoFile.set(null);
    this.lastVerdict.set(null);
  }

  /**
   * Date d'expiration formatÃ©e FR (jj/mm/aaaa) pour l'Ã©tape courante.
   * Permet Ã  l'artisan de vÃ©rifier visuellement quel document on parle.
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
    // Nettoyage du polling d'achat Pappers si le composant est dÃ©truit
    // pendant qu'un setInterval tourne (navigation, hot reload, etc.).
    this.destroyRef.onDestroy(() => this.stopPurchasePolling());

    // Resume : Ã  l'ARRIVÃ‰E UNIQUEMENT, jump Ã  la premiÃ¨re Ã©tape non-faite
    // (en sautant celles dÃ©jÃ  skippÃ©es cette session). Si tout est validÃ©,
    // on enchaÃ®ne direct sur le KYC.
    //
    // âš ï¸  Ne PAS rejouer ce calcul sur les Ã©missions suivantes : un upload
    // dÃ©clenche `refreshDashboard()` â†’ nouvelle Ã©mission â†’ si on
    // re-positionnait `currentIndex` ici, l'artisan qui upload sur l'Ã©tape 3
    // serait tÃ©lÃ©portÃ© sur l'Ã©tape 1 dÃ¨s qu'un rejet revient.
    let resumed = false;
    this.session.dashboard$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (resumed || !this.dashboard()) return;
        resumed = true;
        // Si au moins un doc verified expire dans les 30 j, on NE redirige
        // pas â€” l'artisan vient justement renouveler une piÃ¨ce. Le stepper
        // doit rester ouvert pour qu'il puisse re-uploader la version Ã  jour.
        const items = this.dashboard()?.documents?.items ?? [];
        const hasExpiringSoon = items.some(
          (it) =>
            it.status === 'verified' &&
            it.days_until_expiry !== null &&
            it.days_until_expiry !== undefined &&
            it.days_until_expiry <= 30,
        );
        if (this.allDone() && !hasExpiringSoon) {
          // Tous les documents sont validÃ©s. Deux cas :
          //   1. Le KYC vidÃ©o n'est pas encore approuvÃ© â†’ on enchaÃ®ne sur /kyc
          //      (cas onboarding initial : docs OK, identitÃ© Ã  faire ensuite).
          //   2. Le KYC est dÃ©jÃ  approved â†’ l'artisan est entiÃ¨rement Ã  jour,
          //      le router-link "Mes documents" du dashboard l'a juste amenÃ©
          //      ici pour gÃ©rer ses piÃ¨ces. Pas de raison de le tÃ©lÃ©porter
          //      vers /kyc dÃ©jÃ  validÃ©. On le renvoie sur le dashboard avec
          //      un mot rassurant.
          const kycStatus = this.dashboard()?.kyc?.status;
          if (kycStatus === 'approved') {
            // Pas de snackbar ici : ouvrir un toast en plein cycle de routing
            // (synchrone, juste avant `router.navigate`) dÃ©clenche un
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
        // Si rien Ã  uploader mais un doc expire bientÃ´t, on positionne le
        // stepper directement sur ce doc â€” l'artisan vient pour Ã§a.
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
    // sur le step piÃ¨ce d'identitÃ©. Sur les autres steps, retombe sur step.config.type.
    this.dispatchUploadCall(file, this.currentUploadType());
  }

  /**
   * Workflow recto + verso (CNI). Fusionne deux photos prises au tÃ©lÃ©phone en
   * un PDF mono-fichier puis enchaÃ®ne sur l'upload classique. La fusion ne
   * s'applique QU'aux piÃ¨ces d'identitÃ© â€” les documents administratifs
   * doivent rester bit-pour-bit identiques Ã  l'original (cf. `StepConfig.twoSided`).
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
        : 'Impossible de prÃ©parer le document. RÃ©essaie avec deux photos prises Ã  l\'instant.';
      this.lastVerdict.set({ type: 'rejected', message: msg });
      return;
    }

    this.dispatchUploadCall(merged, this.currentUploadType());
  }

  /**
   * Chemin alternatif sur la step CNI : l'artisan possÃ¨de dÃ©jÃ  un fichier
   * scannÃ© (PDF ou image) avec recto + verso ensemble â€” pas besoin de re-prendre
   * deux photos. Le fichier est envoyÃ© bit-pour-bit au backend, AUCUNE fusion
   * ni re-encodage cÃ´tÃ© client (prÃ©serve les mÃ©tadonnÃ©es scanner, signatures
   * Ã©lectroniques Ã©ventuelles, intÃ©gritÃ© forensique).
   */
  async submitDirectFile(file: File): Promise<void> {
    const step = this.currentStep();
    if (!step) return;

    const isPdf = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');
    if (!isPdf && !isImage) {
      this.lastVerdict.set({
        type: 'rejected',
        message: 'Format non supportÃ©. Utilise un PDF ou une image.',
      });
      return;
    }

    // P1-6 â€” garde taille fichier (10 Mo max cÃ´tÃ© backend).
    if (!this.guardFileSize(file)) {
      return;
    }

    // Le mode "fichier complet" remplace les Ã©ventuelles photos dÃ©jÃ  dÃ©posÃ©es
    // dans les slots recto/verso â€” pas de mix entre les deux pipelines.
    this.rectoFile.set(null);
    this.versoFile.set(null);

    this.isUploading.set(true);
    this.lastVerdict.set(null);
    this.dispatchUploadCall(file, this.currentUploadType());
  }

  /**
   * Passeport â€” capture camÃ©ra single-shot guidÃ©e. L'artisan tape sur la
   * dropzone, son tÃ©lÃ©phone ouvre la camÃ©ra arriÃ¨re (via `capture="environment"`),
   * il photographie la page avec sa photo + MRZ, jscanify dÃ©tecte les 4 coins
   * et redresse la perspective. Au "Valider" du dialog scanner, on enchaÃ®ne
   * directement sur l'upload â€” pas besoin d'un bouton Â« Envoyer Â» sÃ©parÃ©
   * comme pour la CNI recto/verso (1 seul fichier, validation visuelle dÃ©jÃ 
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
   * SÃ©lectionne ou remplace un slot recto/verso. Chaque slot accepte une seule
   * image â€” un nouvel upload remplace silencieusement le prÃ©cÃ©dent.
   *
   * Pour les images (cas dominant : photo prise au tÃ©lÃ©phone), on passe
   * d'abord par le scanner client jscanify qui dÃ©tecte les 4 coins du
   * document, redresse la perspective et exporte un JPEG propre. L'artisan
   * peut ajuster les coins Ã  la main si la dÃ©tection auto rate. PDF dÃ©jÃ 
   * fournis (cas rare ici, mais possible via `submitDirectFile`) ne sont
   * jamais altÃ©rÃ©s â€” rÃ¨gle bit-pour-bit pour les docs admin.
   */
  async onSlotFile(side: 'recto' | 'verso', ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    // Reset immÃ©diatement pour permettre la re-sÃ©lection du mÃªme fichier.
    input.value = '';

    if (!file) {
      if (side === 'recto') this.rectoFile.set(null);
      else this.versoFile.set(null);
      return;
    }

    // P1-6 â€” garde taille AVANT scanner/fusion : si l'iPhone livre un ProRAW
    // de 25 Mo, autant le dire tout de suite Ã  l'artisan plutÃ´t que de faire
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
      // Utilisateur a annulÃ© â†’ on vide le slot et coupe le chaÃ®nage guidÃ©,
      // sinon on lui ouvre la camÃ©ra verso alors que le recto n'est pas posÃ©.
      if (side === 'recto') this.rectoFile.set(null);
      else this.versoFile.set(null);
      this.guidedCaptureActive = false;
      return;
    }

    if (side === 'recto') this.rectoFile.set(processed);
    else this.versoFile.set(processed);

    // ChaÃ®nage guidÃ© : si l'artisan a dÃ©marrÃ© le mode Â« 2 photos d'un coup Â»
    // et vient de prendre le recto, on ouvre automatiquement la camÃ©ra verso.
    if (this.guidedCaptureActive && side === 'recto') {
      this.guidedCaptureActive = false;
      this.snack.open('Maintenant le verso (cÃ´tÃ© chevrons <<<)', '', {
        duration: 2500,
        panelClass: ['tuita-snackbar'],
      });
      // Petit dÃ©lai pour laisser le snackbar apparaÃ®tre + l'input verso Ãªtre
      // prÃªt aprÃ¨s le change event recto. setTimeout(0) suffit en gÃ©nÃ©ral,
      // mais on laisse 250 ms pour fluiditÃ© visuelle sur mobile.
      setTimeout(() => this.triggerVersoCapture(), 250);
    }
  }

  /**
   * P1-6 â€” Garde stricte sur la taille des fichiers uploadÃ©s.
   *
   * Refuse silencieusement (avec snackbar explicite) tout fichier > 10 Mo.
   * Sans ce check, le navigateur envoie quand mÃªme, nginx renvoie un 413
   * en clair â†’ l'artisan voit Â« erreur rÃ©seau Â» et pense que c'est l'OCR
   * qui a plantÃ©. Mieux vaut un message proactif qui guide vers la solution
   * (reprendre la photo en JPEG normal, pas en ProRAW).
   *
   * @returns `true` si le fichier est sous la limite (upload autorisÃ©).
   *          `false` aprÃ¨s avoir affichÃ© le snackbar (upload annulÃ©).
   */
  private guardFileSize(file: File): boolean {
    if (file.size <= MAX_UPLOAD_BYTES) {
      return true;
    }
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    this.snack.open(
      `Fichier trop volumineux (${sizeMb} Mo). Limite : ${MAX_UPLOAD_MB_LABEL}. ` +
        'Reprends une photo en mode JPEG normal (dÃ©sactive Â« ProRAW Â» sur iPhone).',
      'OK',
      { duration: 6000, panelClass: ['tuita-snackbar'] },
    );
    return false;
  }

  /**
   * Ouvre le scanner client (jscanify + OpenCV.js, lazy-load). Retourne :
   *   - le File rognÃ© + redressÃ© (JPEG) si validation utilisateur
   *   - le File original si l'utilisateur a choisi Â« envoyer telle quelle Â»
   *     (fallback, ex: scanner indisponible)
   *   - `null` si l'utilisateur a cliquÃ© Â« reprendre la photo Â»
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
   * DÃ©marre la capture guidÃ©e : ouvre la camÃ©ra recto. Quand l'artisan prend
   * la photo, `onSlotFile('recto', ...)` enchaÃ®ne automatiquement sur la
   * camÃ©ra verso (cf. flag `guidedCaptureActive`).
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
   * code machine entre crochets quand le backend en fournit un. Sans Ã§a il
   * voyait juste Â« Validation failed. Â» et n'avait aucun moyen de comprendre
   * que c'Ã©tait par exemple le type de document qui Ã©tait mal envoyÃ©.
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

    // Erreurs de validation Laravel (422) â€” on aplatit les messages champ par
    // champ pour que l'artisan voie Â« type : la valeur est invalide Â».
    // On NE montre PAS le code machine [validation_failed] Ã  l'user : il est
    // dÃ©jÃ  loggÃ© en console (cf. error.interceptor.ts) pour le support.
    const fieldErrors = body?.errors;
    if (fieldErrors && typeof fieldErrors === 'object') {
      const flat = Object.entries(fieldErrors)
        .map(([field, msgs]) => `${field} : ${(msgs ?? []).join(', ')}`)
        .join(' â€¢ ');
      if (flat) {
        return flat;
      }
    }

    // FIX-042 â€” Sur erreur serveur 5xx : on N'AFFICHE JAMAIS le message brut
    // backend ("Internal server error", stack traces, etc.) Ã  l'artisan.
    // Le contractor voit un message FR clair "cÃ´tÃ© technique, pas de ta faute".
    // Le dÃ©tail technique reste loggÃ© en console (cf. error.interceptor.ts)
    // pour que le support puisse investiguer via le correlation_id.
    if (status !== undefined && status >= 500) {
      return 'Erreur cÃ´tÃ© Tuita - pas de ta faute. RÃ©essaie dans un instant. Si Ã§a persiste, contacte le support.';
    }

    // Microcopy user-facing : on retourne UNIQUEMENT le message FR du backend,
    // sans prÃ©fixer par le code machine entre crochets. Le code reste
    // disponible dans `code` cÃ´tÃ© composant pour faire du routing UX (CTA
    // contextuel), mais l'artisan ne voit jamais un identifiant technique.
    if (codedMessage) {
      return codedMessage;
    }
    if (body?.message) {
      // Pour 4xx on garde le message backend (Laravel l'a dÃ©jÃ  francisÃ© sur
      // notre code via ApiException) mais on NE met PAS de "(HTTP XXX)"
      // suffix â€” pas de friction technique cÃ´tÃ© artisan.
      return body.message;
    }
    return status && status >= 500
      ? 'Erreur cÃ´tÃ© Tuita - pas de ta faute. RÃ©essaie dans un instant.'
      : 'L\'envoi a Ã©chouÃ©. RÃ©essaie dans un instant.';
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
        if (status === 'verified') {
          setVerdict.set({
            type: 'verified',
            message: 'Document validÃ© !',
          });
          // Auto-advance UNIQUEMENT pour le bloc principal â€” un upload
          // secondaire (ex: dÃ©cennale) ne change pas d'Ã©tape, l'artisan
          // doit cliquer "Suivant" lui-mÃªme.
          if (target === 'primary') {
            // âš ï¸ Garde anti court-circuit du bloc bonus : si l'Ã©tape a un
            // `secondary` (ex: dÃ©cennale) pas encore VERIFIED, on n'auto-avance
            // PAS. Sinon l'artisan rate la dropzone bonus Ã  cÃ´tÃ© et la dÃ©cennale
            // est perdue â€” un badge `decennale_verified` en moins et des
            // missions gros Å“uvre bloquÃ©es cÃ´tÃ© tuita.fr.
            const step = this.currentStep();
            const hasUnresolvedSecondary =
              !!step?.config.secondary && !this.secondaryDone();

            if (hasUnresolvedSecondary) {
              this.snack.open(
                'âœ“ RC Pro validÃ©e - ajoute ta dÃ©cennale Ã  droite, ou clique Suivant.',
                '',
                {
                  duration: 5000,
                  panelClass: ['tuita-snackbar', 'snack-success'],
                },
              );
              this.session.refreshDashboard();
            } else {
              this.snack.open('âœ“ Document validÃ© - Ã©tape suivante...', '', {
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
            this.snack.open('âœ“ DÃ©cennale ajoutÃ©e Ã  ton dossier !', '', {
              duration: 2500,
              panelClass: ['tuita-snackbar', 'snack-success'],
            });
            this.session.refreshDashboard();
          }
        } else if (status === 'rejected') {
          const detail = doc?.failure_detail ?? r?.data?.failure_detail ?? r?.failure_detail;
          const reason = doc?.failure_reason ?? r?.data?.failure_reason ?? r?.failure_reason;
          // Microcopy user-facing : on n'expose PAS le code machine `reason`
          // dans le message visible. Il est conservÃ© en console (interceptor)
          // pour le support. Le `failure_detail` du backend est dÃ©jÃ  un
          // message FR actionnable.
          const fallback = 'Le document a Ã©tÃ© refusÃ©. VÃ©rifie qu\'il est bien lisible et rÃ©essaie.';
          const message = detail ?? fallback;
          setVerdict.set({ type: 'rejected', message, code: reason ?? null });
          this.snack.open(message, 'OK', {
            duration: 8000,
            panelClass: ['tuita-snackbar', 'snack-error'],
          });
          this.session.refreshDashboard();
        } else {
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
  // Bloc secondaire (ex: dÃ©cennale dans le step assurances)
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
   * Bouton "RÃ©cupÃ©rer l'officiel â€” 9,99 â‚¬" sur l'Ã©tape immatriculation.
   * RÃ©utilise le dialog d'achat existant qui gÃ¨re SIREN + Stripe Checkout.
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
   * Lance l'achat officiel : appel `purchaseDocument` â†’ ouvre Stripe Embedded
   * Checkout. Au succÃ¨s, refresh le dashboard â€” le doc arrivera VERIFIED via
   * Pappers et l'Ã©tape sera marquÃ©e âœ“ automatiquement par le polling implicite
   * du dashboard.
   */
  private runPurchase(docType: 'extrait_inpi' | 'kbis' | 'avis_sirene', siren: string): void {
    const cleanSiren = (siren ?? '').replace(/\s+/g, '');
    if (!/^\d{9}$/.test(cleanSiren)) {
      this.snack.open('SIREN invalide - vÃ©rifie les 9 chiffres.', 'OK', {
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
        // Dev / gratuit : la livraison tourne dÃ©jÃ  cÃ´tÃ© backend.
        this.session.refreshDashboard();
        this.snack.open('Document en cours de rÃ©cupÃ©ration...', '', {
          duration: 4000,
          panelClass: ['tuita-snackbar'],
        });
      },
      error: (err: unknown) => {
        const message =
          (err as { error?: { error?: { message?: string } } })?.error?.error?.message ??
          "Erreur lors de l'achat. RÃ©essaie dans un instant.";
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
        title: `Paiement sÃ©curisÃ© - ${labels[docType]}`,
        subtitle: 'Confirmez votre achat pour lancer la dÃ©livrance du document officiel.',
      },
    });
    ref.afterClosed().subscribe((result) => {
      if (result?.status === 'complete') {
        // L'ancien verdict OCR (souvent `kbis_not_original` sur un upload
        // manuel antÃ©rieur) n'est plus pertinent â€” le contractor vient de
        // payer pour un PDF officiel Pappers qui bypasse l'OCR cÃ´tÃ© backend.
        // Sans ce reset, la banniÃ¨re orange Â« Document refusÃ© Â» reste Ã 
        // l'Ã©cran et l'artisan croit avoir payÃ© pour rien (incident 2026-05-14).
        this.lastVerdict.set(null);
        this.snack.open(
          'Paiement confirmÃ© - rÃ©cupÃ©ration du document en cours...',
          '',
          { duration: 4000, panelClass: ['tuita-snackbar', 'snack-success'] },
        );
        // `ProcessDocumentPurchase` tourne en async sur Horizon : le doc
        // VERIFIED n'existe pas encore en BDD au moment oÃ¹ ce callback se
        // dÃ©clenche. On poll le dashboard jusqu'Ã  voir l'Ã©tape passer en
        // `verified`, puis on auto-tÃ©lÃ©charge le PDF officiel pour fermer
        // proprement la boucle Â« j'ai payÃ© â†’ j'ai reÃ§u mon document Â».
        this.startPurchasePolling(docType);
      }
    });
  }

  /**
   * Lance le polling du dashboard aprÃ¨s un paiement Stripe confirmÃ©.
   *
   * Le job backend `ProcessDocumentPurchase` (Horizon, queue `documents`)
   * tÃ©lÃ©charge le PDF via Pappers, le chiffre, le stocke S3 puis crÃ©e un
   * `Document` en `VERIFIED` direct (bypass OCR, source officielle). Tout Ã§a
   * prend typiquement 2-8 s mais peut grimper si Pappers est lent. On poll
   * toutes les 3 s pendant max 60 s, puis on rend la main au cas de timeout.
   *
   * Idempotent : un Ã©ventuel polling prÃ©cÃ©dent est arrÃªtÃ© avant de relancer.
   */
  private startPurchasePolling(docType: 'extrait_inpi' | 'kbis' | 'avis_sirene'): void {
    this.stopPurchasePolling();
    this.isPurchasePolling.set(true);

    const POLL_INTERVAL_MS = 3000;
    const POLL_TIMEOUT_MS = 60_000;
    const targetType = this.currentStep()?.config.type ?? '';
    const startedAt = Date.now();

    // Refresh immÃ©diat â€” sur un Pappers trÃ¨s rapide (~1 s), le doc peut dÃ©jÃ 
    // Ãªtre en BDD avant mÃªme le premier tick d'intervalle.
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
          "Toujours en cours cÃ´tÃ© serveur. Recharge la page dans une minute si rien n'a changÃ©.",
          'OK',
          { duration: 8000, panelClass: ['tuita-snackbar', 'snack-warn'] },
        );
        return;
      }
      this.session.refreshDashboard();
    }, POLL_INTERVAL_MS);
  }

  /** ArrÃªte le polling en cours (idempotent). AppelÃ© sur succÃ¨s, timeout, destroy. */
  private stopPurchasePolling(): void {
    if (this.purchasePollHandle !== null) {
      clearInterval(this.purchasePollHandle);
      this.purchasePollHandle = null;
    }
    this.isPurchasePolling.set(false);
  }

  /**
   * DÃ©clenche le tÃ©lÃ©chargement automatique du PDF officiel dÃ¨s que le doc
   * a atterri en BDD cÃ´tÃ© backend. L'artisan voit son extrait
   * s'ouvrir/se tÃ©lÃ©charger sans avoir Ã  cliquer â€” feedback immÃ©diat Â« j'ai
   * bien reÃ§u mon document contre mes 9,99 â‚¬ Â». Fail-soft : si le download
   * Ã©choue (ex. blob endpoint indisponible), on garde la confirmation
   * d'achat, le PDF reste accessible depuis l'onglet Â« Mes documents Â».
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
      `${labels[docType]} reÃ§u - tÃ©lÃ©chargement en cours...`,
      '',
      { duration: 4000, panelClass: ['tuita-snackbar', 'snack-success'] },
    );

    if (!documentUuid) {
      // Cas rare : dashboard pas encore enrichi avec le document_uuid (race
      // cÃ´tÃ© backend serializer). Skip silencieux â€” le doc est validÃ©, le
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
        // Fail-soft volontaire (cf. JSDoc). Pas de toast d'erreur â€” on ne
        // veut pas inquiÃ©ter l'artisan alors que le doc est livrÃ© + visible
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
    // Garde anti-bypass silencieux : si l'Ã©tape courante n'est PAS validÃ©e
    // (pas de doc uploadÃ© / pas de RIB sauvegardÃ©) ET pas encore skippÃ©e
    // explicitement, on refuse d'avancer en silence. L'artisan doit choisir :
    //   - dÃ©poser le document attendu (action principale)
    //   - OU cliquer Â« Je le ferai plus tard Â» pour skip volontaire
    //
    // Sans cette garde, un clic Â« Suivant Â» faisait avancer silencieusement
    // sans tracer le skip â€” l'artisan se retrouvait Ã  la fin du stepper avec
    // une compliance KO sans comprendre pourquoi.
    const step = this.currentStep();
    if (step && !step.done && !this.skippedTypes().has(step.config.type)) {
      const docKind = step.config.type === 'cni'
        ? 'ta piÃ¨ce d\'identitÃ©'
        : (step.config.type === 'bank' ? 'tes coordonnÃ©es bancaires' : 'le document');
      this.snack.open(
        `Pour avancer : dÃ©pose ${docKind} ou clique Â« Je le ferai plus tard Â» si tu ne l'as pas sous la main.`,
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
      // est `verified`. Sans piÃ¨ce d'identitÃ© validÃ©e, le KYC vidÃ©o n'a pas
      // de photo de visage Ã  comparer â€” la session Ã©chouerait cÃ´tÃ© backend.
      const cniStep = this.steps().find((s) => s.config.type === 'cni');
      if (!cniStep?.done) {
        const cniIndex = STEP_ORDER.findIndex((s) => s.type === 'cni');
        this.currentIndex.set(cniIndex >= 0 ? cniIndex : 0);
        this.resetStepLocalState();
        this.snack.open(
          'DÃ©pose d\'abord ta piÃ¨ce d\'identitÃ© - sans elle, on ne peut pas vÃ©rifier ton identitÃ© en vidÃ©o.',
          'OK',
          {
            duration: 6000,
            panelClass: ['tuita-snackbar', 'snack-error'],
          },
        );
        return;
      }
      // Si le KYC est dÃ©jÃ  approved (cas renouvellement / mise Ã  jour
      // d'un doc expirant), pas de raison de re-rediriger vers /kyc qui
      // affichera Â« identitÃ© dÃ©jÃ  vÃ©rifiÃ©e Â». On revient sur le dashboard.
      const kycStatus = this.dashboard()?.kyc?.status;
      if (kycStatus === 'approved') {
        void this.router.navigate(['/dashboard']);
        return;
      }
      this.snack.open('Ã‰tape documents terminÃ©e - passons Ã  l\'identitÃ©.', '', {
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
   * Indique si une Ã©tape est verrouillÃ©e pour la navigation directe.
   *
   * RÃ¨gle : une Ã©tape est verrouillÃ©e si elle est devant l'Ã©tape courante
   * ET qu'une des Ã©tapes intermÃ©diaires n'est ni `done` ni `skipped`.
   *
   * UtilisÃ©e par le template pour griser visuellement le dot + afficher
   * un cadenas. La mÃ©thode `goTo()` applique la mÃªme rÃ¨gle en runtime
   * (dÃ©fense en profondeur â€” mÃªme si quelqu'un force le clic via devtools,
   * la nav est bloquÃ©e et un toast warn est affichÃ©).
   *
   * Cf. BUG-013 + commentaire utilisateur 2026-05-13 (Â« le stepper doit
   * rester bloquÃ© incrÃ©mentalement Â»).
   */
  isStepLocked(index: number): boolean {
    const currentIdx = this.currentIndex();
    // Reculer ou rester sur place : jamais verrouillÃ©.
    if (index <= currentIdx) return false;

    // Avancer : on doit traverser toutes les Ã©tapes entre courante et cible.
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

    // Reculer est TOUJOURS autorisÃ© (l'artisan veut revoir une Ã©tape dÃ©jÃ 
    // faite, corriger un upload, vÃ©rifier ce qu'il a dÃ©posÃ©). On laisse
    // passer sans contrainte.
    if (index <= currentIdx) {
      this.currentIndex.set(index);
      this.resetStepLocalState();
      return;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // GARDE â€” ordre d'avancement forcÃ© (sÃ©curitÃ© onboarding)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // Avancer N'EST autorisÃ© QUE si toutes les Ã©tapes intermÃ©diaires entre
    // la position actuelle et la cible sont soit `done` (validÃ©e), soit
    // `skipped` explicitement par l'artisan.
    //
    // Sans cette garde, l'artisan pouvait sauter Ã  Ã©tape 5 RIB sans avoir
    // validÃ© Ã©tape 1 CNI â€” ce qui ouvrait des failles de cross-check
    // (impossible de vÃ©rifier que le titulaire RIB correspond Ã  l'identitÃ©
    // tant que la CNI n'est pas validÃ©e).
    //
    // Le backend tient aussi sa ligne (cf. ContractorProfileController::
    // updateBankDetails qui refuse RIB si pas de piÃ¨ce d'identitÃ©
    // VERIFIED) â€” dÃ©fense en profondeur.
    const allSteps = this.steps();
    for (let i = currentIdx; i < index; i++) {
      const s = allSteps[i];
      if (!s) continue;
      const isSkipped = this.skippedTypes().has(s.config.type);
      if (!s.done && !isSkipped) {
        const label = s.config.title ?? `Ã‰tape ${i + 1}`;
        this.snack.open(
          `Tu dois d'abord valider l'Ã©tape ${i + 1} - "${label}" - ou la skipper avec Â« Je le ferai plus tard Â».`,
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
   * RÃ©initialise l'Ã©tat local liÃ© Ã  une Ã©tape (verdict + slots recto/verso).
   * Ã‰vite qu'un retour en arriÃ¨re ne rÃ©-affiche une vieille photo CNI ou un
   * verdict obsolÃ¨te.
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
    // arriÃ¨re et finir sa saisie). On reset uniquement les erreurs serveur
    // qui sont contextuelles Ã  la derniÃ¨re soumission.
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
      // Pas critique : on perd juste l'Ã©tat "skip" au refresh.
    }
  }
}
