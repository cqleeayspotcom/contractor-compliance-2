import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ApiConfiguration } from '../api/api-configuration';
import { unwrapData, unwrapDataMeta } from '../core/api-envelope';
import { adminInvitationCodesCreate } from '../api/fn/admin-invitation-codes/admin-invitation-codes-create';
import { adminInvitationCodesShow } from '../api/fn/admin-invitation-codes/admin-invitation-codes-show';
import { adminInvitationCodesRevoke } from '../api/fn/admin-invitation-codes/admin-invitation-codes-revoke';
import { adminInvitationCodesUpdateNote } from '../api/fn/admin-invitation-codes/admin-invitation-codes-update-note';
import { adminInvitationCodesList } from '../api/fn/admin-invitation-codes/admin-invitation-codes-list';

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
  generated_by_label: string | null;
  expires_at: string;
  max_uses: number | null;
  uses_count: number;
  revoked_at: string | null;
  note: string | null;
  first_use: InvitationCodeFirstUse | null;
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
  private readonly apiConfig = inject(ApiConfiguration);

  list(params: { status?: string; per_page?: number; sort?: string; direction?: 'asc' | 'desc' } = {}): Observable<InvitationCodeListResponse> {
    return adminInvitationCodesList(this.http, this.apiConfig.rootUrl, params).pipe(
      unwrapDataMeta<InvitationCodeRow[], InvitationCodeListResponse['meta']>(),
      map(({ data, meta }) => ({ data, meta: meta as InvitationCodeListResponse['meta'] })),
    );
  }

  create(body: {
    valid_for_days?: number;
    max_uses?: number | null;
    note: string;
    generated_by_label: string;
  }): Observable<{ data: InvitationCodeRow }> {
    return adminInvitationCodesCreate(this.http, this.apiConfig.rootUrl, { body }).pipe(
      unwrapData<InvitationCodeRow>(),
      map(data => ({ data })),
    );
  }

  detail(uuid: string): Observable<{ data: InvitationCodeDetail }> {
    // NOTE : le param OpenAPI s'appelle `code` mais sÃ©mantiquement le backend
    // accepte aussi l'uuid (les consommateurs passent row.uuid historiquement).
    return adminInvitationCodesShow(this.http, this.apiConfig.rootUrl, { code: uuid }).pipe(
      unwrapData<InvitationCodeDetail>(),
      map(data => ({ data })),
    );
  }

  revoke(uuid: string): Observable<{ data: InvitationCodeRow }> {
    return adminInvitationCodesRevoke(this.http, this.apiConfig.rootUrl, { code: uuid }).pipe(
      unwrapData<InvitationCodeRow>(),
      map(data => ({ data })),
    );
  }

  updateNote(uuid: string, note: string): Observable<{ data: InvitationCodeRow }> {
    return adminInvitationCodesUpdateNote(this.http, this.apiConfig.rootUrl, { code: uuid, body: { note } }).pipe(
      unwrapData<InvitationCodeRow>(),
      map(data => ({ data })),
    );
  }
}
