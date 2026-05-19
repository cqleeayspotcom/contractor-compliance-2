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

/**
 * Wrappers SDK pour la gestion admin des codes d'invitation contractor.
 *
 * POURQUOI on renvoie des Observables alors que `Api.invoke` produit des
 * Promises : les composants existants consomment ces méthodes via `.subscribe`
 * (gestion erreurs MatSnackBar, refresh table). On wrappe via `from()` pour
 * éviter une réécriture des composants, tout en s'appuyant exclusivement sur
 * le SDK auto-généré côté transport HTTP.
 */
@Injectable({ providedIn: 'root' })
export class AdminInvitationCodeService {
  private readonly api = inject(Api);

  list(
    params: { status?: string; per_page?: number; sort?: string; direction?: 'asc' | 'desc' } = {},
  ): Observable<InvitationCodeListResponse> {
    return from(
      this.api.invoke(adminInvitationCodesList, params).then((env) => {
        const body = env as { data: InvitationCodeRow[]; meta: InvitationCodeListResponse['meta'] };
        return { data: body.data, meta: body.meta };
      }),
    );
  }

  create(body: {
    valid_for_days?: number;
    max_uses?: number | null;
    note: string;
    generated_by_label: string;
  }): Observable<{ data: InvitationCodeRow }> {
    return from(
      this.api.invoke(adminInvitationCodesCreate, { body }).then((env) => ({
        data: (env as { data: InvitationCodeRow }).data,
      })),
    );
  }

  detail(uuid: string): Observable<{ data: InvitationCodeDetail }> {
    // POURQUOI : le paramètre OpenAPI s'appelle `code`, mais le backend
    // accepte aussi l'uuid. Les composants passent historiquement `row.uuid`.
    return from(
      this.api.invoke(adminInvitationCodesShow, { code: uuid }).then((env) => ({
        data: (env as { data: InvitationCodeDetail }).data,
      })),
    );
  }

  revoke(uuid: string): Observable<{ data: InvitationCodeRow }> {
    return from(
      this.api.invoke(adminInvitationCodesRevoke, { code: uuid }).then((env) => ({
        data: (env as { data: InvitationCodeRow }).data,
      })),
    );
  }

  updateNote(uuid: string, note: string): Observable<{ data: InvitationCodeRow }> {
    return from(
      this.api.invoke(adminInvitationCodesUpdateNote, { code: uuid, body: { note } }).then((env) => ({
        data: (env as { data: InvitationCodeRow }).data,
      })),
    );
  }
}
