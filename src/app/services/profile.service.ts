import { Injectable, inject } from '@angular/core';
import { Api } from '../api/api';
import { profileShow } from '../api/fn/profile/profile-show';
import { profileLogout } from '../api/fn/profile/profile-logout';
import { profileNotificationsUpdate } from '../api/fn/profile/profile-notifications-update';

export interface ProfileIdentity {
  phone: string | null;
  /** Email du compte contractor (cc_users.email) — unique email, lecture seule. */
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  siren: string | null;
}

/**
 * Préférences de notification du contractor — 3 interrupteurs opt-in.
 *
 * Note 2026-04-30 : seul le canal email est conservé. Les notifications
 * portail (page /notifications, cloche header, persistance BDD) ont été
 * supprimées — l'utilisateur reçoit ses alertes uniquement par email.
 *
 * Note 2026-05-21 : plus de champ `email_address`. Un contractor a un seul
 * email — celui de son compte (`identity.email`). Les alertes y partent.
 */
export interface NotificationPreferences {
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
   * Récupère le profil contractor (identité + préférences notif email) via le
   * SDK généré `profileShow` → `GET /contractor-compliance/profile`.
   *
   * IMPORTANT (régression 2026-05-20) : ce service lisait auparavant le
   * dashboard (`dashboardIndex`) en supposant qu'il agrégeait un bloc
   * `notifications`. Or `ContractorDashboardController::indexAction` ne renvoie
   * AUCUN bloc `notifications` — l'email de notification enregistré ne se
   * réaffichait donc jamais après un rechargement de la page profil (il était
   * pourtant bien persisté en base par le PATCH). Le backend expose désormais
   * un endpoint dédié `GET /profile` (ContractorProfileController::showAction)
   * qui agrège identity + notifications + bank_details : on lit celui-là.
   */
  async getProfile(): Promise<ContractorProfile> {
    // `GET /profile` renvoie le bloc `identity` déjà en snake_case
    // (cf. ContractorProfileController::buildIdentity) — pas de remapping
    // camelCase → snake_case nécessaire, contrairement au dashboard.
    const r = await this.api.invoke(profileShow) as {
      data?: {
        identity?: Partial<ProfileIdentity>;
        notifications?: Partial<NotificationPreferences>;
      };
    };
    const i = r?.data?.identity ?? {};
    const n = r?.data?.notifications ?? {};
    return {
      identity: {
        phone: i.phone ?? null,
        email: i.email ?? null,
        first_name: i.first_name ?? null,
        last_name: i.last_name ?? null,
        company_name: i.company_name ?? null,
        siren: i.siren ?? null,
      },
      notifications: {
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
    // La réponse backend (notificationsPreferencesAction::serializePreference)
    // est l'objet préférences À PLAT sous `data` — { email_* } — et NON
    // { data: { notifications: {...} } }. On lit donc `data` directement,
    // sinon on retombait toujours sur le fallback `prefs` (le payload envoyé).
    const r = await this.api.invoke(profileNotificationsUpdate, { body: prefs as any }) as {
      data?: NotificationPreferences;
    };
    return r?.data ?? (prefs as NotificationPreferences);
  }

  async logout(): Promise<void> {
    await this.api.invoke(profileLogout);
  }
}
