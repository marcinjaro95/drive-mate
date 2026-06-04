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

  async getVehicles(): Promise<Vehicle[]> {
    const { data, error } = await this.supabase.client
      .from('vehicles')
      .select('*')
      .order('created_at', { ascending: false });
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

  async createVehicle(payload: Omit<NewVehicle, 'user_id'>): Promise<Vehicle> {
    const user_id = this.auth.currentUser()!.id;
    const { data, error } = await this.supabase.client
      .from('vehicles')
      .insert({ ...payload, user_id })
      .select()
      .single();
    if (error) throw error;
    return data as Vehicle;
  }

  async updateVehicle(id: string, payload: VehicleUpdate): Promise<Vehicle> {
    const { data, error } = await this.supabase.client
      .from('vehicles')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Vehicle;
  }

  async deleteVehicle(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('vehicles')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
