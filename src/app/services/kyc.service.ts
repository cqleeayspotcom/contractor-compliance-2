import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, interval } from 'rxjs';
import { switchMap, takeWhile, map } from 'rxjs/operators';
import { Api } from '../api/api';
import { ApiConfiguration } from '../api/api-configuration';

// SDK functions disponibles cote backend Tuita (post-regeneration ng-openapi-gen).
// POURQUOI : on ne reference QUE les routes reellement exposees par le module
// platform-backend/module/ContractorCompliance. Les anciennes routes legacy
// (kyc-start-identity, kyc-poll-session, kyc-generate-mobile-link,
// kyc-submit-video, kyc-generate-challenge) n'existent plus cote backend ->
// les methodes correspondantes sont stubbees plus bas.
import { kycChallenge } from '../api/fn/kyc/kyc-challenge';
import { kycStatus } from '../api/fn/kyc/kyc-status';
import { kycVideo } from '../api/fn/kyc/kyc-video';
import { kycMobileLink } from '../api/fn/kyc/kyc-mobile-link';
import { kycMobileSubmitVideo } from '../api/fn/kyc-mobile/kyc-mobile-submit-video';
import { kycMobileChallenges } from '../api/fn/kyc-mobile/kyc-mobile-challenges';

export type KycChallenge = 'turn_left' | 'turn_right' | 'look_up' | 'look_down' | 'blink' | 'smile' | 'nod' | 'open_mouth';

/** Inline session shape returned by start/poll/submit endpoints. */
export interface KycSessionResponse {
  uuid: string;
  status: 'pending' | 'processing' | 'approved' | 'rejected' | 'expired';
  expires_at?: string;
  created_at: string;
}

export interface KycMobileLinkResponse {
  mobile_url: string;
  qr_url: string;
  challenge: KycChallenge;
  challenge_2: KycChallenge;
  expires_in: number;
  expires_at: string;
}

export interface KycChallengeResponse {
  challenge_token: string;
  challenge: KycChallenge;
  challenge_2: KycChallenge;
  expires_in: number;
  device_type: string;
}

export interface KycMobileTokenResponse {
  session_uuid: string;
  challenge: KycChallenge;
  challenge_2: KycChallenge | null;
  expires_at: string;
}

export interface KycMobileResult {
  status: 'pending' | 'processing' | 'pending_retry' | 'approved' | 'rejected' | 'rejected_no_face_source' | 'failed' | string;
  finished: boolean;
  ok: boolean;
  retryable: boolean;
  headline: string;
  message: string;
  failure_reason: string | null;
}

@Injectable({ providedIn: 'root' })
export class KycService {
  private readonly api = inject(Api);
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfiguration);

  // ---------------------------------------------------------------------------
  // Session management
  // ---------------------------------------------------------------------------

  /**
   * Demarre une session KYC identite.
   * NOTE : le backend Tuita n'expose pas de route /kyc/start dediee.
   * La session est cree implicitement au premier appel /kyc/challenge.
   * On expose donc startSession comme un simple alias de getChallenge()
   * pour preserver l'API publique consommee par les composants existants.
   */
  startSession(
    _documentType: 'passport' | 'id_card' | 'driving_license' = 'id_card',
    _language = 'fr'
  ): Observable<KycSessionResponse> {
    return from(this.api.invoke(kycChallenge)).pipe(
      map(r => (r as any)?.data?.session as KycSessionResponse)
    );
  }

  /**
   * Recupere le statut courant de la session KYC du contractor connecte.
   * Cote backend la session est identifiee par le cookie __contractor_ssid,
   * pas par un uuid passe en parametre -> l'argument est conserve pour
   * compatibilite mais ignore.
   */
  pollSession(_sessionUuid: string): Observable<KycSessionResponse> {
    return from(this.api.invoke(kycStatus)).pipe(
      map(r => (r as any)?.data?.session as KycSessionResponse)
    );
  }

  /**
   * Poll session status every 3 seconds until a final status is reached.
   * The observable completes after emitting the first approved | rejected | expired status.
   */
  pollUntilFinal(sessionUuid: string): Observable<KycSessionResponse> {
    const finalStatuses = ['approved', 'rejected', 'expired'];
    return interval(3000).pipe(
      switchMap(() => this.pollSession(sessionUuid)),
      takeWhile(session => !finalStatuses.includes(session.status), true)
    );
  }

  // ---------------------------------------------------------------------------
  // Video submission (authenticated — desktop / direct flow)
  // ---------------------------------------------------------------------------

  /** Submit KYC video directly (authenticated user, desktop or mobile). */
  submitVideo(
    _sessionUuid: string,
    videoBlob: Blob
  ): Observable<{ session: KycSessionResponse; message?: string }> {
    // POURQUOI : la route Tuita /kyc/video identifie la session via cookie
    // contractor, pas via session_uuid dans le body. On garde la signature
    // historique pour ne pas casser les appelants.
    return from(
      this.api.invoke(kycVideo, { body: { video: videoBlob } })
    ).pipe(
      map(r => ({
        session: (r as any)?.data?.session as KycSessionResponse,
        message: (r as any)?.data?.message
      }))
    );
  }

  // ---------------------------------------------------------------------------
  // Direct mobile challenge (authenticated user already on mobile)
  // ---------------------------------------------------------------------------

  /**
   * Recupere un challenge biometrique pour la session courante.
   * NOTE : le backend Tuita expose /kyc/challenge en GET (pas POST) et
   * identifie la session via cookie. L'argument session_uuid est ignore.
   */
  generateChallenge(_sessionUuid: string): Observable<KycChallengeResponse> {
    return from(this.api.invoke(kycChallenge)).pipe(
      map(r => (r as any)?.data as KycChallengeResponse)
    );
  }

  // ---------------------------------------------------------------------------
  // QR Code / Mobile link flow
  // ---------------------------------------------------------------------------

  /** Generate a one-time mobile link + QR code URL (called from desktop). */
  generateMobileLink(_sessionUuid: string): Observable<KycMobileLinkResponse> {
    // Cote backend, /kyc/mobile-link cree le token capability a partir du
    // cookie contractor courant -> aucun body necessaire.
    return from(this.api.invoke(kycMobileLink)).pipe(
      map(r => (r as any)?.data as KycMobileLinkResponse)
    );
  }

  // ---------------------------------------------------------------------------
  // Public mobile endpoints (no auth — called from the mobile page)
  // ---------------------------------------------------------------------------

  /**
   * Valide un token QR et récupère les 2 challenges biométriques (public).
   *
   * POURQUOI on appelle `kycMobileChallenges` et non `kycMobileValidateToken` :
   * côté backend, `GET /contractor-compliance/kyc/mobile/{token}` rend un
   * formulaire HTML (viewAction legacy mobile), pas du JSON — la SPA mobile
   * parserait du `<!doctype …>` comme JSON et tomberait sur "Unexpected
   * token '<'". Le seul GET JSON qui retourne challenges + expires_at sans
   * consommer le token est `…/{token}/challenges` (challengesAction).
   * `kycMobileValidateToken` est conservé dans le SDK pour compat mais
   * inutilisable depuis Angular tel quel.
   */
  validateMobileToken(token: string): Observable<KycMobileTokenResponse> {
    return from(this.api.invoke(kycMobileChallenges, { token })).pipe(
      map(r => (r as any)?.data as KycMobileTokenResponse)
    );
  }

  /**
   * Récupère les 2 challenges biométriques pour la SPA mobile SANS
   * consommer le token (pendant JSON du viewAction HTML legacy). Permet
   * au composant React/Angular mobile de hydrater l'UI avant l'enregistrement
   * vidéo, là où `validateMobileToken` consomme le capability.
   */
  getMobileChallenges(token: string): Observable<KycMobileTokenResponse> {
    return from(this.api.invoke(kycMobileChallenges, { token })).pipe(
      map(r => (r as any)?.data as KycMobileTokenResponse)
    );
  }

  /**
   * Submit KYC video from mobile using the one-time token (public).
   *
   * POURQUOI on contourne le SDK auto-généré `kycMobileSubmitVideo` :
   *   Le request-builder ng-openapi-gen fait `formData.set('video', blob)`
   *   sans préciser de filename (3e argument de FormData.append). Le multipart
   *   produit a alors un Content-Disposition `name="video"` SANS `filename="..."`,
   *   ce que certains parseurs PSR-7 côté Laminas (Diactoros) interprètent
   *   comme un champ de formulaire ordinaire et NON comme un UploadedFile.
   *   Résultat : `$request->getUploadedFiles()` ne contient pas 'video',
   *   le backend rejette en 400 « Requête invalide. Recharge la page et
   *   réessaie. » (KycMobileController.php:285 / videoAction).
   *
   * Fix : on construit la FormData à la main avec un filename explicite,
   * et on POST directement via HttpClient sur l'URL du SDK (pour rester
   * synchronisé si la route change côté backend, on dérive l'URL depuis
   * `kycMobileSubmitVideo.PATH`).
   */
  submitMobileVideo(token: string, videoBlob: Blob): Observable<void> {
    // POURQUOI on re-wrap le Blob en strippant le `;codecs=...` :
    //   MediaRecorder produit un Blob dont le `type` est `video/webm;codecs=vp9`
    //   (ou similaire). Quand on l'envoie en multipart, le navigateur copie ce
    //   type tel-quel dans le Content-Type de la part fichier. Côté backend,
    //   ALLOWED_VIDEO_MIMES est en comparaison stricte sur ['video/mp4',
    //   'video/webm', 'video/quicktime'] (cf. KycMobileController.php:50) →
    //   `video/webm;codecs=vp9` est rejeté avec `kyc_video_invalid_format`.
    const canonicalType = (videoBlob.type.split(';')[0] || 'video/webm').trim();
    const ext = canonicalType.includes('mp4') ? 'mp4'
              : canonicalType.includes('quicktime') ? 'mov'
              : canonicalType.includes('webm') ? 'webm'
              : 'bin';

    const safeBlob = videoBlob.type === canonicalType
      ? videoBlob
      : new Blob([videoBlob], { type: canonicalType });

    const formData = new FormData();
    formData.append('video', safeBlob, `kyc-mobile.${ext}`);

    const path = kycMobileSubmitVideo.PATH.replace('{token}', encodeURIComponent(token));
    const url = `${this.apiConfig.rootUrl}${path}`;

    return this.http.post<void>(url, formData);
  }

  /**
   * Récupère le verdict de la session KYC associée au token mobile.
   * Endpoint public auth-by-capability (le token suffit, pas de cookie).
   *
   * Utilisé par kyc-mobile pour poller le résultat après upload : tant que
   * `finished=false` (statuts pending/processing/pending_retry), le composant
   * relance toutes les ~2s ; sinon il affiche `headline`/`message` au
   * contractor.
   *
   * Pas passé par le SDK ng-openapi-gen pour rester déployable sans
   * régénération côté frontend — on POST/GET directement comme pour
   * `submitMobileVideo`.
   */
  getMobileResult(token: string): Observable<KycMobileResult> {
    const path = `/contractor-compliance/kyc/mobile/${encodeURIComponent(token)}/result`;
    const url = `${this.apiConfig.rootUrl}${path}`;
    return this.http.get<{ data: KycMobileResult }>(url).pipe(
      map(res => res.data),
    );
  }

  /**
   * Régénère un token mobile sur la même session KYC après un échec —
   * permet le retry direct depuis le téléphone sans repasser par le PC.
   *
   * Retourne le nouveau token + l'URL complète à charger. Le composant
   * mobile fait simplement `window.location.href = result.url` pour
   * relancer le flow sur le nouveau token (intro screen frais).
   *
   * Refusé côté backend si :
   *   - statut courant ≠ rejected/failed
   *   - failure_reason = rejected_no_face_source (manque la CNI →
   *     l'artisan DOIT redéposer la pièce d'identité depuis son PC)
   */
  retryMobile(token: string): Observable<{ token: string; url: string }> {
    const path = `/contractor-compliance/kyc/mobile/${encodeURIComponent(token)}/retry`;
    const url = `${this.apiConfig.rootUrl}${path}`;
    return this.http.post<{ data: { token: string; url: string } }>(url, {}).pipe(
      map(res => res.data),
    );
  }
}
