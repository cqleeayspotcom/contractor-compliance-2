import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';

import { Api } from '../api/api';
import { ApiConfiguration } from '../api/api-configuration';
import { adminSettingsList } from '../api/fn/admin-settings/admin-settings-list';
import { adminSettingsGet } from '../api/fn/admin-settings/admin-settings-get';
import { adminSettingsUpdate } from '../api/fn/admin-settings/admin-settings-update';
import { adminSettingsBatchUpdate } from '../api/fn/admin-settings/admin-settings-batch-update';
import { adminSettingsReset } from '../api/fn/admin-settings/admin-settings-reset';

export type SettingValue = string | number | boolean | string[] | null;

export interface PlatformSetting {
  key: string;
  value: SettingValue;
  type: 'string' | 'integer' | 'float' | 'boolean' | 'array' | 'json';
  source: 'database' | 'env_fallback';
  description?: string | null;
  updated_at?: string | null;
  default_value?: SettingValue;
}

export interface UpdateSettingPayload {
  value: SettingValue;
  reason: string;
}

export interface BatchUpdateEntry {
  key: string;
  value: SettingValue;
  reason: string;
}

@Injectable({ providedIn: 'root' })
export class AdminSettingsService {
  private readonly api = inject(Api);
  // POURQUOI : le SDK généré pour `POST /settings/:key/reset` n'expose pas de
  // body (omission dans l'OpenAPI), or le backend lit `reason` dans le body
  // pour tracer la motivation du reset. On garde un HttpClient brut pour ce
  // seul endpoint afin de préserver l'audit trail.
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfiguration);

  async list(): Promise<PlatformSetting[]> {
    const env = await this.api.invoke(adminSettingsList);
    return (env as { data?: PlatformSetting[] }).data ?? [];
  }

  async show(key: string): Promise<PlatformSetting> {
    const env = await this.api.invoke(adminSettingsGet, { key });
    return (env as { data: PlatformSetting }).data;
  }

  async update(key: string, payload: UpdateSettingPayload): Promise<PlatformSetting> {
    const env = await this.api.invoke(adminSettingsUpdate, { key, body: payload as unknown as Record<string, unknown> });
    return (env as { data: PlatformSetting }).data;
  }

  async batchUpdate(updates: BatchUpdateEntry[]): Promise<PlatformSetting[]> {
    const env = await this.api.invoke(adminSettingsBatchUpdate, { body: { updates } as unknown as Record<string, unknown> });
    return (env as { data?: PlatformSetting[] }).data ?? [];
  }

  reset(key: string, reason: string): Promise<PlatformSetting> {
    // Gap SDK : voir commentaire en tête de classe. URL alignée sur le PATH du
    // SDK (`adminSettingsReset.PATH`) — ne pas oublier de basculer ici si le
    // backend renomme la route.
    // POURQUOI : URL dérivée du PATH du SDK auto-généré pour rester synchronisée
    // avec l'OpenAPI ; le segment `{key}` est substitué localement car l'appel
    // brut via HttpClient est nécessaire pour transmettre le body `reason`.
    const path = adminSettingsReset.PATH.replace('{key}', encodeURIComponent(key));
    const url = `${this.apiConfig.rootUrl}${path}`;
    return firstValueFrom(
      this.http
        .post<{ data: PlatformSetting }>(url, { reason })
        .pipe(map((r) => r.data)),
    );
  }
}
