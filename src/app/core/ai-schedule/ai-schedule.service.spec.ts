import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AiScheduleService } from './ai-schedule.service';
import { VehicleService } from '../vehicles/vehicle.service';
import type { Vehicle } from '../models/vehicle.model';
import type { ScheduleItem } from '../models/schedule-item.model';

const makeVehicle = (overrides: Partial<Vehicle> = {}): Vehicle => ({
  id: 'v1',
  user_id: 'user-abc',
  make: 'Toyota',
  model: 'Corolla',
  year: 2019,
  engine_capacity: 1.6,
  fuel_type: 'gasoline',
  vin: null,
  current_mileage: 45000,
  ai_schedule: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const makeItem = (overrides: Partial<ScheduleItem> = {}): ScheduleItem => ({
  id: 'test-item-id',
  item: 'Oil change',
  interval_km: 10000,
  next_due_km: 55000,
  next_due_date: null,
  urgency: 'upcoming',
  source: "Toyota Corolla 2019 owner's manual",
  ...overrides,
});

function makeEnvelope(items: ScheduleItem[]) {
  return {
    choices: [{ message: { content: JSON.stringify({ items }) } }],
  };
}

describe('AiScheduleService', () => {
  let service: AiScheduleService;
  let mockUpdateVehicle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockUpdateVehicle = vi.fn().mockResolvedValue(makeVehicle());

    TestBed.configureTestingModule({
      providers: [
        AiScheduleService,
        { provide: VehicleService, useValue: { updateVehicle: mockUpdateVehicle } },
      ],
    });
    service = TestBed.inject(AiScheduleService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns correctly typed filtered ScheduleItem[] on a valid response', async () => {
    const items = [makeItem(), makeItem({ item: 'Tyre rotation', source: 'Standard practice' })];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeEnvelope(items)),
    }));

    const result = await service.generateAndSave(makeVehicle());

    expect(result).toHaveLength(2);
    expect(result[0].item).toBe('Oil change');
    expect(result[1].item).toBe('Tyre rotation');
  });

  it('excludes items where source is an empty string', async () => {
    const items = [
      makeItem({ source: '' }),
      makeItem({ item: 'Air filter', source: 'Manufacturer schedule' }),
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeEnvelope(items)),
    }));

    const result = await service.generateAndSave(makeVehicle());

    expect(result).toHaveLength(1);
    expect(result[0].item).toBe('Air filter');
  });

  it('excludes items where source property is missing', async () => {
    const itemWithoutSource = { item: 'Brake fluid', interval_km: 40000, next_due_km: null, next_due_date: null, urgency: 'upcoming' } as any;
    const items = [itemWithoutSource, makeItem({ item: 'Spark plugs' })];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeEnvelope(items)),
    }));

    const result = await service.generateAndSave(makeVehicle());

    expect(result).toHaveLength(1);
    expect(result[0].item).toBe('Spark plugs');
  });

  it('throws when choices[0].message.content is not valid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'not json' } }] }),
    }));

    await expect(service.generateAndSave(makeVehicle())).rejects.toThrow();
  });

  it('throws with status code when fetch returns a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(service.generateAndSave(makeVehicle())).rejects.toThrow('AI proxy error: 500');
  });

  it('persists the filtered items via VehicleService.updateVehicle', async () => {
    const items = [makeItem(), makeItem({ item: 'Brake check', source: '' })];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeEnvelope(items)),
    }));

    await service.generateAndSave(makeVehicle());

    expect(mockUpdateVehicle).toHaveBeenCalledWith('v1', { ai_schedule: [items[0]] });
  });

  describe('buildPrompt', () => {
    it('contains make, model, year, engine_capacity, and fuel_type', async () => {
      let capturedBody: any;
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeEnvelope([makeItem()])),
        });
      }));

      await service.generateAndSave(makeVehicle());

      const prompt: string = capturedBody.messages[0].content;
      expect(prompt).toContain('Toyota');
      expect(prompt).toContain('Corolla');
      expect(prompt).toContain('2019');
      expect(prompt).toContain('1.6');
      expect(prompt).toContain('gasoline');
    });
  });
});
