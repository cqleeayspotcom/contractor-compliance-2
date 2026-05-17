import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { TuitaIconComponent } from './tuita-icon.component';

/**
 * Expiring document interface
 */
export interface ExpiringDocument {
  id: string;
  name: string;
  type: string;
  expiryDate: Date;
  validFrom: Date;
  daysRemaining: number;
}

/**
 * Action button definition for expiring documents
 */
export interface ExpiringDocumentAction {
  label: string;
  icon: string;
  callback: (document: ExpiringDocument) => void;
}

/**
 * ExpiringDocumentsWidget Component
 *
 * Widget for displaying documents expiring in next 30 days:
 * - Shows documents expiring in next 30 days
 * - Countdown timer for each (days remaining)
 * - Progress bar (time elapsed vs validity period)
 * - Color-coded: red (< 7 days), orange (< 14 days), yellow (< 30 days)
 * - Quick action buttons (renew, view)
 * - Collapsed/expanded view
 * - Empty state if none expiring
 *
 * @example
 * ```html
 * <app-expiring-documents-widget
 *   [documents]="expiringDocuments"
 *   [actions]="documentActions"
 *   [expanded]="isExpanded"
 *   (toggle)="onToggle($event)"
 *   (actionClicked)="onActionClick($event)"
 * ></app-expiring-documents-widget>
 * ```
 */
@Component({
  selector: 'app-expiring-documents-widget',
  standalone: true,
  imports: [CommonModule, MatTooltipModule, MatButtonModule, TuitaIconComponent],
  templateUrl: './expiring-documents-widget.component.html',
  styleUrl: './expiring-documents-widget.component.scss'
})
export class ExpiringDocumentsWidgetComponent {
  /**
   * Array of expiring documents to display
   */
  @Input() documents: ExpiringDocument[] = [];

  /**
   * Quick action buttons to display for each document
   */
  @Input() actions: ExpiringDocumentAction[] = [];

  /**
   * Whether the widget is expanded
   */
  @Input() expanded: boolean = true;

  /**
   * Maximum number of documents to show when collapsed
   */
  @Input() maxCollapsedDocuments: number = 3;

  /**
   * Empty state message
   */
  @Input() emptyMessage: string = 'No documents expiring soon';

  /**
   * Empty state sub-message
   */
  @Input() emptySubMessage: string = 'All your documents are up to date!';

  /**
   * Additional CSS classes to apply
   */
  @Input() class: string = '';

  /**
   * Event emitted when widget is toggled (expanded/collapsed)
   */
  @Output() toggle = new EventEmitter<boolean>();

  /**
   * Event emitted when an action is clicked
   */
  @Output() actionClicked = new EventEmitter<{ document: ExpiringDocument; action: ExpiringDocumentAction }>();

  /**
   * Get documents to display based on expanded state
   */
  get displayDocuments(): ExpiringDocument[] {
    if (this.expanded) {
      return this.documents;
    }
    return this.documents.slice(0, this.maxCollapsedDocuments);
  }

  /**
   * Get count of hidden documents when collapsed
   */
  get hiddenDocumentsCount(): number {
    if (this.expanded) return 0;
    return Math.max(0, this.documents.length - this.maxCollapsedDocuments);
  }

  /**
   * Check if there are any expiring documents
   */
  get hasExpiringDocuments(): boolean {
    return this.documents.length > 0;
  }

  /**
   * Get computed CSS classes for the widget
   */
  get widgetClasses(): string {
    const classes = ['expiring-documents-widget'];

    if (!this.expanded) {
      classes.push('expiring-documents-widget-collapsed');
    }

    if (this.class) {
      classes.push(this.class);
    }

    return classes.join(' ');
  }

  /**
   * Get severity class for a document based on days remaining
   */
  getDocumentSeverityClass(document: ExpiringDocument): string {
    if (document.daysRemaining < 7) return 'severity-critical';
    if (document.daysRemaining < 14) return 'severity-warning';
    return 'severity-caution';
  }

  /**
   * Get color class for progress bar
   */
  getProgressColorClass(document: ExpiringDocument): string {
    if (document.daysRemaining < 7) return 'progress-red';
    if (document.daysRemaining < 14) return 'progress-orange';
    return 'progress-yellow';
  }

  /**
   * Calculate progress percentage for a document
   */
  calculateProgress(document: ExpiringDocument): number {
    const validFrom = new Date(document.validFrom).getTime();
    const expiryDate = new Date(document.expiryDate).getTime();
    const now = Date.now();

    const totalDuration = expiryDate - validFrom;
    const elapsed = now - validFrom;

    const percentage = (elapsed / totalDuration) * 100;
    return Math.max(0, Math.min(100, percentage));
  }

  /**
   * Handle widget toggle
   */
  onToggleClick(): void {
    this.expanded = !this.expanded;
    this.toggle.emit(this.expanded);
  }

  /**
   * Handle action button click
   */
  onActionClick(document: ExpiringDocument, action: ExpiringDocumentAction): void {
    this.actionClicked.emit({ document, action });
    action.callback(document);
  }
}
