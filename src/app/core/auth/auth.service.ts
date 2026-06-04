import { Injectable, signal, computed } from '@angular/core';
import { AuthError, User } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _currentUser = signal<User | null>(null);
  private readonly _isLoading = signal(true);

  readonly currentUser = this._currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this._currentUser() !== null);
  readonly isLoading = this._isLoading.asReadonly();

  readonly initialized: Promise<void>;

  constructor(private readonly supabase: SupabaseService) {
    this.initialized = this.supabase.client.auth.getSession()
      .then(({ data }) => {
        this._currentUser.set(data.session?.user ?? null);
      })
      .catch(() => {
        this._currentUser.set(null);
      })
      .finally(() => {
        this._isLoading.set(false);
      });

    this.supabase.client.auth.onAuthStateChange((_event, session) => {
      this._currentUser.set(session?.user ?? null);
    });
  }

  async signIn(email: string, password: string): Promise<AuthError | null> {
    const { error } = await this.supabase.client.auth.signInWithPassword({ email, password });
    return error;
  }

  async signUp(email: string, password: string): Promise<AuthError | null> {
    const { error } = await this.supabase.client.auth.signUp({ email, password });
    return error;
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
  }
}
