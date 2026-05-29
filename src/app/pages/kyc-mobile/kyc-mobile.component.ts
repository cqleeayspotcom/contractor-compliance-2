import {
  Component, OnInit, OnDestroy, ViewChild, ElementRef, inject, signal, computed
} from '@angular/core';
import { CommonModule }             from '@angular/common';
import { ActivatedRoute }           from '@angular/router';
import { MatButtonModule }          from '@angular/material/button';
import { MatIconModule }            from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject }                  from 'rxjs';
import { takeUntil, timeout }       from 'rxjs/operators';

import { KycService, KycChallenge } from '../../services/kyc.service';

type Step =
  | 'loading'
  | 'intro'            // écran d'introduction avec instructions
  | 'challenge_1'      // caméra ouverte, consigne 1 visible, attente du clic "Prêt"
  | 'countdown_1'      // décompte 3-2-1 avant enregistrement challenge 1
  | 'recording_1'      // enregistrement challenge 1
  | 'transition'       // 1s de transition entre les 2 challenges
  | 'challenge_2'      // consigne 2 visible, attente du clic "Prêt"
  | 'countdown_2'      // décompte 3-2-1 avant enregistrement challenge 2
  | 'recording_2'      // enregistrement challenge 2
  | 'uploading'
  | 'success'
  | 'error';

const CHALLENGE_LABELS: Record<KycChallenge, string> = {
  turn_left:  'Tournez la tête vers VOTRE gauche',
  turn_right: 'Tournez la tête vers VOTRE droite',
  look_up:    'Regardez vers le haut',
  look_down:  'Regardez vers le bas',
  nod:        'Hochez la tête (oui)',
  blink:      'Fermez les yeux 1 seconde puis rouvrez',
  smile:      'Souriez franchement (montrez les dents)',
  open_mouth: 'Ouvrez grand la bouche',
};

// Hint court affiché sous le label principal (pas trop long pour mobile)
const CHALLENGE_HINTS: Record<KycChallenge, string> = {
  turn_left:  'Gardez les épaules face caméra, tournez votre tête 30° à gauche',
  turn_right: 'Gardez les épaules face caméra, tournez votre tête 30° à droite',
  look_up:    'Levez bien le menton vers le plafond',
  look_down:  'Baissez bien le menton vers vos pieds',
  nod:        'Un « oui » franc : haut, bas',
  blink:      'Fermez franchement les paupières - pas juste un regard baissé',
  smile:      'Un sourire timide n\'est pas détecté',
  open_mouth: 'Grand « Ah », pas juste entrouvrir',
};

const CHALLENGE_ICONS: Record<KycChallenge, string> = {
  turn_left:  'keyboard_arrow_left',
  turn_right: 'keyboard_arrow_right',
  look_up:    'keyboard_arrow_up',
  look_down:  'keyboard_arrow_down',
  nod:        'swap_vert',
  blink:      'visibility',
  smile:      'sentiment_very_satisfied',
  open_mouth: 'record_voice_over',
};

/**
 * Page mobile KYC — 2 challenges séquentiels anti-spoofing.
 * Route : /kyc/mobile/:token  (publique, pas d'auth)
 *
 * Flow :
 *  1. Valide le token → reçoit challenge 1 + challenge 2
 *  2. Ouvre la caméra directement
 *  3. Challenge 1 : consigne affichée → "Prêt" → enregistrement 4s
 *  4. Transition 1s
 *  5. Challenge 2 : nouvelle consigne → "Prêt" → enregistrement 4s
 *  6. Les 2 vidéos sont concaténées en un seul Blob et soumises
 *  7. Résultat
 */
@Component({
  selector: 'app-kyc-mobile',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './kyc-mobile.component.html',
  styleUrls: ['./kyc-mobile.component.scss']
})
export class KycMobileComponent implements OnInit, OnDestroy {
  @ViewChild('videoEl') videoElRef!: ElementRef<HTMLVideoElement>;

  private readonly kycService = inject(KycService);
  private readonly route      = inject(ActivatedRoute);
  private readonly destroy$   = new Subject<void>();

  step          = signal<Step>('loading');
  errorMsg      = signal('');
  canRetry      = signal(false);
  recordingSecs = signal(0);
  countdown     = signal(0);

  private token      = '';
  private challenge1: KycChallenge = 'turn_left';
  private challenge2: KycChallenge = 'turn_right';

  private stream:    MediaStream | null = null;
  private recorder:  MediaRecorder | null = null;
  private chunks1:   Blob[] = [];
  private chunks2:   Blob[] = [];
  private recTimer?:       ReturnType<typeof setInterval>;
  private countdownTimer?: ReturnType<typeof setInterval>;
  // Canvas + AF pour enregistrer un flux miroiré — cohérent avec ce que voit
  // le contractor à l'écran (caméra frontale naturellement affichée en miroir).
  private mirrorCanvas: HTMLCanvasElement | null = null;
  private mirrorStream: MediaStream | null = null;
  private mirrorAF: number | null = null;

  // ── Computed helpers ───────────────────────────────────────────────────────

  currentLabel = computed(() =>
    CHALLENGE_LABELS[this.isChallenge2Step() ? this.challenge2 : this.challenge1]
    ?? 'Regardez la caméra'
  );

  /** Labels/icônes des 2 gestes — affichés en aperçu sur l'écran d'intro. */
  challenge1Label = computed(() => CHALLENGE_LABELS[this.challenge1] ?? 'Premier mouvement');
  challenge2Label = computed(() => CHALLENGE_LABELS[this.challenge2] ?? 'Second mouvement');
  challenge1Icon = computed(() => CHALLENGE_ICONS[this.challenge1] ?? 'face');
  challenge2Icon = computed(() => CHALLENGE_ICONS[this.challenge2] ?? 'face');

  currentHint = computed(() =>
    CHALLENGE_HINTS[this.isChallenge2Step() ? this.challenge2 : this.challenge1]
    ?? ''
  );

  currentIcon = computed(() =>
    CHALLENGE_ICONS[this.isChallenge2Step() ? this.challenge2 : this.challenge1]
    ?? 'face'
  );

  /** Action machine ("turn_left", "smile"...) exposée pour le [data-action] CSS */
  currentAction = computed(() =>
    (this.isChallenge2Step() ? this.challenge2 : this.challenge1) as string
  );

  isCameraStep    = computed(() => ['challenge_1','countdown_1','recording_1','transition','challenge_2','countdown_2','recording_2'].includes(this.step()));
  isChallenge1Step = computed(() => ['challenge_1','countdown_1','recording_1'].includes(this.step()));
  isChallenge2Step = computed(() => ['challenge_2','countdown_2','recording_2'].includes(this.step()));
  isRecordingStep  = computed(() => this.step() === 'recording_1' || this.step() === 'recording_2');
  isCountdownStep  = computed(() => this.step() === 'countdown_1' || this.step() === 'countdown_2');

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    if (!this.token) { this.setError('Lien invalide.', false); return; }
    this.validateToken();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopStream();
    clearInterval(this.recTimer);
    clearInterval(this.countdownTimer);
  }

  // ── Token validation ───────────────────────────────────────────────────────

  private validateToken(): void {
    this.kycService.validateMobileToken(this.token)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => {
          this.challenge1 = data.challenge;
          this.challenge2 = data.challenge_2 ?? 'smile';
          this.step.set('intro');
        },
        error: (err) => {
          const backendMsg = this.extractBackendMessage(err);
          const backendCode = this.extractBackendCode(err);
          this.setError(
            this.formatError(
              backendMsg ?? 'Ce lien est invalide ou a expiré.',
              backendCode ?? `HTTP_${err?.status ?? '???'}`,
            ),
            false,
          );
        },
      });
  }

  // ── Camera ─────────────────────────────────────────────────────────────────

  private openCamera(): void {
    // POURQUOI cette garde explicite avant l'appel à getUserMedia :
    //   Sur HTTP (ex. l'IP de dev `http://34.34.169.47`), le navigateur ne
    //   considère PAS la page comme "secure context" → `navigator.mediaDevices`
    //   est `undefined` et accéder à `.getUserMedia(...)` jette un TypeError
    //   SYNCHRONE qui n'est PAS attrapé par le `.catch()` du Promise plus bas.
    //   Résultat sans cette garde : clic sur "Commencer la vérification" →
    //   l'exception remonte dans la zone Angular, le composant reste bloqué
    //   sur l'écran d'intro, aucun message d'erreur affiché → "rien ne se passe".
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.openingCamera.set(false);
      this.setError(
        this.formatError(
          'La caméra ne peut être ouverte qu\'en HTTPS. Ouvre cette page en https://… (ou via localhost en dev).',
          'CLIENT_NOT_SECURE_CONTEXT',
          `secureContext=${window.isSecureContext}, mediaDevices=${!!navigator.mediaDevices}`,
        ),
        false,
      );
      return;
    }

    let promise: Promise<MediaStream>;
    try {
      promise = navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (err: any) {
      this.openingCamera.set(false);
      // Filet de sécurité au cas où une implémentation exotique lèverait
      // encore une exception synchrone malgré la garde ci-dessus.
      this.setError(
        this.formatError(
          'Impossible d\'accéder à la caméra.',
          err?.name ?? 'CLIENT_GUM_THROW',
          err?.message ?? String(err),
        ),
        true,
      );
      return;
    }

    promise.then(stream => {
      this.openingCamera.set(false);
      this.stream = stream;
      this.step.set('challenge_1');
      setTimeout(() => {
        if (this.videoElRef?.nativeElement) {
          this.videoElRef.nativeElement.srcObject = stream;
        }
      }, 80);
    }).catch((err: any) => {
      this.openingCamera.set(false);
      const name = err?.name ?? 'CLIENT_GUM_REJECT';
      const denied = name === 'NotAllowedError';
      // Notre liste des erreurs getUserMedia courantes — toutes affichées avec
      // leur code DOMException pour qu'on les retrouve à coup sûr dans un
      // ticket support sans console de debug mobile :
      //   NotAllowedError, NotFoundError, NotReadableError, OverconstrainedError,
      //   SecurityError, AbortError, TypeError.
      const human = denied
        ? 'Accès à la caméra refusé. Activez-la dans les paramètres de votre navigateur.'
        : name === 'NotFoundError'
          ? 'Aucune caméra détectée sur cet appareil.'
          : name === 'NotReadableError'
            ? 'La caméra est déjà utilisée par une autre application.'
            : 'Impossible d\'accéder à la caméra.';
      this.setError(
        this.formatError(human, name, err?.message ?? undefined),
        !denied,
      );
    });
  }

  // ── Intro → Camera ─────────────────────────────────────────────────────────

  /** Garde anti-double-tap : entre le clic et la résolution de getUserMedia
   * (prompt navigateur), un second tap déclencherait un 2e appel et pourrait
   * laisser fuiter un MediaStream. Public + signal pour binding template. */
  readonly openingCamera = signal(false);

  startVerification(): void {
    if (this.openingCamera() || this.stream) return;
    this.openingCamera.set(true);
    this.openCamera();
  }

  // ── Countdown ─────────────────────────────────────────────────────────────

  startCountdown(): void {
    const isFirst = this.step() === 'challenge_1';
    this.step.set(isFirst ? 'countdown_1' : 'countdown_2');
    this.countdown.set(3);

    this.countdownTimer = setInterval(() => {
      const val = this.countdown() - 1;
      this.countdown.set(val);
      if (val <= 0) {
        clearInterval(this.countdownTimer);
        this.beginRecording();
      }
    }, 1000);
  }

  // ── Recording ──────────────────────────────────────────────────────────────

  private beginRecording(): void {
    if (!this.stream) return;

    const isFirst = this.step() === 'countdown_1';
    const targetStep: Step = isFirst ? 'recording_1' : 'recording_2';

    const mimeType = this.getSupportedMime();

    // Enregistrer le flux MIROIRÉ (pas le stream brut) pour que MediaPipe
    // analyse exactement ce que l'utilisateur voit à l'écran. Sans ça :
    // "tournez vers VOTRE gauche" → l'utilisateur tourne à sa gauche →
    // sur l'écran miroir son visage va à droite → confusion → il corrige
    // en sens inverse → challenge rejeté.
    const recordStream = this.ensureMirroredStream(this.stream);
    this.recorder = new MediaRecorder(recordStream, { mimeType });

    const chunks: Blob[] = [];
    this.recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    this.recorder.onstop = () => {
      if (isFirst) {
        this.chunks1 = chunks;
        this.onChallenge1Done();
      } else {
        this.chunks2 = chunks;
        this.onChallenge2Done();
      }
    };

    this.recorder.start(250);
    this.step.set(targetStep);
    this.recordingSecs.set(0);

    let s = 0;
    this.recTimer = setInterval(() => {
      s++;
      this.recordingSecs.set(s);
      if (s >= 4) this.stopCurrentRecording();
    }, 1000);
  }

  stopCurrentRecording(): void {
    clearInterval(this.recTimer);
    // Garde anti-double-stop : MediaRecorder.stop() jette InvalidStateError si
    // appelé sur un recorder déjà "inactive" (cas : timer 4s atteint + clic
    // utilisateur sur "Terminer" en même temps). Sans cette garde, l'exception
    // remonte dans la zone Angular et masque le flux normal.
    if (this.recorder && this.recorder.state !== 'inactive') {
      try { this.recorder.stop(); } catch { /* déjà arrêté entre 2 vérifs */ }
    }
  }

  // ── Challenge flow ─────────────────────────────────────────────────────────

  private onChallenge1Done(): void {
    this.step.set('transition');
    // 1.2s de feedback visuel "Parfait !" avant le 2ème challenge
    setTimeout(() => {
      this.step.set('challenge_2');
    }, 1200);
  }

  /** Évite de soumettre deux fois si onstop est rejoué pour une raison X. */
  private uploadStarted = false;

  private onChallenge2Done(): void {
    if (this.uploadStarted) return;
    this.uploadStarted = true;

    // Merge les 2 enregistrements en un seul Blob
    const allChunks = [...this.chunks1, ...this.chunks2];
    const mime = this.recorder?.mimeType ?? 'video/webm';
    const blob = new Blob(allChunks, { type: mime });

    if (blob.size < 30_000) {
      this.uploadStarted = false; // permet un retry
      this.setError(
        this.formatError(
          'Vidéo trop courte ou vide. Vérifie que ton micro/caméra autorise l\'enregistrement et réessaie.',
          'CLIENT_VIDEO_TOO_SMALL',
          `${blob.size} bytes`,
        ),
        true,
      );
      return;
    }

    this.stopStream();
    this.step.set('uploading');
    this.submitVideo(blob);
  }

  /** Timeout réseau pour l'upload : 90 s couvre largement même un 3G faible
   *  pour ~3 MB. Au-delà, on N'AURA pas l'aval du backend → retry est sûr. */
  private static readonly UPLOAD_TIMEOUT_MS = 90_000;

  private submitVideo(blob: Blob): void {
    this.kycService.submitMobileVideo(this.token, blob)
      .pipe(
        timeout({ each: KycMobileComponent.UPLOAD_TIMEOUT_MS }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        // ⚠️ Le job biométrique est ASYNC côté serveur — le 200 arrive dès que
        // la vidéo est uploadée + dispatchée, AVANT toute analyse. Un rejet
        // biométrique (`face_mismatch`, `liveness_failed`...) ne peut donc
        // PAS surfacer ici. Le verdict s'affiche côté PC (polling) ou sur
        // le tableau de bord du contractor à son retour.
        next: () => this.step.set('success'),
        error: (err) => {
          const status = err?.status;
          const backendMsg = this.extractBackendMessage(err);
          const backendCode = this.extractBackendCode(err);

          // Timeout RxJS (pas de status HTTP)
          if (err?.name === 'TimeoutError') {
            this.uploadStarted = false;
            this.setError(
              this.formatError(
                'L\'envoi de la vidéo a expiré (réseau trop lent). Réessaie.',
                'CLIENT_UPLOAD_TIMEOUT',
                `${KycMobileComponent.UPLOAD_TIMEOUT_MS / 1000}s`,
              ),
              true,
            );
            return;
          }

          // 410 : token consommé/expiré — pas de retry, faut repartir du PC
          if (status === 410) {
            this.setError(
              this.formatError(
                'Ce lien a déjà été utilisé ou a expiré. Retournez sur votre ordinateur pour relancer la vérification.',
                backendCode ?? 'HTTP_410',
                backendMsg ?? undefined,
              ),
              false,
            );
            return;
          }

          // Réseau coupé (status 0) ou 5xx : retry possible
          if (status === 0 || status >= 500) {
            this.uploadStarted = false;
            this.setError(
              this.formatError(
                backendMsg ?? 'Erreur réseau. Vérifie ta connexion puis réessaie.',
                backendCode ?? (status === 0 ? 'NETWORK_OFFLINE' : `HTTP_${status}`),
              ),
              true,
            );
            return;
          }

          // 4xx (autre que 410) : généralement non-retryable côté mobile
          // (token déjà utilisé, format invalide, fichier vide…). On affiche
          // explicitement le code backend pour débuguer depuis le mobile.
          this.setError(
            this.formatError(
              backendMsg ?? 'Erreur lors de l\'envoi.',
              backendCode ?? `HTTP_${status ?? '???'}`,
              status === 413 ? 'Vidéo trop grosse pour le serveur.' : undefined,
            ) + ' Si le problème persiste, retournez sur votre ordinateur pour relancer la vérification.',
            false,
          );
        },
      });
  }

  /**
   * Le backend Tuita renvoie l'enveloppe canonique { error: { code, message } }.
   * Sur HttpErrorResponse, le body parsé est dans `err.error`, donc le vrai
   * message est à `err.error.error.message` — NON `err.error.message` (ancienne
   * convention). On essaie plusieurs chemins pour rester robuste.
   */
  private extractBackendMessage(err: any): string | null {
    return (
      err?.error?.error?.message ??
      err?.error?.message ??
      (typeof err?.error === 'string' ? err.error : null) ??
      null
    );
  }

  private extractBackendCode(err: any): string | null {
    return err?.error?.error?.code ?? err?.error?.code ?? null;
  }

  /**
   * Formate un message d'erreur en y annexant TOUJOURS le code technique
   * (entre crochets) — sans console mobile, c'est la seule façon pour
   * l'utilisateur de nous remonter le diagnostic exact.
   */
  private formatError(humanMessage: string, code: string, extra?: string): string {
    const tail = extra ? ` — ${extra}` : '';
    return `${humanMessage}\n[code: ${code}${tail}]`;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  retry(): void {
    this.stopStream();
    clearInterval(this.recTimer);
    clearInterval(this.countdownTimer);
    this.chunks1 = [];
    this.chunks2 = [];
    this.uploadStarted = false;
    this.errorMsg.set('');
    this.openCamera();
  }

  private setError(msg: string, canRetry: boolean): void {
    this.errorMsg.set(msg);
    this.canRetry.set(canRetry);
    this.step.set('error');
    this.stopStream();
  }

  private stopStream(): void {
    if (this.mirrorAF !== null) {
      cancelAnimationFrame(this.mirrorAF);
      this.mirrorAF = null;
    }
    this.mirrorStream?.getTracks().forEach(t => t.stop());
    this.mirrorStream = null;
    this.mirrorCanvas = null;

    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
  }

  /**
   * Crée (une seule fois par session) un flux miroiré via Canvas pour que le
   * contenu enregistré par MediaRecorder corresponde à ce que voit le
   * contractor (affichage miroir CSS). Réutilisé entre les 2 challenges.
   */
  private ensureMirroredStream(sourceStream: MediaStream): MediaStream {
    if (this.mirrorStream) {
      return this.mirrorStream;
    }

    const videoTrack = sourceStream.getVideoTracks()[0];
    const settings = videoTrack.getSettings();
    const width = settings.width ?? 1280;
    const height = settings.height ?? 720;

    const sourceVideo = document.createElement('video');
    sourceVideo.srcObject = sourceStream;
    sourceVideo.muted = true;
    sourceVideo.playsInline = true;
    // play() retourne une promise qui peut rejeter (autoplay bloqué). On
    // l'ignore : ce code n'est exécuté qu'après une interaction utilisateur
    // (clic sur "Je suis prêt") donc l'autoplay est autorisé. Le `.catch`
    // évite les "Uncaught (in promise)" qui pollueraient la console.
    sourceVideo.play().catch(() => { /* autoplay edge case, le draw rate cale juste */ });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      // Si le navigateur ne supporte pas 2d (très rare) : retour au stream
      // brut pour ne pas bloquer l'utilisateur. Perte de cohérence miroir
      // acceptée comme moindre mal vs blocage total.
      return sourceStream;
    }

    this.mirrorCanvas = canvas;

    const drawFrame = () => {
      if (!this.mirrorCanvas) return;
      // readyState >= HAVE_CURRENT_DATA garantit qu'il y a au moins une frame
      // décodée — évite les premières secondes en frame noire si la caméra
      // n'a pas encore poussé d'image au moment où drawFrame() démarre.
      if (sourceVideo.readyState >= 2) {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(sourceVideo, -width, 0, width, height);
        ctx.restore();
      }
      this.mirrorAF = requestAnimationFrame(drawFrame);
    };
    drawFrame();

    this.mirrorStream = canvas.captureStream(30);
    return this.mirrorStream;
  }

  private getSupportedMime(): string {
    const types = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'];
    return types.find(t => MediaRecorder.isTypeSupported(t)) ?? 'video/webm';
  }
}
