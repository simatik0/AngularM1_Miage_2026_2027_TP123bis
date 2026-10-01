import { AbstractControl, Component, inject, signal, ValidationErrors, ValidatorFn } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
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
  imports: [ReactiveFormsModule],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePageComponent {
  readonly auth = inject(AuthService);
  readonly error = signal('');
  readonly success = signal('');
  readonly saving = signal(false);
  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, trimmedMinLength(2)],
    }),
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.error.set('');
    this.auth.profile().subscribe({
      next: (user) => {
        this.form.setValue({ name: user.name });
      },
      error: () => this.error.set('Impossible de charger votre profil.'),
    });
  }

  save(): void {
    if (this.saving()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.error.set('');
    this.success.set('');
    this.saving.set(true);
    const name = this.form.controls.name.value.trim();
    this.form.disable();

    this.auth
      .update(name)
      .pipe(
        finalize(() => {
          this.saving.set(false);
          this.form.enable();
        }),
      )
      .subscribe({
        next: (user) => {
          this.form.setValue({ name: user.name });
          this.success.set('Votre nom a bien été mis à jour.');
        },
        error: () => this.error.set('Impossible d’enregistrer votre nom. Veuillez réessayer.'),
      });
  }
}
