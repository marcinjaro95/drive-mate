import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase.service';
import { AuthService } from '../auth/auth.service';
import type { Vehicle, NewVehicle, VehicleUpdate } from '../models/vehicle.model';

@Injectable({ providedIn: 'root' })
export class VehicleService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly auth: AuthService,
  ) {}

  async getVehicles(options: { limit?: number; offset?: number } = {}): Promise<Vehicle[]> {
    const { limit = 100, offset = 0 } = options;
    const { data, error } = await this.supabase.client
      .from('vehicles')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return data as Vehicle[];
  }

  async getVehicle(id: string): Promise<Vehicle | null> {
    const { data, error } = await this.supabase.client
      .from('vehicles')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as Vehicle | null;
  }

  async createVehicle(payload: Omit<NewVehicle, 'user_id' | 'ai_schedule'>): Promise<Vehicle> {
    const user = this.auth.currentUser();
    if (!user) throw new Error('Unauthenticated');
    const user_id = user.id;
    const { data, error } = await this.supabase.client
      .from('vehicles')
      .insert({ ...payload, user_id })
      .select()
      .single();
    if (error) throw error;
    return data as Vehicle;
  }

  async updateVehicle(id: string, payload: VehicleUpdate): Promise<Vehicle> {
    const user = this.auth.currentUser();
    if (!user) throw new Error('Unauthenticated');
    const { data, error } = await this.supabase.client
      .from('vehicles')
      .update(payload)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) throw error;
    return data as Vehicle;
  }

  async deleteVehicle(id: string): Promise<void> {
    const user = this.auth.currentUser();
    if (!user) throw new Error('Unauthenticated');
    const { error } = await this.supabase.client
      .from('vehicles')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;
  }
}
