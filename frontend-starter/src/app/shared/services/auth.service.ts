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
  readonly avatarUrl = signal<string | null>(null);
  readonly avatarError = signal('');

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
      .pipe(tap((user) => {
        this.currentUser.set(user);
        this.loadAvatar();
      }));
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

  updateProfile(name: string, bio: string) {
    return this.http
      .put<User>('/api/users/me/profile', { name, bio })
      .pipe(tap((user) => this.currentUser.set(user)));
  }

  uploadAvatar(file: File) {
    const body = new FormData();
    body.append('avatar', file);
    return this.http.put<User>('/api/users/me/avatar', body).pipe(
      tap((user) => {
        this.currentUser.set(user);
        this.loadAvatar();
      }),
    );
  }

  deleteAvatar() {
    return this.http.delete<User>('/api/users/me/avatar').pipe(
      tap((user) => {
        this.currentUser.set(user);
        this.releaseAvatar();
      }),
    );
  }

  loadAvatar(): void {
    const user = this.currentUser();
    if (!user?.hasProfileImage) {
      this.releaseAvatar();
      return;
    }

    const token = this.token();
    if (!token) return;
    this.avatarError.set('');
    this.http.get('/api/users/me/avatar', { responseType: 'blob' }).subscribe({
      next: (image) => {
        if (this.token() !== token) return;
        this.releaseAvatar();
        this.avatarUrl.set(URL.createObjectURL(image));
      },
      error: (error: unknown) => {
        if (this.token() !== token) return;
        this.releaseAvatar();
        this.avatarError.set('Impossible de charger votre photo de profil.');
        console.error('[AuthService] Erreur de chargement de la photo de profil', error);
      },
    });
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
    this.releaseAvatar();
    localStorage.removeItem('gpc_token');
    this.token.set(null);
    this.currentUser.set(null);
  }

  private storeAuthentication(response: AuthResponse): void {
    this.sessionError.set('');
    localStorage.setItem('gpc_token', response.token);
    this.token.set(response.token);
    this.currentUser.set(response.user);
    this.loadAvatar();
  }

  private releaseAvatar(): void {
    const currentUrl = this.avatarUrl();
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    this.avatarUrl.set(null);
  }
}
