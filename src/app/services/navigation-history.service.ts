import { Injectable, inject } from '@angular/core';
import { Location } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

/**
 * Tracks intra-app navigation so the back button can return to the actual
 * previous page instead of always falling back to /dashboard.
 */
@Injectable({ providedIn: 'root' })
export class NavigationHistoryService {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private internalNavCount = 0;

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        this.internalNavCount += 1;
      });
  }

  /** True when at least one in-app navigation occurred before the current page. */
  canGoBack(): boolean {
    return this.internalNavCount > 1;
  }

  back(fallback: string | unknown[]): void {
    if (this.canGoBack()) {
      this.location.back();
      return;
    }
    if (Array.isArray(fallback)) {
      this.router.navigate(fallback);
    } else {
      this.router.navigateByUrl(fallback);
    }
  }
}
