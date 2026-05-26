import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { UrgencyDialogService } from '../components/shared/urgency-dialog/urgency-dialog.service';
import { ApiConfiguration } from '../api/api-configuration';
import { unwrapData } from '../core/api-envelope';
import { invitationCodesCheck } from '../api/fn/signup/invitation-codes-check';
import { signupCreate } from '../api/fn/signup/signup-create';
import { signupRequestPin } from '../api/fn/signup/signup-request-pin';

export interface SignupPayload {
  code: string;
  phone: string;
  email: string;
  // PIN SMS reçu sur le téléphone — preuve de possession. Le frontend a dû
  // appeler POST /contractor/auth/pin avant pour déclencher l'envoi du SMS.
  pincode: string;
  // Champs optionnels — au signup l'artisan ne saisit que code + phone + email.
  // Le reste est rempli automatiquement par OCR à l'upload des documents
  // (CNI â†’ first/last_name, KBIS â†’ siren/company_name).
  first_name?: string;
  last_name?: string;
  siren?: string;
  company_name?: string;
}

export interface SignupResponse {
  session_id: string;
  contractor: {
    uuid: string;
    phone: string;
    first_name: string | null;
    last_name: string | null;
  };
  invitation: {
    code_used: string;
  };
  next: string;
}

/**
 * Service d'inscription publique par code d'invitation. La réponse pose un
 * cookie `__contractor_ssid` côté serveur — le frontend doit ensuite naviguer
 * vers `/dashboard` qui sera authentifié par ce cookie.
 *
 * Pas de header d'auth requis ici — c'est volontairement public, le code
 * d'invitation est la garde.
 */
export type VerifyCodeReason =
  | 'invalid_format'
  | 'not_found'
  | 'revoked'
  | 'expired'
  | 'exhausted';

export interface VerifyCodeResponse {
  valid: boolean;
  code: string;
  reason?: VerifyCodeReason;
}

@Injectable({ providedIn: 'root' })
export class ContractorSignupService {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfiguration);
  private readonly urgencyDialogService = inject(UrgencyDialogService);

  /**
   * Pré-vérification du code (étape 1 du flow signup). Ne crée rien,
   * ne consomme pas le code. Permet à l'artisan de savoir tout de suite
   * si son code est bon avant de remplir 6 champs d'identité.
   *
   * Le backend répond 200 dans tous les cas — le flag `valid` discrimine,
   * et `reason` (présent quand `valid: false`) donne la raison exacte.
   */
  verifyCode(code: string): Observable<VerifyCodeResponse> {
    return invitationCodesCheck(this.http, this.apiConfig.rootUrl, { code }).pipe(
      unwrapData<{ valid: boolean; reason?: VerifyCodeReason }>(),
      map((data) => ({ valid: data.valid === true, reason: data.reason, code })),
    );
  }

  /**
   * Étape intermédiaire — déclenche l'envoi du PIN SMS sur le téléphone
   * saisi ET persiste l'identité dans cc_signup_attempts (audit). À appeler
   * APRÈS la saisie nom/prénom/téléphone/email, AVANT le step OTP.
   *
   * Le backend (ContractorSignupController::requestPinAction) :
   *   - valide la forme (first/last_name requis)
   *   - vérifie que le code d'invitation est consommable
   *   - applique les rate-limits anti-abus SMS (5/code, 3/phone, 10/IP par h)
   *   - log la tentative en PIN_REQUESTED
   *   - envoie le SMS via ContractorOauthWrapper::sendSmsPassword
   */
  requestPin(payload: {
    code: string;
    phone: string;
    email: string;
    first_name: string;
    last_name: string;
    siren?: string;
    company_name?: string;
  }): Observable<{ sent: boolean; mock?: boolean }> {
    return signupRequestPin(this.http, this.apiConfig.rootUrl, {
      body: payload,
    }).pipe(unwrapData<{ sent: boolean; mock?: boolean }>());
  }

  signup(payload: SignupPayload): Observable<SignupResponse> {
    return signupCreate(this.http, this.apiConfig.rootUrl, {
      body: {
        code: payload.code,
        phone: payload.phone,
        email: payload.email,
        pincode: payload.pincode,
        first_name: payload.first_name,
        last_name: payload.last_name,
        siren: payload.siren,
        company_name: payload.company_name,
      },
    }).pipe(
      unwrapData<SignupResponse>(),
      // Marque le timestamp signup pour activer la période de grâce 24h du
      // UrgencyDialogService — sinon un user fresh signup serait harcelé
      // immédiatement par le modal "Ton dossier n'est pas complet" alors
      // qu'il vient à peine d'arriver. Voir BUG-004 / FIX-003.
      tap(() => this.urgencyDialogService.markSignupCompleted()),
    );
  }
}
