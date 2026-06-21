import { TestBed } from '@angular/core/testing';
import { provideRouter, withDisabledInitialNavigation, Router, ActivatedRoute } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { VehicleEditComponent } from './vehicle-edit';
import { VehicleService } from '../../core/vehicles/vehicle.service';
import type { Vehicle } from '../../core/models/vehicle.model';

const makeVehicle = (overrides: Partial<Vehicle> = {}): Vehicle => ({
  id: 'v1',
  user_id: 'user-abc',
  make: 'Toyota',
  model: 'Yaris',
  year: 2020,
  engine_capacity: 1.0,
  fuel_type: 'gasoline',
  vin: 'WBA1234567890ABCD',
  current_mileage: 50000,
  ai_schedule: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('VehicleEditComponent', () => {
  let getVehicleSpy: ReturnType<typeof vi.fn>;
  let updateVehicleSpy: ReturnType<typeof vi.fn>;

  const vehicle = makeVehicle();

  function setup() {
    getVehicleSpy = vi.fn().mockResolvedValue(vehicle);
    updateVehicleSpy = vi.fn().mockResolvedValue({ ...vehicle });

    TestBed.configureTestingModule({
      imports: [VehicleEditComponent],
      providers: [
        provideAnimationsAsync(),
        provideRouter([], withDisabledInitialNavigation()),
        { provide: ActivatedRoute, useValue: { snapshot: { params: { id: 'v1' } } } },
        { provide: VehicleService, useValue: { getVehicle: getVehicleSpy, updateVehicle: updateVehicleSpy } },
      ],
    });
  }

  it('prefills form with loaded vehicle values after init', async () => {
    setup();
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(VehicleEditComponent);
    await fixture.whenStable();
    const c = fixture.componentInstance;

    expect(c.form.controls.make.value).toBe('Toyota');
    expect(c.form.controls.model.value).toBe('Yaris');
    expect(c.form.controls.year.value).toBe(2020);
    expect(c.form.controls.engine_capacity.value).toBe(1.0);
    expect(c.form.controls.fuel_type.value).toBe('gasoline');
    expect(c.form.controls.current_mileage.value).toBe(50000);
  });

  it('VIN control is disabled', async () => {
    setup();
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(VehicleEditComponent);
    await fixture.whenStable();

    expect(fixture.componentInstance.form.controls.vin.disabled).toBe(true);
  });

  it('submit calls updateVehicle with editable fields only — no vin key', async () => {
    setup();
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(VehicleEditComponent);
    await fixture.whenStable();

    await fixture.componentInstance.onSubmit();

    expect(updateVehicleSpy).toHaveBeenCalledOnce();
    const payload = updateVehicleSpy.mock.calls[0][1];
    expect(payload).toEqual({
      make: 'Toyota',
      model: 'Yaris',
      year: 2020,
      engine_capacity: 1.0,
      fuel_type: 'gasoline',
      current_mileage: 50000,
      ai_schedule: null,
    });
    expect(payload).not.toHaveProperty('vin');
  });

  it('navigates to /dashboard/vehicles/:id on successful save', async () => {
    setup();
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(VehicleEditComponent);
    await fixture.whenStable();
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate');

    await fixture.componentInstance.onSubmit();

    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard/vehicles', 'v1']);
  });

  it('displays error message and resets isSubmitting when updateVehicle throws', async () => {
    setup();
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(VehicleEditComponent);
    const c = fixture.componentInstance;
    await fixture.whenStable();
    updateVehicleSpy.mockRejectedValue(new Error('network error'));

    await c.onSubmit();

    expect(c.error()).toBe('network error');
    expect(c.isSubmitting()).toBe(false);
  });

  it('cancel — updateVehicle is never called without explicit submit', async () => {
    setup();
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(VehicleEditComponent);
    await fixture.whenStable();

    expect(updateVehicleSpy).not.toHaveBeenCalled();
  });
});
