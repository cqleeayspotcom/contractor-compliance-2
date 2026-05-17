import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';

export interface ProfileIdentity {
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  siren: string | null;
}

/**
 * PrÃ©fÃ©rences email opt-in du contractor.
 *
 * Note 2026-04-30 : seul le canal email est conservÃ©. Les notifications
 * portail (page /notifications, cloche header, persistance BDD) ont Ã©tÃ©
 * supprimÃ©es â€” l'utilisateur reÃ§oit ses alertes uniquement par email.
 */
export interface NotificationPreferences {
  email_address: string | null;
  email_invoice_payment: boolean;
  email_document_expiry: boolean;
  email_invoice_rejected: boolean;
}

export interface ContractorProfile {
  identity: ProfileIdentity;
  notifications: NotificationPreferences;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);

  getProfile(): Promise<ContractorProfile> {
    return firstValueFrom(
      this.http.get<{ data: ContractorProfile }>('/contractor-compliance/profile').pipe(map((r) => r.data)),
    );
  }

  updateNotifications(prefs: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    return firstValueFrom(
      this.http
        .patch<{ data: { notifications: NotificationPreferences } }>(
          '/contractor-compliance/profile/notifications',
          prefs,
        )
        .pipe(map((r) => r.data.notifications)),
    );
  }

  logout(): Promise<void> {
    return firstValueFrom(
      this.http.post<void>('/contractor-compliance/profile/logout', null),
    ).then(() => undefined);
  }
}
