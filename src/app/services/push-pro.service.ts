import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { ContractorSessionService } from './contractor-session.service';
import { PushProModalComponent } from '../components/shared/push-pro-modal/push-pro-modal.component';

/**
 * PushProService
 *
 * Gère l'affichage "intrusif" du modal d'upgrade vers le plan Pro pour les
 * contractors en plan `free`.
 *
 * Règles :
 *  - N'affiche le modal qu'aux contractors en plan `free` (vérifié via ContractorSessionService.plan)
 *  - Respecte un cooldown de 7 jours entre deux affichages (via localStorage)
 *  - La date du dernier affichage est persistée sous la clé `push_pro_last_shown`
 */
@Injectable({ providedIn: 'root' })
export class PushProService {
  private readonly session = inject(ContractorSessionService);

  /** Clé localStorage pour stocker le timestamp du dernier affichage. */
  private static readonly STORAGE_KEY = 'push_pro_last_shown';

  /** Cooldown entre deux affichages, en ms (7 jours). */
  private static readonly COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

  /**
   * Détermine si le modal doit être affiché au contractor courant.
   *
   * Retourne true si :
   *  - le plan courant est `free`
   *  - ET (aucun affichage précédent OU dernier affichage > 7 jours)
   */
  shouldShow(): boolean {
    if (this.session.plan !== 'free') {
      return false;
    }

    const lastShown = this.readLastShown();
    if (lastShown === null) {
      return true;
    }

    return Date.now() - lastShown > PushProService.COOLDOWN_MS;
  }

  /**
   * Enregistre la date actuelle comme date du dernier affichage.
   * Appelé après la fermeture du modal (peu importe le CTA cliqué).
   */
  markShown(): void {
    try {
      localStorage.setItem(PushProService.STORAGE_KEY, Date.now().toString());
    } catch {
      // localStorage peut être indisponible (mode privé strict, quota, ...)
      // on ne bloque pas le flow — au pire le modal se réaffichera
    }
  }

  /**
   * Ouvre le modal Push Pro. À la fermeture (quelle que soit la raison :
   * ESC, backdrop, bouton), appelle markShown() pour démarrer le cooldown.
   */
  show(dialog: MatDialog): void {
    const ref = dialog.open(PushProModalComponent, {
      width: '480px',
      maxWidth: '92vw',
      maxHeight: '92vh',              // header/footer stickés, body scrollable — évite le débordement mobile
      panelClass: 'push-pro-dialog-panel',
      autoFocus: false,
      restoreFocus: true,
      // ESC et click-outside actifs par défaut (on ne les désactive pas)
    });

    ref.afterClosed().subscribe(() => this.markShown());
  }

  // --- internals ------------------------------------------------------------

  private readLastShown(): number | null {
    try {
      const raw = localStorage.getItem(PushProService.STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}
