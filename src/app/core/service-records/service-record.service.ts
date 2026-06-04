import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase.service';
import { AuthService } from '../auth/auth.service';
import type { ServiceRecord, NewServiceRecord, ServiceRecordUpdate } from '../models/service-record.model';

@Injectable({ providedIn: 'root' })
export class ServiceRecordService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly auth: AuthService,
  ) {}

  async getServiceRecords(vehicleId: string): Promise<ServiceRecord[]> {
    const { data, error } = await this.supabase.client
      .from('service_records')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('service_date', { ascending: false });
    if (error) throw error;
    return data as ServiceRecord[];
  }

  async getServiceRecord(id: string): Promise<ServiceRecord | null> {
    const { data, error } = await this.supabase.client
      .from('service_records')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as ServiceRecord | null;
  }

  async createServiceRecord(payload: Omit<NewServiceRecord, 'user_id'>): Promise<ServiceRecord> {
    const user_id = this.auth.currentUser()!.id;
    const { data, error } = await this.supabase.client
      .from('service_records')
      .insert({ ...payload, user_id })
      .select()
      .single();
    if (error) throw error;
    return data as ServiceRecord;
  }

  async updateServiceRecord(id: string, payload: ServiceRecordUpdate): Promise<ServiceRecord> {
    const { data, error } = await this.supabase.client
      .from('service_records')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as ServiceRecord;
  }

  async deleteServiceRecord(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('service_records')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
