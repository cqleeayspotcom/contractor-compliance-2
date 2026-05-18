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

type SignupStep = 'code' | 'identity' | 'success';

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

  // Étape courante (code → identity → success)
  readonly step = signal<SignupStep>('code');

  // Form state — minimal pour l'artisan BTP
  readonly code = signal<string>('');
  readonly phoneRaw = signal<string>(''); // ce que l'artisan tape, format libre
  readonly email = signal<string>('');

  // États async
  readonly isVerifyingCode = signal<boolean>(false);
  readonly isSubmittingSignup = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);


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

  readonly canSubmitIdentity = computed<boolean>(() => {
    if (this.isSubmittingSignup()) return false;
    return this.isPhoneValid() && this.isEmailValid();
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
  }

  onEmailInput(value: string): void {
    this.email.set(value);
    this.errorMessage.set(null);
  }

  submitIdentity(): void {
    if (!this.canSubmitIdentity()) return;
    this.isSubmittingSignup.set(true);
    this.errorMessage.set(null);

    // Payload minimal — code + téléphone normalisé + email. Les autres infos
    // (nom, prénom, SIREN, raison sociale) seront remplies automatiquement
    // par l'OCR à l'upload des documents pendant l'onboarding.
    this.api.signup({
      code: this.code(),
      phone: this.normalizedPhone(),
      email: this.email().trim(),
      // Champs optionnels laissés vides côté frontend signup — le backend
      // accepte. Ils seront enrichis par les uploads ultérieurs.
      first_name: '',
      last_name: '',
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
      default:
        return 'Une erreur est survenue. Réessaie dans un instant.';
    }
  }
}
