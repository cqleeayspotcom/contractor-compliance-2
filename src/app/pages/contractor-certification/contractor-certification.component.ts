import { Component, ChangeDetectionStrategy, DestroyRef, ElementRef, OnDestroy, OnInit, signal, computed, inject, effect, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { EMPTY, Subject, Subscription, interval } from 'rxjs';
import { catchError, switchMap, debounceTime, filter } from 'rxjs/operators';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { ContractorApiService } from '../../services/contractor-api.service';
import { ContractorSessionService } from '../../services/contractor-session.service';
import { RefreshService } from '../../services/refresh.service';
import { OnboardingNextStepCtaComponent } from '../../components/shared/onboarding-next-step-cta/onboarding-next-step-cta.component';
import { ParcoursStepperComponent } from '../../components/shared/parcours-stepper/parcours-stepper.component';

/**
 * Chapitres cliquables de la vidéo de formation. Les timecodes sont
 * proportionnels au plan source (5 chapitres, ~5 min). À recalibrer après
 * visionnage de la version brandée si le rendu NotebookLM a déformé un segment.
 */
interface VideoChapter {
  start: number;
  title: string;
  icon: string;
}

// Timecodes calibrés via détection de changement de scène ffmpeg sur la
// vidéo brandée (qcm-formation-tuita.mp4, 320s). Transitions détectées à
// 46.7s / 94.9s / 155.3s / 205.0s — bornes réelles des 5 chapitres.
const VIDEO_CHAPTERS: VideoChapter[] = [
  { start: 0,   title: 'Vous intervenez au nom de TUITA', icon: 'badge' },
  { start: 47,  title: 'Application Tuita & communication', icon: 'phone_iphone' },
  { start: 95,  title: 'La pré-visite', icon: 'photo_camera' },
  { start: 155, title: 'Intervention & règles toiture', icon: 'roofing' },
  { start: 205, title: 'Sécurité, propreté, intégrité', icon: 'health_and_safety' },
];

interface QuizQuestion {
  id: number;
  question: string;
  options: { key: string; label: string }[];
  correctAnswer: string;
  explanation: string;
}

const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    question: 'Lorsque vous vous présentez chez un client et qu\'il vous demande au nom de qui vous intervenez, que répondez-vous ?',
    options: [
      { key: 'A', label: 'Au nom de TUITA' },
      { key: 'B', label: 'À votre propre nom' },
      { key: 'C', label: 'Au nom de 007' },
    ],
    correctAnswer: 'A',
    explanation: 'Vous intervenez toujours au nom de TUITA, c\'est l\'entreprise qui vous mandate auprès du client.',
  },
  {
    id: 2,
    question: 'Lors d\'une prévisite, si le client vous demande combien coûte la prestation, que faites-vous ?',
    options: [
      { key: 'A', label: 'Vous lui dites de demander à TUITA' },
      { key: 'B', label: 'Vous lui chiffrez un prix sur place' },
      { key: 'C', label: 'Vous dites que c\'est secret défense' },
    ],
    correctAnswer: 'A',
    explanation: 'Les tarifs sont gérés exclusivement par TUITA. Ne communiquez jamais de prix au client.',
  },
  {
    id: 3,
    question: 'Lors de votre intervention, si vous avez oublié votre perceuse, que faites-vous ?',
    options: [
      { key: 'A', label: 'Vous allez en chercher une' },
      { key: 'B', label: 'Vous utilisez celle du client' },
      { key: 'C', label: 'Vous essayez de percer avec votre doigt' },
    ],
    correctAnswer: 'A',
    explanation: 'Vous devez toujours arriver avec votre matériel complet. En cas d\'oubli, allez le chercher plutôt que d\'utiliser celui du client.',
  },
  {
    id: 4,
    question: 'Si l\'équipe TUITA demande 15 photos de l\'intervention, que faites-vous ?',
    options: [
      { key: 'A', label: 'Je n\'utilise plus WhatsApp. j\'envoie 15 photos sur l\'application' },
      { key: 'B', label: 'Vous en envoyez deux et vous partez' },
      { key: 'C', label: 'Vous envoyez une photo de Jessica Alba' },
    ],
    correctAnswer: 'A',
    explanation: 'Les photos sont essentielles pour le suivi qualité. Envoyez toujours le nombre demandé sur le canal prévu.',
  },
  {
    id: 5,
    question: 'Si vous êtes en retard et hors du créneau prévu, que faites-vous ?',
    options: [
      { key: 'A', label: 'Prévenir l\'équipe TUITA pour qu\'ils avertissent le client' },
      { key: 'B', label: 'Venir comme un fantôme à l\'improviste' },
      { key: 'C', label: 'Dire que vous avez été capturé par des extraterrestres' },
    ],
    correctAnswer: 'A',
    explanation: 'Prévenez toujours TUITA en cas de retard. L\'équipe se charge de prévenir le client et réorganiser si besoin.',
  },
  {
    id: 6,
    question: 'Si vous avez un imprévu quelques jours avant l\'intervention, que faites-vous ?',
    options: [
      { key: 'A', label: 'Vous ne dites rien et prévenez la veille' },
      { key: 'B', label: 'Dire que vous avez encore crevé votre pneu' },
      { key: 'C', label: 'Prévenir TUITA 48 à 72h à l\'avance pour qu\'ils trouvent une solution' },
    ],
    correctAnswer: 'C',
    explanation: 'Prévenez au minimum 48 à 72h à l\'avance. Un désistement tardif entraîne des frais de gestion de 100 EUR.',
  },
  {
    id: 7,
    question: 'Si un opérateur TUITA vous demande une commission sous la table, que faites-vous ?',
    options: [
      { key: 'A', label: 'Vous la lui donnez' },
      { key: 'B', label: 'Vous refusez et signalez le comportement' },
      { key: 'C', label: 'Vous préférez être payé en chocolat' },
    ],
    correctAnswer: 'B',
    explanation: 'Toute demande de commission est interdite. Refusez et signalez immédiatement à la direction TUITA.',
  },
  {
    id: 8,
    question: 'Si vous laissez des gravats après votre intervention, que faites-vous ?',
    options: [
      { key: 'A', label: 'Vous nettoyez et laissez les lieux propres' },
      { key: 'B', label: 'Vous dites au client de nettoyer' },
      { key: 'C', label: 'Vous faites vos besoins dans les gravats' },
    ],
    correctAnswer: 'A',
    explanation: 'La propreté du chantier fait partie de la prestation. Nettoyez toujours avant de partir.',
  },
  {
    id: 9,
    question: 'Lorsqu\'un client vous demande une prestation supplémentaire, que faites-vous ?',
    options: [
      { key: 'A', label: 'Vous lui donnez un tarif de votre côté' },
      { key: 'B', label: 'Vous transmettez les infos à TUITA pour un devis officiel' },
      { key: 'C', label: 'Vous acceptez s\'il paie en pizzas pendant un an' },
    ],
    correctAnswer: 'B',
    explanation: 'Ne proposez jamais de prestations en direct. Transmettez la demande à TUITA qui fera un devis officiel.',
  },
  {
    id: 10,
    question: 'Lors de votre accès en toiture, que faites-vous ?',
    options: [
      { key: 'A', label: 'Toutes les précautions de sécurité (harnais, échelle, etc.)' },
      { key: 'B', label: 'Vous montez en mode acrobate' },
      { key: 'C', label: 'Vous êtes Spider-Man' },
    ],
    correctAnswer: 'A',
    explanation: 'La sécurité est non négociable. Harnais, échelle sécurisée, casque : pas d\'exception.',
  },
  {
    id: 11,
    question: 'Lorsque TUITA vous met à disposition une machine élévatrice, que faites-vous ?',
    options: [
      { key: 'A', label: 'Respecter les consignes de sécurité et rendre la machine en parfait état' },
      { key: 'B', label: 'Faire des dérapages pour impressionner' },
      { key: 'C', label: 'L\'utiliser comme un manège personnel' },
    ],
    correctAnswer: 'A',
    explanation: 'Le matériel mis à disposition doit être utilisé selon les règles de sécurité et rendu en bon état.',
  },
  {
    id: 12,
    question: 'Si vous causez un dégât à un objet chez la cliente, que faites-vous ?',
    options: [
      { key: 'A', label: 'Signaler à l\'équipe TUITA pour qu\'ils trouvent une solution' },
      { key: 'B', label: 'Dire que quelqu\'un d\'autre a vandalisé l\'objet' },
      { key: 'C', label: 'L\'enterrer dans le jardin' },
    ],
    correctAnswer: 'A',
    explanation: 'Signalez immédiatement tout dégât à TUITA. L\'assurance RC Pro couvre ce type de sinistre.',
  },
  {
    id: 13,
    question: 'Lors de la pré-visite :',
    options: [
      { key: 'A', label: 'Quelques photos vue d\'en bas, envoyées plus tard' },
      { key: 'B', label: 'Au moins 15 photos (rapprochées + éloignées), envoyées sur l\'application Tuita, attendre validation avant de partir' },
      { key: 'C', label: 'Pas de photos' },
    ],
    correctAnswer: 'B',
    explanation: 'Minimum 15 photos détaillées. Envoyez-les sur l\'application Tuita et attendez que votre conseiller valide avant de quitter le site.',
  },
  {
    id: 14,
    question: 'Lors de la pré-visite je dois :',
    options: [
      { key: 'A', label: 'Démonter toute la toiture' },
      { key: 'B', label: 'Prendre des photos, identifier les zones à risques sans tout démonter, déposer les infos sur l\'application Tuita' },
    ],
    correctAnswer: 'B',
    explanation: 'La pré-visite est un diagnostic visuel. Ne démontez rien, identifiez et documentez les zones à risques.',
  },
  {
    id: 15,
    question: 'Pré-visite avec dégâts sur fenêtre de toit, je dois :',
    options: [
      { key: 'A', label: 'Prendre en photo la fenêtre de toit' },
      { key: 'B', label: 'Photos de la fenêtre + plaque signalétique + dimensions + marque' },
    ],
    correctAnswer: 'B',
    explanation: 'Pour commander la bonne pièce, il faut la marque, les dimensions et la plaque signalétique. Une simple photo ne suffit pas.',
  },
  {
    id: 16,
    question: 'Pré-visite : pour connaître l\'accès au toit je dois :',
    options: [
      { key: 'A', label: 'Dire au conseiller "c\'est ok ça va le faire"' },
      { key: 'B', label: 'Photos de l\'accès, hauteur à la gouttière, besoin de nacelle et dimension' },
    ],
    correctAnswer: 'B',
    explanation: 'L\'équipe a besoin d\'informations précises pour planifier le chantier : photos, hauteur, type d\'accès nécessaire.',
  },
  {
    id: 17,
    question: 'Lors de la pré-visite je dois :',
    options: [
      { key: 'A', label: 'Expliquer au client qu\'on va refaire entièrement la toiture' },
      { key: 'B', label: 'Dire au client que je prends les informations et TUITA s\'occupe du devis' },
    ],
    correctAnswer: 'B',
    explanation: 'Ne faites jamais de promesse au client. Votre rôle est de collecter les infos, TUITA fait le devis.',
  },
  {
    id: 18,
    question: 'Lors de la pose d\'une fenêtre de toit je dois :',
    options: [
      { key: 'A', label: 'Pas besoin de niveau, ça se met automatiquement' },
      { key: 'B', label: 'Mettre obligatoirement la fenêtre de niveau à l\'aide d\'un niveau' },
    ],
    correctAnswer: 'B',
    explanation: 'Une fenêtre de toit mal nivelée causera des infiltrations. Le niveau est obligatoire.',
  },
  {
    id: 19,
    question: 'Lors de la pose d\'une gouttière :',
    options: [
      { key: 'A', label: 'Pas besoin de pente, l\'eau finira par s\'évacuer' },
      { key: 'B', label: '5 mm de pente par mètre de gouttière pour une évacuation correcte' },
    ],
    correctAnswer: 'B',
    explanation: '5 mm par mètre est la norme pour une gouttière. Sans pente suffisante, l\'eau stagne et déborde.',
  },
  {
    id: 20,
    question: 'Lorsque je fais une réparation en tuiles :',
    options: [
      { key: 'A', label: 'L\'écartement des tuiles n\'a pas d\'importance' },
      { key: 'B', label: 'Je respecte le pureau et les fiches techniques de pose' },
    ],
    correctAnswer: 'B',
    explanation: 'Le pureau (partie visible de la tuile) doit être respecté pour garantir l\'étanchéité et la solidité.',
  },
  {
    id: 21,
    question: 'Lors d\'une intervention :',
    options: [
      { key: 'A', label: 'Je fais uniquement les travaux prévus par mon conseiller TUITA' },
      { key: 'B', label: 'Je fais des travaux supplémentaires si le client demande' },
    ],
    correctAnswer: 'A',
    explanation: 'Ne réalisez que les travaux commandés par TUITA. Tout supplément doit passer par un devis officiel.',
  },
  {
    id: 22,
    question: 'Lorsque je pose des éléments de toiture :',
    options: [
      { key: 'A', label: 'Le sens de superposition n\'a pas d\'importance' },
      { key: 'B', label: 'Je respecte le sens des écoulements des eaux pluviales' },
    ],
    correctAnswer: 'B',
    explanation: 'Le sens de pose est crucial pour l\'étanchéité. L\'eau doit toujours s\'écouler vers le bas sans remonter sous les éléments.',
  },
  {
    id: 23,
    question: 'Lorsque je réalise une toiture :',
    options: [
      { key: 'A', label: 'Les vents dominants n\'ont aucune influence' },
      { key: 'B', label: 'Je prends en compte les vents dominants pour les éléments à emboîtement ou recouvrement' },
    ],
    correctAnswer: 'B',
    explanation: 'Les vents dominants peuvent soulever les éléments mal orientés. Posez toujours dans le sens opposé au vent dominant.',
  },
  {
    id: 24,
    question: 'Lorsque je bâche une toiture :',
    options: [
      { key: 'A', label: 'Je positionne la bâche à l\'intérieur de la maison' },
      { key: 'B', label: 'Je positionne la bâche sur les éléments de toiture, solidement fixée avec liteaux et vis' },
    ],
    correctAnswer: 'B',
    explanation: 'La bâche doit être à l\'extérieur, bien fixée avec des liteaux et vis pour résister au vent et protéger de la pluie.',
  },
];

const TOTAL_QUESTIONS = QUIZ_QUESTIONS.length;

@Component({
  selector: 'app-contractor-certification',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatRadioModule,
    MatProgressBarModule,
    MatSnackBarModule,
    OnboardingNextStepCtaComponent,
    ParcoursStepperComponent,
  ],
  templateUrl: './contractor-certification.component.html',
  styleUrl: './contractor-certification.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorCertificationComponent implements OnInit, OnDestroy {
  private readonly api = inject(ContractorApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(ContractorSessionService);
  private readonly refreshBus = inject(RefreshService);
  private readonly snack = inject(MatSnackBar);

  // UUID de l'attempt courant côté back (renvoyé par POST /certification/start).
  // Le back impose qu'un seul attempt actif existe par user ; un re-start renvoie
  // l'uuid de l'attempt existant (idempotent).
  private attemptUuid: string | null = null;
  private heartbeatSub?: Subscription;
  /** Timestamp (ms) du début de la tentative côté serveur — utilisé pour
   *  afficher le temps écoulé dans le QCM. Fixé au retour de
   *  `startCertification()`, jamais réinitialisé pendant l'attempt. */
  private startedAtMs: number | null = null;

  /** Tick 1s pour rafraîchir le compteur de temps affiché. Recalculé à
   *  partir de `startedAtMs` à chaque tick — pas de dérive cumulative. */
  readonly nowMs = signal(Date.now());

  /** Temps écoulé depuis le début de la tentative, formaté `mm:ss`.
   *  Affiché en haut du QCM pour que le contractor sache combien de temps
   *  il a déjà passé (et le BO ait une stat exploitable). */
  readonly elapsedLabel = computed(() => {
    if (this.startedAtMs === null) return '';
    const sec = Math.max(0, Math.floor((this.nowMs() - this.startedAtMs) / 1000));
    const mm = Math.floor(sec / 60).toString().padStart(2, '0');
    const ss = (sec % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  });

  /**
   * Sauvegarde debouncée du brouillon. Chaque clic sur une réponse pousse
   * dans ce Subject ; on PATCH au serveur 1,2 s après le dernier changement
   * pour ne pas spammer l'API quand l'artisan clique en rafale.
   */
  private readonly partialSave$ = new Subject<void>();

  readonly currentStep = signal<'video' | 'quiz' | 'review' | 'result'>('video');
  readonly videoWatched = signal(false);

  readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('formationVideo');
  readonly chapters = VIDEO_CHAPTERS;
  readonly currentChapterIndex = signal(0);
  readonly quizSubmitted = signal(false);
  readonly quizScore = signal(0);
  readonly quizPassed = signal(false);
  readonly submitting = signal(false);
  readonly answers = signal<Record<number, string>>({});
  readonly attempt = signal(1);
  readonly showUnanswered = signal(false);

  readonly allQuestions = QUIZ_QUESTIONS;
  readonly totalQuestions = TOTAL_QUESTIONS;

  /** Wrong questions for review screen */
  readonly wrongQuestions = computed(() => {
    const ans = this.answers();
    return QUIZ_QUESTIONS.filter(q => ans[q.id] !== q.correctAnswer);
  });

  readonly progressPercent = computed(() => {
    switch (this.currentStep()) {
      case 'video': return 33;
      case 'quiz': return 66;
      case 'review':
      case 'result': return 100;
    }
  });

  readonly stepLabel = computed(() => {
    switch (this.currentStep()) {
      case 'video': return 'Étape 1/2 - Formation vidéo';
      case 'quiz':
        if (this.attempt() > 1) return `Nouvelle tentative - Questionnaire (${TOTAL_QUESTIONS} questions)`;
        return `Étape 2/2 - Questionnaire (${TOTAL_QUESTIONS} questions)`;
      case 'review': return 'Correction - Lisez les explications';
      case 'result': return 'Certification TUITA';
    }
  });

  readonly allAnswered = computed(() => {
    const ans = this.answers();
    return QUIZ_QUESTIONS.every(q => ans[q.id] !== undefined);
  });

  readonly nextAction = signal<string | null>(null);

  private readonly resultNextStepEffect = effect(() => {
    if (this.currentStep() === 'result') {
      this.api.getDashboard()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (d) => this.nextAction.set(d.next_action ?? null),
          error: () => this.nextAction.set(null),
        });
    }
  });

  /**
   * Desactive le bouton "Rafraichir" du header pendant que le contractor
   * repond au QCM ou lit la correction. Refresh a ces etapes n'efface pas
   * les reponses (elles sont en memoire signal), mais le bouton serait
   * trompeur — il n'y a rien a recharger tant que le QCM n'est pas soumis.
   */
  private readonly certifBusyEffect = effect(() => {
    const step = this.currentStep();
    const busy = step === 'quiz' || step === 'review';
    this.refreshBus.setBusy('certif-quiz', busy);
  });

  ngOnInit(): void {
    // GUARD CERTIF DEJA OBTENUE :
    //   Sans ce check, l'arrivee sur /certification declenchait directement
    //   POST /certification/start, qui repond depuis le 2026-05-29 par
    //   409 ALREADY_CERTIFIED quand session.certified_at est non-null
    //   (cf. ContractorCertificationController::doQcmStart). Le 409 etait
    //   surface par le `error:` du startCertification ci-dessous sous forme
    //   de toast rouge "Impossible de demarrer le QCM" — completement faux
    //   et angoissant pour un contractor deja certifie qui ne fait que
    //   re-visiter la page.
    //   On lit donc d'abord /certification/status (GET, sans effet de bord)
    //   et si completed=true on bascule directement sur la card succes,
    //   sans appeler /start. Sinon on enchaine sur le flow normal.
    this.api.getCertificationStatus().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: status => {
        if (status?.completed) {
          // Affiche la card de succes sans creer de nouvelle tentative.
          // quizScore / quizPassed alimentent le template result-card.
          this.quizScore.set(typeof status.score === 'number' ? status.score : TOTAL_QUESTIONS);
          this.quizPassed.set(true);
          this.currentStep.set('result');
          return;
        }
        this.bootstrapAttempt();
      },
      error: () => {
        // Status indisponible (reseau, 5xx) : on tente quand meme le start
        // pour ne pas bloquer un contractor qui n'est PAS certifie a cause
        // d'une coupure transitoire. Si la cause est un vrai 409 derriere,
        // le start le surfacera comme avant — strictement pas pire.
        this.bootstrapAttempt();
      },
    });
  }

  /**
   * Initialise l'attempt QCM cote back + wiring (heartbeat, draft save,
   * compteur de temps). Appele depuis ngOnInit UNIQUEMENT quand le
   * contractor n'est pas deja certifie (voir guard ci-dessus).
   */
  private bootstrapAttempt(): void {
    // Démarre l'attempt côté back (idempotent — retourne l'uuid existant si actif).
    // Si `started_at` est ancien (> 60s), c'est qu'on reprend un attempt
    // précédemment démarré (rafraîchissement, retour de chantier après pause).
    // On signale la reprise au contractor par un toast — important pour qu'il
    // sache qu'il continue là où il s'était arrêté et pas à zéro.
    this.api.startCertification().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        this.attemptUuid = res.attempt_uuid;
        this.attempt.set(res.attempt_number);
        // Timestamp de démarrage côté serveur — alimente le compteur
        // `elapsedLabel` et donne au BO une stat exploitable. Si parsing
        // de `started_at` rate (format imprévu), fallback Date.now() pour
        // ne pas afficher NaN à l'utilisateur.
        const parsedStart = Date.parse(res.started_at);
        this.startedAtMs = Number.isFinite(parsedStart) ? parsedStart : Date.now();

        // Restaure le brouillon serveur : si le contractor a commencé à
        // répondre puis a fermé l'onglet / changé de device, ses réponses
        // précédentes sont déjà cochées en arrivant. Si non vide, on saute
        // directement au quiz (inutile de re-regarder la vidéo).
        const draft = this.normalizePartialAnswers(res.partial_answers);
        const hasDraft = Object.keys(draft).length > 0;
        if (hasDraft) {
          this.answers.set(draft);
          this.currentStep.set('quiz');
          this.snack.open(
            'Reprise de ta tentative - tes réponses précédentes sont restaurées.',
            '',
            { duration: 4000, panelClass: ['tuita-snackbar', 'snack-info'] },
          );
        }
        // POURQUOI on ne fire PLUS de toast « Reprise » quand il n'y a aucun
        // brouillon : le simple fait d'arriver sur /certification crée un
        // QcmAttempt côté backend (idempotent via `startCertification()`). Au
        // 2e chargement de la page, `started_at` est > 60s mais le contractor
        // n'a RIEN « repris » — il n'a fait que naviguer. Le toast affolait
        // sans raison (« je n'ai jamais cliqué Commencer, pourquoi on me dit
        // que je reprends ?? »). On garde uniquement le toast utile, celui
        // qui signale la restauration de réponses réellement saisies.

        this.startHeartbeat();
      },
      error: () => {
        // POURQUOI on surface l'erreur au contractor (versus l'avaler) :
        //   Sans attemptUuid, le `complete` final fera 422 ANSWERS_UUID_MISSING
        //   et le contractor perdra ses 24 réponses. Un toast + log explicites
        //   évitent ce piège silencieux. Le service `startCertification()`
        //   retente déjà automatiquement sur 409 (race-loser concurrent) ; si
        //   on tombe ici, c'est une vraie erreur (réseau, 500…) qui mérite
        //   un message clair plutôt qu'un quiz fantôme.
        this.snack.open(
          'Impossible de démarrer le QCM. Vérifie ta connexion et rafraîchis la page.',
          'Fermer',
          { duration: 8000, panelClass: ['tuita-snackbar', 'snack-error'] },
        );
      },
    });

    // ── Brouillon serveur ───────────────────────────────────────────────
    // POURQUOI on re-câble le save-draft : sans persistence serveur, un
    // refresh / un crash navigateur / un changement de device perdait
    // les 24 réponses. Le backend expose `PATCH /certification/answers`
    // depuis 2026-05-24 et `startCertification` lit `partial_answers` au
    // retour — c'est l'écho de ce PATCH. On debounce 1,2s pour ne pas
    // spammer l'API quand l'artisan clique en rafale (parcours rapide).
    this.partialSave$.pipe(
      takeUntilDestroyed(this.destroyRef),
      debounceTime(1200),
      filter(() => this.attemptUuid !== null),
      switchMap(() => {
        const uuid = this.attemptUuid!;
        // Stringify les clés numériques pour le contrat backend
        // (Record<string,string>). Filtre les valeurs invalides (defensif).
        const ans = this.answers();
        const payload: Record<string, string> = {};
        for (const [k, v] of Object.entries(ans)) {
          if (v === 'A' || v === 'B' || v === 'C') payload[k] = v;
        }
        return this.api.saveCertificationAnswers(uuid, payload).pipe(
          // Fail-soft : un échec PATCH n'interrompt PAS le QCM (les réponses
          // restent en signal local). Le prochain selectAnswer relancera.
          catchError(() => EMPTY),
        );
      }),
    ).subscribe();

    // ── Compteur de temps ──────────────────────────────────────────────
    // Tick 1s pour rafraîchir `elapsedLabel`. Recalculé depuis startedAtMs
    // à chaque tick — pas de dérive cumulative (un onglet en background
    // peut throttle le setInterval sans fausser le résultat).
    interval(1000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.nowMs.set(Date.now());
    });
  }

  /** Convertit le payload serveur (clés string) en Record<number, string>. */
  private normalizePartialAnswers(raw: unknown): Record<number, string> {
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<number, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const id = Number.parseInt(k, 10);
      if (Number.isFinite(id) && id >= 1 && id <= TOTAL_QUESTIONS && (v === 'A' || v === 'B' || v === 'C')) {
        out[id] = v;
      }
    }
    return out;
  }

  ngOnDestroy(): void {
    this.heartbeatSub?.unsubscribe();
    this.refreshBus.setBusy('certif-quiz', false);
  }

  private startHeartbeat(): void {
    this.heartbeatSub?.unsubscribe();
    this.heartbeatSub = interval(30_000).pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap(() => {
        if (!this.attemptUuid) return EMPTY;
        return this.api.heartbeatCertification(this.attemptUuid).pipe(catchError(() => EMPTY));
      }),
    ).subscribe();
  }

  onVideoEnded(): void {
    this.videoWatched.set(true);
  }

  onVideoPlay(): void {
    // Marque comme vu dès la lecture pour ne pas bloquer si l'utilisateur
    // navigue par chapitres (l'event 'ended' ne se déclenche pas dans ce cas).
    this.videoWatched.set(true);
  }

  onVideoTimeUpdate(): void {
    const video = this.videoRef()?.nativeElement;
    if (!video) return;
    const t = video.currentTime;
    let idx = 0;
    for (let i = 0; i < this.chapters.length; i++) {
      if (t >= this.chapters[i].start) idx = i;
    }
    if (idx !== this.currentChapterIndex()) {
      this.currentChapterIndex.set(idx);
    }
  }

  formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  jumpToChapter(index: number): void {
    const video = this.videoRef()?.nativeElement;
    if (!video) return;
    const chapter = this.chapters[index];
    if (!chapter) return;
    video.currentTime = chapter.start;
    this.currentChapterIndex.set(index);
    this.videoWatched.set(true);
    void video.play().catch(() => { /* autoplay bloqué : on laisse l'utilisateur cliquer play */ });
  }

  goToQuiz(): void {
    this.currentStep.set('quiz');
  }

  selectAnswer(questionId: number, answer: string): void {
    this.answers.update(prev => ({ ...prev, [questionId]: answer }));
    // Clear highlight once they start answering
    if (this.showUnanswered() && this.allAnswered()) {
      this.showUnanswered.set(false);
    }
    // Désarme la soumission incomplète : si l'artisan corrige son oubli, on
    // n'a plus à le pénaliser au prochain clic Valider (cf. submitQuiz).
    this.incompleteSubmitArmed = false;

    // Persist le brouillon côté serveur (debouncé) pour permettre la reprise.
    this.partialSave$.next();

    // Scroll auto vers la prochaine question non répondue — laisse le DOM
    // appliquer l'état coché avant de scroller.
    setTimeout(() => this.scrollToNextUnanswered(questionId), 120);
  }

  /**
   * Trouve la prochaine question sans réponse APRÈS celle qu'on vient de cocher.
   * Si toutes les suivantes sont déjà répondues, on reboucle au début pour
   * couvrir une question sautée en milieu de liste. Si tout est rempli, on
   * scroll vers le bouton de soumission.
   */
  private scrollToNextUnanswered(fromQuestionId: number): void {
    const ans = this.answers();
    const ordered = [
      ...QUIZ_QUESTIONS.filter(q => q.id > fromQuestionId),
      ...QUIZ_QUESTIONS.filter(q => q.id <= fromQuestionId),
    ];
    const next = ordered.find(q => ans[q.id] === undefined);
    if (next) {
      const el = document.getElementById('question-' + next.id);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    document.getElementById('quiz-submit-button')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  isCorrect(questionId: number): boolean {
    const q = QUIZ_QUESTIONS.find(q => q.id === questionId);
    return q ? this.answers()[questionId] === q.correctAnswer : false;
  }

  getCorrectAnswer(questionId: number): string {
    const q = QUIZ_QUESTIONS.find(q => q.id === questionId);
    if (!q) return '';
    const opt = q.options.find(o => o.key === q.correctAnswer);
    return opt ? opt.label : '';
  }

  getExplanation(questionId: number): string {
    return QUIZ_QUESTIONS.find(q => q.id === questionId)?.explanation ?? '';
  }

  isUnanswered(questionId: number): boolean {
    return this.showUnanswered() && this.answers()[questionId] === undefined;
  }

  /** Count of unanswered questions */
  get unansweredCount(): number {
    const ans = this.answers();
    return QUIZ_QUESTIONS.filter(q => ans[q.id] === undefined).length;
  }

  /** Tracking du 1er Valider-incomplet : pour distinguer "j'ai cliqué par
   *  erreur, montre-moi ce qui manque" du "je veux soumettre quand même".
   *  Reset à chaque selectAnswer pour laisser une 2e chance après une
   *  réponse oubliée corrigée. */
  private incompleteSubmitArmed = false;

  submitQuiz(): void {
    if (this.submitting()) return;

    const ans = this.answers();

    // Cas incomplet — DEUX comportements :
    //   1er clic : on highlight + scroll vers la question manquante (UX
    //              actuelle) ET on arme le flag « si tu reclic, je submit
    //              quand même ». Pas d'attempt comptabilisé encore.
    //   2e clic (même set incomplet) : on submit pour de vrai → le
    //              backend marque l'attempt comme `completed_at` + passed=false
    //              → le compteur de tentative bump côté DB → le contractor
    //              ne peut plus boucler indéfiniment en ouvrant/fermant.
    //
    // POURQUOI ce double-clic : un simple submit aveugle au 1er clic ferait
    // perdre l'attempt à un artisan qui a juste raté son dernier scroll.
    // À l'inverse, un submit qui REFUSE de partir laisse le contractor
    // « tester gratuitement » en cliquant Valider après chaque réponse —
    // pas de coût, pas de pression. Le double-clic est le compromis :
    // tu peux corriger, mais si tu insistes, ça compte.
    if (!this.allAnswered()) {
      if (!this.incompleteSubmitArmed) {
        this.incompleteSubmitArmed = true;
        this.showUnanswered.set(true);
        const firstUnanswered = QUIZ_QUESTIONS.find(q => ans[q.id] === undefined);
        if (firstUnanswered) {
          const el = document.getElementById('question-' + firstUnanswered.id);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        const missing = QUIZ_QUESTIONS.length - Object.keys(ans).length;
        this.snack.open(
          `Il te manque ${missing} réponse${missing > 1 ? 's' : ''}. ` +
            `Reclique sur « Valider » pour soumettre quand même — la tentative sera comptabilisée comme un échec.`,
          'Compris',
          { duration: 9000, panelClass: ['tuita-snackbar', 'snack-warn'] },
        );
        return;
      }
      // 2e clic : on tombe dans le flux normal qui va calculer le score et
      // submit. Les réponses manquantes resteront simplement absentes —
      // le backend les traite comme erronées et `passed=false` est garanti
      // (impossible d'avoir 24/24 avec des réponses manquantes).
    }

    let totalCorrect = 0;
    QUIZ_QUESTIONS.forEach(q => {
      if (ans[q.id] === q.correctAnswer) totalCorrect++;
    });

    this.quizScore.set(totalCorrect);
    this.quizSubmitted.set(true);

    if (totalCorrect === TOTAL_QUESTIONS) {
      // All correct — certify!
      this.quizPassed.set(true);
      this.submitting.set(true);
      const attemptId = this.attemptUuid;
      if (!attemptId) {
        this.submitting.set(false);
        this.currentStep.set('result');
        return;
      }
      this.api.completeCertification(attemptId, ans).subscribe({
        next: () => {
          this.submitting.set(false);
          this.heartbeatSub?.unsubscribe();
          this.session.refreshDashboard();
          this.currentStep.set('result');
        },
        error: () => {
          this.submitting.set(false);
          this.currentStep.set('result');
        },
      });
    } else {
      // Some wrong — on marque l'attempt comme terminé/échoué côté serveur
      // AVANT d'afficher la review. Sans ce complete, le brouillon resterait
      // « actif » et `attempt_count` ne bumperait jamais → le compteur «
      // Tentative N°2 » affiché en haut de page mentirait, et le BO ne
      // verrait jamais l'échec.
      const attemptId = this.attemptUuid;
      if (attemptId) {
        this.submitting.set(true);
        this.api.completeCertification(attemptId, ans).subscribe({
          next: () => {
            this.submitting.set(false);
            this.heartbeatSub?.unsubscribe();
            this.currentStep.set('review');
            // Reset l'armement pour la prochaine tentative (post-review →
            // retryAll() relance un nouvel attempt).
            this.incompleteSubmitArmed = false;
          },
          error: () => {
            this.submitting.set(false);
            // Fail-soft : on montre quand même la review pour ne pas piéger
            // l'artisan sur le QCM. Le retry recréera un attempt.
            this.currentStep.set('review');
            this.incompleteSubmitArmed = false;
          },
        });
      } else {
        this.currentStep.set('review');
        this.incompleteSubmitArmed = false;
      }
    }
  }

  /** Règle produit : "pas de facilité" — après lecture des corrections, le presta
   *  recommence les 24 questions à zéro pour ancrer les bonnes réponses.
   *  Une nouvelle QcmAttempt est créée côté back via POST /certification/start. */
  retryAll(): void {
    this.answers.set({});
    this.quizSubmitted.set(false);
    this.quizPassed.set(false);
    this.showUnanswered.set(false);

    // Nouvelle tentative côté back (la précédente reste trace avec completed_at/passed=false).
    // POURQUOI la transition vers 'quiz' est DANS le next() et pas en dehors :
    //   un échec du start (réseau, 500…) ne doit pas faire transiter l'UI vers
    //   le quiz sans attemptUuid — l'utilisateur verrait l'écran QCM mais le
    //   submit final partirait sans UUID → 422. On reste sur la page review
    //   avec un toast d'erreur si le start rate.
    this.api.startCertification().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        this.attemptUuid = res.attempt_uuid;
        this.attempt.set(res.attempt_number);
        const parsedStart = Date.parse(res.started_at);
        this.startedAtMs = Number.isFinite(parsedStart) ? parsedStart : Date.now();
        // Brouillon serveur vide pour une nouvelle tentative — on s'assure
        // que le signal local repart aussi de zéro même si le start renvoie
        // un attempt préexistant avec des réponses (cas edge : double-clic).
        const draft = this.normalizePartialAnswers(res.partial_answers);
        if (Object.keys(draft).length > 0) {
          this.answers.set(draft);
        }
        this.startHeartbeat();
        this.currentStep.set('quiz');
      },
      error: () => {
        this.snack.open(
          'Impossible de relancer le QCM. Réessaie dans quelques instants.',
          'Fermer',
          { duration: 8000, panelClass: ['tuita-snackbar', 'snack-error'] },
        );
      },
    });
  }

  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  /**
   * CTA principal de la card succès certification : on pousse vers les
   * missions disponibles plutôt que vers le dashboard, parce que c'est
   * exactement ce que la certification vient de débloquer. Le bouton
   * « Retour au tableau de bord » reste accessible en secondaire.
   */
  goToMissions(): void {
    this.router.navigate(['/missions']);
  }
}
