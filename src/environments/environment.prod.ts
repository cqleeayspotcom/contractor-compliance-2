/**
 * Production environment configuration.
 *
 * Copie adaptée pour le backend Laminas Tuita (module ContractorCompliance).
 * En prod, ce frontend est servi par le même domaine que le backend Tuita
 * (reverse proxy) — apiUrl reste donc relatif.
 */
export const environment = {
  production: true,
  apiUrl: '', // Routes complètes en relatif (/contractor-compliance/...)
  /** Backend Tuita prod — servi sur le même domaine via reverse proxy. */
  tuitaBackendUrl: '',
  frontendUrl: 'https://staging.tuita.fr',
  stripe: {
    publishableKey: 'pk_live_your_stripe_key_here'
  },
  features: {
    enableMockData: false,
    enableDebugMode: false,
    enableAnalytics: true
  },
  /**
   * Feature flag kill-switch côté frontend, miroir du flag backend
   * `CONTRACTOR_COMPLIANCE_ENABLED`.
   *
   * POURQUOI `false` par défaut en prod : opt-in explicite. La prod active
   * le module en réécrivant `/assets/feature-flags.json` côté serveur
   * (Cloud Run static asset / reverse proxy) avec
   * `{"contractorComplianceEnabled": true}` — sans rebuild Angular. Cela
   * permet un kill-switch à chaud : remettre `false` dans le JSON et
   * rafraîchir le CDN coupe l'UI sans redéploiement.
   */
  contractorComplianceEnabled: false,
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
  // TODO: remplacer par l'URL publique Reverb prod (ex: wss://ws.tuita.fr)
  reverbKey: 'REPLACE_WITH_PROD_KEY',
  reverbHost: 'ws.tuita.fr',
  reverbPort: 443,
  reverbScheme: 'https' as 'http' | 'https',
};
