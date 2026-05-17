import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Schéma minimal du JSON runtime `/assets/feature-flags.json`.
 * On garde les champs optionnels — un fichier vide reste valide et tombe
 * en fallback sur `environment.contractorComplianceEnabled`.
 */
interface FeatureFlagsPayload {
  contractorComplianceEnabled?: boolean;
}

/**
 * FeatureFlagsService — source de vérité runtime des flags UI.
 *
 * POURQUOI ce service :
 * - Le flag `contractorComplianceEnabled` est un kill-switch miroir du flag
 *   backend Laminas `CONTRACTOR_COMPLIANCE_ENABLED`. Quand la prod coupe le
 *   module backend (404 sur /contractor-compliance/*), le frontend doit se
 *   couper aussi pour éviter requêtes inutiles + afficher "service
 *   indisponible".
 * - On VEUT pouvoir le toggler SANS REBUILD Angular en prod GCP Cloud Run.
 *   D'où le fetch runtime de `/assets/feature-flags.json` au boot (via
 *   APP_INITIALIZER). En prod, ce fichier peut être réécrit côté serveur
 *   (static asset Cloud Run, ou reverse-proxy nginx servant un JSON
 *   custom) pour basculer l'UI à chaud.
 * - Fallback silencieux sur `environment.ts` si le fetch échoue (réseau
 *   coupé, fichier absent, JSON invalide) — on ne veut PAS bloquer le boot
 *   de l'app sur un fichier de flags facultatif.
 */
@Injectable({ providedIn: 'root' })
export class FeatureFlagsService {
  /**
   * Valeur effective du flag, résolue au boot.
   * Init = valeur build-time (`environment.contractorComplianceEnabled`).
   * Remplacée par la valeur runtime si `/assets/feature-flags.json` la
   * fournit explicitement.
   */
  private contractorComplianceEnabledValue: boolean =
    environment.contractorComplianceEnabled;

  /**
   * Charge le JSON runtime. Appelé une seule fois via APP_INITIALIZER
   * dans app.config.ts. Retourne toujours une promesse résolue — pas de
   * rejet pour ne pas bloquer le boot.
   */
  load(): Promise<void> {
    return fetch('/assets/feature-flags.json', { cache: 'no-cache' })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: FeatureFlagsPayload | null) => {
        if (payload && typeof payload.contractorComplianceEnabled === 'boolean') {
          this.contractorComplianceEnabledValue = payload.contractorComplianceEnabled;
        }
      })
      .catch(() => {
        // Silencieux : on garde la valeur build-time si le fetch échoue.
      });
  }

  /**
   * Indique si le module contractor-compliance est actif côté UI.
   * Utilisé par le guard de route et l'interceptor HTTP pour court-circuiter
   * les requêtes quand le module est désactivé.
   */
  isContractorComplianceEnabled(): boolean {
    return this.contractorComplianceEnabledValue;
  }
}
