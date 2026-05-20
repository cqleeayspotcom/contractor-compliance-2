/**
 * Unsaved Changes Guard
 * Prevents navigation away from routes with unsaved changes
 * Shows confirmation dialog before allowing navigation
 */
import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { Observable } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmationDialogComponent } from '../components/shared/confirmation-dialog.component';

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

  // No custom dialog: fall back to the shared Material confirmation dialog
  // (replaces the native browser `confirm()`).
  const dialog = inject(MatDialog);
  return ConfirmationDialogComponent.open(dialog, {
    title: 'Modifications non enregistrées',
    message:
      'Vous avez des modifications non enregistrées qui seront perdues si vous quittez cette page. Voulez-vous vraiment partir ?',
    confirmText: 'Quitter',
    cancelText: 'Rester',
    type: 'warning',
  });
};
