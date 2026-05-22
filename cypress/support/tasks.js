/**
 * Tâches Node exécutées côté process Cypress (setupNodeEvents).
 *
 * POURQUOI un module séparé : `cy.task` ne peut pas tourner dans le navigateur
 * (lecture fichier / DB interdite côté browser). On expose ici les 2 lectures
 * de PIN nécessaires au mode real-backend, réutilisant la logique des Steps
 * E2E PHP du backend (PinReader.php / AdminAuthSteps::readPinFromLog()).
 *
 * Environnement ciblé : Windows + Docker Desktop (backend dans WSL).
 *   - `docker` n'est PAS sur le PATH → on préfixe par `wsl -- docker ...`.
 *   - Le PIN contractor est en clair dans cft_contractor_oauth.sms_password
 *     (dev only) → lu via un PHP jetable piping par stdin dans le conteneur.
 *   - Le PIN admin n'existe qu'en clair dans le log applicatif (bcrypt en DB)
 *     → lu directement sur le bind-mount host (pas besoin de Docker).
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/** Conteneur backend Laminas. */
const WEB_CONTAINER = 'c_platform_webserver';

/**
 * Log applicatif Tuita — bind-mount host du volume conteneur
 * /var/log/nginx. Surchargeable via CC_E2E_APP_LOG pour les arbo non-standard.
 */
const DEFAULT_APP_LOG = path.resolve(
  __dirname,
  '../../../docker-instance/var/log/nginx/application.log'
);

/**
 * Normalise un téléphone vers le format interne Tuita P33XXXXXXXXX.
 * Aligné sur PinReader::normalizePhone() côté backend.
 */
function normalizePhone(phone) {
  if (phone.startsWith('+')) {
    return 'P' + phone.replace(/^\+/, '');
  }
  return phone;
}

/**
 * Lit le PIN contractor en clair depuis cft_contractor_oauth.sms_password.
 *
 * Réutilise le bootstrap Doctrine de l'app (mêmes credentials que le module,
 * aucun mot de passe en dur). Le script PHP est passé par stdin pour éviter
 * tout enfer de quoting `wsl -- docker exec ... php -r "..."`.
 */
function readContractorPin(phone) {
  const normalized = normalizePhone(phone);
  // PHP jetable — bootstrap Doctrine puis SELECT du PIN. Le téléphone est
  // injecté via une variable d'env (CC_PIN_PHONE) pour ne pas interpoler de
  // chaîne non maîtrisée dans le source PHP.
  // POURQUOI `echo` et pas `fwrite(STDOUT,...)` : quand le code PHP est lu
  // depuis stdin, la constante STDOUT n'est pas garantie d'être définie selon
  // la config CLI — `echo` écrit toujours sur la sortie standard. On encadre
  // la valeur de marqueurs pour l'isoler d'un éventuel warning Xdebug.
  const php = `<?php
chdir('/var/www');
require '/var/www/vendor/autoload.php';
$appConfig = require '/var/www/config/application.config.php';
$app = \\Laminas\\Mvc\\Application::init($appConfig);
$conn = $app->getServiceManager()->get('doctrine.entitymanager.orm_default')->getConnection();
$phone = getenv('CC_PIN_PHONE');
$pin = $conn->fetchOne(
  "SELECT sms_password FROM cft_contractor_oauth WHERE sms_phone = ? ORDER BY updatedAt DESC LIMIT 1",
  [$phone]
);
echo '<<<PIN:' . ($pin === false || $pin === null ? '' : (string) $pin) . ':PIN>>>';
`;

  // POURQUOI une boucle de retry : le backend renvoie 200 à /contractor/auth/pin
  // AVANT que la ligne cft_contractor_oauth.sms_password ne soit nécessairement
  // visible (commit/réplica/latence). Sans retry, cy.loginContractor lit parfois
  // un PIN vide. On retente quelques fois avec une courte pause.
  const MAX_TRIES = 6;
  let lastOut = '';
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    let out;
    try {
      out = execFileSync(
        'wsl',
        ['--', 'docker', 'exec', '-i', '-e', `CC_PIN_PHONE=${normalized}`, WEB_CONTAINER, 'php'],
        { input: php, encoding: 'utf8', timeout: 30000 }
      );
    } catch (e) {
      throw new Error(
        `readContractorPin(${phone}) : échec de l'exécution PHP dans ${WEB_CONTAINER}. ` +
          `Le conteneur backend est-il up ? Détail : ${e.message}`
      );
    }
    lastOut = String(out);
    // Le binaire php du conteneur peut préfixer un warning Xdebug — on isole
    // la valeur via les marqueurs <<<PIN:...:PIN>>>.
    const m = lastOut.match(/<<<PIN:(\d*):PIN>>>/);
    if (m && m[1]) {
      return m[1];
    }
    // PIN pas encore visible — pause synchrone courte avant de retenter.
    if (attempt < MAX_TRIES) {
      sleepSync(1000);
    }
  }

  throw new Error(
    `readContractorPin(${phone}) : aucun PIN trouvé pour ${normalized} ` +
      `dans cft_contractor_oauth.sms_password après ${MAX_TRIES} tentatives. ` +
      `Le request-pin a-t-il tourné ? Sortie PHP: ${lastOut.slice(0, 200)}`
  );
}

/**
 * Pause synchrone — `cy.task` doit retourner une valeur (ou Promise) ; on
 * bloque ici le thread du process plugin Cypress le temps que le PIN se
 * matérialise. Sans dépendance externe : on s'appuie sur execFileSync.
 */
function sleepSync(ms) {
  // `sleep` POSIX via wsl — disponible partout où docker l'est déjà.
  try {
    execFileSync('wsl', ['--', 'sleep', String(ms / 1000)], { timeout: ms + 5000 });
  } catch {
    // Fallback : boucle d'attente active si wsl sleep échoue.
    const end = Date.now() + ms;
    while (Date.now() < end) {
      /* attente active bornée */
    }
  }
}

/**
 * Lit le dernier PIN admin depuis le log applicatif.
 *
 * Pattern émis par AdminAuthRequestPinController : "ADMIN PINCODE: <pin> for <email>".
 * On parcourt les dernières lignes en sens inverse pour le PIN le plus récent.
 */
function readAdminPin(email) {
  const logPath = process.env.CC_E2E_APP_LOG || DEFAULT_APP_LOG;
  if (!fs.existsSync(logPath)) {
    throw new Error(
      `readAdminPin(${email}) : log applicatif introuvable : ${logPath}. ` +
        `Définir CC_E2E_APP_LOG pour surcharger le chemin.`
    );
  }

  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split(/\r?\n/);
  // POURQUOI preg_quote-like : l'email contient un '.' et potentiellement un '+'.
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp('ADMIN PINCODE: (\\d+) for ' + escaped);

  for (let i = lines.length - 1; i >= 0; i--) {
    const found = lines[i].match(pattern);
    if (found) {
      return found[1];
    }
  }

  throw new Error(
    `readAdminPin(${email}) : PIN admin introuvable dans ${logPath}. ` +
      `La route /admin/auth/request-pin a-t-elle bien été appelée pour ${email} ?`
  );
}

/** Enregistre les tâches sur l'objet `on` de setupNodeEvents. */
function registerTasks(on) {
  on('task', {
    readContractorPin(phone) {
      return readContractorPin(phone);
    },
    readAdminPin(email) {
      return readAdminPin(email);
    },
    // Log côté terminal Node (cy.log n'apparaît que dans le runner). Utile
    // pour tracer les étapes real-backend dans la sortie `cypress run`.
    log(message) {
      // eslint-disable-next-line no-console
      console.log(String(message));
      return null;
    },
  });
}

module.exports = { registerTasks };
