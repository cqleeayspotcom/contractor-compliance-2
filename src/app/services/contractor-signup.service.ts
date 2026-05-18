import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { UrgencyDialogService } from '../components/shared/urgency-dialog/urgency-dialog.service';
import { ApiConfiguration } from '../api/api-configuration';
import { unwrapData } from '../core/api-envelope';
import { invitationCodesCheck } from '../api/fn/signup/invitation-codes-check';
import { signupCreate } from '../api/fn/signup/signup-create';

export interface SignupPayload {
  code: string;
  phone: string;
  email: string;
  // Champs optionnels â€” au signup l'artisan ne saisit que code + phone + email.
  // Le reste est rempli automatiquement par OCR Ã  l'upload des documents
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
 * Service d'inscription publique par code d'invitation. La rÃ©ponse pose un
 * cookie `__contractor_ssid` cÃ´tÃ© serveur â€” le frontend doit ensuite naviguer
 * vers `/dashboard` qui sera authentifiÃ© par ce cookie.
 *
 * Pas de header d'auth requis ici â€” c'est volontairement public, le code
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
   * PrÃ©-vÃ©rification du code (Ã©tape 1 du flow signup). Ne crÃ©e rien,
   * ne consomme pas le code. Permet Ã  l'artisan de savoir tout de suite
   * si son code est bon avant de remplir 6 champs d'identitÃ©.
   *
   * Le backend rÃ©pond 200 dans tous les cas â€” le flag `valid` discrimine,
   * et `reason` (prÃ©sent quand `valid: false`) donne la raison exacte.
   */
  verifyCode(code: string): Observable<VerifyCodeResponse> {
    return invitationCodesCheck(this.http, this.apiConfig.rootUrl, { code }).pipe(
      unwrapData<{ valid: boolean; reason?: VerifyCodeReason }>(),
      map((data) => ({ valid: data.valid === true, reason: data.reason, code })),
    );
  }

  signup(payload: SignupPayload): Observable<SignupResponse> {
    return signupCreate(this.http, this.apiConfig.rootUrl, {
      body: {
        code: payload.code,
        phone: payload.phone,
        email: payload.email,
        first_name: payload.first_name,
        last_name: payload.last_name,
        siren: payload.siren,
        company_name: payload.company_name,
      },
    }).pipe(
      unwrapData<SignupResponse>(),
      // Marque le timestamp signup pour activer la pÃ©riode de grÃ¢ce 24h du
      // UrgencyDialogService â€” sinon un user fresh signup serait harcelÃ©
      // immÃ©diatement par le modal "Ton dossier n'est pas complet" alors
      // qu'il vient Ã  peine d'arriver. Voir BUG-004 / FIX-003.
      tap(() => this.urgencyDialogService.markSignupCompleted()),
    );
  }
}
