import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase.service';
import { AuthError, Session, User } from '@supabase/supabase-js';

const makeUser = (id = 'user-1'): User =>
  ({ id, email: 'test@example.com' }) as User;

const makeSession = (user: User): Session =>
  ({ user, access_token: 'tok', refresh_token: 'rtok' }) as Session;

function makeMockSupabase() {
  let authStateCallback: ((event: string, session: Session | null) => void) | null = null;

  let getSessionResult: Promise<{ data: { session: Session | null }; error: AuthError | null }> =
    Promise.resolve({ data: { session: null }, error: null });

  const mock = {
    client: {
      auth: {
        getSession: () => getSessionResult,
        onAuthStateChange: (cb: (event: string, session: Session | null) => void) => {
          authStateCallback = cb;
          return { data: { subscription: { unsubscribe: () => {} } } };
        },
        signInWithPassword: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
      },
    },
    _setGetSessionResult(result: typeof getSessionResult) {
      getSessionResult = result;
    },
    _fireAuthStateChange(event: string, session: Session | null) {
      authStateCallback?.(event, session);
    },
  };
  return mock;
}

describe('AuthService', () => {
  let service: AuthService;
  let mockSupabase: ReturnType<typeof makeMockSupabase>;

  beforeEach(() => {
    mockSupabase = makeMockSupabase();

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: SupabaseService, useValue: mockSupabase },
      ],
    });

    service = TestBed.inject(AuthService);
  });

  describe('initial state', () => {
    it('isLoading is true before getSession resolves', () => {
      mockSupabase._setGetSessionResult(new Promise(() => {})); // never resolves
      // Re-create service with the pending promise
      TestBed.resetTestingModule();
      mockSupabase = makeMockSupabase();
      mockSupabase._setGetSessionResult(new Promise(() => {}));
      TestBed.configureTestingModule({
        providers: [
          AuthService,
          { provide: SupabaseService, useValue: mockSupabase },
        ],
      });
      service = TestBed.inject(AuthService);

      expect(service.isLoading()).toBe(true);
      expect(service.isAuthenticated()).toBe(false);
    });
  });

  describe('initialization with session', () => {
    it('sets currentUser and clears isLoading when getSession resolves with a session', async () => {
      const user = makeUser();
      mockSupabase._setGetSessionResult(
        Promise.resolve({ data: { session: makeSession(user) }, error: null }),
      );
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          AuthService,
          { provide: SupabaseService, useValue: mockSupabase },
        ],
      });
      service = TestBed.inject(AuthService);

      await service.initialized;

      expect(service.currentUser()).toEqual(user);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.isLoading()).toBe(false);
    });
  });

  describe('initialization without session', () => {
    it('keeps currentUser null when getSession resolves with no session', async () => {
      await service.initialized;

      expect(service.currentUser()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.isLoading()).toBe(false);
    });
  });

  describe('signIn', () => {
    it('returns null and triggers auth state update on success', async () => {
      const user = makeUser();
      (mockSupabase.client.auth.signInWithPassword as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { session: makeSession(user), user },
        error: null,
      });

      await service.initialized;
      const result = await service.signIn('test@example.com', 'password');
      mockSupabase._fireAuthStateChange('SIGNED_IN', makeSession(user));

      expect(result).toBeNull();
      expect(service.currentUser()).toEqual(user);
    });

    it('returns AuthError and keeps currentUser null on failure', async () => {
      const authError = new AuthError('Invalid credentials');
      (mockSupabase.client.auth.signInWithPassword as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { session: null, user: null },
        error: authError,
      });

      await service.initialized;
      const result = await service.signIn('test@example.com', 'wrong');

      expect(result).toBe(authError);
      expect(service.currentUser()).toBeNull();
    });
  });

  describe('signUp', () => {
    it('returns null and triggers auth state update on success', async () => {
      const user = makeUser('new-user');
      (mockSupabase.client.auth.signUp as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { session: makeSession(user), user },
        error: null,
      });

      await service.initialized;
      const result = await service.signUp('new@example.com', 'password');
      mockSupabase._fireAuthStateChange('SIGNED_IN', makeSession(user));

      expect(result).toBeNull();
      expect(service.currentUser()).toEqual(user);
    });

    it('returns AuthError on failure', async () => {
      const authError = new AuthError('Email already registered');
      (mockSupabase.client.auth.signUp as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { session: null, user: null },
        error: authError,
      });

      await service.initialized;
      const result = await service.signUp('existing@example.com', 'password');

      expect(result).toBe(authError);
    });
  });

  describe('signOut', () => {
    it('clears currentUser when auth state changes to null', async () => {
      const user = makeUser();
      (mockSupabase.client.auth.signOut as ReturnType<typeof vi.fn>).mockResolvedValue({
        error: null,
      });

      await service.initialized;
      // Simulate a signed-in user first
      mockSupabase._fireAuthStateChange('SIGNED_IN', makeSession(user));
      expect(service.currentUser()).toEqual(user);

      await service.signOut();
      mockSupabase._fireAuthStateChange('SIGNED_OUT', null);

      expect(service.currentUser()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
    });
  });
});
