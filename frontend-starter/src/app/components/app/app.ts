import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class AppComponent {
  readonly auth = inject(AuthService);
  readonly logoutError = signal('');
  private readonly router = inject(Router);

  logout(): void {
    this.logoutError.set('');
    this.auth.logout().subscribe({
      next: () => {
        void this.router.navigateByUrl('/login');
      },
      error: (error: unknown) => {
        if (!(error instanceof HttpErrorResponse && error.status === 401)) {
          this.logoutError.set(
            'Session effacée de ce navigateur, mais le serveur n’a pas confirmé sa révocation.',
          );
        }
        void this.router.navigateByUrl('/login');
      },
    });
  }
}
