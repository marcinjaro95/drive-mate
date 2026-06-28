import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ScheduleViewComponent } from './schedule-view';
import { VehicleService } from '../../core/vehicles/vehicle.service';
import { AiScheduleService } from '../../core/ai-schedule/ai-schedule.service';
import { ServiceRecordService } from '../../core/service-records/service-record.service';
import type { Vehicle } from '../../core/models/vehicle.model';
import type { ScheduleItem } from '../../core/models/schedule-item.model';

const makeItem = (overrides: Partial<ScheduleItem> = {}): ScheduleItem => ({
  id: 'item-1',
  item: 'Oil change',
  interval_km: 10000,
  next_due_km: 55000,
  next_due_date: null,
  urgency: 'upcoming',
  source: "Toyota Yaris 2020 owner's manual",
  ...overrides,
});

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
        {
          provide: VehicleService,
          useValue: {
            getVehicle: vi.fn().mockResolvedValue(vehicle),
            deleteVehicle: deleteVehicleSpy,
          },
        },
        {
          provide: AiScheduleService,
          useValue: { generateAndSave: vi.fn().mockResolvedValue([]) },
        },
      ],
    });
    TestBed.overrideComponent(ScheduleViewComponent, {
      set: { providers: [{ provide: MatDialog, useValue: { open: dialogOpenSpy } }] },
    });
    await TestBed.compileComponents();

    const fixture = TestBed.createComponent(ScheduleViewComponent);
    component = fixture.componentInstance;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

describe('ScheduleViewComponent — generation flow', () => {
  let component: ScheduleViewComponent;
  let fixture: ComponentFixture<ScheduleViewComponent>;
  let generateAndSaveSpy: ReturnType<typeof vi.fn>;

  // Drains the full microtask queue (setTimeout fires only after all microtasks settle)
  const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  beforeEach(async () => {
    generateAndSaveSpy = vi.fn();

    TestBed.configureTestingModule({
      imports: [ScheduleViewComponent],
      providers: [
        provideRouter([]),
        provideAnimationsAsync(),
        { provide: ActivatedRoute, useValue: { snapshot: { params: { id: 'v1' } } } },
        {
          provide: VehicleService,
          useValue: { getVehicle: vi.fn().mockResolvedValue(makeVehicle({ ai_schedule: null })) },
        },
        {
          provide: ServiceRecordService,
          useValue: { getServiceRecords: vi.fn().mockResolvedValue([]) },
        },
        { provide: AiScheduleService, useValue: { generateAndSave: generateAndSaveSpy } },
      ],
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(ScheduleViewComponent);
    component = fixture.componentInstance;
  });

  it('renders error card when generateAndSave rejects', async () => {
    generateAndSaveSpy.mockRejectedValue(new Error('AI proxy error: 500'));
    fixture.detectChanges();
    await flushPromises();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.error-card')).not.toBeNull();
  });

  it('error card paragraph contains the error message', async () => {
    generateAndSaveSpy.mockRejectedValue(new Error('AI proxy error: 500'));
    fixture.detectChanges();
    await flushPromises();
    fixture.detectChanges();
    const p = fixture.nativeElement.querySelector('.error-card p');
    expect(p?.textContent).toContain('AI proxy error: 500');
  });

  it('error card has a "Try again" button', async () => {
    generateAndSaveSpy.mockRejectedValue(new Error('AI proxy error: 500'));
    fixture.detectChanges();
    await flushPromises();
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.error-card button');
    expect(button?.textContent?.trim()).toContain('Try again');
  });

  it('"Try again" button re-triggers generation', async () => {
    generateAndSaveSpy
      .mockRejectedValueOnce(new Error('AI proxy error: 500'))
      .mockResolvedValue([]);
    fixture.detectChanges();
    await flushPromises();
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.error-card button');
    button.click();
    fixture.detectChanges();
    await flushPromises();
    expect(generateAndSaveSpy).toHaveBeenCalledTimes(2);
  });

  it('does not render error card when generateAndSave rejects with AbortError', async () => {
    generateAndSaveSpy.mockRejectedValue(new DOMException('AbortError', 'AbortError'));
    fixture.detectChanges();
    await flushPromises();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.error-card')).toBeNull();
  });

  it('renders skeleton cards while isGenerating is true', () => {
    component.isLoading.set(false);
    component.isGenerating.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.skeleton-card')).not.toBeNull();
  });

  it('renders filtered empty-state when generateAndSave resolves with empty array', async () => {
    generateAndSaveSpy.mockResolvedValue([]);
    fixture.detectChanges();
    await flushPromises();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('All schedule items were filtered');
    expect(fixture.nativeElement.querySelector('.error-card')).toBeNull();
  });

  it('renders non-empty source attribution for each schedule item', async () => {
    generateAndSaveSpy.mockResolvedValue([
      makeItem(),
      makeItem({ id: 'item-2', item: 'Tyre rotation', source: 'Industry standard' }),
    ]);
    fixture.detectChanges();
    await flushPromises();
    fixture.detectChanges();
    const smalls: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('small');
    expect(smalls.length).toBeGreaterThan(0);
    smalls.forEach((small) => {
      expect(small.textContent!.trim().length).toBeGreaterThan(0);
    });
  });
});

describe('ScheduleViewComponent — service-records unavailable', () => {
  const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  describe('ngOnInit swallow (Instance A) — getServiceRecords rejects', () => {
    let fixture: ComponentFixture<ScheduleViewComponent>;
    let component: ScheduleViewComponent;
    let snackBarOpenSpy: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      snackBarOpenSpy = vi.fn();
      TestBed.configureTestingModule({
        imports: [ScheduleViewComponent],
        providers: [
          provideRouter([]),
          provideAnimationsAsync(),
          { provide: ActivatedRoute, useValue: { snapshot: { params: { id: 'v1' } } } },
          {
            provide: VehicleService,
            useValue: { getVehicle: vi.fn().mockResolvedValue(makeVehicle()) },
          },
          {
            provide: ServiceRecordService,
            useValue: { getServiceRecords: vi.fn().mockRejectedValue(new Error('RLS error')) },
          },
          {
            provide: AiScheduleService,
            useValue: { generateAndSave: vi.fn().mockResolvedValue([makeItem()]) },
          },
        ],
      });
      TestBed.overrideComponent(ScheduleViewComponent, {
        set: { providers: [{ provide: MatSnackBar, useValue: { open: snackBarOpenSpy } }] },
      });
      await TestBed.compileComponents();
      fixture = TestBed.createComponent(ScheduleViewComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await flushPromises();
      fixture.detectChanges();
    });

    it('getServiceRecords throws during ngOnInit → serviceRecordsUnavailable signal is true and snackbar is opened', () => {
      expect(component.serviceRecordsUnavailable()).toBe(true);
      expect(snackBarOpenSpy).toHaveBeenCalledWith(
        'Schedule generated without service history — some intervals may be approximate.',
        undefined,
        { duration: 5000 },
      );
    });

    it('getServiceRecords throws during ngOnInit → schedule items still rendered', () => {
      expect(fixture.nativeElement.querySelectorAll('[data-testid="schedule-item"]').length).toBe(
        1,
      );
    });
  });

  describe('ngOnInit happy path — getServiceRecords succeeds', () => {
    let fixture: ComponentFixture<ScheduleViewComponent>;
    let component: ScheduleViewComponent;
    let snackBarOpenSpy: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      snackBarOpenSpy = vi.fn();
      TestBed.configureTestingModule({
        imports: [ScheduleViewComponent],
        providers: [
          provideRouter([]),
          provideAnimationsAsync(),
          { provide: ActivatedRoute, useValue: { snapshot: { params: { id: 'v1' } } } },
          {
            provide: VehicleService,
            useValue: { getVehicle: vi.fn().mockResolvedValue(makeVehicle()) },
          },
          {
            provide: ServiceRecordService,
            useValue: { getServiceRecords: vi.fn().mockResolvedValue([]) },
          },
          {
            provide: AiScheduleService,
            useValue: { generateAndSave: vi.fn().mockResolvedValue([makeItem()]) },
          },
        ],
      });
      TestBed.overrideComponent(ScheduleViewComponent, {
        set: { providers: [{ provide: MatSnackBar, useValue: { open: snackBarOpenSpy } }] },
      });
      await TestBed.compileComponents();
      fixture = TestBed.createComponent(ScheduleViewComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await flushPromises();
      fixture.detectChanges();
    });

    it('getServiceRecords succeeds → serviceRecordsUnavailable signal remains false and snackbar is not opened', () => {
      expect(component.serviceRecordsUnavailable()).toBe(false);
      expect(snackBarOpenSpy).not.toHaveBeenCalled();
    });
  });

  describe('generateSchedule() direct call (Instance B)', () => {
    let fixture: ComponentFixture<ScheduleViewComponent>;
    let component: ScheduleViewComponent;
    let getServiceRecordsSpy: ReturnType<typeof vi.fn>;
    let snackBarOpenSpy: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      getServiceRecordsSpy = vi.fn().mockResolvedValue([]);
      snackBarOpenSpy = vi.fn();

      TestBed.configureTestingModule({
        imports: [ScheduleViewComponent],
        providers: [
          provideRouter([]),
          provideAnimationsAsync(),
          { provide: ActivatedRoute, useValue: { snapshot: { params: { id: 'v1' } } } },
          {
            provide: VehicleService,
            useValue: {
              getVehicle: vi.fn().mockResolvedValue(makeVehicle({ ai_schedule: [makeItem()] })),
            },
          },
          {
            provide: ServiceRecordService,
            useValue: { getServiceRecords: getServiceRecordsSpy },
          },
          {
            provide: AiScheduleService,
            useValue: { generateAndSave: vi.fn().mockResolvedValue([makeItem()]) },
          },
        ],
      });
      TestBed.overrideComponent(ScheduleViewComponent, {
        set: { providers: [{ provide: MatSnackBar, useValue: { open: snackBarOpenSpy } }] },
      });
      await TestBed.compileComponents();
      fixture = TestBed.createComponent(ScheduleViewComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await flushPromises();
      fixture.detectChanges();
    });

    it('getServiceRecords throws during generateSchedule() → serviceRecordsUnavailable signal is true and snackbar is opened', async () => {
      getServiceRecordsSpy.mockRejectedValue(new Error('RLS error'));
      await component.generateSchedule();
      fixture.detectChanges();
      expect(component.serviceRecordsUnavailable()).toBe(true);
      expect(snackBarOpenSpy).toHaveBeenCalledWith(
        'Schedule generated without service history — some intervals may be approximate.',
        undefined,
        { duration: 5000 },
      );
    });

    it('getServiceRecords throws during generateSchedule() → schedule items still rendered', async () => {
      getServiceRecordsSpy.mockRejectedValue(new Error('RLS error'));
      await component.generateSchedule();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('[data-testid="schedule-item"]').length).toBe(
        1,
      );
    });
  });
});
