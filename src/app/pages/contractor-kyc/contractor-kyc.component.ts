import { Component, ChangeDetectionStrategy, DestroyRef, inject, signal, computed, OnDestroy, ViewChild, ElementRef, effect } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { QRCodeComponent } from 'angularx-qrcode';
import { KycTermsDialogComponent } from './kyc-terms-dialog.component';
import { KycHelpDialogComponent } from './kyc-help-dialog.component';
import { KycRedoConfirmDialogComponent } from './kyc-redo-confirm-dialog.component';

import { ContractorApiService, KycChallenge, KycDebugPayload } from '../../services/contractor-api.service';
import { OnboardingNextStepCtaComponent } from '../../components/shared/onboarding-next-step-cta/onboarding-next-step-cta.component';
import { KycProgressBarComponent } from '../../components/shared/kyc-progress-bar/kyc-progress-bar.component';
import { ParcoursStepperComponent } from '../../components/shared/parcours-stepper/parcours-stepper.component';
import { ContractorSessionService } from '../../services/contractor-session.service';
import { RefreshService } from '../../services/refresh.service';
import { decideNextKycState, shouldRegenerateQr, KycPollState } from './kyc-poll-state';

type KycState = 'verified_recap' | 'idle' | 'qr_code' | 'phone_connected' | 'challenge_ready' | 'countdown' | 'recording' | 'uploading' | 'processing' | 'polling_stalled' | 'approved' | 'rejected' | 'qr_expired';

@Component({
  selector: 'app-contractor-kyc',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    QRCodeComponent,
    OnboardingNextStepCtaComponent,
    KycProgressBarComponent,
    ParcoursStepperComponent,
  ],
  templateUrl: './contractor-kyc.component.html',
  styleUrl: './contractor-kyc.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorKycComponent implements OnDestroy {
  private readonly api = inject(ContractorApiService);
  private readonly session = inject(ContractorSessionService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly refreshBus = inject(RefreshService);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('videoPreview') videoPreview!: ElementRef<HTMLVideoElement>;

  /**
   * État initial calculé depuis le dashboard : si le KYC est déjà `approved`,
   * on ouvre la page sur l'écran récap (lecture seule + porte de secours
   * confirmée) au lieu du formulaire de lancement. Empêche l'auto-sabotage
   * par clic accidentel sur "Commencer" alors que l'identité est validée.
   */
  readonly state = signal<KycState>(
    this.session.kycStatus === 'approved' ? 'verified_recap' : 'idle',
  );

  /** Date de la dernière vérification KYC (ISO), affichée sur l'écran récap. */
  readonly verifiedAt = signal<string | null>(null);

  /** Prénom + nom du contractor (pour personnaliser le récap). */
  readonly verifiedName = signal<string>('');

  private readonly dashboardSub = this.session.dashboard$.subscribe(dash => {
    if (!dash) return;
    this.verifiedAt.set(dash.kyc?.last_attempt_at ?? null);
    const first = dash.contractor?.firstName ?? '';
    const last = dash.contractor?.lastName ?? '';
    this.verifiedName.set(`${first} ${last}`.trim());
    // Si le dashboard devient 'approved' après-coup (rematch positif p.ex.),
    // on rebascule sur le récap tant qu'on est encore en état neutre.
    if (dash.kyc?.status === 'approved' && this.state() === 'idle') {
      this.state.set('verified_recap');
    }
  });

  /**
   * `true` pendant les états actifs de la session KYC (countdown, recording,
   * uploading, processing). Sert à deux verrouillages UX :
   *   1. `kycBusyEffect` → désactive le bouton Rafraîchir du header (refresh
   *      tuerait la session caméra + l'upload en cours).
   *   2. Template → désactive le mini-stepper parcours en haut de page : un
   *      clic accidentel sur la pastille « Docs » ou « Certif. » naviguerait
   *      hors de /kyc et détruirait la vidéo enregistrée. Cf. binding
   *      [disabled] sur <app-parcours-stepper>.
   */
  readonly kycBusy = computed(() => {
    const s = this.state();
    return s === 'countdown' || s === 'recording' || s === 'uploading' || s === 'processing';
  });

  private readonly kycBusyEffect = effect(() => {
    this.refreshBus.setBusy('kyc-session', this.kycBusy());
  });

  /** Prochaine étape d'onboarding manquante — null tant que non chargée. */
  readonly nextAction = signal<string | null>(null);

  /**
   * Dès que le KYC passe en `approved` (polling ou chargement initial),
   * on rafraîchit le dashboard pour récupérer `next_action` et afficher
   * le CTA qui guide vers l'étape suivante (QCM, zones d'intervention, etc.).
   */
  private readonly approvedNextStepEffect = effect(() => {
    if (this.state() === 'approved') {
      this.api.getDashboard()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (d) => this.nextAction.set(d.next_action ?? null),
          error: () => this.nextAction.set(null),
        });
    }
  });

  readonly termsAccepted = signal(false);
  readonly startingChallenge = signal(false);
  readonly challenge = signal<KycChallenge | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly failureReason = signal<string | null>(null);
  readonly failureCode = signal<string | null>(null);
  readonly failureDetail = signal<string | null>(null);
  readonly failureDebug = signal<KycDebugPayload | null>(null);
  readonly recordingSeconds = signal(0);
  readonly countdownValue = signal(3);

  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingTimer: ReturnType<typeof setInterval> | null = null;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private qrRegenTimer: ReturnType<typeof setTimeout> | null = null;
  /** Échéance d'expiration du jeton mobile courant (ms epoch), pour la régénération préventive. */
  private qrExpiresAtMs = 0;
  /** Marge avant expiration où l'on régénère (absorbe le décalage d'horloge client/serveur). */
  private readonly QR_REGEN_MARGIN_MS = 30_000;
  // Canvas + animation frame utilisés pour enregistrer un flux MIROIRÉ
  // (cohérent avec l'affichage utilisateur). Sans cela, MediaRecorder
  // capturerait le flux brut caméra (non miroiré) alors que le contractor
  // voit son reflet — causant une confusion sur "votre gauche/droite".
  private mirrorCanvas: HTMLCanvasElement | null = null;
  private mirrorAnimationFrame: number | null = null;
  maxDuration = 10;

  /**
   * URL du lien capability KYC mobile à encoder dans le QR. C'est CETTE
   * URL qui est rendue en QR-code par le composant `<qrcode>` (dépendance
   * `angularx-qrcode` déjà installée). Le rendu est 100% local — le token
   * capability ne fuite JAMAIS vers un service tiers (auparavant on passait
   * par api.qrserver.com, ce qui exposait l'URL d'auth mobile à un service
   * externe — corrigé 2026-05-18).
   */
  readonly mobileKycUrl = signal('');

  /** Dernier `phone_connected` connu (mis à jour à chaque poll). */
  private lastPhoneConnected = false;

  /** Construit l'URL mobile + arme la régénération préventive du QR. */
  private generateQrCode(token: string, expiresAt?: string): void {
    const baseUrl = window.location.origin;
    this.mobileKycUrl.set(`${baseUrl}/kyc/mobile/${token}`);
    // Date.parse renvoie NaN sur une date malformée : on retombe sur 0 pour
    // que armQrRegen no-ope (sinon setTimeout(fn, NaN) se déclenche aussitôt).
    const parsed = expiresAt ? Date.parse(expiresAt) : 0;
    this.qrExpiresAtMs = Number.isNaN(parsed) ? 0 : parsed;
    this.armQrRegen();
  }

  /** Current challenge index (0 ou 1) selon position dans la vidéo */
  private currentChallengeIndex(): number {
    const secs = this.recordingSeconds();
    const half = Math.floor(this.maxDuration / 2);
    return secs < half ? 0 : 1;
  }

  /** Secondes restantes sur le challenge en cours */
  challengeSecondsLeft(): number {
    const secs = this.recordingSeconds();
    const half = Math.floor(this.maxDuration / 2);
    const boundary = this.currentChallengeIndex() === 0 ? half : this.maxDuration;
    return Math.max(0, boundary - secs);
  }

  /** Progression 0-100 du challenge en cours (pour barre animée) */
  challengeProgressPct(): number {
    const secs = this.recordingSeconds();
    const half = Math.floor(this.maxDuration / 2);
    if (this.currentChallengeIndex() === 0) {
      return Math.min(100, (secs / half) * 100);
    }
    return Math.min(100, ((secs - half) / half) * 100);
  }

  /** Numéro du challenge en cours pour affichage 1/2 ou 2/2 */
  challengeNumber(): number {
    return this.currentChallengeIndex() + 1;
  }

  /** Current challenge instruction shown during recording */
  currentChallengeLabel(): string {
    const challenges = this.challenge()?.challenges ?? [];
    return challenges[this.currentChallengeIndex()]?.label ?? '';
  }

  /** Icone Material du challenge en cours (pour indication visuelle direction) */
  currentChallengeIcon(): string {
    const challenges = this.challenge()?.challenges ?? [];
    return challenges[this.currentChallengeIndex()]?.icon ?? '';
  }

  /** Action machine du challenge en cours (turn_left, smile, etc.) utile pour le CSS */
  currentChallengeAction(): string {
    const challenges = this.challenge()?.challenges ?? [];
    return challenges[this.currentChallengeIndex()]?.action ?? '';
  }

  /** Force desktop camera mode (skip QR code) */
  forceDesktopMode(): void {
    this.state.set('challenge_ready');
  }

  ngOnDestroy(): void {
    this.cleanup();
    this.dashboardSub.unsubscribe();
    this.refreshBus.setBusy('kyc-session', false);
  }

  /**
   * Ouvre le modal de confirmation avant relance d'une session KYC alors
   * que l'identité est déjà vérifiée. Si l'utilisateur confirme, on bascule
   * sur l'état `idle` — le flux normal reprend à partir de là (acceptation
   * CGU puis `startChallenge()`). Côté backend, le fait de démarrer une
   * nouvelle session KYC n'invalide pas automatiquement la précédente
   * (pas de hook côté serveur pour `idle → challenge`) : la suspension
   * effective côté tuita.fr a lieu à l'issue de la nouvelle session, via
   * le webhook `contractor.compliance.invalidated` si elle échoue. On
   * affiche néanmoins le warning UX pour éviter le clic réflexe.
   */
  openRedoConfirm(): void {
    const ref = this.dialog.open(KycRedoConfirmDialogComponent, {
      width: '520px',
      autoFocus: false,
      restoreFocus: true,
    });
    ref.afterClosed().subscribe(confirmed => {
      if (confirmed === true) {
        this.state.set('idle');
      }
    });
  }

  openTermsDialog(event: Event): void {
    event.preventDefault();
    const dialogRef = this.dialog.open(KycTermsDialogComponent, {
      width: '600px',
      maxHeight: '80vh',
    });
    dialogRef.afterClosed().subscribe(accepted => {
      if (accepted) {
        this.termsAccepted.set(true);
      }
    });
  }

  /**
   * Ouvre le modal d'aide KYC avec explications détaillées des gestes, des
   * conditions de lumière et des erreurs fréquentes. Pour les contractors qui
   * veulent plus de contexte que la liste ultra-condensée de l'écran preview.
   */
  openHelpDialog(): void {
    this.dialog.open(KycHelpDialogComponent, {
      width: '560px',
      maxHeight: '85vh',
      panelClass: 'kyc-help-dialog-panel',
    });
  }

  // --- State machine ---

  startChallenge(): void {
    // Garde anti-double-clic : sans ça, un rage-click envoyait 4–5 POST /kyc/challenge
    // en parallèle, qui saturaient pm.max_children=5 côté PHP-FPM + se battaient sur
    // le sémaphore GET_LOCK MySQL → 500/timeouts.
    if (this.startingChallenge()) {
      return;
    }
    this.startingChallenge.set(true);
    this.errorMessage.set(null);

    this.api.generateChallenge().subscribe({
      next: ch => {
        this.challenge.set(ch);
        this.maxDuration = ch.video_max_duration_seconds || 10;

        // Decide flow based on desktop_mode config + device type
        const desktopMode = (ch as any).desktop_mode ?? 'qr_code';
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        if (isMobile || desktopMode === 'camera') {
          // Mobile or forced camera mode → direct recording
          this.state.set('challenge_ready');
        } else if (desktopMode === 'auto') {
          // Auto: QR on desktop, camera on mobile
          this.generateQrCode(ch.challenge_token, ch.expires_at);
          this.state.set('qr_code');
          this.startPolling();
        } else {
          // Default: qr_code → show QR for mobile scan
          this.generateQrCode(ch.challenge_token, ch.expires_at);
          this.state.set('qr_code');
          this.startPolling(); // Poll for mobile completion
        }
        this.startingChallenge.set(false);
      },
      error: (err: any) => {
        this.errorMessage.set(err?.error?.error?.message ?? err?.error?.message ?? 'Impossible de generer le challenge.');
        this.state.set('idle');
        this.startingChallenge.set(false);
      },
    });
  }

  async startRecording(): Promise<void> {
    this.errorMessage.set(null);

    try {
      // Ratio portrait 3:4 (720x960) pour matcher l'ovale de cadrage (240x320).
      // Le contractor voit sa vidéo rognée à l'ovale et peut centrer son visage
      // correctement. Un cadrage carré (ancien) laissait le visage mal positionné
      // et cramé par le backlight (fenêtre derrière) — MTCNN ratait alors > 50%
      // des frames. En portrait, la tête + épaules rentrent dans l'ovale à une
      // distance de ~40-50cm, distance idéale pour l'exposition et MTCNN.
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
        audio: false,
      });

      // Countdown 3-2-1 AVANT de lancer MediaRecorder. Objectif : laisser au
      // contractor le temps de lâcher la souris + se caler face caméra dans
      // l'ovale. Sans countdown, la 1ère seconde était perdue en ajustement
      // (doigts sur clavier, tête pas en place) → best_frame tombait souvent
      // sur une frame floue/bougée → score DeepFace catastrophique (0.08).
      this.state.set('countdown');

      // Attacher tout de suite le stream au <video> pour que le contractor
      // SE VOIT pendant le countdown et se positionne. Même problème de
      // timing Angular que recording → polling (cf. reattachStreamWithRetry).
      this.reattachStreamWithRetry();

      await this.runCountdown(3);

      this.state.set('recording');

      // Le <video #videoPreview> du bloc countdown a été détruit par Angular
      // quand on passe à state='recording' (bloc @if différent). Le nouvel
      // élément du bloc recording est vide — il faut lui ré-attacher le stream
      // sinon l'écran reste noir pendant l'enregistrement.
      //
      // ⚠️ setTimeout(50) est INSUFFISANT : Angular zonejs + @if peut prendre
      // 100-200ms pour détruire l'ancien <video> et monter le nouveau. Si on
      // ré-attache trop tôt, `this.videoPreview.nativeElement` pointe encore
      // sur l'élément détruit → stream attaché dans le vide → oval noir sur
      // l'écran pendant tout l'enregistrement. Solution : polling 50ms sur
      // `srcObject` jusqu'à 2 secondes max pour garantir l'attachement.
      this.reattachStreamWithRetry();

      this.recordedChunks = [];

      // Créer un canvas qui redessine le flux caméra en miroir (scaleX = -1)
      // et enregistrer LE FLUX DU CANVAS — pas le stream brut. Ainsi ce que
      // MediaPipe analyse côté backend = ce que voit l'utilisateur à l'écran.
      const mirroredStream = this.createMirroredStream(this.mediaStream);

      this.mediaRecorder = new MediaRecorder(mirroredStream, { mimeType: 'video/webm' });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => this.onRecordingStopped();

      this.mediaRecorder.start(100);
      this.recordingSeconds.set(0);

      this.recordingTimer = setInterval(() => {
        const current = this.recordingSeconds() + 1;
        this.recordingSeconds.set(current);
        if (current >= this.maxDuration) {
          this.stopRecording();
        }
      }, 1000);

    } catch {
      this.errorMessage.set('Impossible d\'accéder à la caméra. Vérifiez les permissions.');
      this.state.set('challenge_ready');
    }
  }

  /**
   * Affiche un countdown 3→2→1 pendant `seconds` secondes avant de résoudre.
   * Utilisé entre l'ouverture caméra et le démarrage MediaRecorder pour
   * laisser au contractor le temps de se préparer.
   */
  /**
   * Polling 50 ms (max 40 essais = 2 s) pour ré-attacher le mediaStream au
   * <video #videoPreview> fraîchement créé par Angular quand on passe du
   * state `countdown` au state `recording` (blocs @if distincts → Angular
   * détruit l'ancien video et monte le nouveau, avec un délai variable).
   *
   * Un simple `setTimeout(50)` rate dans ~30% des cas sur PC lent / dev server
   * chaud → oval vidéo noir pendant tout l'enregistrement même si le stream
   * caméra est OK. Le polling est la seule façon robuste de garantir que
   * `ViewChild.nativeElement` pointe bien sur le DOM courant.
   *
   * Sortie anticipée dès que `srcObject` est attaché et que la vidéo joue.
   */
  private reattachStreamWithRetry(maxAttempts = 40): void {
    let attempts = 0;
    const tryAttach = (): void => {
      attempts++;
      const el = this.videoPreview?.nativeElement;
      if (el && this.mediaStream) {
        // Déjà attaché ET en lecture → rien à faire.
        if (el.srcObject === this.mediaStream && !el.paused) {
          return;
        }
        el.srcObject = this.mediaStream;
        el.play().catch(() => {
          // Autoplay peut échouer si le user a coupé la caméra entre temps —
          // on ne relance pas, Angular détruira/reconstruira le state suivant.
        });
        return;
      }
      if (attempts < maxAttempts) {
        setTimeout(tryAttach, 50);
      }
    };
    setTimeout(tryAttach, 50);
  }

  private runCountdown(seconds: number): Promise<void> {
    return new Promise((resolve) => {
      this.countdownValue.set(seconds);
      const tick = () => {
        const next = this.countdownValue() - 1;
        if (next <= 0) {
          resolve();
          return;
        }
        this.countdownValue.set(next);
        setTimeout(tick, 1000);
      };
      setTimeout(tick, 1000);
    });
  }

  stopRecording(): void {
    if (this.recordingTimer !== null) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.stopCamera();
  }

  private onRecordingStopped(): void {
    const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
    const file = new File([blob], 'kyc-video.webm', { type: 'video/webm' });
    const token = this.challenge()?.challenge_token;

    if (!token) {
      this.errorMessage.set('Token de challenge invalide.');
      this.state.set('idle');
      return;
    }

    this.state.set('uploading');

    this.api.submitVideo(file, token).subscribe({
      next: () => {
        this.state.set('processing');
        this.startPolling();
      },
      error: (err: any) => {
        this.errorMessage.set(err?.error?.message ?? 'Erreur lors de l\'envoi de la video.');
        this.state.set('challenge_ready');
      },
    });
  }

  private pollCount = 0;
  private pollStartedAt = 0;
  // Timeout doux côté `processing` (analyse en cours) — cohérent avec le message
  // UX (« jusqu'à 10 minutes ») + tampon réseau. Au-delà, on n'affiche PAS un
  // faux rejet : on bascule en `polling_stalled` avec bouton manuel.
  private readonly MAX_POLL_DURATION_PROCESSING = 12 * 60 * 1000;
  // Timeout très large côté `qr_code` (PC affiche le QR, attend que l'utilisateur
  // scanne + filme + soumette sur son mobile). Si on appliquait 12 min ici, le PC
  // basculerait en "stalled" alors que le mobile n'a même pas encore soumis.
  private readonly MAX_POLL_DURATION_QR = 60 * 60 * 1000;

  // Wake Lock pour empêcher la mise en veille de l'écran pendant l'analyse
  // (mobile/tablette : sans ça, l'écran se verrouille → JS suspendu, polling gelé).
  private wakeLock: any = null;
  private visibilityHandler: (() => void) | null = null;

  private startPolling(): void {
    this.stopPolling();
    this.pollCount = 0;
    this.pollStartedAt = Date.now();

    // 1) Empêche la mise en veille de l'écran (best-effort, supporté sur Android Chrome,
    //    iOS Safari ≥ 16.4, Edge, Chrome desktop). Sur les autres navigateurs, fallback :
    //    le user verra le warning "ne fermez pas la page".
    this.acquireWakeLock();

    // 2) Quand l'onglet redevient visible (utilisateur déverrouille son téléphone,
    //    revient sur l'onglet, etc.), on déclenche un poll immédiat pour rattraper
    //    le throttling/suspension du timer pendant l'arrière-plan.
    this.visibilityHandler = () => {
      const s = this.state();
      const pollingStates: KycState[] = ['processing', 'qr_code', 'phone_connected'];
      if (document.visibilityState === 'visible' && pollingStates.includes(s)) {
        this.acquireWakeLock(); // certains navigateurs libèrent le lock au backgrounding
        this.pollNow();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);

    this.schedulePoll();
  }

  private schedulePoll(immediate: boolean = false): void {
    // Backoff: 3s, 5s, 8s, 12s, 15s, 15s, 15s...
    const delays = [3000, 5000, 8000, 12000, 15000];
    const delay = immediate ? 0 : delays[Math.min(this.pollCount, delays.length - 1)];

    this.pollingTimer = setTimeout(() => {
      // Timeout doux : on N'affiche PAS un faux rejet — le job peut encore finir.
      // On bascule en polling_stalled avec bouton "Vérifier maintenant".
      // Le seuil dépend de l'écran : tant qu'on ATTEND LE MOBILE (QR affiché OU
      // téléphone connecté en train de filmer), on tolère beaucoup plus longtemps
      // que processing (analyse en cours, ≤ 10 min annoncées au user). Sans
      // `phone_connected` ici, un scan tardif (≈9e min) basculerait en
      // polling_stalled en plein filmage — alors que le backend a justement
      // prolongé le jeton (refreshExpiry) pour ce cas.
      const waitingForPhone = this.state() === 'qr_code' || this.state() === 'phone_connected';
      const ceiling = waitingForPhone
        ? this.MAX_POLL_DURATION_QR
        : this.MAX_POLL_DURATION_PROCESSING;
      if (Date.now() - this.pollStartedAt > ceiling) {
        this.stopPolling();
        this.state.set('polling_stalled');
        return;
      }

      this.api.getKycStatus().subscribe({
        next: status => {
          this.lastPhoneConnected = status.phone_connected ?? false;

          const next = decideNextKycState({
            serverStatus: status.status ?? null,
            phoneConnected: this.lastPhoneConnected,
            currentState: this.state() as KycPollState,
          });

          if (next === 'approved') {
            this.stopPolling();
            this.state.set('approved');
            this.session.refreshDashboard();
          } else if (next === 'rejected') {
            this.stopPolling();
            this.failureReason.set(this.translateFailure(status));
            this.failureCode.set(status.failure_reason ?? null);
            this.failureDetail.set(status.failure_detail ?? null);
            this.failureDebug.set(status.debug ?? null);
            this.state.set('rejected');
          } else if (next === 'qr_expired') {
            // Filet : le jeton est mort sans avoir été régénéré à temps.
            this.stopPolling();
            this.state.set('qr_expired');
          } else if (next === 'processing') {
            // Le mobile a soumis sa vidéo → analyse démarrée. Reset du timer
            // pour appliquer le timeout court (processing ≤ 12 min).
            this.cancelQrRegen();
            this.pollStartedAt = Date.now();
            this.pollCount = 0;
            this.state.set('processing');
            this.schedulePoll();
          } else if (next === 'phone_connected') {
            // Le QR a été scanné : on quitte « en attente » pour « téléphone
            // connecté ». Le QR n'est plus utile, on coupe sa régénération.
            this.cancelQrRegen();
            this.state.set('phone_connected');
            this.pollCount++;
            this.schedulePoll();
          } else {
            this.pollCount++;
            this.schedulePoll();
          }
        },
        error: () => {
          this.pollCount++;
          this.schedulePoll();
        },
      });
    }, delay) as unknown as ReturnType<typeof setInterval>;
  }

  /** Force un poll immédiat (bouton "Vérifier maintenant" + retour de visibilité). */
  private pollNow(): void {
    if (this.pollingTimer !== null) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.pollCount = 0; // reset backoff après retour
    this.schedulePoll(true);
  }

  /** Bouton manuel sur l'écran polling_stalled. */
  refreshNow(): void {
    if (this.state() === 'polling_stalled') {
      this.state.set('processing');
      this.startPolling();
    } else {
      this.pollNow();
    }
  }

  /**
   * Arme un timer qui régénère le QR ~30 s avant son expiration, SAUF si le
   * téléphone a déjà scanné (cf. shouldRegenerateQr). Sans expires_at connu,
   * on ne fait rien (le filet `expired` côté polling prend le relais).
   */
  private armQrRegen(): void {
    this.cancelQrRegen();
    if (this.qrExpiresAtMs <= 0) {
      return;
    }
    const delay = Math.max(5_000, this.qrExpiresAtMs - Date.now() - this.QR_REGEN_MARGIN_MS);
    this.qrRegenTimer = setTimeout(() => {
      if (shouldRegenerateQr({ currentState: this.state() as KycPollState, phoneConnected: this.lastPhoneConnected })) {
        this.regenerateQr();
      }
    }, delay);
  }

  private cancelQrRegen(): void {
    if (this.qrRegenTimer !== null) {
      clearTimeout(this.qrRegenTimer);
      this.qrRegenTimer = null;
    }
  }

  /**
   * Demande un nouveau jeton (le backend invalide l'ancien via
   * invalidatePreviousForSession) et remplace l'URL du QR en silence.
   *
   * Échec réseau : tant qu'il reste de la marge avant expiration, on laisse le
   * timer retenter (armQrRegen replanifie à ~5 s puisqu'on est déjà près de
   * l'échéance). Si le jeton est mort sans qu'on ait pu le renouveler, on
   * bascule sur l'écran de récupération manuelle `qr_expired` plutôt que de
   * laisser un QR inutilisable affiché.
   */
  private regenerateQr(): void {
    this.api.generateChallenge().subscribe({
      next: ch => {
        this.challenge.set(ch);
        this.generateQrCode(ch.challenge_token, ch.expires_at);
      },
      error: () => {
        // Le QR reste scannable jusqu'à son expiration réelle : on ne baisse
        // les bras (qr_expired) que s'il est vraiment mort. Avant ça, armQrRegen
        // replanifie un retry court (~5 s, plancher du delai).
        const dead = this.qrExpiresAtMs > 0 && Date.now() >= this.qrExpiresAtMs;
        if (dead) {
          this.stopPolling();
          this.state.set('qr_expired');
        } else {
          this.armQrRegen();
        }
      },
    });
  }

  /** Bouton « Générer un nouveau QR » de l'écran qr_expired. */
  regenerateQrManually(): void {
    this.state.set('qr_code');
    this.regenerateQr();
    this.startPolling();
  }

  private async acquireWakeLock(): Promise<void> {
    try {
      const nav = navigator as any;
      if (nav.wakeLock && typeof nav.wakeLock.request === 'function') {
        // Si déjà acquis, ne pas redemander.
        if (this.wakeLock && !this.wakeLock.released) return;
        this.wakeLock = await nav.wakeLock.request('screen');
        this.wakeLock.addEventListener?.('release', () => {
          this.wakeLock = null;
        });
      }
    } catch {
      // Best-effort : pas de wake lock dispo (Firefox iOS, vieux Safari) → on continue
      // quand même, le warning UX prend le relais.
    }
  }

  private releaseWakeLock(): void {
    if (this.wakeLock) {
      try {
        this.wakeLock.release?.();
      } catch { /* noop */ }
      this.wakeLock = null;
    }
  }

  retry(): void {
    this.state.set('idle');
    this.challenge.set(null);
    this.errorMessage.set(null);
    this.failureReason.set(null);
    this.failureCode.set(null);
    this.failureDetail.set(null);
    this.failureDebug.set(null);
  }

  /** Pretty-print du JSON debug pour la <pre>. */
  formatDebug(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  goToDashboard(): void {
    this.router.navigateByUrl('/dashboard');
  }

  /**
   * Enchaîne sur la phase 3 du parcours après KYC validé. La page
   * /certification a ses propres gardes (déjà certifié → recap, première
   * tentative → intro) — on n'a rien à savoir ici.
   */
  goToCertification(): void {
    this.router.navigateByUrl('/certification');
  }

  // --- Helpers ---

  private translateFailure(status: any): string {
    return this.failureGuide(status?.failure_reason).description;
  }

  /**
   * Guide utilisateur affiché en prod : description claire + actions concrètes
   * + code de référence pour le support. Aucune donnée sensible (scores, seuils,
   * provider) — celles-ci restent dans le bloc debug local/staging uniquement.
   */
  failureGuide(code: string | null | undefined): { description: string; actions: string[] } {
    const guides: Record<string, { description: string; actions: string[] }> = {
      liveness_failed: {
        description: "Le test de vivacité n'a pas été concluant : nous n'avons pas pu confirmer qu'une vraie personne se trouvait devant la caméra.",
        actions: [
          "Placez-vous dans un endroit bien éclairé, sans contre-jour (pas de fenêtre derrière vous).",
          "Retirez chapeau, lunettes de soleil, masque ou tout accessoire qui couvre le visage.",
          "Regardez directement l'objectif et restez immobile pendant l'enregistrement.",
        ],
      },
      face_not_detected: {
        description: "Aucun visage clairement identifiable n'a été trouvé - soit dans votre vidéo, soit sur la photo de votre pièce d'identité.",
        actions: [
          "Centrez votre visage dans le cadre, à environ 30 cm de la caméra.",
          "Vérifiez que votre pièce d'identité est nette, bien éclairée et entièrement visible (pas de doigt sur la photo).",
          "Si le problème persiste après plusieurs essais, reuploadez votre pièce d'identité (CNI ou passeport).",
        ],
      },
      face_mismatch: {
        description: "Le visage filmé ne correspond pas à celui de votre pièce d'identité.",
        actions: [
          "Vérifiez que vous utilisez bien votre propre pièce d'identité (et pas celle d'un proche).",
          "Si votre apparence a beaucoup changé (barbe, coupe de cheveux, lunettes nouvelles), retirez les éléments ajoutés au moment du KYC.",
          "Si la photo de votre pièce d'identité est floue, sombre ou abîmée, reuploadez une version plus nette.",
          "Filmez-vous dans une pièce bien éclairée, face à la caméra, sans accessoire couvrant le visage.",
        ],
      },
      dual_challenge_failed: {
        description: "Les deux mouvements de tête demandés n'ont pas été correctement détectés.",
        actions: [
          "Relisez attentivement les deux instructions affichées avant de lancer l'enregistrement.",
          "Effectuez chaque mouvement franchement et lentement (par ex. tournez la tête vers la gauche jusqu'au bout, puis revenez).",
          "Ne bougez pas la caméra ni le téléphone pendant l'enregistrement - seule votre tête doit bouger.",
        ],
      },
      spoofing_detected: {
        description: "Le système a détecté un signal de fraude (photo, écran, masque, ou tentative d'usurpation).",
        actions: [
          "Filmez votre vrai visage en direct, face à la caméra - pas une photo ni un écran qui affiche un visage.",
          "Ne portez pas de masque, ni de lunettes opaques.",
        ],
      },
      biometric_service_unavailable: {
        description: "Notre service de vérification d'identité est momentanément indisponible.",
        actions: [
          "Réessayez dans quelques minutes - il s'agit en général d'une coupure courte.",
        ],
      },
      best_frame_missing: {
        description: "Une vérification automatique de continuité d'identité a échoué (donnée technique manquante).",
        actions: [
          "Refaites une session KYC complète - c'est la procédure normale dans ce cas.",
        ],
      },
      face_mismatch_on_doc_change: {
        description: "Vous avez réuploadé une pièce d'identité, mais le visage de cette nouvelle pièce ne correspond pas à celui filmé lors de votre KYC précédent.",
        actions: [
          "Si vous avez renouvelé votre pièce d'identité légitimement, refaites un KYC complet pour mettre à jour la correspondance.",
          "Sinon, vérifiez que la pièce uploadée est bien la vôtre.",
        ],
      },
      provider_unavailable_on_rematch: {
        description: "Une revérification automatique a échoué pour cause d'indisponibilité du service.",
        actions: [
          "Refaites une session KYC complète pour réactiver votre vérification d'identité.",
        ],
      },
    };

    return guides[code ?? ''] ?? {
      description: "La vérification a échoué pour une raison non identifiée.",
      actions: [
        "Réessayez en suivant à la lettre les instructions à l'écran.",
      ],
    };
  }

  private stopCamera(): void {
    if (this.mirrorAnimationFrame !== null) {
      cancelAnimationFrame(this.mirrorAnimationFrame);
      this.mirrorAnimationFrame = null;
    }
    this.mirrorCanvas = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
  }

  /**
   * Crée un flux MediaStream qui copie la webcam en appliquant un miroir
   * horizontal (scaleX = -1). Le flux retourné est ensuite donné à
   * MediaRecorder pour que le contenu ENREGISTRÉ corresponde exactement à
   * ce que le contractor voit à l'écran (lui-même déjà affiché en miroir
   * via CSS).
   *
   * Principe : un <video> caché joue le stream brut, un <canvas> redessine
   * chaque frame avec un scale(-1, 1). On capture le flux du canvas via
   * canvas.captureStream() — c'est lui qui est enregistré.
   *
   * Perf : le redraw se fait via requestAnimationFrame (suit le refresh
   * monitor ~60fps), c'est négligeable côté CPU (quelques pourcent).
   */
  private createMirroredStream(sourceStream: MediaStream): MediaStream {
    const videoTrack = sourceStream.getVideoTracks()[0];
    const settings = videoTrack.getSettings();
    const width = settings.width ?? 720;
    const height = settings.height ?? 720;

    // Video offscreen qui consomme le stream brut
    const sourceVideo = document.createElement('video');
    sourceVideo.srcObject = sourceStream;
    sourceVideo.muted = true;
    sourceVideo.playsInline = true;
    sourceVideo.play();

    // Canvas qui dessine la video source en miroir
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      // Fallback si le navigateur n'accepte pas 2d (très rare) : on
      // retourne le stream brut pour ne pas bloquer l'enregistrement,
      // quitte à perdre la cohérence gauche/droite pour cet utilisateur.
      return sourceStream;
    }

    this.mirrorCanvas = canvas;

    const drawFrame = () => {
      if (!this.mirrorCanvas) return; // cleanup déjà passé
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(sourceVideo, -width, 0, width, height);
      ctx.restore();
      this.mirrorAnimationFrame = requestAnimationFrame(drawFrame);
    };
    drawFrame();

    // captureStream() à la fréquence native du canvas (suivra requestAnimationFrame)
    return canvas.captureStream(30);
  }

  private stopPolling(): void {
    this.cancelQrRegen();
    if (this.pollingTimer !== null) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.releaseWakeLock();
  }

  private cleanup(): void {
    this.stopCamera();
    this.stopPolling();
    if (this.recordingTimer !== null) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
  }
}
