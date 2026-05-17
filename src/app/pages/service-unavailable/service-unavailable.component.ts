import { ChangeDetectionStrategy, Component } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Écran "Service temporairement indisponible".
 *
 * POURQUOI : quand le feature flag `contractorComplianceEnabled` est OFF,
 * tout le routeur est rabattu sur cette page (voir featureFlagGuard).
 * L'utilisateur ne doit voir ni dashboard ni requêtes API en échec — juste
 * un message clair + un bouton retour vers le site principal Tuita.
 *
 * Pas de Material lourd ici (snackbar/button minimal en CSS) — la page doit
 * pouvoir s'afficher même si le reste du bundle Material n'est pas chargé.
 */
@Component({
  selector: 'app-service-unavailable',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="su-wrap">
      <section class="su-card">
        <h1 class="su-title">Service temporairement indisponible</h1>
        <p class="su-text">
          L'espace conformité prestataires Tuita est en maintenance.
          Nous serons de retour très bientôt.
        </p>
        <a class="su-cta" [href]="tuitaHome" rel="noopener">
          Retour à Tuita
        </a>
      </section>
    </main>
  `,
  styles: [`
    :host { display: block; }
    .su-wrap {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: #f7f7f9;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    .su-card {
      max-width: 520px;
      width: 100%;
      background: #fff;
      border-radius: 12px;
      padding: 40px 32px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
      text-align: center;
    }
    .su-title {
      margin: 0 0 16px;
      font-size: 22px;
      font-weight: 600;
      color: #1a1a1a;
    }
    .su-text {
      margin: 0 0 28px;
      color: #555;
      line-height: 1.55;
      font-size: 15px;
    }
    .su-cta {
      display: inline-block;
      padding: 12px 28px;
      background: #ff6a00;
      color: #fff;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      transition: background 0.15s ease;
    }
    .su-cta:hover { background: #e85e00; }
  `],
})
export class ServiceUnavailableComponent {
  /**
   * URL de retour. En dev on renvoie vers le backend local Tuita (port 8060),
   * en prod vers tuita.fr. Pas de hardcode "https://tuita.fr" — on dérive
   * de `environment.tuitaBackendUrl` quand il est renseigné, sinon fallback.
   */
  readonly tuitaHome: string =
    environment.tuitaBackendUrl && environment.tuitaBackendUrl.length > 0
      ? environment.tuitaBackendUrl
      : 'https://tuita.fr';
}
