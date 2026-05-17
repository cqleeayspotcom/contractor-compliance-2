import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, booleanAttribute } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TuitaIconComponent } from './tuita-icon.component';

/**
 * Smart alert type variants with corresponding priorities and behaviors
 */
export type SmartAlertType = 'urgent' | 'warning' | 'info' | 'success';

/**
 * Smart alert priority levels
 */
export type SmartAlertPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Smart alert action button definition
 */
export interface SmartAlertAction {
  label: string;
  callback: () => void;
  primary?: boolean;
}

/**
 * SmartAlertBanner Component
 *
 * An advanced alert banner component with smart features including:
 * - Different alert types with appropriate icons and colors
 * - Dismissible with optional "Don't show again"
 * - Action buttons (primary action + dismiss)
 * - Countdown timers for time-sensitive items
 * - Progress indicators for expiring items
 * - Multiple alerts stacked
 * - Animation on appearance
 * - Auto-dismiss for success messages
 * - Persistent for urgent warnings
 * - Mat-tooltip for more info
 *
 * @example
 * ```html
 * <!-- Urgent alert -->
 * <app-smart-alert-banner
 *   type="urgent"
 *   title="Document Rejected"
 *   message="Your insurance document has been rejected due to insufficient coverage."
 *   [dismissible]="true"
 *   [persistent]="true"
 *   [actions]="urgentActions"
 * ></app-smart-alert-banner>
 *
 * <!-- Warning with countdown -->
 * <app-smart-alert-banner
 *   type="warning"
 *   title="Subscription Expiring Soon"
 *   message="Your subscription expires in 5 days. Renew now to avoid service interruption."
 *   [daysRemaining]="5"
 *   [dismissible]="true"
 *   [showDonotShowAgain]="true"
 * ></app-smart-alert-banner>
 *
 * <!-- Success with auto-dismiss -->
 * <app-smart-alert-banner
 *   type="success"
 *   title="Document Verified"
 *   message="Your KYC document has been successfully verified."
 *   [autoDismiss]="true"
 *   [dismissTimeout]="5000"
 * ></app-smart-alert-banner>
 * ```
 */
@Component({
  selector: 'app-smart-alert-banner',
  standalone: true,
  imports: [CommonModule, TuitaIconComponent],
  templateUrl: './smart-alert-banner.component.html',
  styleUrl: './smart-alert-banner.component.scss'
})
export class SmartAlertBannerComponent implements OnInit, OnDestroy {
  /**
   * Alert type variant
   * - urgent: Red alert for critical issues (documents rejected, KYC rejected, subscription expired)
   * - warning: Orange alert for warnings (documents expiring, subscription expiring, incomplete KYC)
   * - info: Blue alert for informational messages (new features, tips)
   * - success: Green alert for success messages (documents verified, KYC approved)
   */
  @Input() type: SmartAlertType = 'info';

  /**
   * Alert title/headline
   * Displayed prominently at the top of the alert
   */
  @Input() title: string = '';

  /**
   * Alert message content
   * The main message body of the alert
   */
  @Input() message: string = '';

  /**
   * Additional detailed information
   * Shown in a collapsible details section
   */
  @Input() details: string = '';

  /**
   * Whether the alert can be dismissed by the user
   * When true, shows a close button
   */
  @Input({ transform: booleanAttribute }) dismissible: boolean = true;

  /**
   * Whether to show "Don't show again" option
   * Allows users to permanently dismiss similar alerts
   */
  @Input({ transform: booleanAttribute }) showDonotShowAgain: boolean = false;

  /**
   * Whether the alert is persistent (cannot be dismissed)
   * Overrides dismissible when true
   */
  @Input({ transform: booleanAttribute }) persistent: boolean = false;

  /**
   * Whether to auto-dismiss the alert after a timeout
   * When true, alert automatically closes after dismissTimeout
   */
  @Input({ transform: booleanAttribute }) autoDismiss: boolean = false;

  /**
   * Time in milliseconds before auto-dismissing the alert
   * Default: 5000ms (5 seconds)
   */
  @Input() dismissTimeout: number = 5000;

  /**
   * Number of days remaining for time-sensitive alerts
   * Displays a countdown indicator
   */
  @Input() daysRemaining: number | null = null;

  /**
   * Expiry date for time-sensitive alerts
   * Used to calculate days remaining automatically
   */
  @Input() expiryDate: Date | null = null;

  /**
   * Action buttons to display
   * Array of action objects with label and callback
   */
  @Input() actions: SmartAlertAction[] = [];

  /**
   * Tooltip text for more information
   * Shows additional context on hover
   */
  @Input() tooltip: string = '';

  /**
   * Additional CSS classes to apply
   */
  @Input() class: string = '';

  /**
   * Unique identifier for the alert type
   * Used for "Don't show again" functionality
   */
  @Input() alertId: string = '';

  /**
   * Event emitted when the alert is dismissed
   */
  @Output() dismissed = new EventEmitter<{ dismissed: boolean; dontShowAgain: boolean }>();

  /**
   * Event emitted when an action is clicked
   */
  @Output() actionClicked = new EventEmitter<SmartAlertAction>();

  /**
   * Internal visibility state
   */
  isVisible: boolean = true;

  /**
   * Details section expansion state
   */
  isDetailsExpanded: boolean = false;

  /**
   * "Don't show again" checkbox state
   */
  dontShowAgain: boolean = false;

  /**
   * Timeout reference for auto-dismiss functionality
   */
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Interval reference for countdown timer
   */
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Get the icon name based on alert type
   */
  get iconName(): string {
    const iconMap: Record<SmartAlertType, string> = {
      urgent: 'error',
      warning: 'warning',
      info: 'info',
      success: 'check-circle'
    };
    return iconMap[this.type];
  }

  /**
   * Get computed CSS classes for the alert container
   */
  get alertClasses(): string {
    const classes = ['smart-alert-banner', `smart-alert-${this.type}`];

    if (!this.isVisible) {
      classes.push('smart-alert-hidden');
    }

    if (this.persistent) {
      classes.push('smart-alert-persistent');
    }

    if (this.class) {
      classes.push(this.class);
    }

    return classes.join(' ');
  }

  /**
   * Get progress percentage for time remaining
   */
  get progressPercentage(): number {
    if (!this.daysRemaining) return 0;

    // Assuming 30 days as the full period
    const fullPeriod = 30;
    return Math.max(0, Math.min(100, (this.daysRemaining / fullPeriod) * 100));
  }

  /**
   * Get progress bar color class
   */
  get progressColor(): string {
    if (!this.daysRemaining) return 'progress-blue';

    if (this.daysRemaining < 7) return 'progress-red';
    if (this.daysRemaining < 14) return 'progress-orange';
    return 'progress-yellow';
  }

  /**
   * Get aria-live region for accessibility
   * Urgent alerts use assertive, others use polite
   */
  get ariaLive(): string {
    return this.type === 'urgent' ? 'assertive' : 'polite';
  }

  /**
   * Get aria role for accessibility
   */
  get ariaRole(): string {
    return this.type === 'urgent' ? 'alert' : 'status';
  }

  ngOnInit(): void {
    // Calculate days remaining from expiry date if provided
    if (this.expiryDate && !this.daysRemaining) {
      this.calculateDaysRemaining();
    }

    // Start countdown timer if days remaining is set
    if (this.daysRemaining !== null) {
      this.startCountdownTimer();
    }

    // Auto-dismiss if enabled
    if (this.autoDismiss) {
      this.startAutoDismiss();
    }
  }

  ngOnDestroy(): void {
    this.clearAutoDismiss();
    this.clearCountdownTimer();
  }

  /**
   * Dismiss the alert
   * Can be called programmatically or by user interaction
   */
  dismiss(): void {
    if (this.persistent) return;

    this.isVisible = false;

    // Emit dismiss event with "don't show again" state
    this.dismissed.emit({
      dismissed: true,
      dontShowAgain: this.dontShowAgain
    });

    // Allow animation to complete before destroying
    setTimeout(() => {
      this.clearAutoDismiss();
    }, 300);
  }

  /**
   * Handle action button click
   */
  onActionClick(action: SmartAlertAction): void {
    // Emit action clicked event
    this.actionClicked.emit(action);

    // Execute the callback
    action.callback();
  }

  /**
   * Toggle details section
   */
  toggleDetails(): void {
    this.isDetailsExpanded = !this.isDetailsExpanded;
  }

  /**
   * Calculate days remaining from expiry date
   */
  private calculateDaysRemaining(): void {
    if (!this.expiryDate) return;

    const now = new Date();
    const expiry = new Date(this.expiryDate);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    this.daysRemaining = Math.max(0, diffDays);
  }

  /**
   * Start the auto-dismiss timer
   */
  private startAutoDismiss(): void {
    this.clearAutoDismiss();
    this.dismissTimer = setTimeout(() => {
      this.dismiss();
    }, this.dismissTimeout);
  }

  /**
   * Clear the auto-dismiss timer
   */
  private clearAutoDismiss(): void {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
  }

  /**
   * Start countdown timer to refresh days remaining
   */
  private startCountdownTimer(): void {
    this.clearCountdownTimer();

    // Update every hour
    this.countdownInterval = setInterval(() => {
      if (this.expiryDate) {
        this.calculateDaysRemaining();
      }
    }, 60 * 60 * 1000);
  }

  /**
   * Clear countdown timer
   */
  private clearCountdownTimer(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }
}
