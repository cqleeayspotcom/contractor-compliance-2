import { Component, Input, booleanAttribute, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TuitaIconComponent } from './tuita-icon.component';

/**
 * Alert type variants with corresponding icons and colors
 */
export type AlertType = 'error' | 'warning' | 'success' | 'info';

/**
 * ErrorAlert Component
 *
 * A reusable alert/notification component with different types,
 * icons, auto-dismiss functionality, and dismissible option.
 *
 * @example
 * ```html
 * <!-- Basic error alert -->
 * <app-error-alert
 *   type="error"
 *   message="An error occurred while processing your request."
 * ></app-error-alert>
 *
 * <!-- Success alert with auto-dismiss -->
 * <app-error-alert
 *   type="success"
 *   message="Document uploaded successfully!"
 *   [autoDismiss]="true"
 *   [dismissTimeout]="5000"
 * ></app-error-alert>
 *
 * <!-- Warning alert with custom title -->
 * <app-error-alert
 *   type="warning"
 *   title="Attention Required"
 *   message="Your subscription expires in 3 days."
 *   [dismissible]="true"
 * ></app-error-alert>
 *
 * <!-- Info alert (non-dismissible) -->
 * <app-error-alert
 *   type="info"
 *   message="New features have been added to your dashboard."
 *   [dismissible]="false"
 * ></app-error-alert>
 * ```
 */
@Component({
  selector: 'app-error-alert',
  standalone: true,
  imports: [CommonModule, TuitaIconComponent],
  templateUrl: './error-alert.component.html',
  styleUrl: './error-alert.component.scss'
})
export class ErrorAlertComponent implements OnInit, OnDestroy {
  /**
   * Alert type variant
   * - error: Red alert for errors (uses Tuita orange for accessibility)
   * - warning: Orange/yellow alert for warnings
   * - success: Green alert for success messages
   * - info: Blue alert for informational messages
   */
  @Input() type: AlertType = 'error';

  /**
   * Optional title/header for the alert
   * If not provided, only the message is displayed
   */
  @Input() title: string = '';

  /**
   * The alert message content
   * Can contain HTML if sanitized properly
   */
  @Input() message: string = '';

  /**
   * Whether the alert can be dismissed by the user
   * When true, shows a close button
   */
  @Input({ transform: booleanAttribute }) dismissible: boolean = true;

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
   * Additional CSS classes to apply to the host element
   */
  @Input() class: string = '';

  /**
   * Event emitted when the alert is dismissed
   * Can be used to trigger cleanup actions in parent components
   */
  onDismiss: (() => void) | null = null;

  /**
   * Internal visibility state
   */
  isVisible: boolean = true;

  /**
   * Timeout reference for auto-dismiss functionality
   */
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Get the icon name based on alert type
   */
  get iconName(): string {
    const iconMap: Record<AlertType, string> = {
      error: 'error',
      warning: 'warning',
      success: 'check-circle',
      info: 'info'
    };
    return iconMap[this.type];
  }

  /**
   * Get computed CSS classes for the alert container
   */
  get alertClasses(): string {
    const classes = ['error-alert', `error-alert-${this.type}`];

    if (!this.isVisible) {
      classes.push('error-alert-hidden');
    }

    if (this.class) {
      classes.push(this.class);
    }

    return classes.join(' ');
  }

  ngOnInit(): void {
    if (this.autoDismiss) {
      this.startAutoDismiss();
    }
  }

  ngOnDestroy(): void {
    this.clearAutoDismiss();
  }

  /**
   * Dismiss the alert
   * Can be called programmatically or by user interaction
   */
  dismiss(): void {
    this.isVisible = false;

    // Call custom dismiss callback if provided
    if (this.onDismiss) {
      this.onDismiss();
    }

    // Allow animation to complete before destroying
    setTimeout(() => {
      this.clearAutoDismiss();
    }, 300);
  }

  /**
   * Set a custom dismiss callback
   * @param callback - Function to call when alert is dismissed
   */
  setDismissCallback(callback: () => void): void {
    this.onDismiss = callback;
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
}
