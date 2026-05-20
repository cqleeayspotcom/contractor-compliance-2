import { Injectable, inject } from '@angular/core';

import { Api } from '../api/api';
import { adminKycSessions } from '../api/fn/admin-kyc/admin-kyc-sessions';
import { adminKycRejections } from '../api/fn/admin-kyc/admin-kyc-rejections';
import { adminKycArtifactsView } from '../api/fn/admin-kyc/admin-kyc-artifacts-view';
import { adminKycShow } from '../api/fn/admin-kyc/admin-kyc-show';
import { adminKycReplay } from '../api/fn/admin-kyc/admin-kyc-replay';
import { adminKycForceApprove } from '../api/fn/admin-kyc/admin-kyc-force-approve';

export interface KycSessionRow {
  uuid: string;
  user_id: number | null;
  contractor_phone: string | null;
  contractor_first_name: string | null;
  contractor_last_name: string | null;
  status: string;
  failure_reason: string | null;
  failure_detail: string | null;
  liveness_score: number | null;
  face_match_score: number | null;
  biometric_provider: string | null;
  biometric_result: Record<string, unknown> | null;
  retry_count: number | null;
  last_retried_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
}

export interface KycPaginatedResponse<T> {
  data: T[];
  meta?: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export interface KycArtifact {
  type: string;
  path: string;
  label?: string;
  score?: number | null;
}

export interface KycArtifactsResponse {
  data: {
    session_uuid: string;
    artifacts: KycArtifact[];
  };
}

export interface KycSessionsQuery {
  page?: number;
  per_page?: number;
  phone?: string;
  failure_reason?: string;
  sort?: string;
  direction?: 'asc' | 'desc';
}

@Injectable({ providedIn: 'root' })
export class AdminKycService {
  private readonly api = inject(Api);

  private sanitizeQuery(query: KycSessionsQuery | undefined): KycSessionsQuery {
    if (!query) return {};
    const q = { ...query };
    if (q.failure_reason === 'all') delete q.failure_reason;
    return q;
  }

  async getSessions(query?: KycSessionsQuery): Promise<KycPaginatedResponse<KycSessionRow>> {
    // SuccessEnvelope `{ data: KycSessionRow[], meta: {...} }` → on conserve la
    // forme `KycPaginatedResponse` attendue par le composant.
    const env = await this.api.invoke(adminKycSessions, this.sanitizeQuery(query));
    return env as unknown as KycPaginatedResponse<KycSessionRow>;
  }

  async getRejections(query?: KycSessionsQuery): Promise<KycPaginatedResponse<KycSessionRow>> {
    const env = await this.api.invoke(adminKycRejections, this.sanitizeQuery(query));
    return env as unknown as KycPaginatedResponse<KycSessionRow>;
  }

  /**
   * Artefacts visualisables d'une session KYC. Une session = une vidéo selfie :
   * `artifacts/view` (route réelle backend) renvoie son URL signée (TTL 1h),
   * directement utilisable comme `src`. Retourne `[]` si aucune vidéo stockée.
   *
   * NB : il n'existe pas de route "liste d'artefacts" côté backend — l'ancienne
   * `/kyc/sessions/{uuid}/artifacts` était morte (404). Les frames extraites
   * éventuelles sont décrites dans `biometric_result`, pas servies en fichiers.
   */
  async getArtifacts(sessionUuid: string): Promise<KycArtifact[]> {
    const env = await this.api.invoke(adminKycArtifactsView, { uuid: sessionUuid });
    const data = (env as { data?: { video_url?: string | null; available?: boolean } }).data ?? {};
    if (!data.available || !data.video_url) {
      return [];
    }
    return [{ type: 'video', path: data.video_url, label: 'Vidéo selfie KYC' }];
  }

  /** Détail complet d'une session KYC (scores, artefacts, historique retry). */
  async getSession(uuid: string): Promise<KycSessionRow> {
    const env = await this.api.invoke(adminKycShow, { uuid });
    return (env as unknown as { data: KycSessionRow }).data;
  }

  /**
   * Rejoue le pipeline biométrique sur une session (nouvelle passe provider).
   * Utile quand le provider était KO au moment de la 1re tentative.
   */
  async replaySession(sessionUuid: string): Promise<KycSessionRow> {
    const env = await this.api.invoke(adminKycReplay, { sessionUuid });
    return (env as unknown as { data: KycSessionRow }).data;
  }

  /**
   * Validation manuelle forcée d'une session KYC : override la décision auto
   * du pipeline biométrique (cas litige / score limite confirmé à la main).
   */
  async forceApprove(sessionUuid: string): Promise<KycSessionRow> {
    const env = await this.api.invoke(adminKycForceApprove, { sessionUuid });
    return (env as unknown as { data: KycSessionRow }).data;
  }
}
