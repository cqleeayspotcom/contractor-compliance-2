import { Injectable, computed, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/**
 * Signal bus pour le bouton "Rafraichir" du header.
 *
 * Le header emet un tick sur `refresh$` a chaque click ; chaque page
 * interessee s'abonne dans son ngOnInit et appelle sa propre methode
 * de rechargement (loadMissions, loadInvoices, loadDocuments, etc.).
 *
 * Decouplage volontaire : aucune page ne depend directement du header,
 * chaque page decide du perimetre de son refresh et reste responsable
 * de son loading/error state.
 *
 * --- Desactivation contextuelle ---
 *
 * Une page peut bloquer le bouton Rafraichir pendant un etat critique
 * ou un rechargement detruirait du travail en cours (enregistrement
 * video KYC, QCM de certification, etc.) via :
 *
 *   refreshBus.setBusy('kyc-recording', true);
 *   // ... plus tard ...
 *   refreshBus.setBusy('kyc-recording', false);
 *
 * Le set des cles actives est fusionne : tant qu'au moins une cle est
 * active, `canRefresh()` retourne false et le header desactive le bouton.
 */
@Injectable({ providedIn: 'root' })
export class RefreshService {
  private readonly refreshSubject = new Subject<void>();
  readonly refresh$: Observable<void> = this.refreshSubject.asObservable();

  /** Ensemble des cles qui empechent actuellement un refresh. */
  private readonly busyKeys = signal<ReadonlySet<string>>(new Set());

  /** True si aucune page n'a pose de verrou — le bouton est cliquable. */
  readonly canRefresh = computed(() => this.busyKeys().size === 0);

  /**
   * Pose (busy=true) ou leve (busy=false) un verrou identifie par `key`.
   * La cle doit etre unique par page/etat — typiquement
   * `'kyc-recording'`, `'certif-quiz'`, etc.
   *
   * IMPORTANT : toute page qui pose un verrou doit s'assurer de le
   * lever dans son ngOnDestroy pour ne pas figer le bouton apres
   * navigation.
   */
  setBusy(key: string, busy: boolean): void {
    this.busyKeys.update(prev => {
      const next = new Set(prev);
      if (busy) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  /** Click handler — no-op silencieux si un verrou est pose. */
  trigger(): void {
    if (!this.canRefresh()) return;
    this.refreshSubject.next();
  }
}
