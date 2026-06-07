import { Component, OnInit, signal, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { VehicleService } from '../../core/vehicles/vehicle.service';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog';
import type { Vehicle } from '../../core/models/vehicle.model';

@Component({
  selector: 'app-vehicle-list',
  imports: [DecimalPipe, MatCardModule, MatButtonModule, MatProgressSpinnerModule, MatDialogModule],
  templateUrl: './vehicle-list.html',
})
export class VehicleListComponent implements OnInit {
  private readonly vehicleService = inject(VehicleService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

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

  deleteCar(event: MouseEvent, vehicle: Vehicle): void {
    event.stopPropagation();
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: `Delete ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
        message: `Deleting this car will also permanently remove all its service records. This cannot be undone.`,
        onConfirm: async () => {
          await this.vehicleService.deleteVehicle(vehicle.id);
          this.vehicles.update(list => list.filter(c => c.id !== vehicle.id));
        },
      },
    });
  }
}
