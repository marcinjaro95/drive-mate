import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatDialog } from '@angular/material/dialog';
import { ScheduleViewComponent } from './schedule-view';
import { VehicleService } from '../../core/vehicles/vehicle.service';
import { AiScheduleService } from '../../core/ai-schedule/ai-schedule.service';
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

describe('ScheduleViewComponent — delete flow', () => {
  let component: ScheduleViewComponent;
  let deleteVehicleSpy: ReturnType<typeof vi.fn>;
  let navigateSpy: ReturnType<typeof vi.fn>;
  let dialogOpenSpy: ReturnType<typeof vi.fn>;

  const vehicle = makeVehicle();

  beforeEach(async () => {
    deleteVehicleSpy = vi.fn().mockResolvedValue(undefined);
    navigateSpy = vi.fn().mockResolvedValue(true);
    dialogOpenSpy = vi.fn().mockReturnValue({});

    TestBed.configureTestingModule({
      imports: [ScheduleViewComponent],
      providers: [
        provideAnimationsAsync(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { params: { id: 'v1' } } } },
        { provide: VehicleService, useValue: { getVehicle: vi.fn().mockResolvedValue(vehicle), deleteVehicle: deleteVehicleSpy } },
        { provide: AiScheduleService, useValue: { generateAndSave: vi.fn().mockResolvedValue([]) } },
      ],
    });
    TestBed.overrideComponent(ScheduleViewComponent, {
      set: { providers: [{ provide: MatDialog, useValue: { open: dialogOpenSpy } }] },
    });
    await TestBed.compileComponents();

    const fixture = TestBed.createComponent(ScheduleViewComponent);
    component = fixture.componentInstance;
    (component as any).router = { navigate: navigateSpy };
  });

  it('opens dialog with data.title containing the vehicle make and model', () => {
    component.vehicle.set(vehicle);
    component.openDeleteDialog();

    const [, config] = dialogOpenSpy.mock.calls[0];
    expect(config.data.title).toContain('Toyota');
    expect(config.data.title).toContain('Yaris');
  });

  it('onConfirm calls deleteVehicle and navigates to /dashboard', async () => {
    component.vehicle.set(vehicle);
    component.openDeleteDialog();

    const [, config] = dialogOpenSpy.mock.calls[0];
    await config.data.onConfirm();

    expect(deleteVehicleSpy).toHaveBeenCalledWith('v1');
    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard']);
  });

  it('onConfirm rejects when deleteVehicle throws', async () => {
    const error = new Error('delete failed');
    deleteVehicleSpy.mockRejectedValue(error);

    component.vehicle.set(vehicle);
    component.openDeleteDialog();

    const [, config] = dialogOpenSpy.mock.calls[0];
    await expect(config.data.onConfirm()).rejects.toThrow('delete failed');
  });
});
