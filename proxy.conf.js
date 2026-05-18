/**
 * Proxy dev Angular → backend Tuita (monolithe Laminas sur :8060).
 *
 * POURQUOI un .js et plus un .json :
 * Le backend Tuita pose le cookie `__contractor_ssid` avec les flags
 * `Secure` et `SameSite=None` (config conçue pour la prod en HTTPS sur
 * tuita.fr). Or sur `http://localhost:4200` :
 *   - `Secure` → le navigateur DROPPE le cookie silencieusement
 *     (cookie non stocké → toute requête suivante part sans session → 401).
 *   - `SameSite=None` sans `Secure` est rejeté aussi.
 * On strip donc ces flags à la volée côté proxy en dev uniquement.
 */
function rewriteSetCookieForLocalhost(proxyRes) {
  const setCookie = proxyRes.headers['set-cookie'];
  if (!setCookie) return;
  proxyRes.headers['set-cookie'] = setCookie.map((c) =>
    c
      .replace(/;\s*Secure/gi, '')
      .replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
  );
}

const target = 'http://localhost:8060';

module.exports = {
  '/contractor-compliance': {
    target,
    secure: false,
    changeOrigin: true,
    cookieDomainRewrite: 'localhost',
    // Le backend pose le cookie avec `Path=/contractor` → invisible pour
    // les requêtes vers `/contractor-compliance/*`. On force `Path=/` pour
    // que le cookie soit envoyé sur tous les endpoints en dev.
    cookiePathRewrite: '/',
    logLevel: 'debug',
    onProxyRes: rewriteSetCookieForLocalhost,
  },
  '/contractor/auth': {
    target,
    secure: false,
    changeOrigin: true,
    cookieDomainRewrite: 'localhost',
    // Le backend pose le cookie avec `Path=/contractor` → invisible pour
    // les requêtes vers `/contractor-compliance/*`. On force `Path=/` pour
    // que le cookie soit envoyé sur tous les endpoints en dev.
    cookiePathRewrite: '/',
    logLevel: 'debug',
    onProxyRes: rewriteSetCookieForLocalhost,
  },
};
