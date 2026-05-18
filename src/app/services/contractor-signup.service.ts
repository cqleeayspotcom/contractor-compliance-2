import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { UrgencyDialogService } from '../components/shared/urgency-dialog/urgency-dialog.service';

export interface SignupPayload {
  code: string;
  phone: string;
  email: string;
  // Champs optionnels — au signup l'artisan ne saisit que code + phone + email.
  // Le reste est rempli automatiquement par OCR à l'upload des documents
  // (CNI → first/last_name, KBIS → siren/company_name).
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
 * Service d'inscription publique par code d'invitation. La réponse pose un
 * cookie `__contractor_ssid` côté serveur — le frontend doit ensuite naviguer
 * vers `/dashboard` qui sera authentifié par ce cookie.
 *
 * Pas de header d'auth requis ici — c'est volontairement public, le code
 * d'invitation est la garde.
 */
export interface VerifyCodeResponse {
  success: boolean;
  // `valid` peut �tre false : le backend `/invitation-codes/check` r�pond
  // 200 + `valid: false` quand le code n'existe pas/est r�voqu� � la
  // distinction passe par ce flag, pas par le code HTTP.
  data: { valid: boolean; code: string };
}

@Injectable({ providedIn: 'root' })
export class ContractorSignupService {
  private readonly http = inject(HttpClient);
  private readonly urgencyDialogService = inject(UrgencyDialogService);

  /**
   * Pré-vérification du code (étape 1 du flow signup). Ne crée rien,
   * ne consomme pas le code. Permet à l'artisan de savoir tout de suite
   * si son code est bon avant de remplir 6 champs d'identité.
   */
  /**
   * V�rifie un code d'invitation sans le consommer via la route d�di�e
   * `GET /contractor-compliance/invitation-codes/check?code=XXXX`. Le code
   * n'est consomm� que par `signup()` plus tard.
   */
  verifyCode(code: string): Observable<VerifyCodeResponse> {
    const url = `/contractor-compliance/invitation-codes/check?code=${encodeURIComponent(code)}`;
    return this.http.get<{ data?: { valid?: boolean } }>(url).pipe(
      map((res) => ({
        success: true,
        data: { valid: res?.data?.valid === true, code },
      })),
    );
  }

  signup(payload: SignupPayload): Observable<SignupResponse> {
    // withCredentials: true → le navigateur stocke le cookie Set-Cookie de la
    // réponse, indispensable pour les requêtes authentifiées suivantes.
    return this.http
      .post<SignupResponse>('/contractor-compliance/signup', payload, {
        withCredentials: true,
      })
      .pipe(
        // Marque le timestamp signup pour activer la période de grâce 24h du
        // UrgencyDialogService — sinon un user fresh signup serait harcelé
        // immédiatement par le modal "Ton dossier n'est pas complet" alors
        // qu'il vient à peine d'arriver. Voir BUG-004 / FIX-003.
        tap((response) => {
          if (response?.success) {
            this.urgencyDialogService.markSignupCompleted();
          }
        }),
      );
  }
}
