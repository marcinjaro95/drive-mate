import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatDialog } from '@angular/material/dialog';
import { VehicleListComponent } from './vehicle-list';
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
  vin: null,
  current_mileage: null,
  ai_schedule: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('VehicleListComponent — delete flow', () => {
  let component: VehicleListComponent;
  let deleteVehicleSpy: ReturnType<typeof vi.fn>;
  let dialogOpenSpy: ReturnType<typeof vi.fn>;

  const vehicle = makeVehicle();

  beforeEach(async () => {
    deleteVehicleSpy = vi.fn().mockResolvedValue(undefined);
    dialogOpenSpy = vi.fn().mockReturnValue({});

    TestBed.configureTestingModule({
      imports: [VehicleListComponent],
      providers: [
        provideAnimationsAsync(),
        provideRouter([]),
        {
          provide: VehicleService,
          useValue: { getVehicles: vi.fn().mockResolvedValue([vehicle]), deleteVehicle: deleteVehicleSpy },
        },
      ],
    });
    TestBed.overrideComponent(VehicleListComponent, {
      set: { providers: [{ provide: MatDialog, useValue: { open: dialogOpenSpy } }] },
    });
    await TestBed.compileComponents();

    const fixture = TestBed.createComponent(VehicleListComponent);
    component = fixture.componentInstance;
  });

  it('opens dialog with data.title containing the vehicle make and model', () => {
    component.deleteCar(new MouseEvent('click'), vehicle);

    const [, config] = dialogOpenSpy.mock.calls[0];
    expect(config.data.title).toContain('Toyota');
    expect(config.data.title).toContain('Yaris');
  });

  it('onConfirm calls deleteVehicle with the vehicle id', async () => {
    component.deleteCar(new MouseEvent('click'), vehicle);

    const [, config] = dialogOpenSpy.mock.calls[0];
    await config.data.onConfirm();

    expect(deleteVehicleSpy).toHaveBeenCalledWith('v1');
  });

  it('onConfirm removes the vehicle from the signal', async () => {
    component.vehicles.set([vehicle]);
    component.deleteCar(new MouseEvent('click'), vehicle);

    const [, config] = dialogOpenSpy.mock.calls[0];
    await config.data.onConfirm();

    expect(component.vehicles()).not.toContainEqual(vehicle);
  });

  it('onConfirm rejects when deleteVehicle throws', async () => {
    const error = new Error('delete failed');
    deleteVehicleSpy.mockRejectedValue(error);

    component.deleteCar(new MouseEvent('click'), vehicle);

    const [, config] = dialogOpenSpy.mock.calls[0];
    await expect(config.data.onConfirm()).rejects.toThrow('delete failed');
  });
});
