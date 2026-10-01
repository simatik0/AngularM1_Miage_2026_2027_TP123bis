import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly error = signal('');
  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  submit(): void {
    this.error.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Veuillez saisir une adresse email et un mot de passe valides.');
      return;
    }

    const values = this.form.getRawValue();
    this.auth.login(values.email, values.password).subscribe({
      next: () => {
        void this.router.navigateByUrl('/tracks');
      },
      error: (error: HttpErrorResponse) => {
        const message =
          typeof error.error?.message === 'string'
            ? error.error.message
            : 'Adresse email ou mot de passe incorrect.';
        this.error.set(message);
      },
    });
  }
}
