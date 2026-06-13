import { TestBed } from '@angular/core/testing';
import { provideRouter, withDisabledInitialNavigation, Router } from '@angular/router';
import { signal } from '@angular/core';
import { routes } from '../../app.routes';
import { AuthService } from './auth.service';

function setupGuardTest(opts: { initialized: Promise<void>; authenticated: boolean }) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withDisabledInitialNavigation()),
      {
        provide: AuthService,
        useValue: {
          initialized: opts.initialized,
          isAuthenticated: signal(opts.authenticated),
        },
      },
    ],
  });
  return TestBed.inject(Router);
}

describe('authGuard', () => {
  it('redirects unauthenticated visitor from /dashboard to /login', async () => {
    const router = setupGuardTest({ initialized: Promise.resolve(), authenticated: false });
    await router.navigateByUrl('/dashboard');
    expect(router.url).toBe('/login');
  });

  it('allows authenticated visitor through to /dashboard', async () => {
    const router = setupGuardTest({ initialized: Promise.resolve(), authenticated: true });
    await router.navigateByUrl('/dashboard');
    expect(router.url).toBe('/dashboard');
  });

  it('waits for auth.initialized before deciding — unauthenticated visitor is redirected after init resolves', async () => {
    let resolveInit!: () => void;
    const initialized = new Promise<void>(r => { resolveInit = r; });
    const router = setupGuardTest({ initialized, authenticated: false });

    const nav = router.navigateByUrl('/dashboard');
    // Guard is suspended; initialized hasn't resolved yet so the navigation hasn't committed.
    expect(router.url).toBe('/');
    resolveInit();
    await nav;
    expect(router.url).toBe('/login');
  });
});
