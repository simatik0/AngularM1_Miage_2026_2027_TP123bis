import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

function isPublicAuthRequest(url: string): boolean {
  return (
    url.includes('/api/auth/login') ||
    url.includes('/api/auth/register') ||
    url.includes('/api/health')
  );
}

/** Adds the bearer token to protected API requests and handles expired tokens. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();
  const isPublicRequest = isPublicAuthRequest(request.url);
  const isLogoutRequest = request.url.split('?')[0].endsWith('/api/auth/logout');

  return next(
    token && !isPublicRequest
      ? request.clone({
          setHeaders: { Authorization: `Bearer ${token}` },
        })
      : request,
  ).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !isPublicRequest &&
        !isLogoutRequest
      ) {
        auth.clearLocalSession();
        void router.navigateByUrl('/login');
      }

      return throwError(() => error);
    }),
  );
};
