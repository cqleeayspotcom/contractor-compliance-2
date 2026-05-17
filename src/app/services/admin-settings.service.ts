import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';

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

const ADMIN_KEY_STORAGE_KEY = 'tuita_admin_key';
const BASE = '/contractor-compliance/admin/settings';

@Injectable({ providedIn: 'root' })
export class AdminSettingsService {
  private readonly http = inject(HttpClient);

  private headers(): HttpHeaders {
    const key = sessionStorage.getItem(ADMIN_KEY_STORAGE_KEY) ?? '';
    return new HttpHeaders({ 'X-Tuita-Admin-Key': key });
  }

  list(): Promise<PlatformSetting[]> {
    return firstValueFrom(
      this.http
        .get<{ data: PlatformSetting[] }>(BASE, { headers: this.headers() })
        .pipe(map((r) => r.data ?? [])),
    );
  }

  show(key: string): Promise<PlatformSetting> {
    return firstValueFrom(
      this.http
        .get<{ data: PlatformSetting }>(`${BASE}/${encodeURIComponent(key)}`, {
          headers: this.headers(),
        })
        .pipe(map((r) => r.data)),
    );
  }

  update(key: string, payload: UpdateSettingPayload): Promise<PlatformSetting> {
    return firstValueFrom(
      this.http
        .put<{ data: PlatformSetting }>(`${BASE}/${encodeURIComponent(key)}`, payload, {
          headers: this.headers(),
        })
        .pipe(map((r) => r.data)),
    );
  }

  batchUpdate(updates: BatchUpdateEntry[]): Promise<PlatformSetting[]> {
    return firstValueFrom(
      this.http
        .patch<{ data: PlatformSetting[] }>(BASE, { updates }, { headers: this.headers() })
        .pipe(map((r) => r.data ?? [])),
    );
  }

  reset(key: string, reason: string): Promise<PlatformSetting> {
    return firstValueFrom(
      this.http
        .post<{ data: PlatformSetting }>(
          `${BASE}/${encodeURIComponent(key)}/reset`,
          { reason },
          { headers: this.headers() },
        )
        .pipe(map((r) => r.data)),
    );
  }
}
