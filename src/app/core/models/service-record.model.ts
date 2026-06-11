export interface ServiceRecord {
  id: string;
  vehicle_id: string;
  user_id: string;
  service_date: string;
  mileage: number;
  label: string;
  notes: string | null;
  schedule_item_id: string | null;
  created_at: string;
  updated_at: string;
}

export type NewServiceRecord = Omit<ServiceRecord, 'id' | 'created_at' | 'updated_at'>;
export type ServiceRecordUpdate = Partial<Omit<NewServiceRecord, 'user_id' | 'vehicle_id'>>;
