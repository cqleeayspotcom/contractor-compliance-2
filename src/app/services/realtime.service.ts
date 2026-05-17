// TODO: npm install --save laravel-echo pusher-js
// Tant que ces packages ne sont pas installés, ce service fonctionne en
// mode "no-op gracieux" : connect() ne crash pas, les Observables retournent
// EMPTY et le polling HTTP reste la seule voie de MAJ des statuts.
//
// Une fois `laravel-echo` + `pusher-js` installés :
//   1. Décommenter les imports ci-dessous
//   2. Remplacer `any` par `Echo` dans le typage de `this.echo`
//   3. Les payloads restent identiques côté consommateur (pas de breaking).
//
// Backend (Laravel Reverb) publie sur :
//   - private-contractor.{companyId}   channel (cf. routes/channels.php)
//   - event `.document.status_changed` (cf. DocumentStatusChanged)
//   - event `.invoice.status_changed`  (cf. InvoiceStatusChanged)

import { Injectable } from '@angular/core';
import { Observable, Subject, EMPTY } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { environment } from '../../environments/environment';

// import Echo from 'laravel-echo';
// import Pusher from 'pusher-js';

/**
 * Payload d'un event `.document.status_changed` broadcast par le backend
 * (cf. backend/app/Events/DocumentStatusChanged.php).
 */
export interface DocumentStatusEvent {
  uuid: string;
  type: string | null;
  status: string;
  detected_type?: string | null;
  failure_reason?: string | null;
  failure_detail?: string | null;
  verification_score?: number | null;
  ocr_phase?: string | null;
  updated_at: string;
}

/**
 * Payload d'un event `.invoice.status_changed` broadcast par le backend
 * (cf. backend/app/Events/InvoiceStatusChanged.php).
 */
export interface InvoiceStatusEvent {
  uuid: string;
  invoice_number?: string | null;
  status: string;
  amount_ht?: number | null;
  amount_ttc?: number | null;
  amount_tva?: number | null;
  rejection_reason?: string | null;
  rejection_details?: string[] | null;
  pages_count?: number | null;
  updated_at: string;
}

/**
 * Service temps-réel basé sur Laravel Reverb (WebSocket).
 * Cohabite avec le polling HTTP : si l'event WS arrive avant, super —
 * le polling suivant confirme simplement. En cas d'indispo WS (réseau
 * chantier, Reverb down), le polling reste la voie garantie.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  // private echo: Echo | null = null;
  private echo: any = null;
  private channelName: string | null = null;

  private readonly documentStatus$ = new Subject<DocumentStatusEvent>();
  private readonly invoiceStatus$ = new Subject<InvoiceStatusEvent>();

  /**
   * Se connecte à Reverb et s'abonne au channel privé contractor.{id}.
   *
   * `channelId` = company_id (backend broadcast sur private-contractor.{companyId}).
   * À défaut, on accepte le user_id — la logique d'autorisation est
   * côté backend (routes/channels.php).
   *
   * Idempotent : appeler 2x avec le même id ne recrée pas la connexion.
   */
  connect(channelId: number | string | null | undefined): void {
    if (channelId === null || channelId === undefined || channelId === '') {
      // Pas d'ID → pas de WS. Le polling HTTP prend le relais.
      // eslint-disable-next-line no-console
      console.debug('[Realtime] no channelId, skipping WS (polling fallback)');
      return;
    }

    const targetChannel = `contractor.${channelId}`;
    if (this.echo && this.channelName === targetChannel) {
      return; // déjà connecté au bon channel
    }

    // Si changement d'identité (rare), on ferme la précédente.
    if (this.echo) {
      this.disconnect();
    }

    try {
      // -----------------------------------------------------------------
      // Activation réelle une fois `laravel-echo` + `pusher-js` installés :
      // -----------------------------------------------------------------
      // (window as any).Pusher = Pusher;
      //
      // this.echo = new Echo({
      //   broadcaster: 'reverb',
      //   key: environment.reverbKey,
      //   wsHost: environment.reverbHost,
      //   wsPort: environment.reverbPort,
      //   wssPort: environment.reverbPort,
      //   forceTLS: environment.reverbScheme === 'https',
      //   enabledTransports: ['ws', 'wss'],
      //   authEndpoint: `${environment.apiUrl}/contractor/broadcasting/auth`,
      //   auth: {
      //     headers: { 'X-Requested-With': 'XMLHttpRequest' },
      //   },
      // });
      //
      // this.echo
      //   .private(targetChannel)
      //   .listen('.document.status_changed', (payload: DocumentStatusEvent) => {
      //     this.documentStatus$.next(payload);
      //   })
      //   .listen('.invoice.status_changed', (payload: InvoiceStatusEvent) => {
      //     this.invoiceStatus$.next(payload);
      //   });

      this.channelName = targetChannel;
      // eslint-disable-next-line no-console
      console.debug(
        `[Realtime] WS désactivé (laravel-echo non installé) — channel cible : ${targetChannel}`,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[Realtime] connexion WS impossible, fallback polling HTTP', err);
      this.echo = null;
      this.channelName = null;
    }
  }

  /**
   * Observable des MAJ de statut document (broadcast Reverb).
   * En mode no-op (echo non installé) → Subject vide, aucun tick jamais émis.
   */
  onDocumentStatusChanged(): Observable<DocumentStatusEvent> {
    return this.documentStatus$.asObservable();
  }

  /**
   * Observable des MAJ de statut facture (broadcast Reverb).
   */
  onInvoiceStatusChanged(): Observable<InvoiceStatusEvent> {
    return this.invoiceStatus$.asObservable();
  }

  /**
   * Ferme la connexion WS. À appeler dans le ngOnDestroy des composants
   * qui ont appelé connect().
   */
  disconnect(): void {
    if (!this.echo) {
      this.channelName = null;
      return;
    }
    try {
      if (this.channelName) {
        // this.echo.leave(`private-${this.channelName}`);
      }
      // this.echo.disconnect();
    } catch {
      /* no-op */
    }
    this.echo = null;
    this.channelName = null;
  }

  /** Utilitaire : Observable vide utilisable en fallback explicite. */
  empty<T>(): Observable<T> {
    return EMPTY as Observable<T>;
  }

  /** Utilitaire RxJS pour enchaîner un takeUntil(destroy$) idiomatique. */
  until<T>(destroy$: Subject<void>) {
    return (source: Observable<T>) => source.pipe(takeUntil(destroy$));
  }
}
