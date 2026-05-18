import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';

import { Api } from '../api/api';
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
  private readonly api = inject(Api);

  list(params: { status?: string; per_page?: number; sort?: string; direction?: 'asc' | 'desc' } = {}): Observable<InvitationCodeListResponse> {
    return from(
      this.api.invoke(adminInvitationCodesList, params),
    ) as Observable<InvitationCodeListResponse>;
  }

  create(body: {
    valid_for_days?: number;
    max_uses?: number | null;
    note: string;
    generated_by_label: string;
  }): Observable<{ data: InvitationCodeRow }> {
    return from(
      this.api.invoke(adminInvitationCodesCreate, { body }),
    ) as Observable<{ data: InvitationCodeRow }>;
  }

  detail(uuid: string): Observable<{ data: InvitationCodeDetail }> {
    // NOTE : le param OpenAPI s'appelle `code` mais sémantiquement le backend
    // accepte aussi l'uuid (les consommateurs passent row.uuid historiquement).
    return from(
      this.api.invoke(adminInvitationCodesShow, { code: uuid }),
    ) as Observable<{ data: InvitationCodeDetail }>;
  }

  revoke(uuid: string): Observable<{ data: InvitationCodeRow }> {
    return from(
      this.api.invoke(adminInvitationCodesRevoke, { code: uuid }),
    ) as Observable<{ data: InvitationCodeRow }>;
  }

  updateNote(uuid: string, note: string): Observable<{ data: InvitationCodeRow }> {
    return from(
      this.api.invoke(adminInvitationCodesUpdateNote, { code: uuid, body: { note } }),
    ) as Observable<{ data: InvitationCodeRow }>;
  }
}
