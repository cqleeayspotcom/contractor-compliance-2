import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AdminKycService, KycArtifact, KycSessionRow } from '../../services/admin-kyc.service';
import { AdminKycArtifactPreviewDialogComponent } from './admin-kyc-artifact-preview-dialog.component';
import { PhoneDisplayPipe } from '../../pipes/phone-display.pipe';
import { SkeletonComponent } from '../../components/shared/skeleton.component';

interface ArtifactWithUrl extends KycArtifact {
  blobUrl?: string;
  loadError?: boolean;
}

interface ChallengeEntry {
  key: string;
  type: string | null;
  label: string;
  passed: boolean | null;
  score: number | null;
  reason: string | null;
}

interface RematchData {
  document_uuid?: string;
  score?: number | null;
  threshold?: number | null;
  decision?: string;
  reason?: string;
  provider?: string;
  at?: string;
}

@Component({
  selector: 'app-admin-kyc-session-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatCardModule,
    MatExpansionModule,
    MatTooltipModule,
    PhoneDisplayPipe,
    SkeletonComponent,
  ],
  templateUrl: './admin-kyc-session-dialog.component.html',
  styleUrl: './admin-kyc-session-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminKycSessionDialogComponent implements OnInit, OnDestroy {
  private readonly api = inject(AdminKycService);
  private readonly dialog = inject(MatDialog);
  readonly dialogRef = inject(MatDialogRef<AdminKycSessionDialogComponent>);
  readonly data = inject<{ session: KycSessionRow }>(MAT_DIALOG_DATA);

  readonly session = this.data.session;
  readonly artifacts = signal<ArtifactWithUrl[]>([]);
  readonly artifactsLoading = signal(false);
  readonly artifactsError = signal<string | null>(null);
  readonly rawJsonExpanded = signal(false);

  // Defensive accessor on biometric_result (typed as Record<string, unknown> | null).
  private readonly biometric = computed<Record<string, unknown>>(() => {
    const r = this.session.biometric_result;
    return r && typeof r === 'object' ? (r as Record<string, unknown>) : {};
  });

  ngOnInit(): void {
    this.loadArtifacts();
  }

  ngOnDestroy(): void {
    this.artifacts().forEach((a) => {
      if (a.blobUrl) {
        try {
          URL.revokeObjectURL(a.blobUrl);
        } catch {
          // ignore
        }
      }
    });
  }

  private loadArtifacts(): void {
    this.artifactsLoading.set(true);
    this.artifactsError.set(null);

    this.api
      .getArtifacts(this.session.uuid)
      .then((list) => {
        // `path` est déjà une URL signée (TTL 1h) directement exploitable
        // comme `src` d'un <video> — plus de fetch blob intermédiaire.
        this.artifacts.set(list.map((a) => ({ ...a, blobUrl: a.path })));
        this.artifactsLoading.set(false);
      })
      .catch((err) => {
        this.artifactsLoading.set(false);
        this.artifactsError.set('Impossible de charger les artefacts.');
        console.error('[admin-kyc] artifacts load failed', err);
      });
  }

  openFullSize(artifact: ArtifactWithUrl): void {
    if (!artifact.blobUrl) return;
    this.dialog.open(AdminKycArtifactPreviewDialogComponent, {
      data: { url: artifact.blobUrl, label: artifact.label ?? artifact.type },
      maxWidth: '95vw',
      maxHeight: '95vh',
      panelClass: 'admin-kyc-preview-dialog',
    });
  }

  // ── Identity ──────────────────────────────────────────────────────────────

  shortUuid(): string {
    return this.session.uuid?.split('-')[0] ?? this.session.uuid ?? '—';
  }

  contractorName(): string {
    const s = this.session;
    const parts = [s.contractor_first_name, s.contractor_last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : '—';
  }

  // company_name & siren are NOT on KycSessionRow — try to surface them from
  // biometric_result if persisted there, else hide.
  companyName(): string | null {
    const v = this.biometric()['company_name'];
    return typeof v === 'string' && v.length > 0 ? v : null;
  }

  siren(): string | null {
    const v = this.biometric()['siren'];
    return typeof v === 'string' && v.length > 0 ? v : null;
  }

  // ── Verdict / failure ─────────────────────────────────────────────────────

  failureReasonLabel(): string {
    const code = this.session.failure_reason;
    if (!code) return '—';
    const labels: Record<string, string> = {
      liveness_failed: 'Liveness échouée (anti-spoofing)',
      face_not_detected: 'Aucun visage détecté',
      face_mismatch: 'Le visage ne correspond pas au document',
      face_mismatch_on_doc_change: 'Mismatch après reupload doc identité',
      dual_challenge_failed: 'Échec sur les 2 challenges 3D',
      spoofing_detected: 'Spoofing détecté',
      biometric_service_unavailable: 'Service biométrique indisponible',
      provider_unavailable_on_rematch: 'Provider KO pendant re-match',
      best_frame_missing: 'Frame de référence manquante (KYC ancien)',
    };
    return labels[code] ?? code;
  }

  statusClass(): string {
    return `status-pill status-${this.session.status ?? 'unknown'}`;
  }

  statusIcon(): string {
    switch (this.session.status) {
      case 'approved':
        return 'check_circle';
      case 'rejected':
        return 'cancel';
      case 'pending_manual_review':
        return 'hourglass_top';
      case 'expired':
        return 'history_toggle_off';
      default:
        return 'help_outline';
    }
  }

  // ── Biometric scores ──────────────────────────────────────────────────────

  provider(): string {
    const v = this.biometric()['provider'];
    if (typeof v === 'string' && v.length > 0) return v;
    return this.session.biometric_provider ?? '—';
  }

  livenessScore(): number | null {
    const v = this.biometric()['liveness_score'];
    if (typeof v === 'number') return v;
    return this.session.liveness_score ?? null;
  }

  livenessPercent(): number | null {
    const s = this.livenessScore();
    if (s === null) return null;
    return Math.max(0, Math.min(100, s * 100));
  }

  livenessPassed(): boolean | null {
    const v = this.biometric()['liveness_passed'];
    return typeof v === 'boolean' ? v : null;
  }

  faceMatchScore(): number | null {
    const v = this.biometric()['face_match_score'];
    if (typeof v === 'number') return v;
    return this.session.face_match_score ?? null;
  }

  faceMatchPercent(): number | null {
    const s = this.faceMatchScore();
    if (s === null) return null;
    return Math.max(0, Math.min(100, s * 100));
  }

  faceMatchPassed(): boolean | null {
    const v = this.biometric()['face_match_passed'];
    return typeof v === 'boolean' ? v : null;
  }

  faceDetected(): boolean | null {
    const v = this.biometric()['face_detected'];
    return typeof v === 'boolean' ? v : null;
  }

  spoofingDetected(): boolean | null {
    const v = this.biometric()['spoofing_detected'];
    return typeof v === 'boolean' ? v : null;
  }

  framesAnalyzed(): number | null {
    const v = this.biometric()['frames_analyzed'];
    return typeof v === 'number' ? v : null;
  }

  livenessThreshold(): number | null {
    const v = this.biometric()['liveness_threshold'];
    return typeof v === 'number' ? v : null;
  }

  faceMatchThreshold(): number | null {
    const v = this.biometric()['face_match_threshold'];
    return typeof v === 'number' ? v : null;
  }

  // ── Challenges 3D ─────────────────────────────────────────────────────────

  challengeLabel(type: string | null): string {
    if (!type) return '—';
    const map: Record<string, string> = {
      yaw_left: 'Tête à gauche',
      yaw_right: 'Tête à droite',
      pitch_up: 'Tête vers le haut',
      pitch_down: 'Tête vers le bas',
      mouth_open: 'Bouche ouverte',
    };
    return map[type] ?? type;
  }

  challenges(): ChallengeEntry[] {
    const raw = this.biometric()['challenges'];
    if (!raw || typeof raw !== 'object') return [];
    const out: ChallengeEntry[] = [];
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const v = value as Record<string, unknown>;
      const type = typeof v['type'] === 'string' ? (v['type'] as string) : null;
      out.push({
        key,
        type,
        label: this.challengeLabel(type),
        passed: typeof v['passed'] === 'boolean' ? (v['passed'] as boolean) : null,
        score: typeof v['score'] === 'number' ? (v['score'] as number) : null,
        reason: typeof v['reason'] === 'string' ? (v['reason'] as string) : null,
      });
    }
    return out;
  }

  challengePercent(score: number | null): number {
    if (score === null) return 0;
    return Math.max(0, Math.min(100, score * 100));
  }

  // ── Rematch ───────────────────────────────────────────────────────────────

  hasRematch(): boolean {
    const v = this.biometric()['rematch_on_id_change'];
    return !!(v && typeof v === 'object');
  }

  rematchData(): RematchData | null {
    const v = this.biometric()['rematch_on_id_change'];
    if (!v || typeof v !== 'object') return null;
    return v as RematchData;
  }

  rematchIsMismatch(): boolean {
    const r = this.rematchData();
    return !!(r && (r.decision === 'invalidated' || r.decision === 'mismatch'));
  }

  // ── Audit / metadata ──────────────────────────────────────────────────────

  videoStoragePath(): string | null {
    const v = this.biometric()['video_storage_path'];
    return typeof v === 'string' && v.length > 0 ? v : null;
  }

  ipAddress(): string | null {
    const candidates = ['ip', 'ip_address', 'used_ip'];
    for (const k of candidates) {
      const v = this.biometric()[k];
      if (typeof v === 'string' && v.length > 0) return v;
    }
    return null;
  }

  userAgent(): string | null {
    const candidates = ['user_agent', 'used_user_agent', 'ua'];
    for (const k of candidates) {
      const v = this.biometric()[k];
      if (typeof v === 'string' && v.length > 0) return v;
    }
    return null;
  }

  truncate(s: string | null | undefined, n: number): string {
    if (!s) return '—';
    return s.length > n ? `${s.slice(0, n)}…` : s;
  }

  // ── Misc ──────────────────────────────────────────────────────────────────

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('fr-FR');
  }

  formatScore(n: number | null | undefined, digits = 3): string {
    if (n === null || n === undefined) return '—';
    return n.toFixed(digits);
  }

  prettyJson(obj: unknown): string {
    if (obj === null || obj === undefined) return '—';
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  }

  trackByPath(_index: number, item: ArtifactWithUrl): string {
    return item.path;
  }

  trackByChallengeKey(_index: number, item: ChallengeEntry): string {
    return item.key;
  }

  toggleRawJson(): void {
    this.rawJsonExpanded.update((v) => !v);
  }

  close(): void {
    this.dialogRef.close();
  }
}
