import { Component, OnInit, signal, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { VehicleService } from '../../core/vehicles/vehicle.service';
import type { Vehicle } from '../../core/models/vehicle.model';

@Component({
  selector: 'app-vehicle-list',
  imports: [DecimalPipe, MatCardModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './vehicle-list.html',
})
export class VehicleListComponent implements OnInit {
  private readonly vehicleService = inject(VehicleService);
  private readonly router = inject(Router);

  vehicles = signal<Vehicle[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const result = await this.vehicleService.getVehicles();
      this.vehicles.set(result);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load vehicles');
    } finally {
      this.isLoading.set(false);
    }
  }

  addCar(): void {
    this.router.navigate(['/dashboard/vehicles/new']);
  }

  openVehicle(id: string): void {
    this.router.navigate(['/dashboard/vehicles', id]);
  }
}
