import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './confirm-dialog.html',
})
export class ConfirmDialogComponent {
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ConfirmDialogComponent>);

  readonly isDeleting = signal(false);
  readonly error = signal<string | null>(null);

  async confirm(): Promise<void> {
    this.isDeleting.set(true);
    this.error.set(null);
    try {
      await this.data.onConfirm();
      this.dialogRef.close();
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      this.isDeleting.set(false);
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
