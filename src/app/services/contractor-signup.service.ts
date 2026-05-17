import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { UrgencyDialogService } from '../components/shared/urgency-dialog/urgency-dialog.service';

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
  success: boolean;
  data: {
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
  };
}

export interface SignupError {
  success: false;
  error: { code: string; message: string };
}

/**
 * Service d'inscription publique par code d'invitation. La rÃ©ponse pose un
 * cookie `__contractor_ssid` cÃ´tÃ© serveur â€” le frontend doit ensuite naviguer
 * vers `/dashboard` qui sera authentifiÃ© par ce cookie.
 *
 * Pas de header d'auth requis ici â€” c'est volontairement public, le code
 * d'invitation est la garde.
 */
export interface VerifyCodeResponse {
  success: boolean;
  data: { valid: true; code: string };
}

@Injectable({ providedIn: 'root' })
export class ContractorSignupService {
  private readonly http = inject(HttpClient);
  private readonly urgencyDialogService = inject(UrgencyDialogService);

  /**
   * PrÃ©-vÃ©rification du code (Ã©tape 1 du flow signup). Ne crÃ©e rien,
   * ne consomme pas le code. Permet Ã  l'artisan de savoir tout de suite
   * si son code est bon avant de remplir 6 champs d'identitÃ©.
   */
  verifyCode(code: string): Observable<VerifyCodeResponse> {
    return this.http.post<VerifyCodeResponse>('/contractor-compliance/signup/verify-code', { code });
  }

  signup(payload: SignupPayload): Observable<SignupResponse> {
    // withCredentials: true â†’ le navigateur stocke le cookie Set-Cookie de la
    // rÃ©ponse, indispensable pour les requÃªtes authentifiÃ©es suivantes.
    return this.http
      .post<SignupResponse>('/contractor-compliance/signup', payload, {
        withCredentials: true,
      })
      .pipe(
        // Marque le timestamp signup pour activer la pÃ©riode de grÃ¢ce 24h du
        // UrgencyDialogService â€” sinon un user fresh signup serait harcelÃ©
        // immÃ©diatement par le modal "Ton dossier n'est pas complet" alors
        // qu'il vient Ã  peine d'arriver. Voir BUG-004 / FIX-003.
        tap((response) => {
          if (response?.success) {
            this.urgencyDialogService.markSignupCompleted();
          }
        }),
      );
  }
}
