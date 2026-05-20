import { Injectable, inject } from '@angular/core';
import { Observable, from, interval } from 'rxjs';
import { switchMap, takeWhile, map } from 'rxjs/operators';
import { Api } from '../api/api';

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
import { kycMobileValidateToken } from '../api/fn/kyc-mobile/kyc-mobile-validate-token';
import { kycMobileSubmitVideo } from '../api/fn/kyc-mobile/kyc-mobile-submit-video';
import { kycMobileChallenges } from '../api/fn/kyc-mobile/kyc-mobile-challenges';

export type KycChallenge = 'turn_left' | 'turn_right' | 'blink' | 'smile';

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

@Injectable({ providedIn: 'root' })
export class KycService {
  private readonly api = inject(Api);

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

  /** Validate a QR code token and retrieve the challenge (public). */
  validateMobileToken(token: string): Observable<KycMobileTokenResponse> {
    return from(this.api.invoke(kycMobileValidateToken, { token })).pipe(
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

  /** Submit KYC video from mobile using the one-time token (public). */
  submitMobileVideo(token: string, videoBlob: Blob): Observable<void> {
    return from(
      this.api.invoke(kycMobileSubmitVideo, { token, body: { video: videoBlob } })
    ).pipe(map(() => undefined));
  }
}
