import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Footer Tuita (copyright + liens légaux).
 *
 * NB : ce footer n'est affiché QUE sur les routes contractor. L'espace admin
 * n'a volontairement pas de footer (voir ContractorLayoutComponent).
 *
 * ⚠️ À FUSIONNER À LA FUSION FRONTEND ⚠️
 * Ce composant est une réplique autonome du footer de tuita.fr, propre à la
 * micro-app Contractor Compliance. Lors de la fusion de ce frontend dans le
 * frontend tuita principal, NE PAS conserver ce composant : le remplacer par
 * le vrai footer partagé de tuita.fr pour éviter d'avoir deux footers à
 * maintenir en parallèle.
 */
@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FooterComponent {
  /**
   * Current year for copyright
   */
  readonly currentYear = new Date().getFullYear();

  /**
   * Legal links
   */
  readonly legalLinks = [
    { path: 'https://tuita.fr/mentions-legales', label: 'Mentions légales' },
    { path: 'https://tuita.fr/cgu', label: 'CGU' },
    { path: 'https://tuita.fr/confidentialite', label: 'Confidentialité' }
  ];

  /**
   * Company information
   */
  readonly companyInfo = {
    name: 'Tuita',
    slogan: 'Simplifiez la vérification de vos sous-traitants'
  };
}
