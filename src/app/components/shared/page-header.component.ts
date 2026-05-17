import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { TuitaIconComponent } from './tuita-icon.component';

/**
 * Breadcrumb item interface
 */
export interface BreadcrumbItem {
  label: string;
  path?: string;
}

/**
 * PageHeader Component
 *
 * A standard page header component with title, subtitle,
 * breadcrumb navigation, and action buttons slot.
 *
 * @example
 * ```html
 * <!-- Basic page header -->
 * <app-page-header
 *   title="Documents"
 *   subtitle="Manage and verify your documents"
 * ></app-page-header>
 *
 * <!-- With breadcrumbs -->
 * <app-page-header
 *   title="Document Details"
 *   subtitle="Review and verify document information"
 *   [breadcrumbs]="[
 *     { label: 'Home', path: '/dashboard' },
 *     { label: 'Documents', path: '/documents' },
 *     { label: 'Details' }
 *   ]"
 * ></app-page-header>
 *
 * <!-- With custom actions -->
 * <app-page-header
 *   title="Employees"
 *   subtitle="Manage your employee list"
 *   [showBackButton]="true"
 *   [backButtonPath]="/employees"
 * >
 *   <ng-content select="[actions]"></ng-content>
 * </app-page-header>
 * ```
 */
@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [CommonModule, RouterLink, TuitaIconComponent],
  templateUrl: './page-header.component.html',
  styleUrl: './page-header.component.scss'
})
export class PageHeaderComponent {
  /**
   * Page title
   */
  @Input() title: string = '';

  /**
   * Optional subtitle or description
   */
  @Input() subtitle: string = '';

  /**
   * Breadcrumb navigation items
   * Last item is considered current page (no link)
   */
  @Input() breadcrumbs: BreadcrumbItem[] = [];

  /**
   * Whether to show a back button
   */
  @Input() showBackButton: boolean = false;

  /**
   * Path for back button
   * If not provided, uses router.back()
   */
  @Input() backButtonPath: string = '';

  /**
   * Icon for back button
   */
  @Input() backButtonIcon: string = 'arrow-back';

  /**
   * Text for back button (accessible label)
   */
  @Input() backButtonText: string = 'Back';

  /**
   * Whether to show breadcrumbs
   */
  @Input() showBreadcrumbs: boolean = true;

  /**
   * Additional CSS classes to apply to the host element
   */
  @Input() class: string = '';

  constructor(private router: Router) {}

  /**
   * Handle back button click
   */
  onBackClick(): void {
    if (this.backButtonPath) {
      this.router.navigate([this.backButtonPath]);
    } else {
      // Use browser history if no specific path provided
      window.history.back();
    }
  }

  /**
   * Check if breadcrumb item is the last one (current page)
   */
  isLastBreadcrumb(index: number): boolean {
    return index === this.breadcrumbs.length - 1;
  }

  /**
   * Get computed CSS classes for the page header container
   */
  get headerClasses(): string {
    const classes = ['page-header'];

    if (this.class) {
      classes.push(this.class);
    }

    return classes.join(' ');
  }

  /**
   * Check if there are any breadcrumbs to display
   */
  get hasBreadcrumbs(): boolean {
    return this.showBreadcrumbs && this.breadcrumbs.length > 0;
  }
}
