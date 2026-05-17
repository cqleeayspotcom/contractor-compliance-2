import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

const BASE_URL = '/contractor-compliance/admin/invitation-codes';

export interface InvitationCodeFirstUse {
  phone: string;
  first_name: string | null;
  last_name: string | null;
  consumed_at: string | null;
}

export interface InvitationCodeRow {
  uuid: string;
  code: string;
  generated_by_admin_id: number | null;
  /**
   * Identifiant libre de l'admin Tuita qui a gÃ©nÃ©rÃ© le code (email ou nom).
   */
  generated_by_label: string | null;
  expires_at: string;
  max_uses: number | null;
  uses_count: number;
  revoked_at: string | null;
  note: string | null;
  /** Premier inscrit avec ce code (chronologique). Null si pas encore consommÃ©. */
  first_use: InvitationCodeFirstUse | null;
  /**
   * Heuristique cohÃ©rence note â†” 1er inscrit. true = match probable,
   * false = mismatch (code redistribuÃ© ou fuite ?), null = pas de signal
   * (note vide ou pas encore consommÃ©).
   */
  note_matches_first_use: boolean | null;
  is_consumable: boolean;
  created_at: string | null;
}

export interface InvitationCodeUseRow {
  uuid: string;
  phone: string;
  first_name: string | null;
  last_name: string | null;
  siren: string | null;
  company_name: string | null;
  consumed_ip: string | null;
  consumed_user_agent: string | null;
  note: string | null;
  created_at: string | null;
  user: { uuid: string; phone: string | null; first_name: string | null; last_name: string | null } | null;
}

export interface InvitationCodeDetail extends InvitationCodeRow {
  uses: InvitationCodeUseRow[];
}

export interface InvitationCodeListResponse {
  data: InvitationCodeRow[];
  meta: { total: number; per_page: number; current_page: number; last_page: number };
}

@Injectable({ providedIn: 'root' })
export class AdminInvitationCodeService {
  private readonly http = inject(HttpClient);

  private headers(): HttpHeaders {
    return new HttpHeaders({ 'X-Tuita-Admin-Key': sessionStorage.getItem('tuita_admin_key') ?? '' });
  }

  list(params: { status?: string; per_page?: number; sort?: string; direction?: 'asc' | 'desc' } = {}): Observable<InvitationCodeListResponse> {
    let httpParams = new HttpParams();
    if (params.status) httpParams = httpParams.set('status', params.status);
    if (params.per_page) httpParams = httpParams.set('per_page', String(params.per_page));
    if (params.sort) httpParams = httpParams.set('sort', params.sort);
    if (params.direction) httpParams = httpParams.set('direction', params.direction);
    return this.http.get<InvitationCodeListResponse>(BASE_URL, { headers: this.headers(), params: httpParams });
  }

  create(body: {
    valid_for_days?: number;
    max_uses?: number | null;
    note: string;
    generated_by_label: string;
  }): Observable<{ data: InvitationCodeRow }> {
    return this.http.post<{ data: InvitationCodeRow }>(BASE_URL, body, { headers: this.headers() });
  }

  detail(uuid: string): Observable<{ data: InvitationCodeDetail }> {
    return this.http.get<{ data: InvitationCodeDetail }>(`${BASE_URL}/${uuid}`, { headers: this.headers() });
  }

  revoke(uuid: string): Observable<{ data: InvitationCodeRow }> {
    return this.http.post<{ data: InvitationCodeRow }>(`${BASE_URL}/${uuid}/revoke`, {}, { headers: this.headers() });
  }

  updateNote(uuid: string, note: string): Observable<{ data: InvitationCodeRow }> {
    return this.http.patch<{ data: InvitationCodeRow }>(
      `${BASE_URL}/${uuid}/note`,
      { note },
      { headers: this.headers() },
    );
  }
}
