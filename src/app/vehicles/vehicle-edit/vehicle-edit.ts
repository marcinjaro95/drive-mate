import { Component, OnInit, signal, inject } from '@angular/core';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { VehicleService } from '../../core/vehicles/vehicle.service';
import type { Vehicle } from '../../core/models/vehicle.model';

@Component({
  selector: 'app-vehicle-edit',
  imports: [
    ReactiveFormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './vehicle-edit.html',
  styleUrl: './vehicle-edit.scss',
})
export class VehicleEditComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly vehicleService = inject(VehicleService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);

  readonly vehicleId = this.route.snapshot.params['id'] as string;

  vehicle = signal<Vehicle | null>(null);
  isLoading = signal(true);
  isSubmitting = signal(false);
  error = signal<string | null>(null);

  form = this.fb.group({
    vin: [{ value: null as string | null, disabled: true }],
    make: ['', Validators.required],
    model: ['', Validators.required],
    year: [
      null as number | null,
      [Validators.required, Validators.min(1900), Validators.max(new Date().getFullYear() + 1)],
    ],
    engine_capacity: [
      null as number | null,
      [Validators.required, Validators.min(0.1), Validators.max(20)],
    ],
    fuel_type: ['', Validators.required],
    current_mileage: [null as number | null, Validators.min(0)],
  });

  async ngOnInit(): Promise<void> {
    try {
      const v = await this.vehicleService.getVehicle(this.vehicleId);
      if (!v) {
        await this.router.navigate(['/dashboard']);
        return;
      }
      this.vehicle.set(v);
      this.form.patchValue({
        vin: v.vin,
        make: v.make,
        model: v.model,
        year: v.year,
        engine_capacity: v.engine_capacity,
        fuel_type: v.fuel_type,
        current_mileage: v.current_mileage,
      });
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load vehicle');
    } finally {
      this.isLoading.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.isSubmitting.set(true);
    this.error.set(null);
    const { make, model, year, engine_capacity, fuel_type, current_mileage } =
      this.form.getRawValue();
    try {
      await this.vehicleService.updateVehicle(this.vehicleId, {
        make: make!,
        model: model!,
        year: year!,
        engine_capacity: engine_capacity!,
        fuel_type: fuel_type!,
        current_mileage: current_mileage ?? null,
        ai_schedule: null,
      });
      this.snackBar.open('Vehicle updated — regenerating AI schedule…', undefined, {
        duration: 5000,
      });
      await this.router.navigate(['/dashboard/vehicles', this.vehicleId]);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to save changes');
      this.isSubmitting.set(false);
    }
  }
}
