import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Observable } from 'rxjs';

export type ConfirmationDialogType = 'error' | 'warning' | 'info' | 'success';

export interface ConfirmationDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: ConfirmationDialogType;
  /** Override icon (Material Symbols name). If omitted, deduced from `type`. */
  icon?: string;
  showIcon?: boolean;
}

/**
 * Reusable confirmation dialog. Replaces native `confirm()` calls.
 *
 * @example
 * ```ts
 * import { ConfirmationDialogComponent } from '@/components/shared/confirmation-dialog.component';
 *
 * constructor(private dialog: MatDialog) {}
 *
 * confirmDelete() {
 *   ConfirmationDialogComponent.open(this.dialog, {
 *     title: 'Supprimer ce document ?',
 *     message: 'Cette action est irréversible.',
 *     confirmText: 'Supprimer',
 *     type: 'error',
 *   }).subscribe(ok => {
 *     if (ok) this.delete();
 *   });
 * }
 * ```
 */
@Component({
  selector: 'app-confirmation-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './confirmation-dialog.component.html',
  styleUrl: './confirmation-dialog.component.scss',
})
export class ConfirmationDialogComponent {
  readonly title: string;
  readonly message: string;
  readonly confirmText: string;
  readonly cancelText: string;
  readonly type: ConfirmationDialogType;
  readonly showIcon: boolean;
  private readonly customIcon: string;

  constructor(
    public dialogRef: MatDialogRef<ConfirmationDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) data: ConfirmationDialogData,
  ) {
    this.title = data.title;
    this.message = data.message;
    this.confirmText = data.confirmText ?? 'Confirmer';
    this.cancelText = data.cancelText ?? 'Annuler';
    this.type = data.type ?? 'info';
    this.showIcon = data.showIcon ?? true;
    this.customIcon = data.icon ?? '';
  }

  /**
   * Helper static : ouvre le dialog et expose un Observable<boolean>
   * (true si confirmé, false sinon — y compris fermeture par escape/backdrop).
   */
  static open(dialog: MatDialog, data: ConfirmationDialogData): Observable<boolean> {
    const ref = dialog.open<ConfirmationDialogComponent, ConfirmationDialogData, boolean>(
      ConfirmationDialogComponent,
      {
        data,
        width: '420px',
        maxWidth: 'calc(100vw - 32px)',
        autoFocus: 'first-tabbable',
        restoreFocus: true,
      },
    );
    return new Observable((sub) => {
      const subscription = ref.afterClosed().subscribe((result) => {
        sub.next(result === true);
        sub.complete();
      });
      return () => subscription.unsubscribe();
    });
  }

  get displayIcon(): string {
    if (this.customIcon) return this.customIcon;
    const map: Record<ConfirmationDialogType, string> = {
      error: 'error',
      warning: 'warning',
      info: 'info',
      success: 'check_circle',
    };
    return map[this.type];
  }

  get dialogClasses(): string {
    return `confirmation-dialog confirmation-dialog--${this.type}`;
  }

  onConfirm(): void {
    this.dialogRef.close(true);
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}
