import { Component, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterModule } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { ContractorSessionService } from '../../services/contractor-session.service';
import type { ContractorDashboard } from '../../services/contractor-api.service';

export interface MemoSection {
  id: string;
  icon: string;
  title: string;
  rules: string[];
}

export const MEMO_SECTIONS: readonly MemoSection[] = [
  {
    id: 'representation',
    icon: 'badge',
    title: 'Je représente Tuita, jamais en direct',
    rules: [
      "Au nom de qui j'interviens → Tuita (jamais au mien)",
      "Si le client demande un prix → je renvoie vers Tuita, je ne chiffre jamais sur place",
      "Si le client demande une prestation en plus → je collecte l'info, Tuita fait le devis officiel",
      "En pré-visite → je ne promets rien au client, Tuita s'occupe du devis",
      "Sur un chantier → uniquement les travaux commandés par Tuita, aucun supplément direct",
    ],
  },
  {
    id: 'communication',
    icon: 'forum',
    title: 'Communication & imprévus',
    rules: [
      "En retard / hors créneau → je préviens Tuita, Tuita prévient le client",
      "Imprévu avant l'intervention → je préviens 48 à 72h à l'avance (désistement tardif = frais de gestion 100 €)",
      "Dégât chez le client → je signale immédiatement à Tuita (couvert par la RC Pro)",
      "Demande de commission / pot-de-vin → je refuse ET je signale à la direction Tuita",
    ],
  },
  {
    id: 'chantier',
    icon: 'construction',
    title: 'Comportement chantier & matériel',
    rules: [
      "Matériel oublié → j'arrive avec mon matériel complet, en cas d'oubli je vais le chercher (pas celui du client)",
      "Gravats / propreté → je nettoie avant de partir, la propreté fait partie de la prestation",
      "Matériel Tuita prêté (nacelle, élévatrice) → respect des consignes sécurité, rendu en parfait état",
    ],
  },
  {
    id: 'securite',
    icon: 'health_and_safety',
    title: 'Sécurité - non négociable',
    rules: [
      "Accès toiture → harnais, échelle sécurisée, casque. Pas d'exception.",
      "Machine élévatrice → formation + consignes respectées, pas de pilotage acrobate",
    ],
  },
  {
    id: 'previsite',
    icon: 'photo_camera',
    title: 'Pré-visite : ce que Tuita attend',
    rules: [
      "Minimum 15 photos (rapprochées + éloignées), postées sur l'application Tuita, attendre validation avant de partir",
      "J'attends la validation du conseiller avant de quitter le site",
      "Je ne démonte rien - diagnostic visuel uniquement, j'identifie les zones à risques",
      "Fenêtre de toit endommagée → photo + plaque signalétique + dimensions + marque",
      "Accès au toit → photos de l'accès, hauteur à la gouttière, besoin nacelle éventuel",
    ],
  },
  {
    id: 'technique',
    icon: 'build',
    title: 'Technique de pose - les fondamentaux',
    rules: [
      "Fenêtre de toit → niveau obligatoire (sinon infiltrations garanties)",
      "Gouttière → pente de 5 mm par mètre pour une évacuation correcte",
      "Tuiles → respect du pureau et des fiches techniques du fabricant",
      "Sens de pose → toujours dans le sens des écoulements d'eau pluviale",
      "Vents dominants → orientation opposée pour emboîtements et recouvrements",
      "Bâchage toiture → à l'extérieur, fixée avec liteaux et vis, résiste au vent",
    ],
  },
] as const;

@Component({
  selector: 'app-contractor-certification-memo',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatCardModule, MatIconModule],
  templateUrl: './contractor-certification-memo.component.html',
  styleUrl: './contractor-certification-memo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorCertificationMemoComponent {
  private readonly session = inject(ContractorSessionService);
  private readonly router = inject(Router);

  readonly sections = MEMO_SECTIONS;

  private readonly dashboard = toSignal<ContractorDashboard | null>(this.session.dashboard$, {
    initialValue: null,
  });

  readonly certifiedAt = computed<string | null>(() => {
    return this.dashboard()?.certification?.completed_at ?? null;
  });

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  retakeQcm(): void {
    this.router.navigate(['/certification'], { queryParams: { retake: '1' } });
  }
}
