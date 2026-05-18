import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';
import { Api } from '../api/api';
import { dashboardIndex } from '../api/fn/dashboard/dashboard-index';
import { profileLogout } from '../api/fn/profile/profile-logout';

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
  private readonly api = inject(Api);

  /**
   * Récupère le profil contractor (identité + préférences notif email) en
   * lisant le dashboard via le SDK généré : pas de route `/profile` séparée
   * côté Tuita, le dashboard agrège déjà ces deux blocs (économie d'un
   * endpoint qui aurait dupliqué les mêmes données).
   */
  async getProfile(): Promise<ContractorProfile> {
    const r = await this.api.invoke(dashboardIndex) as {
      data?: { contractor?: Partial<ProfileIdentity>; notifications?: Partial<NotificationPreferences> };
    };
    const c = r?.data?.contractor ?? {};
    const n = r?.data?.notifications ?? {};
    return {
      identity: {
        phone: c.phone ?? null,
        first_name: c.first_name ?? null,
        last_name: c.last_name ?? null,
        company_name: c.company_name ?? null,
        siren: c.siren ?? null,
      },
      notifications: {
        email_address: n.email_address ?? null,
        email_invoice_payment: n.email_invoice_payment ?? false,
        email_document_expiry: n.email_document_expiry ?? false,
        email_invoice_rejected: n.email_invoice_rejected ?? false,
      },
    };
  }

  // Le SDK ne génère que le GET sur `/profile/notifications` ; pour le PATCH
  // backend on garde un HttpClient direct (le SDK courant ne couvre pas tous
  // les verbes — à mettre à jour quand le générateur OpenAPI couvrira PATCH).
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

  async logout(): Promise<void> {
    await this.api.invoke(profileLogout);
  }
}
