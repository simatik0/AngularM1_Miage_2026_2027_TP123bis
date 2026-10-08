import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';

type Theme = 'dark' | 'light';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class AppComponent {
  readonly auth = inject(AuthService);
  readonly logoutError = signal('');
  readonly profileMenuOpen = signal(false);
  readonly theme = signal<Theme>('dark');
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly pageContainer = viewChild<ElementRef<HTMLElement>>('pageContainer');

  constructor() {
    const currentTheme = this.document.documentElement.dataset['theme'];
    if (currentTheme === 'light') this.theme.set('light');
    this.document.documentElement.dataset['theme'] = this.theme();
  }

  toggleTheme(): void {
    const nextTheme: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(nextTheme);
    this.document.documentElement.dataset['theme'] = nextTheme;
  }

  toggleProfileMenu(): void {
    this.profileMenuOpen.update((open) => !open);
  }

  closeProfileMenu(): void {
    this.profileMenuOpen.set(false);
  }

  animatePage(): void {
    const container = this.pageContainer()?.nativeElement;
    if (
      !container?.animate ||
      this.document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) return;

    container.animate(
      [
        { opacity: 0, transform: 'translateY(12px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  }

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
