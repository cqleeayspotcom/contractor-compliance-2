import { Injectable, inject } from '@angular/core';

import { Api } from '../api/api';
import { adminKycSessions } from '../api/fn/admin-kyc/admin-kyc-sessions';
import { adminKycRejections } from '../api/fn/admin-kyc/admin-kyc-rejections';
import { adminKycArtifactsList } from '../api/fn/admin-kyc/admin-kyc-artifacts-list';
import { adminKycArtifactsView } from '../api/fn/admin-kyc/admin-kyc-artifacts-view';

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
    const result = await this.api.invoke(adminKycSessions, this.sanitizeQuery(query));
    return result as unknown as KycPaginatedResponse<KycSessionRow>;
  }

  async getRejections(query?: KycSessionsQuery): Promise<KycPaginatedResponse<KycSessionRow>> {
    const result = await this.api.invoke(adminKycRejections, this.sanitizeQuery(query));
    return result as unknown as KycPaginatedResponse<KycSessionRow>;
  }

  async getArtifacts(sessionUuid: string): Promise<KycArtifact[]> {
    const result = await this.api.invoke(adminKycArtifactsList, { uuid: sessionUuid });
    return ((result as unknown as KycArtifactsResponse).data?.artifacts) ?? [];
  }

  async fetchArtifactBlob(sessionUuid: string, path: string): Promise<string> {
    const blob = await this.api.invoke(adminKycArtifactsView, { uuid: sessionUuid, path });
    return URL.createObjectURL(blob as unknown as Blob);
  }
}
