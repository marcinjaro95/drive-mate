import { Component, signal, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { VehicleService } from '../../core/vehicles/vehicle.service';
import { VinDecoderService } from '../../core/vehicles/vin-decoder.service';

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
  styleUrl: './vehicle-add.scss',
})
export class VehicleAddComponent {
  private readonly fb = inject(FormBuilder);
  private readonly vehicleService = inject(VehicleService);
  private readonly router = inject(Router);
  private readonly vinDecoderService = inject(VinDecoderService);

  isSubmitting = signal(false);
  error = signal<string | null>(null);
  isDecoding = signal(false);
  decodeError = signal<string | null>(null);

  form = this.fb.group({
    vin: [null as string | null, [Validators.pattern(/^[A-HJ-NPR-Z0-9]{17}$/i)]],
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

  async decodeVin(): Promise<void> {
    if (this.isDecoding()) return;
    const vin = this.form.controls.vin.value;
    if (!vin) return;
    this.isDecoding.set(true);
    try {
      const result = await this.vinDecoderService.decode(vin);
      if (result.error === 'not_found') {
        this.decodeError.set('Could not decode this VIN. Please fill in manually.');
        return;
      }
      const patch: Record<string, string | number> = {};
      if (result.make !== undefined) patch['make'] = result.make;
      if (result.model !== undefined) patch['model'] = result.model;
      if (result.year !== undefined) patch['year'] = result.year;
      if (result.engine_capacity !== undefined) patch['engine_capacity'] = result.engine_capacity;
      if (result.fuel_type !== undefined) patch['fuel_type'] = result.fuel_type;
      this.form.patchValue(patch);
      this.decodeError.set(null);
    } catch {
      this.decodeError.set('Could not decode this VIN. Please fill in manually.');
    } finally {
      this.isDecoding.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.isSubmitting.set(true);
    this.error.set(null);
    const { vin, make, model, year, engine_capacity, fuel_type, current_mileage } =
      this.form.getRawValue();
    try {
      const vehicle = await this.vehicleService.createVehicle({
        make: make!,
        model: model!,
        year: year!,
        engine_capacity: engine_capacity!,
        fuel_type: fuel_type!,
        vin: vin ?? null,
        current_mileage: current_mileage ?? null,
      });
      await this.router.navigate(['/dashboard/vehicles', vehicle.id]);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to save car');
      this.isSubmitting.set(false);
    }
  }
}
