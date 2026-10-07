import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { authInterceptor } from '../interceptors/auth.interceptor';

describe('Authentification TP1 (API simulée)', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  const navigateByUrl = vi.fn().mockResolvedValue(true);
  const user = { id: 'test-user', name: 'Alice', email: 'alice@example.com', createdAt: '2026-10-07T00:00:00Z' };

  beforeEach(() => {
    localStorage.clear();
    navigateByUrl.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  function login(): void {
    auth.login(user.email, 'test-only-password').subscribe();
    const request = http.expectOne('/api/auth/login');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ token: 'synthetic-test-token', user });
  }

  it('conserve la session après connexion et actualise le profil', () => {
    login();
    expect(auth.currentUser()).toEqual(user);
    expect(localStorage.getItem('gpc_token')).toBe('synthetic-test-token');
    auth.update('Bob').subscribe();
    const request = http.expectOne('/api/users/me');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ name: 'Bob' });
    expect(request.request.headers.get('Authorization')).toBe('Bearer synthetic-test-token');
    request.flush({ ...user, name: 'Bob' });
    expect(auth.currentUser()?.name).toBe('Bob');
  });

  it('enregistre la session après inscription', () => {
    auth.register(user.name, user.email, 'test-only-password').subscribe();
    const request = http.expectOne('/api/auth/register');
    expect(request.request.method).toBe('POST');
    request.flush({ token: 'synthetic-test-token', user });
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.currentUser()).toEqual(user);
  });

  it('laisse une connexion refusée sans session et transmet son erreur', () => {
    const onError = vi.fn();
    auth.login(user.email, 'incorrect').subscribe({ error: onError });
    http.expectOne('/api/auth/login').flush({ message: 'Identifiants incorrects' }, { status: 401, statusText: 'Unauthorized' });
    expect(onError).toHaveBeenCalledOnce();
    expect(auth.currentUser()).toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('efface la session et redirige après un 401 sur le profil', () => {
    login();
    auth.profile().subscribe({ error: () => undefined });
    http.expectOne('/api/users/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.currentUser()).toBeNull();
    expect(localStorage.getItem('gpc_token')).toBeNull();
    expect(navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('nettoie aussi la session locale si la déconnexion serveur échoue', () => {
    login();
    auth.logout().subscribe({ error: () => undefined });
    const request = http.expectOne('/api/auth/logout');
    expect(request.request.method).toBe('POST');
    request.flush({}, { status: 500, statusText: 'Server error' });
    expect(auth.currentUser()).toBeNull();
    expect(auth.token()).toBeNull();
    expect(localStorage.getItem('gpc_token')).toBeNull();
  });

  it('restaure le profil depuis le jeton stocké au démarrage', () => {
    localStorage.setItem('gpc_token', 'synthetic-test-token');
    const restored = TestBed.runInInjectionContext(() => new AuthService());
    expect(restored.token()).toBe('synthetic-test-token');
    const result = vi.fn();
    restored.restoreSession().subscribe(result);
    http.expectOne('/api/users/me').flush(user);
    expect(result).toHaveBeenCalledWith(true);
    expect(restored.currentUser()).toEqual(user);
  });
});
