import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { VehicleService } from '../../core/vehicles/vehicle.service';
import { AiScheduleService } from '../../core/ai-schedule/ai-schedule.service';
import { ServiceRecordService } from '../../core/service-records/service-record.service';
import type { Vehicle } from '../../core/models/vehicle.model';
import type { ScheduleItem } from '../../core/models/schedule-item.model';

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

  private abortController: AbortController | null = null;

  vehicle = signal<Vehicle | null>(null);
  scheduleItems = signal<ScheduleItem[]>([]);
  isLoading = signal(true);
  isGenerating = signal(false);
  error = signal<string | null>(null);

  expandedItem = signal<ScheduleItem | null>(null);
  isSaving = signal(false);
  saveError = signal<string | null>(null);
  regenPromptVisible = signal(false);
  mileageSyncWarning = signal(false);

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

    if (this.vehicle()!.ai_schedule?.length) {
      this.scheduleItems.set(this.vehicle()!.ai_schedule!);
      return;
    }
    await this.generateSchedule();
  }

  async generateSchedule(): Promise<void> {
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.isGenerating.set(true);
    this.error.set(null);
    try {
      const items = await this.aiScheduleService.generateAndSave(this.vehicle()!, this.abortController.signal);
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
    this.isSaving.set(true);
    this.saveError.set(null);

    const { service_date, mileage, notes } = this.markDoneForm.getRawValue();

    try {
      await this.serviceRecordService.createServiceRecord({
        vehicle_id: this.vehicle()!.id,
        label: this.expandedItem()!.item,
        service_date: service_date!,
        mileage: mileage!,
        notes: notes || null,
      });
    } catch (err: unknown) {
      this.saveError.set(err instanceof Error ? err.message : 'Failed to save record');
      this.isSaving.set(false);
      return;
    }

    if (mileage! > (this.vehicle()!.current_mileage ?? 0)) {
      try {
        const updated = await this.vehicleService.updateVehicle(this.vehicle()!.id, { current_mileage: mileage! });
        this.vehicle.set(updated);
      } catch {
        this.mileageSyncWarning.set(true);
      }
    }

    this.expandedItem.set(null);
    this.isSaving.set(false);
    this.regenPromptVisible.set(true);
  }

  ngOnDestroy(): void {
    this.abortController?.abort();
  }
}
