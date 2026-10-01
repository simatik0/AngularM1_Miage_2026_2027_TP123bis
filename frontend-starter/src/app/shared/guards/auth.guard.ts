import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Protects routes in the Angular UI.
 * The backend auth middleware remains the real security boundary.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  
  return auth.restoreSession().pipe(
    map((isAuthenticated) =>
      isAuthenticated ? true : router.createUrlTree(['/login']),
    ),
  );
};
