import { TestBed } from '@angular/core/testing';
import { ServiceRecordService } from './service-record.service';
import { SupabaseService } from '../supabase.service';
import { AuthService } from '../auth/auth.service';
import type { ServiceRecord } from '../models/service-record.model';
import { MOCK_USER, createMockBuilder } from '../testing/mock-supabase-builder';

const makeRecord = (overrides: Partial<ServiceRecord> = {}): ServiceRecord => ({
  id: 'sr1',
  vehicle_id: 'v1',
  user_id: 'user-abc',
  service_date: '2026-06-04',
  mileage: 50000,
  label: 'Oil change',
  notes: null,
  created_at: '2026-06-04T00:00:00Z',
  updated_at: '2026-06-04T00:00:00Z',
  ...overrides,
});

describe('ServiceRecordService', () => {
  let service: ServiceRecordService;
  let mockFrom: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFrom = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        ServiceRecordService,
        { provide: SupabaseService, useValue: { client: { from: mockFrom } } },
        { provide: AuthService, useValue: { currentUser: () => MOCK_USER } },
      ],
    });
    service = TestBed.inject(ServiceRecordService);
  });

  describe('getServiceRecords', () => {
    it('returns typed ServiceRecord[] on success', async () => {
      const records = [makeRecord()];
      mockFrom.mockReturnValue(createMockBuilder({ data: records, error: null }));

      const result = await service.getServiceRecords('v1');

      expect(result).toEqual(records);
    });

    it('throws when Supabase returns an error', async () => {
      const pgError = { message: 'query error', code: '42P01' };
      mockFrom.mockReturnValue(createMockBuilder({ data: null, error: pgError }));

      await expect(service.getServiceRecords('v1')).rejects.toEqual(pgError);
    });
  });

  describe('createServiceRecord', () => {
    it('stamps user_id from AuthService, not from the caller payload', async () => {
      const record = makeRecord();
      const builder = createMockBuilder({ data: record, error: null });
      mockFrom.mockReturnValue(builder);

      await service.createServiceRecord({
        vehicle_id: 'v1',
        service_date: '2026-06-04',
        mileage: 50000,
        label: 'Oil change',
        notes: null,
      });

      const insertedPayload = builder.insert.mock.calls[0][0];
      expect(insertedPayload.user_id).toBe('user-abc');
    });

    it('returns the created ServiceRecord on success', async () => {
      const record = makeRecord();
      mockFrom.mockReturnValue(createMockBuilder({ data: record, error: null }));

      const result = await service.createServiceRecord({
        vehicle_id: 'v1',
        service_date: '2026-06-04',
        mileage: 50000,
        label: 'Oil change',
        notes: null,
      });

      expect(result).toEqual(record);
    });

    it('throws when Supabase returns an error', async () => {
      const pgError = { message: 'insert error', code: '23505' };
      mockFrom.mockReturnValue(createMockBuilder({ data: null, error: pgError }));

      await expect(
        service.createServiceRecord({
          vehicle_id: 'v1',
          service_date: '2026-06-04',
          mileage: 50000,
          label: 'Oil change',
          notes: null,
        }),
      ).rejects.toEqual(pgError);
    });

    it('accepts mileage: 0 as a valid boundary value', async () => {
      const record = makeRecord({ mileage: 0 });
      const builder = createMockBuilder({ data: record, error: null });
      mockFrom.mockReturnValue(builder);

      const result = await service.createServiceRecord({
        vehicle_id: 'v1',
        service_date: '2026-06-04',
        mileage: 0,
        label: 'Oil change',
        notes: null,
      });

      expect(result.mileage).toBe(0);
    });
  });

  describe('getServiceRecord', () => {
    it('returns a ServiceRecord when found', async () => {
      const record = makeRecord();
      mockFrom.mockReturnValue(createMockBuilder({ data: record, error: null }));

      const result = await service.getServiceRecord('sr1');

      expect(result).toEqual(record);
    });

    it('returns null when not found', async () => {
      mockFrom.mockReturnValue(createMockBuilder({ data: null, error: null }));

      const result = await service.getServiceRecord('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('deleteServiceRecord', () => {
    it('resolves without error on success', async () => {
      mockFrom.mockReturnValue(createMockBuilder({ data: null, error: null }));

      await expect(service.deleteServiceRecord('sr1')).resolves.toBeUndefined();
    });

    it('throws when Supabase returns an error', async () => {
      const pgError = { message: 'delete error', code: '42501' };
      mockFrom.mockReturnValue(createMockBuilder({ data: null, error: pgError }));

      await expect(service.deleteServiceRecord('sr1')).rejects.toEqual(pgError);
    });
  });

  describe('updateServiceRecord', () => {
    it('returns the updated ServiceRecord on success', async () => {
      const record = makeRecord({ label: 'Tyre rotation' });
      mockFrom.mockReturnValue(createMockBuilder({ data: record, error: null }));

      const result = await service.updateServiceRecord('sr1', { label: 'Tyre rotation' });

      expect(result).toEqual(record);
    });

    it('throws when Supabase returns an error', async () => {
      const pgError = { message: 'update error', code: '42501' };
      mockFrom.mockReturnValue(createMockBuilder({ data: null, error: pgError }));

      await expect(service.updateServiceRecord('sr1', { label: 'Tyre rotation' })).rejects.toEqual(pgError);
    });
  });
});
