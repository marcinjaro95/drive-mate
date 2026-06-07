import type { ScheduleItem } from './schedule-item.model';

export interface Vehicle {
  id: string;
  user_id: string;
  make: string;
  model: string;
  year: number;
  engine_capacity: number;
  fuel_type: string;
  vin: string | null;
  current_mileage: number | null;
  ai_schedule: ScheduleItem[] | null;
  created_at: string;
  updated_at: string;
}

export type NewVehicle = Omit<Vehicle, 'id' | 'created_at' | 'updated_at'>;
export type VehicleUpdate = Partial<Omit<NewVehicle, 'user_id'>>;
