import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TuitaIconComponent } from './tuita-icon.component';

/**
 * Compliance score breakdown item
 */
export interface ComplianceScoreBreakdown {
  label: string;
  value: number;
  total: number;
  icon: string;
  color: string;
}

/**
 * Compliance score suggestion
 */
export interface ComplianceSuggestion {
  title: string;
  description: string;
  actionLabel: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * ComplianceScoreCard Component
 *
 * Visual compliance score card with:
 * - Circular progress chart (0-100%)
 * - Color-coded: red (< 50%), orange (50-79%), green (80-100%)
 * - Animated progress on load
 * - Score breakdown:
 *   - Documents verified
 *   - KYC completed
 *   - Subscription active
 * - "Improve score" button with suggestions
 * - Mat-tooltip on hover showing details
 *
 * @example
 * ```html
 * <app-compliance-score-card
 *   [score]="85"
 *   [breakdown]="scoreBreakdown"
 *   [suggestions]="improvementSuggestions"
 *   (improveClick)="onImproveScore()"
 * ></app-compliance-score-card>
 * ```
 */
@Component({
  selector: 'app-compliance-score-card',
  standalone: true,
  imports: [CommonModule, TuitaIconComponent],
  templateUrl: './compliance-score-card.component.html',
  styleUrl: './compliance-score-card.component.scss'
})
export class ComplianceScoreCardComponent implements OnInit {
  /**
   * Overall compliance score (0-100)
   */
  @Input() score: number = 0;

  /**
   * Score breakdown items
   */
  @Input() breakdown: ComplianceScoreBreakdown[] = [];

  /**
   * Improvement suggestions
   */
  @Input() suggestions: ComplianceSuggestion[] = [];

  /**
   * Whether to show the breakdown section
   */
  @Input() showBreakdown: boolean = true;

  /**
   * Whether to show the suggestions section
   */
  @Input() showSuggestions: boolean = true;

  /**
   * Whether to show the "Improve score" button
   */
  @Input() showImproveButton: boolean = true;

  /**
   * Custom title for the card
   */
  @Input() title: string = 'Compliance Score';

  /**
   * Additional CSS classes to apply
   */
  @Input() class: string = '';

  /**
   * Event emitted when "Improve score" button is clicked
   */
  @Output() improveClick = new EventEmitter<void>();

  /**
   * Event emitted when a suggestion is clicked
   */
  @Output() suggestionClick = new EventEmitter<ComplianceSuggestion>();

  /**
   * Animated score value for animation
   */
  animatedScore: number = 0;

  /**
   * Whether the score animation is complete
   */
  animationComplete: boolean = false;

  /**
   * Get color class based on score
   */
  get scoreColor(): string {
    if (this.score < 50) return 'score-red';
    if (this.score < 80) return 'score-orange';
    return 'score-green';
  }

  /**
   * Get color value for SVG stroke
   */
  get strokeColor(): string {
    if (this.score < 50) return '#DC2626';
    if (this.score < 80) return '#F59E0B';
    return '#04A777';
  }

  /**
   * Get score status label
   */
  get scoreStatus(): string {
    if (this.score < 50) return 'Needs Improvement';
    if (this.score < 80) return 'Good';
    return 'Excellent';
  }

  /**
   * Get computed CSS classes for the card
   */
  get cardClasses(): string {
    const classes = ['compliance-score-card', this.scoreColor];

    if (this.class) {
      classes.push(this.class);
    }

    return classes.join(' ');
  }

  /**
   * Calculate circular progress dash offset
   */
  get dashOffset(): number {
    const circumference = 2 * Math.PI * 45; // radius = 45
    const progress = this.animatedScore / 100;
    return circumference * (1 - progress);
  }

  /**
   * Calculate dash array for circle
   */
  get dashArray(): number {
    return 2 * Math.PI * 45;
  }

  /**
   * Get filtered suggestions by priority
   */
  get highPrioritySuggestions(): ComplianceSuggestion[] {
    return this.suggestions.filter(s => s.priority === 'high');
  }

  /**
   * Check if there are any suggestions
   */
  get hasSuggestions(): boolean {
    return this.suggestions.length > 0;
  }

  /**
   * Check if score is excellent (for display purposes)
   */
  get isExcellentScore(): boolean {
    return this.score >= 80;
  }

  /**
   * Check if score needs improvement
   */
  get needsImprovement(): boolean {
    return this.score < 50;
  }

  ngOnInit(): void {
    this.animateScore();
  }

  /**
   * Animate the score value on load
   */
  private animateScore(): void {
    const duration = 1500; // 1.5 seconds
    const steps = 60;
    const increment = this.score / steps;
    const stepDuration = duration / steps;

    let currentStep = 0;

    const animationInterval = setInterval(() => {
      currentStep++;
      this.animatedScore = Math.min(this.score, Math.round(increment * currentStep));

      if (currentStep >= steps) {
        clearInterval(animationInterval);
        this.animationComplete = true;
      }
    }, stepDuration);
  }

  /**
   * Handle "Improve score" button click
   */
  onImproveClick(): void {
    this.improveClick.emit();
  }

  /**
   * Handle suggestion click
   */
  onSuggestionClick(suggestion: ComplianceSuggestion): void {
    this.suggestionClick.emit(suggestion);
  }

  /**
   * Calculate percentage for breakdown item
   */
  calculateBreakdownPercentage(item: ComplianceScoreBreakdown): number {
    if (item.total === 0) return 0;
    return Math.round((item.value / item.total) * 100);
  }

  /**
   * Get priority class for suggestion
   */
  getSuggestionPriorityClass(suggestion: ComplianceSuggestion): string {
    return `priority-${suggestion.priority}`;
  }
}
