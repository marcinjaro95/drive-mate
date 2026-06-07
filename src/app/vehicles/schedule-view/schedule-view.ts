import { Component, OnInit, signal, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { VehicleService } from '../../core/vehicles/vehicle.service';
import { AiScheduleService } from '../../core/ai-schedule/ai-schedule.service';
import type { Vehicle } from '../../core/models/vehicle.model';
import type { ScheduleItem } from '../../core/models/schedule-item.model';

@Component({
  selector: 'app-schedule-view',
  imports: [DecimalPipe, MatCardModule, MatChipsModule, MatButtonModule, MatProgressSpinnerModule, RouterModule],
  templateUrl: './schedule-view.html',
  styleUrl: './schedule-view.scss',
})
export class ScheduleViewComponent implements OnInit {
  private readonly vehicleService = inject(VehicleService);
  private readonly aiScheduleService = inject(AiScheduleService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  vehicle = signal<Vehicle | null>(null);
  scheduleItems = signal<ScheduleItem[]>([]);
  isLoading = signal(true);
  isGenerating = signal(false);
  error = signal<string | null>(null);

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
    this.isGenerating.set(true);
    this.error.set(null);
    try {
      const items = await this.aiScheduleService.generateAndSave(this.vehicle()!);
      this.scheduleItems.set(items);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to generate schedule');
    } finally {
      this.isGenerating.set(false);
    }
  }

  retry(): void {
    this.generateSchedule();
  }
}
