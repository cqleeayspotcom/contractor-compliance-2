import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

/**
 * Header de l'espace ADMIN Tuita.
 *
 * Volontairement DISTINCT du header contractor (`app-header`) : barre sombre
 * prussian-blue + badge "Administration", aucune navigation contractor
 * (missions / compliance / profil). Chaque page admin porte déjà sa propre
 * barre d'actions (refresh, déconnexion, quicknav), ce header ne sert donc
 * qu'à l'identité visuelle de la partie admin.
 *
 * ⚠️ À FUSIONNER À LA FUSION FRONTEND ⚠️
 * Ce composant est spécifique à la micro-app Contractor Compliance. Lors de
 * la fusion de ce frontend dans le frontend tuita principal, le remplacer
 * par le vrai header back-office / admin de tuita.fr pour ne pas maintenir
 * deux headers admin en parallèle.
 */
@Component({
  selector: 'app-admin-header',
  standalone: true,
  imports: [RouterModule, MatIconModule],
  templateUrl: './admin-header.component.html',
  styleUrl: './admin-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminHeaderComponent {}
