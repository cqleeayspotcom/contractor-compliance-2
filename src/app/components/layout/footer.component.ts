import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

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
