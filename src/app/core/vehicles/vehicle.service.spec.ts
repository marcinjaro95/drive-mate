import { TestBed } from '@angular/core/testing';
import { VehicleService } from './vehicle.service';
import { SupabaseService } from '../supabase.service';
import { AuthService } from '../auth/auth.service';
import type { Vehicle } from '../models/vehicle.model';
import { MOCK_USER, createMockBuilder } from '../testing/mock-supabase-builder';

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
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('VehicleService', () => {
  let service: VehicleService;
  let mockFrom: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFrom = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        VehicleService,
        { provide: SupabaseService, useValue: { client: { from: mockFrom } } },
        { provide: AuthService, useValue: { currentUser: () => MOCK_USER } },
      ],
    });
    service = TestBed.inject(VehicleService);
  });

  describe('getVehicles', () => {
    it('returns typed Vehicle[] on success', async () => {
      const vehicles = [makeVehicle()];
      mockFrom.mockReturnValue(createMockBuilder({ data: vehicles, error: null }));

      const result = await service.getVehicles();

      expect(result).toEqual(vehicles);
    });

    it('throws when Supabase returns an error', async () => {
      const pgError = { message: 'relation "vehicles" does not exist', code: '42P01' };
      mockFrom.mockReturnValue(createMockBuilder({ data: null, error: pgError }));

      await expect(service.getVehicles()).rejects.toEqual(pgError);
    });
  });

  describe('createVehicle', () => {
    it('stamps user_id from AuthService, not from the caller payload', async () => {
      const vehicle = makeVehicle();
      const builder = createMockBuilder({ data: vehicle, error: null });
      mockFrom.mockReturnValue(builder);

      await service.createVehicle({
        make: 'Toyota',
        model: 'Yaris',
        year: 2020,
        engine_capacity: 1.0,
        fuel_type: 'gasoline',
        vin: null,
        current_mileage: null,
      });

      const insertedPayload = builder.insert.mock.calls[0][0];
      expect(insertedPayload.user_id).toBe('user-abc');
    });

    it('returns the created Vehicle on success', async () => {
      const vehicle = makeVehicle();
      mockFrom.mockReturnValue(createMockBuilder({ data: vehicle, error: null }));

      const result = await service.createVehicle({
        make: 'Toyota',
        model: 'Yaris',
        year: 2020,
        engine_capacity: 1.0,
        fuel_type: 'gasoline',
        vin: null,
        current_mileage: null,
      });

      expect(result).toEqual(vehicle);
    });

    it('throws when Supabase returns an error', async () => {
      const pgError = { message: 'insert error', code: '23505' };
      mockFrom.mockReturnValue(createMockBuilder({ data: null, error: pgError }));

      await expect(
        service.createVehicle({
          make: 'Toyota',
          model: 'Yaris',
          year: 2020,
          engine_capacity: 1.0,
          fuel_type: 'gasoline',
          vin: null,
          current_mileage: null,
        }),
      ).rejects.toEqual(pgError);
    });
  });

  describe('getVehicle', () => {
    it('returns a Vehicle when found', async () => {
      const vehicle = makeVehicle();
      mockFrom.mockReturnValue(createMockBuilder({ data: vehicle, error: null }));

      const result = await service.getVehicle('v1');

      expect(result).toEqual(vehicle);
    });

    it('returns null when not found', async () => {
      mockFrom.mockReturnValue(createMockBuilder({ data: null, error: null }));

      const result = await service.getVehicle('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('deleteVehicle', () => {
    it('resolves without error on success', async () => {
      mockFrom.mockReturnValue(createMockBuilder({ data: null, error: null }));

      await expect(service.deleteVehicle('v1')).resolves.toBeUndefined();
    });

    it('throws when Supabase returns an error', async () => {
      const pgError = { message: 'delete error', code: '42501' };
      mockFrom.mockReturnValue(createMockBuilder({ data: null, error: pgError }));

      await expect(service.deleteVehicle('v1')).rejects.toEqual(pgError);
    });
  });

  describe('updateVehicle', () => {
    it('returns the updated Vehicle on success', async () => {
      const vehicle = makeVehicle({ make: 'Honda' });
      mockFrom.mockReturnValue(createMockBuilder({ data: vehicle, error: null }));

      const result = await service.updateVehicle('v1', { make: 'Honda' });

      expect(result).toEqual(vehicle);
    });

    it('throws when Supabase returns an error', async () => {
      const pgError = { message: 'update error', code: '42501' };
      mockFrom.mockReturnValue(createMockBuilder({ data: null, error: pgError }));

      await expect(service.updateVehicle('v1', { make: 'Honda' })).rejects.toEqual(pgError);
    });
  });
});
