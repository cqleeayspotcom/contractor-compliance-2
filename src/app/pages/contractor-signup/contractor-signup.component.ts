import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ContractorSignupService } from '../../services/contractor-signup.service';
import { isValidTuitaPhoneP33, toTuitaPhoneP33 } from '../../utils/phone-normalizer';

const CODE_REGEX = /^[A-HJ-NP-Z2-9]{4}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PINCODE_REGEX = /^\d{4,8}$/;

type SignupStep = 'code' | 'identity' | 'otp' | 'success';

/**
 * Page d'inscription publique contractor par code d'invitation, en 2 étapes
 * minimalistes pour les artisans BTP :
 *
 *   Étape 1 — code : un seul champ, gros, centré. Vérification en 1 clic.
 *
 *   Étape 2 — téléphone : un seul champ, format français accepté tel quel
 *             (06XX, +33 6 XX, etc.) — auto-conversion vers P33... côté
 *             frontend ET vérification côté backend. Les autres infos
 *             (nom, prénom, SIREN, raison sociale) sont remplies
 *             automatiquement à l'upload des documents (CNI puis KBIS).
 *
 *   Succès — code personnel à partager + bouton vers le dashboard.
 */
@Component({
  selector: 'app-contractor-signup',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './contractor-signup.component.html',
  styleUrl: './contractor-signup.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorSignupComponent {
  private readonly api = inject(ContractorSignupService);
  private readonly router = inject(Router);

  // Étape courante (code → identity → otp → success)
  readonly step = signal<SignupStep>('code');

  // Form state — minimal pour l'artisan BTP
  readonly code = signal<string>('');
  readonly phoneRaw = signal<string>(''); // ce que l'artisan tape, format libre
  readonly email = signal<string>('');
  // Prénom et nom captés dès l'étape identité (pas seulement à l'OCR).
  // POURQUOI : la table d'audit cc_signup_attempts persiste TOUTE tentative,
  // même abandonnée. En les capturant avant l'envoi du PIN, on garde une
  // trace exploitable côté admin pour les signups qui n'aboutissent jamais
  // (cf. ContractorSignupController::logAttempt → SignupAttempt::setIdentity).
  // L'OCR de la CNI peut ensuite enrichir / corriger ces valeurs.
  readonly firstName = signal<string>('');
  readonly lastName = signal<string>('');
  readonly pincode = signal<string>(''); // PIN reçu par SMS (4-8 chiffres)

  // États async
  readonly isVerifyingCode = signal<boolean>(false);
  readonly isSendingPin = signal<boolean>(false);
  readonly isSubmittingSignup = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  // UX : marqueur "le user a tenté de soumettre" pour afficher les erreurs
  // de champ (sinon les hints rouges apparaissent dès l'ouverture du form
  // — agressif). On le réinitialise à chaque correction de champ.
  readonly submitAttempted = signal<boolean>(false);


  // ── Téléphone : conversion FR → P33 en live ─────────────────────────────

  /**
   * Convertit un numéro de téléphone français saisi librement (06 XX, +33,
   * espaces, points, etc.) vers le format Tuita `P33XXXXXXXXX`. Mêmes règles
   * que le backend `ContractorSignupController::normalizeFrenchPhone`.
   */
  // Délégation au helper partagé (login + signup) — même règle de
  // normalisation que ContractorSignupController::normalizeFrenchPhone côté
  // backend, pour éviter toute divergence silencieuse entre les deux flows.
  readonly normalizedPhone = computed<string>(() => toTuitaPhoneP33(this.phoneRaw()));

  /**
   * Validation du téléphone normalisé : format Tuita strict après conversion.
   * Ce signal alimente la couleur du champ et l'enable du bouton.
   */
  readonly isPhoneValid = computed<boolean>(() => isValidTuitaPhoneP33(this.normalizedPhone()));

  // ── Validations dérivées ────────────────────────────────────────────────

  readonly canVerifyCode = computed<boolean>(() => {
    return !this.isVerifyingCode() && CODE_REGEX.test(this.code());
  });

  readonly isEmailValid = computed<boolean>(() => {
    const value = this.email().trim();
    return value.length > 0 && value.length <= 255 && EMAIL_REGEX.test(value);
  });

  /** Prénom/nom : non vides, max 100 chars (aligne le SignupInputFilter). */
  readonly isFirstNameValid = computed<boolean>(() => {
    const v = this.firstName().trim();
    return v.length > 0 && v.length <= 100;
  });
  readonly isLastNameValid = computed<boolean>(() => {
    const v = this.lastName().trim();
    return v.length > 0 && v.length <= 100;
  });

  /**
   * Le bouton "Recevoir le code par SMS" reste cliquable même si le form
   * est incomplet — `submitIdentity()` valide et affiche des messages
   * explicites au clic. Disabled UNIQUEMENT pendant l'envoi en cours pour
   * éviter le double-submit. Voir feedback Moussa 2026-05-26 (UX :
   * disabled silencieux = user croit que la page est cassée).
   */
  readonly canSubmitIdentity = computed<boolean>(() => !this.isSendingPin());

  /** Vrai si TOUS les champs identité sont valides (utilisé en interne). */
  readonly isIdentityComplete = computed<boolean>(() =>
    this.isFirstNameValid() &&
    this.isLastNameValid() &&
    this.isPhoneValid() &&
    this.isEmailValid()
  );

  readonly canSubmitOtp = computed<boolean>(() => {
    if (this.isSubmittingSignup()) return false;
    return PINCODE_REGEX.test(this.pincode());
  });

  // ── Step 1 : code ────────────────────────────────────────────────────────

  onCodeInput(value: string): void {
    const cleaned = value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 4);
    this.code.set(cleaned);
    this.errorMessage.set(null);
  }

  verifyCode(): void {
    if (!this.canVerifyCode()) return;
    this.isVerifyingCode.set(true);
    this.errorMessage.set(null);

    this.api.verifyCode(this.code()).subscribe({
      next: (res) => {
        this.isVerifyingCode.set(false);
        // Le backend `/invitation-codes/check` répond 200 même quand le code
        // est invalide — `valid` discrimine, `reason` donne la cause exacte.
        if (!res.valid) {
          this.errorMessage.set(this.messageForVerifyReason(res.reason));
          return;
        }
        this.code.set(res.code);
        this.step.set('identity');
      },
      error: (err) => {
        this.isVerifyingCode.set(false);
        const code = err?.error?.error?.code as string | undefined;
        const msg = err?.error?.error?.message as string | undefined;
        this.errorMessage.set(msg ?? this.fallbackMessageFor(code));
      },
    });
  }

  backToCode(): void {
    this.step.set('code');
    this.errorMessage.set(null);
  }

  // ── Step 2 : téléphone (auto-normalisation) ──────────────────────────────

  onPhoneInput(value: string): void {
    // On stocke ce que l'artisan tape — le `normalizedPhone` computed gère la
    // conversion en arrière-plan. Permet à l'artisan de voir son numéro
    // dans son format naturel (06 12 34 56 78) tout en envoyant le format
    // Tuita au backend.
    this.phoneRaw.set(value);
    this.errorMessage.set(null);
    this.submitAttempted.set(false);
  }

  onEmailInput(value: string): void {
    this.email.set(value);
    this.errorMessage.set(null);
    this.submitAttempted.set(false);
  }

  onFirstNameInput(value: string): void {
    // StripTags côté backend, on s'aligne en retirant les chevrons côté UI
    // pour ne pas laisser un faux sentiment de saisie « riche ».
    this.firstName.set(value.replace(/[<>]/g, ''));
    this.errorMessage.set(null);
    this.submitAttempted.set(false);
  }

  onLastNameInput(value: string): void {
    this.lastName.set(value.replace(/[<>]/g, ''));
    this.errorMessage.set(null);
    this.submitAttempted.set(false);
  }

  /**
   * Étape 2 → 3 : déclenche l'envoi du SMS PIN sur le téléphone saisi ET
   * persiste l'identité saisie (nom/prénom) en base d'audit AVANT le SMS.
   * Sans cette preuve de possession, n'importe qui avec un code d'invitation
   * pouvait squatter le numéro d'un futur contractor (cf.
   * ContractorSignupController::verifyContractorPin côté backend).
   *
   * En passant par notre endpoint `/signup/request-pin` (pas /contractor/auth/pin
   * direct), on bénéficie en plus :
   *   - du log SignupAttempt PIN_REQUESTED (audit même en cas d'abandon OTP)
   *   - des rate-limits anti-abus SMS (5/code, 3/phone, 10/IP par heure)
   */
  submitIdentity(): void {
    // Garde-fou anti double-submit (le seul cas où on bloque vraiment).
    if (this.isSendingPin()) return;
    // Marquer la tentative pour faire apparaître les indicateurs rouges
    // sous chaque champ vide ou mal formaté.
    this.submitAttempted.set(true);
    if (!this.isIdentityComplete()) {
      // Message explicite (pas "Erreur, réessaye") pour que l'artisan
      // BTP comprenne immédiatement quoi corriger.
      const missing: string[] = [];
      if (!this.isFirstNameValid()) missing.push('prénom');
      if (!this.isLastNameValid()) missing.push('nom');
      if (!this.isPhoneValid()) missing.push('téléphone');
      if (!this.isEmailValid()) missing.push('email');
      this.errorMessage.set(
        missing.length === 1
          ? `Remplis le champ « ${missing[0]} » avant de continuer.`
          : `Remplis tous les champs : ${missing.join(', ')}.`,
      );
      return;
    }
    this.isSendingPin.set(true);
    this.errorMessage.set(null);

    this.api.requestPin({
      code: this.code(),
      phone: this.normalizedPhone(),
      email: this.email().trim(),
      first_name: this.firstName().trim(),
      last_name: this.lastName().trim(),
    }).subscribe({
      next: () => {
        this.isSendingPin.set(false);
        this.pincode.set('');
        this.step.set('otp');
      },
      error: (err) => {
        this.isSendingPin.set(false);
        const code = err?.error?.error?.code as string | undefined;
        const msg = err?.error?.error?.message as string | undefined;
        this.errorMessage.set(msg ?? this.fallbackMessageFor(code));
      },
    });
  }

  // ── Step 3 : OTP (PIN SMS) ──────────────────────────────────────────────

  onPincodeInput(value: string): void {
    // Garde uniquement les chiffres ; max 8 (le backend accepte 4-8).
    const cleaned = value.replace(/\D/g, '').slice(0, 8);
    this.pincode.set(cleaned);
    this.errorMessage.set(null);
  }

  backToIdentity(): void {
    this.step.set('identity');
    this.errorMessage.set(null);
    this.pincode.set('');
  }

  /**
   * Renvoie un nouveau SMS PIN. Repasse par /signup/request-pin pour
   * conserver les protections (rate-limits + audit). Le cooldown 120s
   * de ContractorOauthWrapper évite le double-envoi en arrière-plan.
   */
  resendPin(): void {
    if (this.isSendingPin()) return;
    this.isSendingPin.set(true);
    this.errorMessage.set(null);
    this.api.requestPin({
      code: this.code(),
      phone: this.normalizedPhone(),
      email: this.email().trim(),
      first_name: this.firstName().trim(),
      last_name: this.lastName().trim(),
    }).subscribe({
      next: () => this.isSendingPin.set(false),
      error: (err) => {
        this.isSendingPin.set(false);
        const code = err?.error?.error?.code as string | undefined;
        const msg = err?.error?.error?.message as string | undefined;
        this.errorMessage.set(msg ?? this.fallbackMessageFor(code));
      },
    });
  }

  /**
   * Étape 3 → 4 : signup réel, avec le PIN reçu par SMS comme preuve de
   * possession du téléphone. Le backend (ContractorSignupController) :
   *   - vérifie le PIN (lecture cft_contractor_oauth.sms_password, comparaison,
   *     check expiration 10 min, consommation one-shot)
   *   - puis seulement consomme le code d'invitation et crée le compte.
   */
  submitOtp(): void {
    if (!this.canSubmitOtp()) return;
    this.isSubmittingSignup.set(true);
    this.errorMessage.set(null);

    // Payload minimal — code + téléphone normalisé + email + PIN. Les autres
    // infos (nom, prénom, SIREN, raison sociale) seront remplies automatiquement
    // par l'OCR à l'upload des documents pendant l'onboarding.
    this.api.signup({
      code: this.code(),
      phone: this.normalizedPhone(),
      email: this.email().trim(),
      pincode: this.pincode(),
      // Nom/prénom saisis à l'étape identité — déjà persistés en audit via
      // /signup/request-pin, on les renvoie ici pour qu'ils soient écrits
      // sur cc_users (et pas seulement sur cc_signup_attempts).
      first_name: this.firstName().trim(),
      last_name: this.lastName().trim(),
      // SIREN et raison sociale restent vides : remplis par l'OCR du KBIS
      // lors de l'upload des documents (étape onboarding suivante).
      siren: '',
      company_name: '',
    }).subscribe({
      next: () => {
        this.isSubmittingSignup.set(false);
        this.step.set('success');
      },
      error: (err) => {
        this.isSubmittingSignup.set(false);
        const code = err?.error?.error?.code as string | undefined;
        const msg = err?.error?.error?.message as string | undefined;
        this.errorMessage.set(msg ?? this.fallbackMessageFor(code));
        if (code === 'INVITATION_CODE_RACE_CONDITION') {
          this.step.set('code');
        } else if (
          code === 'SIGNUP_PIN_NOT_REQUESTED' ||
          code === 'SIGNUP_PIN_EXPIRED'
        ) {
          // PIN consommé ou jamais demandé : retour étape identité pour
          // redéclencher /contractor/auth/pin (sinon l'utilisateur tape un
          // PIN qui ne sera jamais bon).
          this.step.set('identity');
          this.pincode.set('');
        }
      },
    });
  }

  // ── Step 3 : succès ──────────────────────────────────────────────────────

  goToDashboard(): void {
    void this.router.navigateByUrl('/dashboard');
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private messageForVerifyReason(
    reason: 'invalid_format' | 'not_found' | 'revoked' | 'expired' | 'exhausted' | undefined,
  ): string {
    switch (reason) {
      case 'invalid_format':
        return 'Le code doit faire 4 caractères (lettres + chiffres, sans 0 ni 1).';
      case 'not_found':
        return 'Ce code n\'existe pas. Vérifie auprès de la personne qui te l\'a transmis.';
      case 'revoked':
        return 'Ce code a été révoqué. Demande un autre code.';
      case 'expired':
        return 'Ce code a expiré. Demande-en un nouveau.';
      case 'exhausted':
        return 'Ce code a atteint son nombre maximal d\'usages. Demande un autre code.';
      default:
        return 'Code invalide. Réessaie ou demande-en un nouveau.';
    }
  }

  private fallbackMessageFor(code: string | undefined): string {
    switch (code) {
      case 'INVITATION_CODE_NOT_FOUND':
        return 'Ce code n\'existe pas. Vérifie auprès de la personne qui te l\'a transmis.';
      case 'INVITATION_CODE_EXPIRED':
        return 'Ce code a expiré. Demande-en un nouveau.';
      case 'INVITATION_CODE_REVOKED':
        return 'Ce code a été révoqué. Demande un autre code.';
      case 'INVITATION_CODE_EXHAUSTED':
        return 'Ce code a atteint son nombre maximal d\'usages. Demande un autre code.';
      case 'INVITATION_CODE_INVALID_FORMAT':
        return 'Le code doit faire 4 caractères (lettres + chiffres, sans 0 ni 1).';
      case 'INVITATION_CODE_RACE_CONDITION':
        return 'Ce code vient d\'être consommé. Réessaie ou demande-en un autre.';
      case 'CONTRACTOR_PHONE_ALREADY_REGISTERED':
        return 'Ce numéro est déjà associé à un compte Tuita. Connecte-toi via tuita.fr.';
      case 'SIGNUP_PIN_NOT_REQUESTED':
        return 'Aucun code SMS n\'a encore été envoyé. Re-clique sur « Recevoir le code ».';
      case 'SIGNUP_PIN_MISMATCH':
        return 'Code SMS incorrect. Vérifie le code reçu et réessaie.';
      case 'SIGNUP_PIN_EXPIRED':
        return 'Le code SMS a expiré (10 min). Demande un nouveau code.';
      case 'SIGNUP_RATE_LIMITED':
        return 'Trop de demandes de code SMS. Réessaie plus tard.';
      case 'SIGNUP_SMS_SEND_FAILED':
        return "L'envoi du SMS a échoué. Vérifie le numéro et réessaie.";
      case 'SIGNUP_VALIDATION_FAILED':
        return 'Certaines informations sont invalides. Vérifie les champs en rouge.';
      default:
        return 'Une erreur est survenue. Réessaie dans un instant.';
    }
  }
}
