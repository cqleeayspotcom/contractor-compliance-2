/**
 * Development environment configuration.
 *
 * Copie adaptée pour le backend Laminas Tuita (module ContractorCompliance).
 * - apiUrl : vide. Les services utilisent des chemins relatifs complets
 *   (`/contractor-compliance/...`) qui passent par le proxy Angular
 *   (proxy.conf.json) qui forward `/contractor-compliance/**` vers
 *   http://localhost:8060 (backend Tuita monolithe).
 * - Auth contractor : cookie `__contractor_ssid` posé par Tuita après
 *   l'auth SMS (ContractorAuthAction). L'interceptor
 *   `contractor-cookie.interceptor.ts` active `withCredentials: true` sur
 *   les requêtes /contractor-compliance/*.
 * - Auth admin : bearer OAuth2 Tuita (CLEARANCE_STAFF_ONLY).
 */
export const environment = {
  production: false,
  apiUrl: '',
  /** Backend Laminas Tuita en local (docker-compose port 8060). */
  tuitaBackendUrl: 'http://localhost:8060',
  frontendUrl: 'http://localhost:4200',
  stripe: {
    publishableKey: 'pk_test_your_stripe_key_here'
  },
  features: {
    enableMockData: false,
    enableDebugMode: true,
    enableAnalytics: false
  },
  /**
   * Feature flag kill-switch côté frontend, miroir du flag backend
   * `CONTRACTOR_COMPLIANCE_ENABLED` (module ContractorCompliance Laminas).
   *
   * POURQUOI : si la prod backend désactive le module (404 sur toutes les
   * routes /contractor-compliance/*), le frontend doit aussi se couper pour
   * éviter d'envoyer des requêtes vouées à l'échec et afficher un écran de
   * service indisponible. En dev on garde `true` (le module est toujours
   * chargé localement). Ce flag est de plus overridable à chaud via
   * `/assets/feature-flags.json` (FeatureFlagsService).
   */
  contractorComplianceEnabled: true,
  pagination: {
    defaultPageSize: 25,
    pageSizeOptions: [10, 25, 50, 100]
  },
  upload: {
    maxFileSize: 10485760, // 10MB in bytes
    allowedFileTypes: ['application/pdf', 'image/jpeg', 'image/png']
  },
  session: {
    warningDuration: 300000, // 5 minutes before token expiry
    refreshThreshold: 900000 // 15 minutes - refresh token if expiry is within this window
  },
  // TODO: ajuster quand Reverb est déployé. Valeurs par défaut = docker-compose local.
  // Côté backend : `php artisan reverb:start` + REVERB_APP_KEY dans .env.
  reverbKey: 'local-contractor-key',
  reverbHost: 'localhost',
  reverbPort: 8080,
  reverbScheme: 'http' as 'http' | 'https',
};
