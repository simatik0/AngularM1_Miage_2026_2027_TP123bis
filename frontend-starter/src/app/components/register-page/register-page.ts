import { AbstractControl, Component, inject, signal, ValidationErrors, ValidatorFn } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';

function trimmedMinLength(minimumLength: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = typeof control.value === 'string' ? control.value : '';
    if (!value) {
      return null;
    }

    const actualLength = value.trim().length;
    return actualLength >= minimumLength
      ? null
      : { trimmedMinlength: { requiredLength: minimumLength, actualLength } };
  };
}

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register-page.html',
  styleUrl: './register-page.css',
})
export class RegisterPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly error = signal('');

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, trimmedMinLength(2)],
    }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),
  });

  submit(): void {
    this.error.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const values = this.form.getRawValue();
    this.auth.register(values.name.trim(), values.email, values.password).subscribe({
      next: () => {
        void this.router.navigateByUrl('/profile');
      },
      error: (error: { error?: { message?: string } }) => {
        this.error.set(error.error?.message ?? 'Erreur d’inscription');
      },
    });
  }
}
