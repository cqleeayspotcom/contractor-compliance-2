import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';

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
  private readonly http = inject(HttpClient);

  private readonly baseUrl = '/contractor-compliance/admin/kyc';

  private headers(): HttpHeaders {
    const key = sessionStorage.getItem('tuita_admin_key') ?? '';
    return new HttpHeaders({ 'X-Tuita-Admin-Key': key });
  }

  private toParams(query: KycSessionsQuery | undefined): HttpParams {
    let params = new HttpParams();
    if (!query) return params;
    if (query.page !== undefined) params = params.set('page', String(query.page));
    if (query.per_page !== undefined) params = params.set('per_page', String(query.per_page));
    if (query.phone) params = params.set('phone', query.phone);
    if (query.failure_reason && query.failure_reason !== 'all') {
      params = params.set('failure_reason', query.failure_reason);
    }
    if (query.sort) params = params.set('sort', query.sort);
    if (query.direction) params = params.set('direction', query.direction);
    return params;
  }

  getSessions(query?: KycSessionsQuery): Promise<KycPaginatedResponse<KycSessionRow>> {
    return firstValueFrom(
      this.http.get<KycPaginatedResponse<KycSessionRow>>(`${this.baseUrl}/sessions`, {
        headers: this.headers(),
        params: this.toParams(query),
      }),
    );
  }

  getRejections(query?: KycSessionsQuery): Promise<KycPaginatedResponse<KycSessionRow>> {
    return firstValueFrom(
      this.http.get<KycPaginatedResponse<KycSessionRow>>(`${this.baseUrl}/rejections`, {
        headers: this.headers(),
        params: this.toParams(query),
      }),
    );
  }

  getArtifacts(sessionUuid: string): Promise<KycArtifact[]> {
    return firstValueFrom(
      this.http
        .get<KycArtifactsResponse>(`${this.baseUrl}/${sessionUuid}/artifacts`, {
          headers: this.headers(),
        })
        .pipe(map((r) => r.data?.artifacts ?? [])),
    );
  }

  async fetchArtifactBlob(sessionUuid: string, path: string): Promise<string> {
    const blob = await firstValueFrom(
      this.http.get(`${this.baseUrl}/${sessionUuid}/artifacts/view`, {
        headers: this.headers(),
        params: new HttpParams().set('path', path),
        responseType: 'blob',
      }),
    );
    return URL.createObjectURL(blob);
  }
}
