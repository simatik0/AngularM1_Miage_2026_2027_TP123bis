import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
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
  readonly imageSaving = signal(false);
  readonly imageError = signal('');
  private readonly imageInput = viewChild<ElementRef<HTMLInputElement>>('imageInput');
  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, trimmedMinLength(2)],
    }),
    bio: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.error.set('');
    this.auth.profile().subscribe({
      next: (user) => {
        this.form.setValue({ name: user.name, bio: user.bio || '' });
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
    const bio = this.form.controls.bio.value.trim();
    this.form.disable();

    this.auth
      .updateProfile(name, bio)
      .pipe(
        finalize(() => {
          this.saving.set(false);
          this.form.enable();
        }),
      )
      .subscribe({
        next: (user) => {
          this.form.setValue({ name: user.name, bio: user.bio || '' });
          this.success.set('Votre profil a bien été mis à jour.');
        },
        error: () => this.error.set('Impossible d’enregistrer votre profil. Veuillez réessayer.'),
      });
  }

  chooseImage(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.imageError.set('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.imageError.set('Choisissez une image JPG, PNG ou WebP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.imageError.set('La photo ne doit pas dépasser 2 Mo.');
      return;
    }
    this.imageSaving.set(true);
    this.auth.uploadAvatar(file).pipe(finalize(() => this.imageSaving.set(false))).subscribe({
      next: () => {
        this.success.set('Votre photo de profil a été mise à jour.');
        const input = this.imageInput()?.nativeElement;
        if (input) input.value = '';
      },
      error: (error: unknown) => {
        console.error('[ProfilePage] Erreur de mise à jour de la photo', error);
        this.imageError.set('Impossible d’enregistrer cette photo. Réessayez.');
      },
    });
  }

  removeImage(): void {
    if (this.imageSaving()) return;
    this.imageSaving.set(true);
    this.auth.deleteAvatar().pipe(finalize(() => this.imageSaving.set(false))).subscribe({
      next: () => this.success.set('La photo de profil a été supprimée.'),
      error: (error: unknown) => {
        console.error('[ProfilePage] Erreur de suppression de la photo', error);
        this.imageError.set('Impossible de supprimer la photo de profil.');
      },
    });
  }
}
