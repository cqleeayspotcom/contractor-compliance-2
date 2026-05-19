import { Injectable, inject } from '@angular/core';

import { Api } from '../api/api';
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

  async reset(key: string, reason: string): Promise<PlatformSetting> {
    // POURQUOI SDK : `adminSettingsReset` expose désormais un body optionnel
    // `{ reason }` qui alimente l'audit trail `AppSettingService::set()`.
    // Plus besoin de HttpClient brut — l'intercepteur Bearer admin gère l'auth.
    const env = await this.api.invoke(adminSettingsReset, { key, body: { reason } });
    return (env as { data: PlatformSetting }).data;
  }
}
