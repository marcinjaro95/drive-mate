import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { VehicleService } from '../../core/vehicles/vehicle.service';
import { AiScheduleService } from '../../core/ai-schedule/ai-schedule.service';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ServiceRecordService } from '../../core/service-records/service-record.service';
import type { Vehicle } from '../../core/models/vehicle.model';
import type { ScheduleItem } from '../../core/models/schedule-item.model';
import type { ServiceRecord } from '../../core/models/service-record.model';

@Component({
  selector: 'app-schedule-view',
  imports: [
    DecimalPipe,
    MatCardModule,
    MatChipsModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatSnackBarModule,
    RouterModule,
  ],
  templateUrl: './schedule-view.html',
  styleUrl: './schedule-view.scss',
})
export class ScheduleViewComponent implements OnInit, OnDestroy {
  private readonly vehicleService = inject(VehicleService);
  private readonly aiScheduleService = inject(AiScheduleService);
  private readonly serviceRecordService = inject(ServiceRecordService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  private abortController: AbortController | null = null;

  vehicle = signal<Vehicle | null>(null);
  scheduleItems = signal<ScheduleItem[]>([]);
  isLoading = signal(true);
  isGenerating = signal(false);
  error = signal<string | null>(null);

  expandedItem = signal<ScheduleItem | null>(null);
  isSaving = signal(false);
  saveError = signal<string | null>(null);
  mileageSyncWarning = signal(false);
  savedItems = signal<Set<string>>(new Set());
  serviceRecordsUnavailable = signal(false);

  markDoneForm = this.fb.group({
    service_date: ['', Validators.required],
    mileage: [null as number | null, [Validators.required, Validators.min(0)]],
    notes: [null as string | null],
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.params['id'];
    try {
      const v = await this.vehicleService.getVehicle(id);
      if (!v) {
        await this.router.navigate(['/dashboard']);
        return;
      }
      this.vehicle.set(v);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load vehicle');
      this.isLoading.set(false);
      return;
    }
    this.isLoading.set(false);

    const vehicleForInit = this.vehicle();
    if (!vehicleForInit) return;

    let loadedRecords: ServiceRecord[] = [];
    try {
      loadedRecords = await this.serviceRecordService.getServiceRecords(vehicleForInit.id);
    } catch (err: unknown) {
      console.warn('Service records unavailable — schedule will be generated without history', err);
      this.serviceRecordsUnavailable.set(true);
      this.snackBar.open(
        'Schedule generated without service history — some intervals may be approximate.',
        'Dismiss',
        { duration: 5000 },
      );
    }
    this.savedItems.set(
      new Set(
        loadedRecords.map((r) => r.schedule_item_id).filter((id): id is string => id !== null),
      ),
    );

    if (vehicleForInit.ai_schedule?.length) {
      this.scheduleItems.set(vehicleForInit.ai_schedule!);
      return;
    }
    await this.generateSchedule(loadedRecords);
  }

  async generateSchedule(preloadedRecords?: ServiceRecord[]): Promise<void> {
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.isGenerating.set(true);
    this.error.set(null);
    this.serviceRecordsUnavailable.set(false);
    try {
      let serviceRecords: ServiceRecord[] = preloadedRecords ?? [];
      if (!preloadedRecords) {
        try {
          serviceRecords = await this.serviceRecordService.getServiceRecords(this.vehicle()!.id);
        } catch (err: unknown) {
          console.warn('Service records unavailable — schedule will be generated without history', err);
          this.serviceRecordsUnavailable.set(true);
          this.snackBar.open(
            'Schedule generated without service history — some intervals may be approximate.',
            'Dismiss',
            { duration: 5000 },
          );
        }
      }
      const items = await this.aiScheduleService.generateAndSave(
        this.vehicle()!,
        this.abortController.signal,
        serviceRecords,
      );
      this.scheduleItems.set(items);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      this.error.set(err instanceof Error ? err.message : 'Failed to generate schedule');
    } finally {
      this.isGenerating.set(false);
    }
  }

  retry(): void {
    this.generateSchedule();
  }

  openDeleteDialog(): void {
    const v = this.vehicle();
    if (!v) return;
    this.abortController?.abort();
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: `Delete ${v.year} ${v.make} ${v.model}`,
        message: `Deleting this car will also permanently remove all its service records. This cannot be undone.`,
        onConfirm: async () => {
          await this.vehicleService.deleteVehicle(v.id);
          await this.router.navigate(['/dashboard']);
        },
      },
    });
  }

  openMarkDone(item: ScheduleItem): void {
    const today = new Date().toISOString().split('T')[0];
    this.markDoneForm.reset({
      service_date: today,
      mileage: this.vehicle()?.current_mileage ?? null,
      notes: null,
    });
    this.saveError.set(null);
    this.expandedItem.set(item);
  }

  cancelMarkDone(): void {
    this.expandedItem.set(null);
    this.saveError.set(null);
  }

  async saveMarkDone(): Promise<void> {
    if (this.markDoneForm.invalid || this.isSaving()) return;
    const vehicle = this.vehicle()!;
    const item = this.expandedItem()!;
    this.isSaving.set(true);
    this.saveError.set(null);

    const { service_date, mileage, notes } = this.markDoneForm.getRawValue();

    try {
      try {
        await this.serviceRecordService.createServiceRecord({
          vehicle_id: vehicle.id,
          label: item.item,
          schedule_item_id: item.id,
          service_date: service_date!,
          mileage: mileage!,
          notes: notes || null,
        });
      } catch (err: unknown) {
        this.saveError.set(err instanceof Error ? err.message : 'Failed to save record');
        return;
      }

      if (mileage! > (vehicle.current_mileage ?? 0)) {
        try {
          const updated = await this.vehicleService.updateVehicle(vehicle.id, {
            current_mileage: mileage!,
          });
          this.vehicle.set(updated);
        } catch {
          this.mileageSyncWarning.set(true);
          this.vehicle.set({ ...vehicle, current_mileage: mileage! });
        }
      }

      this.expandedItem.set(null);
      this.savedItems.update((s) => new Set([...s, item.id]));
      this.dialog.open(ConfirmDialogComponent, {
        data: {
          title: 'Regenerate schedule?',
          message:
            'Service recorded. The AI schedule may be outdated — regenerate now to reflect the latest service history.',
          confirmLabel: 'Regenerate',
          onConfirm: async () => {
            await this.generateSchedule();
          },
        },
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  urgencyClass(urgency: string): string {
    return 'urgency-chip chip-' + urgency.replace('_', '-');
  }

  ngOnDestroy(): void {
    this.abortController?.abort();
  }
}
