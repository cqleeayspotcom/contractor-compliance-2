import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { ContractorStatus } from '../../../services/admin-invoice.service';
import { PhoneDisplayPipe } from '../../../pipes/phone-display.pipe';

@Component({
  selector: 'app-contractor-status-banner',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatChipsModule, PhoneDisplayPipe],
  templateUrl: './contractor-status-banner.component.html',
  styleUrl: './contractor-status-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorStatusBannerComponent {
  readonly status = input<ContractorStatus | null | undefined>(null);
  readonly phone = input<string | null | undefined>(null);
  readonly contractorName = input<string | null | undefined>(null);
  readonly siren = input<string | null | undefined>(null);
  readonly profileClick = output<string>();

  readonly isDegraded = computed(() => {
    const s = this.status();
    if (!s) return false;
    return !s.is_compliant
        || (s.kyc_status !== 'approved' && s.kyc_status !== 'none')
        || (s.account_state !== 'fully_verified' && s.account_state !== 'unknown');
  });

  readonly warnings = computed<string[]>(() => {
    const s = this.status();
    if (!s) return [];
    const w: string[] = [];
    if (!s.is_compliant) w.push(`Compliance ${s.compliance_score.toFixed(0)}%`);
    if (s.kyc_status === 'expired' || s.kyc_status === 'rejected') {
      w.push(`KYC ${s.kyc_status}` + (s.kyc_failure_reason ? ` (${s.kyc_failure_reason})` : ''));
    }
    if (s.account_state !== 'fully_verified' && s.account_state !== 'unknown') {
      w.push(`Compte ${s.account_state}`);
    }
    return w;
  });

  onProfileClick(): void {
    const p = this.phone();
    if (p) this.profileClick.emit(p);
  }
}
