import { Injectable, inject } from '@angular/core';
import { Api } from '../api/api';
import { dashboardIndex } from '../api/fn/dashboard/dashboard-index';
import { profileLogout } from '../api/fn/profile/profile-logout';
import { profileNotificationsUpdate } from '../api/fn/profile/profile-notifications-update';

export interface ProfileIdentity {
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  siren: string | null;
}

/**
 * Préférences email opt-in du contractor.
 *
 * Note 2026-04-30 : seul le canal email est conservé. Les notifications
 * portail (page /notifications, cloche header, persistance BDD) ont été
 * supprimées — l'utilisateur reçoit ses alertes uniquement par email.
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
  private readonly api = inject(Api);

  /**
   * R�cup�re le profil contractor (identit� + pr�f�rences notif email) en
   * lisant le dashboard via le SDK g�n�r� : pas de route `/profile` s�par�e
   * c�t� Tuita, le dashboard agr�ge d�j� ces deux blocs (�conomie d'un
   * endpoint qui aurait dupliqu� les m�mes donn�es).
   */
  async getProfile(): Promise<ContractorProfile> {
    // Le dashboard backend renvoie le bloc `contractor` en camelCase :
    //   { phone, firstName, lastName, companyName, siren }
    // (cf. ContractorDashboardController::indexAction côté Laminas).
    // L'interface frontend ProfileIdentity reste en snake_case par convention
    // — on mappe ici. Avant ce mapping (avant 2026-05-18), c.first_name /
    // c.company_name etaient toujours undefined -> le profil affichait "-"
    // meme quand la session avait l'info.
    const r = await this.api.invoke(dashboardIndex) as {
      data?: {
        contractor?: {
          phone?: string | null;
          firstName?: string | null;
          lastName?: string | null;
          companyName?: string | null;
          siren?: string | null;
        };
        notifications?: Partial<NotificationPreferences>;
      };
    };
    const c = r?.data?.contractor ?? {};
    const n = r?.data?.notifications ?? {};
    return {
      identity: {
        phone: c.phone ?? null,
        first_name: c.firstName ?? null,
        last_name: c.lastName ?? null,
        company_name: c.companyName ?? null,
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

  // PATCH /profile/notifications via SDK auto-généré depuis l'OpenAPI backend
  // (alignement Laravel 2026-05-19 : verbe PATCH désormais déclaré dans le
  // contrat OpenAPI, donc le SDK le couvre — plus besoin du HttpClient direct).
  async updateNotifications(prefs: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    const r = await this.api.invoke(profileNotificationsUpdate, { body: prefs as any }) as {
      data?: { notifications?: NotificationPreferences };
    };
    return r?.data?.notifications ?? (prefs as NotificationPreferences);
  }

  async logout(): Promise<void> {
    await this.api.invoke(profileLogout);
  }
}
