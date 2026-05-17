import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Loading Service
 * Manages loading state across the application
 * Used by LoadingInterceptor to show/hide loading indicators
 */
@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private requestCount = 0;
  private loadingRequests = new Set<string>();

  /**
   * Observable for components to subscribe to loading state changes
   */
  public loading$: Observable<boolean> = this.loadingSubject.asObservable();

  /**
   * Current loading state value
   */
  get loading(): boolean {
    return this.loadingSubject.value;
  }

  /**
   * Show loading indicator
   * Increments request count to handle multiple concurrent requests
   */
  show(): void {
    this.requestCount++;
    if (this.requestCount === 1) {
      this.loadingSubject.next(true);
    }
  }

  /**
   * Hide loading indicator
   * Decrements request count, only hides when all requests complete
   */
  hide(): void {
    this.requestCount--;
    if (this.requestCount <= 0) {
      this.requestCount = 0;
      this.loadingSubject.next(false);
    }
  }

  /**
   * Show loading for a specific request
   * @param requestUrl - URL of the request to track
   */
  showForRequest(requestUrl: string): void {
    this.loadingRequests.add(requestUrl);
    this.show();
  }

  /**
   * Hide loading for a specific request
   * @param requestUrl - URL of the completed request
   */
  hideForRequest(requestUrl: string): void {
    this.loadingRequests.delete(requestUrl);
    if (this.loadingRequests.size === 0) {
      this.hide();
    }
  }

  /**
   * Force hide all loading indicators
   * Useful for error scenarios or manual cleanup
   */
  forceHide(): void {
    this.requestCount = 0;
    this.loadingRequests.clear();
    this.loadingSubject.next(false);
  }

  /**
   * Reset loading state
   * Clears all tracking and resets to initial state
   */
  reset(): void {
    this.requestCount = 0;
    this.loadingRequests.clear();
    this.loadingSubject.next(false);
  }
}
