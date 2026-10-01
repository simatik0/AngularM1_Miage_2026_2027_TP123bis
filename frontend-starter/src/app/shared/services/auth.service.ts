import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, finalize, map, Observable, of, tap } from 'rxjs';
import { AuthResponse } from '../models/auth-response.model';
import { User } from '../models/user.model';

/** Handles authentication and the current user's profile. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly currentUser = signal<User | null>(null);
  readonly token = signal<string | null>(localStorage.getItem('gpc_token'));
  readonly isAuthenticated = computed(() => this.token() !== null);
  readonly sessionError = signal('');

  login(email: string, password: string) {
    return this.http
      .post<AuthResponse>('/api/auth/login', { email, password })
      .pipe(tap((response) => this.storeAuthentication(response)));
  }

  register(name: string, email: string, password: string) {
    return this.http
      .post<AuthResponse>('/api/auth/register', { name, email, password })
      .pipe(tap((response) => this.storeAuthentication(response)));
  }

  profile() {
    return this.http
      .get<User>('/api/users/me')
      .pipe(tap((user) => this.currentUser.set(user)));
  }

  restoreSession(): Observable<boolean> {
    if (!this.token()) {
      return of(false);
    }

    return this.profile().pipe(
      map(() => true),
      catchError(() => {
        this.clearLocalSession();
        this.sessionError.set(
          'Le serveur n’a pas pu vérifier votre session. Elle a été effacée de ce navigateur, mais sa révocation serveur n’est pas confirmée.',
        );
        return of(false);
      }),
    );
  }

  update(name: string) {
    return this.http
      .put<User>('/api/users/me', { name })
      .pipe(tap((user) => this.currentUser.set(user)));
  }

  logout(): Observable<void> {
    if (!this.token()) {
      this.clearLocalSession();
      return of(void 0);
    }

    return this.http.post<void>('/api/auth/logout', {}).pipe(
      finalize(() => this.clearLocalSession()),
    );
  }

  clearLocalSession(): void {
    localStorage.removeItem('gpc_token');
    this.token.set(null);
    this.currentUser.set(null);
  }

  private storeAuthentication(response: AuthResponse): void {
    this.sessionError.set('');
    localStorage.setItem('gpc_token', response.token);
    this.token.set(response.token);
    this.currentUser.set(response.user);
  }
}
