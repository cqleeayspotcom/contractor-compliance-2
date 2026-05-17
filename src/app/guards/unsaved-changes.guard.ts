/**
 * Unsaved Changes Guard
 * Prevents navigation away from routes with unsaved changes
 * Shows confirmation dialog before allowing navigation
 */
import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { Observable } from 'rxjs';

/**
 * Interface for components that can have unsaved changes
 * Components should implement this interface to use the unsaved changes guard
 */
export interface CanComponentDeactivate {
  /**
   * Check if the component has unsaved changes
   * @returns true if there are unsaved changes, false otherwise
   */
  hasUnsavedChanges: () => boolean;

  /**
   * Optional: Show custom confirmation dialog
   * If not provided, a default browser confirm dialog will be used
   * @returns Observable<boolean> or boolean indicating if navigation should proceed
   */
  showUnsavedChangesDialog?: () => Observable<boolean> | Promise<boolean> | boolean;
}

/**
 * Guard function that checks for unsaved changes before navigation
 * Works with components implementing CanComponentDeactivate interface
 */
export const unsavedChangesGuard: CanDeactivateFn<CanComponentDeactivate> = (
  component: CanComponentDeactivate
) => {
  // Check if component has unsaved changes
  if (!component.hasUnsavedChanges || !component.hasUnsavedChanges()) {
    // No unsaved changes, allow navigation
    return true;
  }

  // Component has unsaved changes, check for custom dialog
  if (component.showUnsavedChangesDialog) {
    // Use component's custom dialog
    return component.showUnsavedChangesDialog();
  }

  // Use default browser confirmation dialog
  const confirmationMessage = `
    You have unsaved changes that will be lost if you leave this page.
    Are you sure you want to leave?
  `;

  // Show confirmation dialog
  // Note: In production, you might want to use a modal service instead
  return confirm(confirmationMessage);
};

/**
 * Alternative guard that uses a custom modal/dialog service
 * This is a more user-friendly approach than browser confirm
 */
export const unsavedChangesWithModalGuard = (
  modalService: any // Replace with your actual modal/dialog service
): CanDeactivateFn<CanComponentDeactivate> => {
  return (component: CanComponentDeactivate) => {
    if (!component.hasUnsavedChanges || !component.hasUnsavedChanges()) {
      return true;
    }

    if (component.showUnsavedChangesDialog) {
      return component.showUnsavedChangesDialog();
    }

    // Use custom modal service instead of browser confirm
    // This should be replaced with your actual modal service implementation
    return modalService.confirm({
      title: 'Unsaved Changes',
      message: 'You have unsaved changes. Do you want to leave?',
      confirmText: 'Leave',
      cancelText: 'Stay'
    });
  };
};
