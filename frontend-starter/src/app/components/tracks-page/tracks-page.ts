import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { finalize, Subscription } from 'rxjs';
import { Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';

@Component({
  imports: [DatePipe, ReactiveFormsModule],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
})
export class TracksPageComponent {
  private readonly service = inject(TrackService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private readonly audioPlayer = viewChild<ElementRef<HTMLAudioElement>>('audioPlayer');
  private listRequest?: Subscription;
  private audioRequest?: Subscription;

  // Même limite et mêmes types MIME que Multer dans le backend.
  private readonly maxFileSize = 25 * 1024 * 1024;
  private readonly acceptedTypes = new Set([
    'audio/mpeg', 'audio/wav', 'audio/x-wav',
    'audio/ogg', 'audio/mp4', 'audio/x-m4a',
  ]);
  readonly acceptedFiles = '.mp3,.wav,.ogg,.m4a,audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/x-m4a';
  readonly limit = 5;

  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly loading = signal(false);
  readonly listError = signal('');
  readonly uploading = signal(false);
  readonly uploadError = signal('');
  readonly uploadSuccess = signal('');
  readonly audioLoading = signal(false);
  readonly audioError = signal('');
  readonly deleteError = signal('');
  readonly deleteSuccess = signal('');
  readonly deletingTrackId = signal<string | null>(null);
  readonly currentTrack = signal<Track | null>(null);
  readonly audioUrl = signal('');
  readonly currentTime = signal(0);
  readonly duration = signal(0);
  readonly isPlaying = signal(false);
  readonly volume = signal(1);
  readonly playbackRate = signal(1);
  readonly repeatTrack = signal(false);
  readonly searchQuery = signal('');
  readonly favorites = signal<string[]>([]);
  readonly favoritesOnly = signal(false);
  readonly visibleTracks = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase();
    return this.tracks().filter((track) => {
      const matchesQuery = !query ||
        track.title.toLocaleLowerCase().includes(query) ||
        track.originalName.toLocaleLowerCase().includes(query);
      return matchesQuery && (!this.favoritesOnly() || this.favorites().includes(track.id));
    });
  });
  readonly progressPercent = computed(() =>
    this.duration() > 0 ? Math.min(100, (this.currentTime() / this.duration()) * 100) : 0,
  );
  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true }),
  });
  readonly title = this.form.controls.title;
  readonly file = signal<File | null>(null);

  constructor() {
    this.destroyRef.onDestroy(() => this.releaseAudio());
    this.load();
  }

  choose(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.file.set(file);
    this.uploadSuccess.set('');
    this.uploadError.set(this.validateFile(file));
  }

  load(page = this.page()): void {
    // Une ancienne réponse ne doit pas écraser la page demandée ensuite.
    this.listRequest?.unsubscribe();
    this.listError.set('');
    this.loading.set(true);
    this.listRequest = this.service.list(page, this.limit).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: (response) => {
        console.debug('[TracksPage] Pistes chargées', response.items.length);
        this.tracks.set(response.items);
        this.page.set(response.page);
        this.pages.set(response.pages);
      },
      error: (error) => {
        this.listError.set(this.errorMessage(error, 'Impossible de charger les pistes. Réessayez.'));
      },
    });
  }

  go(page: number): void {
    if (this.loading() || page < 1 || page > this.pages() || page === this.page()) return;
    this.load(page);
  }

  upload(): void {
    if (this.uploading()) return;

    const file = this.file();
    this.uploadSuccess.set('');
    this.uploadError.set(this.validateFile(file));
    if (!file || this.uploadError()) return;

    this.uploading.set(true);
    const title = this.title.value.trim() || file.name;
    this.title.disable();
    this.service.upload(file, title).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => {
        this.uploading.set(false);
        this.title.enable();
      }),
    ).subscribe({
      next: (track) => {
        console.debug('[TracksPage] Piste envoyée', track.id);
        this.title.reset();
        this.file.set(null);
        const input = this.fileInput()?.nativeElement;
        if (input) input.value = '';
        this.uploadSuccess.set(`« ${track.title} » a bien été ajouté.`);
        this.load(1);
      },
      error: (error) => {
        this.uploadError.set(this.errorMessage(error, 'Impossible d’envoyer le fichier. Réessayez.'));
      },
    });
  }

  play(track: Track): void {
    this.audioRequest?.unsubscribe();
    this.releaseAudio();
    this.currentTrack.set(track);
    this.currentTime.set(0);
    this.duration.set(0);
    this.isPlaying.set(false);
    this.audioError.set('');
    this.audioLoading.set(true);
    this.audioRequest = this.service.audio(track.id).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.audioLoading.set(false)),
    ).subscribe({
      next: (blob) => {
        console.debug('[TracksPage] Audio chargé', track.id);
        this.audioUrl.set(URL.createObjectURL(blob));
      },
      error: (error) => {
        const message = error instanceof HttpErrorResponse && error.status === 404
          ? 'Cette piste est introuvable ou ne vous appartient pas.'
          : 'Impossible de charger cet audio. Réessayez.';
        this.audioError.set(this.errorMessage(error, message));
      },
    });
  }

  delete(track: Track): void {
    if (this.deletingTrackId()) return;
    const confirmed = window.confirm(`Supprimer définitivement « ${track.title} » et son fichier audio ?`);
    if (!confirmed) return;

    this.deleteError.set('');
    this.deleteSuccess.set('');
    this.deletingTrackId.set(track.id);
    this.service.delete(track.id).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.deletingTrackId.set(null)),
    ).subscribe({
      next: () => {
        this.removeTrackLocally(track);
        this.deleteSuccess.set(`« ${track.title} » et son fichier audio ont été supprimés.`);
        const nextPage = this.tracks().length === 1 && this.page() > 1 ? this.page() - 1 : this.page();
        this.load(nextPage);
      },
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          this.removeTrackLocally(track);
          this.deleteSuccess.set(`« ${track.title} » n’existe déjà plus. La bibliothèque a été actualisée.`);
          this.load(this.page());
          return;
        }
        this.deleteError.set(this.errorMessage(error, 'Impossible de supprimer cette piste. Réessayez.'));
      },
    });
  }

  toggleFavorite(trackId: string): void {
    this.favorites.update((favorites) =>
      favorites.includes(trackId)
        ? favorites.filter((id) => id !== trackId)
        : [...favorites, trackId],
    );
  }

  toggleFavoritesFilter(): void {
    this.favoritesOnly.update((enabled) => !enabled);
  }

  setSearchQuery(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  togglePlayback(): void {
    const audio = this.audioPlayer()?.nativeElement;
    if (!audio || !this.audioUrl()) return;
    if (audio.paused) {
      void audio.play().catch((error: unknown) => {
        this.audioError.set(this.errorMessage(error, 'Impossible de démarrer la lecture audio.'));
      });
    } else {
      audio.pause();
    }
  }

  seek(event: Event): void {
    const audio = this.audioPlayer()?.nativeElement;
    const target = event.target as HTMLInputElement;
    const nextTime = Number(target.value);
    if (!audio || !Number.isFinite(nextTime)) return;
    audio.currentTime = nextTime;
    this.currentTime.set(nextTime);
  }

  setVolume(event: Event): void {
    const nextVolume = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(nextVolume)) return;
    this.volume.set(nextVolume);
    const audio = this.audioPlayer()?.nativeElement;
    if (audio) audio.volume = nextVolume;
  }

  setPlaybackRate(event: Event): void {
    const nextRate = Number((event.target as HTMLSelectElement).value);
    if (!Number.isFinite(nextRate)) return;
    this.playbackRate.set(nextRate);
    const audio = this.audioPlayer()?.nativeElement;
    if (audio) audio.playbackRate = nextRate;
  }

  toggleRepeat(): void {
    this.repeatTrack.update((repeat) => !repeat);
    const audio = this.audioPlayer()?.nativeElement;
    if (audio) audio.loop = this.repeatTrack();
  }

  syncAudioTime(): void {
    const audio = this.audioPlayer()?.nativeElement;
    if (!audio) return;
    this.currentTime.set(audio.currentTime);
    if (Number.isFinite(audio.duration)) this.duration.set(audio.duration);
  }

  onPlaybackChange(playing: boolean): void {
    this.isPlaying.set(playing);
  }

  onAudioEnded(): void {
    this.isPlaying.set(false);
  }

  formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remainingSeconds}`;
  }

  onAudioError(): void {
    this.audioError.set('Le navigateur ne peut pas lire ce fichier audio. Il est peut-être endommagé ou son encodage n’est pas pris en charge.');
    this.releaseAudio();
  }

  private removeTrackLocally(track: Track): void {
    this.favorites.update((favorites) => favorites.filter((id) => id !== track.id));
    if (this.currentTrack()?.id !== track.id) return;
    this.audioRequest?.unsubscribe();
    this.releaseAudio();
    this.currentTrack.set(null);
    this.currentTime.set(0);
    this.duration.set(0);
    this.isPlaying.set(false);
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    const divisor = bytes < 1024 * 1024 ? 1024 : 1024 * 1024;
    const unit = divisor === 1024 ? 'Ko' : 'Mo';
    return `${(bytes / divisor).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${unit}`;
  }

  private validateFile(file: File | null): string {
    if (!file) return 'Choisissez un fichier audio.';
    if (!this.acceptedTypes.has(file.type)) return 'Format non accepté. Choisissez un fichier MP3, WAV, OGG ou M4A.';
    if (file.size === 0) return 'Le fichier audio est vide.';
    if (file.size > this.maxFileSize) return 'Le fichier dépasse la limite de 25 Mo.';
    return '';
  }

  private releaseAudio(): void {
    const url = this.audioUrl();
    if (url) URL.revokeObjectURL(url);
    this.audioUrl.set('');
    this.isPlaying.set(false);
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) return fallback;
    if (error.status === 0) return 'Le serveur est injoignable. Vérifiez votre connexion puis réessayez.';
    const body: unknown = error.error;
    if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
      return body.message === 'File too large' ? 'Le fichier dépasse la limite de 25 Mo.' : body.message;
    }
    // Une erreur HTTP audio peut contenir un Blob au lieu d'un objet JSON.
    return fallback;
  }
}
