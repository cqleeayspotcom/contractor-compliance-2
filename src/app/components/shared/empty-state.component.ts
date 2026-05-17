import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TuitaIconComponent } from './tuita-icon.component';

/**
 * EmptyState Component
 *
 * A reusable empty state component for displaying when no data is available.
 * Shows an icon, title, description, and optional action button.
 *
 * @example
 * ```html
 * <!-- Basic empty state -->
 * <app-empty-state
 *   icon="folder"
 *   title="No documents yet"
 *   description="Upload your first document to get started."
 * ></app-empty-state>
 *
 * <!-- With action button -->
 * <app-empty-state
 *   icon="documents"
 *   title="No documents found"
 *   description="There are no documents matching your search criteria."
 *   actionText="Upload Document"
 *   (actionClicked)="uploadDocument()"
 * ></app-empty-state>
 *
 * <!-- With custom icon color -->
 * <app-empty-state
 *   icon="inbox"
 *   iconColor="primary"
 *   title="Inbox empty"
 *   description="Your inbox is empty. New messages will appear here."
 * ></app-empty-state>
 * ```
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule, TuitaIconComponent],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss'
})
export class EmptyStateComponent {
  /**
   * Icon to display
   * Should be a valid icon name from TuitaIconService
   */
  @Input() icon: string = 'inbox';

  /**
   * Icon color variant
   * Options: primary, secondary, error, warning, info, success, light, lighter, muted
   */
  @Input() iconColor: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success' | 'light' | 'lighter' | 'muted' = 'light';

  /**
   * Icon size variant
   */
  @Input() iconSize: 'sm' | 'md' | 'lg' | 'xl' = 'xl';

  /**
   * Title text for the empty state
   */
  @Input() title: string = 'No Data';

  /**
   * Description text for the empty state
   */
  @Input() description: string = 'There is no data to display.';

  /**
   * Text for the optional action button
   * If not provided, no button is shown
   */
  @Input() actionText: string = '';

  /**
   * Whether to compact the layout (less padding)
   */
  @Input() compact: boolean = false;

  /**
   * Additional CSS classes to apply to the host element
   */
  @Input() class: string = '';

  /**
   * Event emitted when the action button is clicked
   */
  @Input() actionClicked: (() => void) | null = null;

  /**
   * Get computed CSS classes for the empty state container
   */
  get containerClasses(): string {
    const classes = ['empty-state'];

    if (this.compact) {
      classes.push('empty-state-compact');
    }

    if (this.class) {
      classes.push(this.class);
    }

    return classes.join(' ');
  }

  /**
   * Handle action button click
   */
  onActionClick(): void {
    if (this.actionClicked) {
      this.actionClicked();
    }
  }

  /**
   * Check if action button should be shown
   */
  get showActionButton(): boolean {
    return this.actionText.length > 0 && this.actionClicked !== null;
  }
}
