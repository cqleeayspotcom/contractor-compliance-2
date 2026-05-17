import { Routes } from '@angular/router';
import {
  certificationCompletedGuard,
  certificationNotCompletedGuard,
  chantiersAccessGuard,
  featureFlagGuard,
} from './guards';

/**
 * Contractor Compliance microservice routing.
 *
 * No client-side guards needed — cookie auth (__contractor_ssid) is validated
 * by the backend. If the cookie is invalid/missing the API returns 401 and
 * the interceptor redirects to tuita.fr/contractor/login.
 */
export const routes: Routes = [
  // Page "service indisponible" — DOIT être déclarée AVANT le guard global,
  // sinon le guard rabat dessus en boucle. Pas de canActivate ici.
  // POURQUOI : affichée quand le feature flag `contractorComplianceEnabled`
  // est OFF (kill-switch prod miroir du backend CONTRACTOR_COMPLIANCE_ENABLED).
  {
    path: 'service-unavailable',
    loadComponent: () =>
      import('./pages/service-unavailable/service-unavailable.component').then(
        m => m.ServiceUnavailableComponent
      ),
    title: 'Service indisponible - Tuita',
  },

  // Default -> Dashboard (le featureFlagGuard rabat sur /service-unavailable
  // si flag OFF avant même le redirect).
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
    canActivate: [featureFlagGuard],
  },

  // [ADAPTATION TUITA BACKEND]
  // Les routes /signup et /login sont DÉSACTIVÉES dans cette intégration :
  // l'auth contractor est entièrement gérée par le monolithe Tuita
  // (ContractorAuthAction + cookie __contractor_ssid via SMS). Les
  // composants legacy sont conservés sur disque pour référence mais ne
  // sont plus routés — l'utilisateur arrive ici DÉJÀ authentifié via le
  // flow Tuita (sinon l'interceptor renvoie vers tuita.fr/contractor/login).
  // Si on atterrit sur /login ou /signup par erreur, redirect vers dashboard
  // (qui déclenchera un 401 → interceptor → login Tuita).
  { path: 'signup', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'login', redirectTo: 'dashboard', pathMatch: 'full' },

  // Contractor Dashboard (compliance score, docs, KYC, billing)
  // featureFlagGuard appliqué ici : c'est le point d'entrée principal, et
  // la plupart des sous-routes (documents, kyc, invoices...) sont accédées
  // par navigation depuis le dashboard. Si on rate ici, l'utilisateur n'ira
  // pas plus loin. Pour les deep-links directs sur d'autres routes, le
  // featureFlagInterceptor sert de second rempart côté HTTP.
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./pages/contractor-dashboard/contractor-dashboard.component').then(
        m => m.ContractorDashboardComponent
      ),
    canActivate: [featureFlagGuard],
    title: 'Compliance - Tuita',
  },

  // Documents (upload, status, achat Pappers)
  {
    path: 'documents',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/contractor-documents/contractor-documents.component').then(
            m => m.ContractorDocumentsComponent
          ),
        title: 'Documents - Tuita',
      },
      // Stepper d'upload guidé — pensé pour l'onboarding initial. Une étape
      // à la fois, vidéo en haut, gros CTA. La page /documents reste
      // accessible pour la gestion permanente après inscription.
      {
        path: 'upload',
        loadComponent: () =>
          import('../app/pages/onboarding-upload-stepper/onboarding-upload-stepper.component').then(
            m => m.OnboardingUploadStepperComponent
          ),
        title: 'Téléverse tes documents - Tuita',
      },
      // Historique d'achats officiels du contractor (PDFs achetés + reçus Stripe)
      {
        path: 'purchases',
        loadComponent: () =>
          import('./pages/contractor-purchases/contractor-purchases.component').then(
            m => m.ContractorPurchasesComponent
          ),
        title: 'Mes achats - Tuita',
      },
      {
        path: ':uuid',
        loadComponent: () =>
          import('./pages/contractor-documents/contractor-document-status.component').then(
            m => m.ContractorDocumentStatusComponent
          ),
        title: 'Statut - Tuita',
      },
    ],
  },

  // KYC (challenge video + polling)
  {
    path: 'kyc',
    loadComponent: () =>
      import('./pages/contractor-kyc/contractor-kyc.component').then(
        m => m.ContractorKycComponent
      ),
    title: 'Vérification identité - Tuita',
  },

  // KYC Mobile (public — QR code, kept from old app)
  {
    path: 'kyc/mobile/:token',
    loadComponent: () =>
      import('./pages/kyc-mobile/kyc-mobile.component').then(
        m => m.KycMobileComponent
      ),
    title: 'Vérification mobile - Tuita',
  },

  // Mes chantiers — page-hub regroupant Interventions + Factures.
  // Accessible uniquement aux contractors `fully_verified` (garde de route).
  {
    path: 'chantiers',
    loadComponent: () =>
      import('./pages/contractor-chantiers/contractor-chantiers.component').then(
        m => m.ContractorChantiersComponent
      ),
    canActivate: [chantiersAccessGuard],
    title: 'Mes chantiers - Tuita',
  },

  // Mission Offers (offres dispo, proxy tuita.fr)
  {
    path: 'missions',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/contractor-mission-offers/contractor-mission-offers.component').then(
            m => m.ContractorMissionOffersComponent
          ),
        title: 'Offres disponibles - Tuita',
      },
      {
        path: ':mid',
        loadComponent: () =>
          import('./pages/contractor-mission-offers/contractor-mission-offer-detail.component').then(
            m => m.ContractorMissionOfferDetailComponent
          ),
        title: 'Détail offre - Tuita',
      },
    ],
  },

  // Interventions (missions perso du contractor)
  {
    path: 'interventions',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/contractor-interventions/contractor-interventions.component').then(
            m => m.ContractorInterventionsComponent
          ),
        title: 'Mes interventions - Tuita',
      },
      {
        path: ':mid',
        loadComponent: () =>
          import('./pages/contractor-interventions/contractor-intervention-detail.component').then(
            m => m.ContractorInterventionDetailComponent
          ),
        title: 'Détail intervention - Tuita',
      },
    ],
  },

  // Factures (liste, upload, download, detail)
  {
    path: 'invoices',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/contractor-billing/contractor-invoices.component').then(
            m => m.ContractorInvoicesComponent
          ),
        title: 'Factures - Tuita',
      },
      // Factures libres (hors-mission, workflow claim → upload → 2/2 validation)
      {
        path: 'free',
        loadComponent: () =>
          import('./pages/contractor-free-invoices/contractor-free-invoices.component').then(
            m => m.ContractorFreeInvoicesComponent
          ),
        title: 'Factures libres - Tuita',
      },
      {
        path: ':uuid',
        loadComponent: () =>
          import('./pages/contractor-billing/contractor-invoice-detail.component').then(
            m => m.ContractorInvoiceDetailComponent
          ),
        title: 'Détail facture - Tuita',
      },
    ],
  },

  // Facturation (plan, abonnement)
  {
    path: 'billing',
    loadComponent: () =>
      import('./pages/contractor-billing/contractor-billing.component').then(
        m => m.ContractorBillingComponent
      ),
    title: 'Facturation - Tuita',
  },

  // Profil contractor (identité + logout)
  {
    path: 'profile',
    loadComponent: () =>
      import('./pages/contractor-profile/contractor-profile.component').then(
        m => m.ContractorProfileComponent
      ),
    title: 'Mon profil - Tuita',
  },

  // Certification TUITA — flux QCM (accessible uniquement si non encore certifié)
  {
    path: 'certification',
    loadComponent: () =>
      import('./pages/contractor-certification/contractor-certification.component').then(
        m => m.ContractorCertificationComponent
      ),
    canActivate: [certificationNotCompletedGuard],
    title: 'Certification TUITA',
  },

  // Certification TUITA — aide-mémoire (accessible uniquement si déjà certifié)
  {
    path: 'certification/memo',
    loadComponent: () =>
      import('./pages/contractor-certification-memo/contractor-certification-memo.component').then(
        m => m.ContractorCertificationMemoComponent
      ),
    canActivate: [certificationCompletedGuard],
    title: 'Règles TUITA',
  },

  // Admin supervision (super admin only, requires API key)
  {
    path: 'admin',
    loadComponent: () =>
      import('./pages/contractor-admin/contractor-admin.component').then(
        m => m.ContractorAdminComponent
      ),
    title: 'Supervision - Tuita',
  },

  // Admin — supervision des achats de documents officiels
  {
    path: 'admin/purchases',
    loadComponent: () =>
      import('./pages/admin-purchases/admin-purchases.component').then(
        m => m.AdminPurchasesComponent
      ),
    title: 'Supervision achats - Tuita',
  },

  // Admin — codes d'invitation contractor (génération admin Tuita)
  {
    path: 'admin/invitation-codes',
    loadComponent: () =>
      import('./pages/admin-invitation-codes/admin-invitation-codes.component').then(
        m => m.AdminInvitationCodesComponent
      ),
    title: 'Codes d\'invitation - Tuita',
  },

  // Admin — gestion factures (production : list pending/ready/in-progress + actions)
  // Remplace l'ancien admin-invoices-mock supprimé 2026-04-28.
  {
    path: 'admin/invoices',
    loadComponent: () =>
      import('./pages/admin-invoices/admin-invoices.component').then(
        m => m.AdminInvoicesComponent
      ),
    title: 'Gestion factures - Tuita',
  },

  // Admin — édition des seuils business (platform_settings)
  {
    path: 'admin/settings',
    loadComponent: () =>
      import('./pages/admin-settings/admin-settings.component').then(
        m => m.AdminSettingsComponent
      ),
    title: 'Paramètres plateforme - Tuita',
  },

  // Admin — browse paginé contractors (search + filtres + facets)
  {
    path: 'admin/contractors',
    loadComponent: () =>
      import('./pages/admin-contractors-list/admin-contractors-list.component').then(
        m => m.AdminContractorsListComponent
      ),
    title: 'Prestataires - Tuita',
  },

  // Admin — vue 360° d'un contractor (par phone P33...)
  {
    path: 'admin/contractors/:phone',
    loadComponent: () =>
      import('./pages/admin-contractor/admin-contractor.component').then(
        m => m.AdminContractorComponent
      ),
    title: 'Contractor 360° - Tuita',
  },

  // Admin — investigation des KYC en échec (read-only)
  {
    path: 'admin/kyc-failures',
    loadComponent: () =>
      import('./pages/admin-kyc-failures/admin-kyc-failures.component').then(
        m => m.AdminKycFailuresComponent
      ),
    title: 'KYC en échec - Tuita',
  },

  // Admin — gestion des demandes de factures libres (approve / reject)
  {
    path: 'admin/free-invoices',
    loadComponent: () =>
      import('./pages/admin-free-invoices/admin-free-invoices.component').then(
        m => m.AdminFreeInvoicesComponent
      ),
    title: 'Factures libres - Tuita',
  },

  // Legacy redirects — /contractor/* was the old prefix
  { path: 'contractor/dashboard', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'contractor/documents', redirectTo: 'documents', pathMatch: 'full' },
  { path: 'contractor/documents/upload', redirectTo: 'documents/upload', pathMatch: 'full' },
  { path: 'contractor/kyc', redirectTo: 'kyc', pathMatch: 'full' },
  { path: 'contractor/billing', redirectTo: 'billing', pathMatch: 'full' },
  { path: 'contractor/billing/invoices', redirectTo: 'invoices', pathMatch: 'full' },
  { path: 'billing/invoices', redirectTo: 'invoices', pathMatch: 'full' },
  { path: 'contractor/invoices', redirectTo: 'invoices', pathMatch: 'full' },
  { path: 'contractor/billing/invoices/:uuid', redirectTo: 'invoices/:uuid', pathMatch: 'full' },
  { path: 'billing/invoices/:uuid', redirectTo: 'invoices/:uuid', pathMatch: 'full' },
  { path: 'contractor/invoices/:uuid', redirectTo: 'invoices/:uuid', pathMatch: 'full' },
  { path: 'contractor/certification', redirectTo: 'certification', pathMatch: 'full' },
  { path: 'contractor/admin', redirectTo: 'admin', pathMatch: 'full' },
  { path: 'contractor/missions', redirectTo: 'missions', pathMatch: 'full' },

  // 404
  {
    path: '**',
    loadComponent: () =>
      import('./pages/not-found/not-found.component').then(
        m => m.NotFoundComponent
      ),
    title: 'Page non trouvée - Tuita',
  },
];
