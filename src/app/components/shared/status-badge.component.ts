import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TuitaIconComponent } from './tuita-icon.component';

/**
 * Status badge type variants
 */
export type StatusBadgeType =
  | 'pending'
  | 'in-progress'
  | 'processing'
  | 'verified'
  | 'pending_manual_review'
  | 'rejected'
  | 'approved'
  | 'denied'
  | 'active'
  | 'inactive'
  | 'suspended'
  | 'expired'
  | 'legally_outdated'
  | 'draft'
  | 'published'
  | 'archived'
  | 'success'
  | 'error'
  | 'warning'
  | 'info'
  | 'custom';

/**
 * StatusBadge Component
 *
 * A reusable status badge component with different styles
 * for various statuses. Supports pill and rounded styles.
 *
 * @example
 * ```html
 * <!-- Basic usage -->
 * <app-status-badge status="pending"></app-status-badge>
 *
 * <!-- With custom text -->
 * <app-status-badge status="verified" text="Verified"></app-status-badge>
 *
 * <!-- Pill style (default) -->
 * <app-status-badge status="active" shape="pill"></app-status-badge>
 *
 * <!-- Rounded style -->
 * <app-status-badge status="inactive" shape="rounded"></app-status-badge>
 *
 * <!-- With custom colors -->
 * <app-status-badge
 *   status="custom"
 *   text="In Review"
 *   backgroundColor="#E3F2FD"
 *   textColor="#073148"
 * ></app-status-badge>
 *
 * <!-- Small size -->
 * <app-status-badge status="error" size="sm"></app-status-badge>
 * ```
 */
@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule, TuitaIconComponent],
  templateUrl: './status-badge.component.html',
  styleUrl: './status-badge.component.scss'
})
export class StatusBadgeComponent {
  /**
   * Status type
   * Determines the color scheme and default text
   */
  @Input() status: StatusBadgeType = 'pending';

  /**
   * Custom badge text
   * If not provided, uses default text based on status
   */
  @Input() text: string = '';

  /**
   * Badge shape variant
   * - pill: Fully rounded ends (default)
   * - rounded: Slightly rounded corners
   * - square: Square corners
   */
  @Input() shape: 'pill' | 'rounded' | 'square' = 'pill';

  /**
   * Badge size
   * - sm: Small badge (12px font, 20px height)
   * - md: Medium badge (14px font, 24px height) - default
   * - lg: Large badge (16px font, 28px height)
   */
  @Input() size: 'sm' | 'md' | 'lg' = 'md';

  /**
   * Custom background color (for custom status)
   */
  @Input() backgroundColor: string = '';

  /**
   * Custom text color (for custom status)
   */
  @Input() textColor: string = '';

  /**
   * Additional CSS classes to apply to the host element
   */
  @Input() class: string = '';

  /**
   * Whether to show a dot indicator before the text
   */
  @Input() showDot: boolean = false;

  /**
   * Get default text for the status
   */
  get defaultText(): string {
    const textMap: Record<StatusBadgeType, string> = {
      'pending': 'En attente',
      'in-progress': 'En cours',
      'processing': 'En cours',
      'verified': 'Vérifié',
      'pending_manual_review': 'À vérifier',
      'rejected': 'Rejeté',
      'approved': 'Approuvé',
      'denied': 'Refusé',
      'active': 'Actif',
      'inactive': 'Inactif',
      'suspended': 'Suspendu',
      'expired': 'Expiré',
      'legally_outdated': 'Périmé',
      'draft': 'Brouillon',
      'published': 'Publié',
      'archived': 'Archivé',
      'success': 'Succès',
      'error': 'Erreur',
      'warning': 'Attention',
      'info': 'Info',
      'custom': 'Custom'
    };
    return textMap[this.status] || 'Unknown';
  }

  /**
   * Get display text
   * Uses custom text if provided, otherwise defaults to status text
   */
  get displayText(): string {
    return this.text || this.defaultText;
  }

  /**
   * Get icon for the status
   */
  get iconName(): string {
    const iconMap: Record<StatusBadgeType, string> = {
      'pending': 'hourglass-empty',
      'in-progress': 'pending',
      'processing': 'hourglass-empty',
      'verified': 'check-circle',
      'pending_manual_review': 'pending',
      'rejected': 'error',
      'approved': 'check-circle',
      'denied': 'close-circle',
      'active': 'check-circle',
      'inactive': 'pause',
      'suspended': 'error',
      'expired': 'warning-amber',
      'legally_outdated': 'warning-amber',
      'draft': 'edit',
      'published': 'check-circle',
      'archived': 'archive',
      'success': 'check-circle',
      'error': 'error',
      'warning': 'warning',
      'info': 'info',
      'custom': 'label'
    };
    return iconMap[this.status] || 'help-outline';
  }

  /**
   * Get computed CSS classes for the badge
   */
  get badgeClasses(): string {
    const classes = ['status-badge'];

    // Add status class
    classes.push(`status-badge-${this.status}`);

    // Add shape class
    classes.push(`status-badge-${this.shape}`);

    // Add size class
    classes.push(`status-badge-${this.size}`);

    // Add custom classes
    if (this.class) {
      classes.push(this.class);
    }

    return classes.join(' ');
  }

  /**
   * Get custom styles for the badge
   */
  get customStyles(): { [key: string]: string } {
    const styles: { [key: string]: string } = {};

    if (this.status === 'custom') {
      if (this.backgroundColor) {
        styles['background-color'] = this.backgroundColor;
      }
      if (this.textColor) {
        styles['color'] = this.textColor;
      }
    }

    return styles;
  }

  /**
   * Check if dot should be shown
   */
  get shouldShowDot(): boolean {
    return this.showDot;
  }
}
