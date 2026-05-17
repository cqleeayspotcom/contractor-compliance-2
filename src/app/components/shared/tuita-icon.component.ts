import { Component, Input, OnChanges, OnInit, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { IconService, IconName, IconSize } from '../../services/icon.service';
import { SafeHtml } from '@angular/platform-browser';

/**
 * TuitaIcon Component
 *
 * A reusable icon component that uses Tuita's design system and icon service.
 * All icons are rendered as inline SVGs with proper sizing based on Tuita's design tokens.
 *
 * @example
 * ```html
 * <!-- Basic usage -->
 * <tuita-icon icon="home"></tuita-icon>
 *
 * <!-- With size -->
 * <tuita-icon icon="settings" size="lg"></tuita-icon>
 *
 * <!-- With custom class -->
 * <tuita-icon icon="notifications" class="notification-icon"></tuita-icon>
 *
 * <!-- Clickable icon -->
 * <tuita-icon icon="edit" (click)="editItem()"></tuita-icon>
 * ```
 */
@Component({
  selector: 'tuita-icon, app-tuita-icon',
  templateUrl: './tuita-icon.component.html',
  styleUrls: ['./tuita-icon.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TuitaIconComponent implements OnInit, OnChanges {
  /**
   * Icon name from Tuita's icon set
   */
  @Input() icon: IconName | string = 'home';

  /**
   * Icon size variant
   * - xs: 12px - Extra small icons for inline/compact use
   * - sm: 16px - Small icons for buttons, lists
   * - md: 24px - Medium icons for standard use (default)
   * - lg: 32px - Large icons for emphasis
   * - xl: 48px - Extra large icons for hero sections
   */
  @Input() size: IconSize | string = 'md';

  /**
   * Additional CSS classes to apply to the host element
   */
  @Input() class: string = '';

  /**
   * Whether the icon should be rendered as a clickable element
   * Adds cursor pointer and hover effects
   */
  @Input() clickable: boolean = false;

  /**
   * Whether the icon should spin (useful for loading indicators)
   */
  @Input() spin: boolean = false;

  /**
   * Whether the icon should pulse (useful for attention-grabbing indicators)
   */
  @Input() pulse: boolean = false;

  /**
   * Rotation angle in degrees (90, 180, 270)
   */
  @Input() rotate: 90 | 180 | 270 | null = null;

  /**
   * Whether to flip the icon horizontally
   */
  @Input() flipHorizontal: boolean = false;

  /**
   * Whether to flip the icon vertically
   */
  @Input() flipVertical: boolean = false;

  /**
   * Whether the icon is disabled
   */
  @Input() disabled: boolean = false;

  /**
   * Color variant using Tuita's design tokens
   * - primary: #073148 (Tuita blue)
   * - secondary: #04A777 (Tuita green)
   * - error: #F75C03 (Tuita orange)
   * - warning: #F75C03 (Tuita orange)
   * - info: #073148 (Tuita blue)
   * - success: #04A777 (Tuita green)
   * - light: #8d98a7 (Light grey)
   * - lighter: #adb5c0 (Lighter grey)
   * - muted: #cdd3da (Muted grey)
   */
  @Input()
  set color(color: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success' | 'light' | 'lighter' | 'muted' | null) {
    this._color = color;
    this.updateClasses();
  }
  get color(): 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success' | 'light' | 'lighter' | 'muted' | null {
    return this._color;
  }
  private _color: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success' | 'light' | 'lighter' | 'muted' | null = null;

  /**
   * ARIA label for accessibility
   * If not provided, the icon name will be used as a fallback
   */
  @Input() ariaLabel: string = '';

  /**
   * SVG icon markup
   */
  iconSvg: SafeHtml = '';

  /**
   * Computed CSS classes
   */
  private computedClasses: string[] = [];

  constructor(private iconService: IconService) {
    this.updateClasses();
  }

  ngOnInit(): void {
    this.updateIcon();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Update icon SVG when inputs change
    if (changes['icon'] || changes['size']) {
      this.updateIcon();
    }

    // Update classes when relevant inputs change
    if (changes['clickable'] || changes['spin'] || changes['pulse'] ||
        changes['rotate'] || changes['flipHorizontal'] || changes['flipVertical'] ||
        changes['disabled'] || changes['class']) {
      this.updateClasses();
    }
  }

  /**
   * Update the SVG icon markup
   */
  private updateIcon(): void {
    const iconName = this.icon as IconName;
    if (!this.iconService.hasIcon(iconName)) {
      console.warn(`Icon "${this.icon}" not found in Tuita icon set`);
      // Fallback to a default icon
      this.iconSvg = this.iconService.getIcon('help-outline', this.size as IconSize);
    } else {
      this.iconSvg = this.iconService.getIcon(iconName, this.size as IconSize);
    }
  }

  /**
   * Update CSS classes based on component inputs
   */
  private updateClasses(): void {
    this.computedClasses = [];

    // Add color variant
    if (this._color) {
      this.computedClasses.push(`tuita-icon-${this._color}`);
    }

    // Add clickable class
    if (this.clickable) {
      this.computedClasses.push('tuita-icon-clickable');
    }

    // Add animation classes
    if (this.spin) {
      this.computedClasses.push('tuita-icon-spin');
    }

    if (this.pulse) {
      this.computedClasses.push('tuita-icon-pulse');
    }

    // Add rotation class
    if (this.rotate) {
      this.computedClasses.push(`tuita-icon-rotate-${this.rotate}`);
    }

    // Add flip classes
    if (this.flipHorizontal) {
      this.computedClasses.push('tuita-icon-flip-horizontal');
    }

    if (this.flipVertical) {
      this.computedClasses.push('tuita-icon-flip-vertical');
    }

    // Add disabled class
    if (this.disabled) {
      this.computedClasses.push('tuita-icon-disabled');
    }

    // Add custom classes
    if (this.class) {
      this.computedClasses.push(this.class);
    }

    // Apply classes to host element
    this.applyClassesToHost();
  }

  /**
   * Apply computed classes to the host element
   */
  private applyClassesToHost(): void {
    const hostElement = this.getHostElement();
    if (hostElement) {
      hostElement.className = this.computedClasses.join(' ');
    }
  }

  /**
   * Get the host element
   */
  private getHostElement(): HTMLElement | null {
    // This will be set by Angular when the component is rendered
    return null;
  }

  /**
   * Get the ARIA label for the icon
   * @returns ARIA label string
   */
  getAriaLabel(): string {
    return this.ariaLabel || this.icon.replace(/-/g, ' ');
  }
}
