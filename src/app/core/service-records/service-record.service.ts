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

  async getServiceRecords(vehicleId: string, options: { limit?: number; offset?: number } = {}): Promise<ServiceRecord[]> {
    const { limit = 100, offset = 0 } = options;
    const { data, error } = await this.supabase.client
      .from('service_records')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('service_date', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return data as ServiceRecord[];
  }

  async getServiceRecord(id: string): Promise<ServiceRecord | null> {
    const user = this.auth.currentUser();
    if (!user) throw new Error('Unauthenticated');
    const { data, error } = await this.supabase.client
      .from('service_records')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    return data as ServiceRecord | null;
  }

  async createServiceRecord(payload: Omit<NewServiceRecord, 'user_id'>): Promise<ServiceRecord> {
    const user = this.auth.currentUser();
    if (!user) throw new Error('Unauthenticated');
    const user_id = user.id;
    const { data, error } = await this.supabase.client
      .from('service_records')
      .insert({ ...payload, user_id })
      .select()
      .single();
    if (error) throw error;
    return data as ServiceRecord;
  }

  async updateServiceRecord(id: string, payload: ServiceRecordUpdate): Promise<ServiceRecord> {
    const user = this.auth.currentUser();
    if (!user) throw new Error('Unauthenticated');
    const { data, error } = await this.supabase.client
      .from('service_records')
      .update(payload)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) throw error;
    return data as ServiceRecord;
  }

  async deleteServiceRecord(id: string): Promise<void> {
    const user = this.auth.currentUser();
    if (!user) throw new Error('Unauthenticated');
    const { error } = await this.supabase.client
      .from('service_records')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;
  }
}
