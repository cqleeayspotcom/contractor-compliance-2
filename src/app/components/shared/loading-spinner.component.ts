import { Component, Input, booleanAttribute } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * LoadingSpinner Component
 *
 * A reusable loading indicator with Tuita colors and different sizes.
 * Can be used standalone or as an overlay.
 *
 * @example
 * ```html
 * <!-- Basic usage -->
 * <app-loading-spinner></app-loading-spinner>
 *
 * <!-- With size -->
 * <app-loading-spinner size="lg"></app-loading-spinner>
 *
 * <!-- With message -->
 * <app-loading-spinner message="Loading data..."></app-loading-spinner>
 *
 * <!-- As overlay -->
 * <app-loading-spinner overlay></app-loading-spinner>
 *
 * <!-- Overlay with message -->
 * <app-loading-spinner overlay message="Processing..."></app-loading-spinner>
 * ```
 */
@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loading-spinner.component.html',
  styleUrl: './loading-spinner.component.scss'
})
export class LoadingSpinnerComponent {
  /**
   * Size variant for the spinner
   * - sm: 24px - Small spinner for buttons, inline loading
   * - md: 48px - Medium spinner for cards, sections (default)
   * - lg: 72px - Large spinner for pages, full-screen loading
   */
  @Input() size: 'sm' | 'md' | 'lg' = 'md';

  /**
   * Optional loading message to display below the spinner
   */
  @Input() message: string = '';

  /**
   * Whether to display the spinner as a full-screen overlay
   * When true, adds a semi-transparent backdrop
   */
  @Input({ transform: booleanAttribute }) overlay: boolean = false;

  /**
   * Additional CSS classes to apply to the host element
   */
  @Input() class: string = '';

  /**
   * Get the spinner size in pixels based on the size variant
   */
  get spinnerSize(): number {
    const sizeMap = { sm: 24, md: 48, lg: 72 };
    return sizeMap[this.size];
  }

  /**
   * Get the stroke width based on the size variant
   * Larger spinners have proportionally thicker strokes
   */
  get strokeWidth(): number {
    const strokeMap = { sm: 3, md: 4, lg: 5 };
    return strokeMap[this.size];
  }

  /**
   * Get the appropriate CSS class for the message based on size
   */
  get messageClass(): string {
    return `loading-spinner-message loading-spinner-message-${this.size}`;
  }

  /**
   * Get computed host classes
   */
  get hostClasses(): string {
    const classes = ['loading-spinner'];

    if (this.overlay) {
      classes.push('loading-spinner-overlay');
    }

    if (this.size) {
      classes.push(`loading-spinner-${this.size}`);
    }

    if (this.class) {
      classes.push(this.class);
    }

    return classes.join(' ');
  }
}
