import { Component, signal, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { VehicleService } from '../../core/vehicles/vehicle.service';

@Component({
  selector: 'app-vehicle-add',
  imports: [
    ReactiveFormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
  ],
  templateUrl: './vehicle-add.html',
})
export class VehicleAddComponent {
  private readonly fb = inject(FormBuilder);
  private readonly vehicleService = inject(VehicleService);
  private readonly router = inject(Router);

  isSubmitting = signal(false);
  error = signal<string | null>(null);

  form = this.fb.group({
    make: ['', Validators.required],
    model: ['', Validators.required],
    year: [null as number | null, [Validators.required, Validators.min(1900), Validators.max(2030)]],
    engine_capacity: [null as number | null, [Validators.required, Validators.min(0.1), Validators.max(20)]],
    fuel_type: ['', Validators.required],
    current_mileage: [null as number | null, Validators.min(0)],
  });

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.isSubmitting.set(true);
    this.error.set(null);
    const { make, model, year, engine_capacity, fuel_type, current_mileage } = this.form.getRawValue();
    try {
      const vehicle = await this.vehicleService.createVehicle({
        make: make!,
        model: model!,
        year: year!,
        engine_capacity: engine_capacity!,
        fuel_type: fuel_type!,
        vin: null,
        current_mileage: current_mileage ?? null,
      });
      await this.router.navigate(['/dashboard/vehicles', vehicle.id]);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to save car');
      this.isSubmitting.set(false);
    }
  }
}
