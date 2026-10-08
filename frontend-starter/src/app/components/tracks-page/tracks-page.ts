import { DatePipe } from '@angular/common';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { finalize, Subscription } from 'rxjs';
import { Track, TrackMetadata } from '../../shared/models/track.model';
import { Playlist, TrackService } from '../../shared/services/track.service';
import { SnackBarComponent } from '../snack-bar/snack-bar';

type TrackMetadataControls = {
  bpm: FormControl<number | null>;
  key: FormControl<string>;
  tuning: FormControl<string>;
  genre: FormControl<string>;
  level: FormControl<Track['level']>;
};

type TrackUploadControls = TrackMetadataControls & {
  title: FormControl<string>;
};

@Component({
  imports: [DatePipe, ReactiveFormsModule, SnackBarComponent],
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
  readonly uploadProgress = signal<number | null>(null);
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
  readonly formatFilter = signal('');
  readonly dateFilter = signal('');
  readonly sortOrder = signal('newest');
  readonly bpmMinFilter = signal('');
  readonly bpmMaxFilter = signal('');
  readonly keyFilter = signal('');
  readonly tuningFilter = signal('');
  readonly genreFilter = signal('');
  readonly levelFilter = signal('');
  readonly favorites = signal<string[]>([]);
  readonly favoritesOnly = signal(false);
  readonly playlists = signal<Playlist[]>([]);
  readonly selectedPlaylistId = signal('');
  readonly selectedPlaylist = computed(() =>
    this.playlists().find((playlist) => playlist.id === this.selectedPlaylistId()) ?? null,
  );
  readonly playlistName = signal('');
  readonly playlistMessage = signal('');
  readonly playlistError = signal('');
  readonly queue = signal<Track[]>([]);
  readonly queueMessage = signal('');
  readonly metadataEditTrackId = signal<string | null>(null);
  readonly metadataError = signal('');
  readonly metadataSaving = signal(false);
  readonly metadataForm = new FormGroup({
    bpm: new FormControl<number | null>(null),
    key: new FormControl('', { nonNullable: true }),
    tuning: new FormControl('', { nonNullable: true }),
    genre: new FormControl('', { nonNullable: true }),
    level: new FormControl<Track['level']>('', { nonNullable: true }),
  });
  readonly visibleTracks = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase();
    const bpmMin = this.bpmMinFilter() ? Number(this.bpmMinFilter()) : null;
    const bpmMax = this.bpmMaxFilter() ? Number(this.bpmMaxFilter()) : null;
    const keyQuery = this.keyFilter().trim().toLocaleLowerCase();
    const tuningQuery = this.tuningFilter().trim().toLocaleLowerCase();
    const genreQuery = this.genreFilter().trim().toLocaleLowerCase();
    const now = Date.now();
    const dateThreshold = this.dateFilter()
      ? now - Number(this.dateFilter()) * 24 * 60 * 60 * 1000
      : 0;
    const filtered = this.tracks().filter((track) => {
      const matchesQuery = !query ||
        track.title.toLocaleLowerCase().includes(query) ||
        track.originalName.toLocaleLowerCase().includes(query);
      const matchesFormat = !this.formatFilter() || this.formatLabel(track.mimeType) === this.formatFilter();
      const matchesDate = !dateThreshold || new Date(track.createdAt).getTime() >= dateThreshold;
      const matchesBpm = (bpmMin === null || (track.bpm !== null && track.bpm >= bpmMin)) &&
        (bpmMax === null || (track.bpm !== null && track.bpm <= bpmMax));
      const matchesMusic = (!keyQuery || track.key.toLocaleLowerCase().includes(keyQuery)) &&
        (!tuningQuery || track.tuning.toLocaleLowerCase().includes(tuningQuery)) &&
        (!genreQuery || track.genre.toLocaleLowerCase().includes(genreQuery)) &&
        (!this.levelFilter() || track.level === this.levelFilter());
      return matchesQuery && matchesFormat && matchesDate && matchesBpm && matchesMusic &&
        (!this.favoritesOnly() || this.favorites().includes(track.id));
    });
    return filtered.sort((first, second) => {
      switch (this.sortOrder()) {
        case 'oldest': return first.createdAt.localeCompare(second.createdAt);
        case 'title': return first.title.localeCompare(second.title, 'fr');
        case 'bpm': return (first.bpm ?? Number.MAX_SAFE_INTEGER) - (second.bpm ?? Number.MAX_SAFE_INTEGER);
        default: return second.createdAt.localeCompare(first.createdAt);
      }
    });
  });
  readonly progressPercent = computed(() =>
    this.duration() > 0 ? Math.min(100, (this.currentTime() / this.duration()) * 100) : 0,
  );
  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true }),
    bpm: new FormControl<number | null>(null),
    key: new FormControl('', { nonNullable: true }),
    tuning: new FormControl('', { nonNullable: true }),
    genre: new FormControl('', { nonNullable: true }),
    level: new FormControl<Track['level']>('', { nonNullable: true }),
  });
  readonly title = this.form.controls.title;
  readonly file = signal<File | null>(null);

  constructor() {
    this.destroyRef.onDestroy(() => this.releaseAudio());
    this.load();
    this.loadPlaylists();
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
    const uploadMetadata = this.metadataFromForm(this.form);
    if (uploadMetadata.bpm !== null && (uploadMetadata.bpm < 20 || uploadMetadata.bpm > 300)) {
      this.uploadError.set('Le BPM doit être compris entre 20 et 300.');
      return;
    }

    this.uploading.set(true);
    this.uploadProgress.set(0);
    const title = this.title.value.trim() || file.name;
    this.title.disable();
    this.service.upload(file, title, uploadMetadata).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => {
        this.uploading.set(false);
        this.uploadProgress.set(null);
        this.title.enable();
      }),
    ).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress) {
          this.uploadProgress.set(
            event.total ? Math.min(100, Math.floor((event.loaded / event.total) * 100)) : null,
          );
        } else if (event.type === HttpEventType.Response) {
          const track = event.body;
          if (!track) {
            this.uploadError.set('Le serveur a terminé l’envoi sans renvoyer la piste créée.');
            return;
          }
          console.debug('[TracksPage] Piste envoyée', track.id);
          this.title.reset();
          this.form.patchValue({ bpm: null, key: '', tuning: '', genre: '', level: '' });
          this.file.set(null);
          const input = this.fileInput()?.nativeElement;
          if (input) input.value = '';
          this.uploadSuccess.set(`« ${track.title} » a bien été ajouté.`);
          this.load(1);
        }
      },
      error: (error) => {
        this.uploadError.set(this.errorMessage(error, 'Impossible d’envoyer le fichier. Réessayez.'));
      },
    });
  }

  play(track: Track): void {
    this.removeFromQueue(track.id);
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
          this.deleteSuccess.set(`« ${track.title} » n’est plus disponible. La bibliothèque a été actualisée.`);
          const nextPage = this.tracks().length === 1 && this.page() > 1 ? this.page() - 1 : this.page();
          this.load(nextPage);
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

  setFormatFilter(event: Event): void {
    this.formatFilter.set((event.target as HTMLSelectElement).value);
  }

  setDateFilter(event: Event): void {
    this.dateFilter.set((event.target as HTMLSelectElement).value);
  }

  setSortOrder(event: Event): void {
    this.sortOrder.set((event.target as HTMLSelectElement).value);
  }

  setBpmMinFilter(event: Event): void {
    this.bpmMinFilter.set((event.target as HTMLInputElement).value);
  }

  setBpmMaxFilter(event: Event): void {
    this.bpmMaxFilter.set((event.target as HTMLInputElement).value);
  }

  setKeyFilter(event: Event): void {
    this.keyFilter.set((event.target as HTMLInputElement).value);
  }

  setTuningFilter(event: Event): void {
    this.tuningFilter.set((event.target as HTMLInputElement).value);
  }

  setGenreFilter(event: Event): void {
    this.genreFilter.set((event.target as HTMLInputElement).value);
  }

  setLevelFilter(event: Event): void {
    this.levelFilter.set((event.target as HTMLSelectElement).value);
  }

  setPlaylistName(event: Event): void {
    this.playlistName.set((event.target as HTMLInputElement).value);
  }

  setSelectedPlaylist(event: Event): void {
    this.selectedPlaylistId.set((event.target as HTMLSelectElement).value);
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
    const [next, ...remaining] = this.queue();
    if (next) {
      this.queue.set(remaining);
      this.play(next);
    }
  }

  formatLabel(mimeType: string): string {
    const subtype = mimeType.replace('audio/', '').toLowerCase();
    if (subtype.includes('mpeg')) return 'MP3';
    if (subtype.includes('wav')) return 'WAV';
    if (subtype.includes('ogg')) return 'OGG';
    if (subtype.includes('mp4') || subtype.includes('m4a')) return 'M4A';
    return subtype.toUpperCase();
  }

  bpmVisualPercent(bpm: number): number {
    return Math.max(8, Math.min(100, ((bpm - 20) / 280) * 100));
  }

  editMetadata(track: Track): void {
    this.metadataError.set('');
    this.metadataEditTrackId.set(track.id);
    this.metadataForm.setValue({
      bpm: track.bpm,
      key: track.key,
      tuning: track.tuning,
      genre: track.genre,
      level: track.level,
    });
  }

  saveMetadata(track: Track): void {
    if (this.metadataSaving()) return;
    const metadata = this.metadataFromForm(this.metadataForm);
    if (metadata.bpm !== null && (metadata.bpm < 20 || metadata.bpm > 300)) {
      this.metadataError.set('Le BPM doit être compris entre 20 et 300.');
      return;
    }
    this.metadataSaving.set(true);
    this.metadataError.set('');
    this.service.updateMetadata(track.id, metadata).pipe(
      finalize(() => this.metadataSaving.set(false)),
    ).subscribe({
      next: (updatedTrack) => {
        this.tracks.update((tracks) => tracks.map((item) => item.id === updatedTrack.id ? updatedTrack : item));
        this.metadataEditTrackId.set(null);
      },
      error: (error: unknown) => {
        console.error('[TracksPage] Erreur de mise à jour des métadonnées', error);
        this.metadataError.set(this.errorMessage(error, 'Impossible d’enregistrer ces informations.'));
      },
    });
  }

  cancelMetadataEdit(): void {
    this.metadataEditTrackId.set(null);
    this.metadataError.set('');
  }

  loadPlaylists(): void {
    this.service.playlists().subscribe({
      next: (playlists) => this.playlists.set(playlists),
      error: (error: unknown) => {
        console.error('[TracksPage] Erreur de chargement des playlists', error);
        this.playlistError.set('Impossible de charger vos playlists.');
      },
    });
  }

  createPlaylist(): void {
    const name = this.playlistName().trim();
    if (!name || name.length > 60) {
      this.playlistError.set('Le nom doit contenir de 1 à 60 caractères.');
      return;
    }
    this.playlistError.set('');
    this.service.createPlaylist(name).subscribe({
      next: (playlist) => {
        this.playlists.update((playlists) => [playlist, ...playlists]);
        this.selectedPlaylistId.set(playlist.id);
        this.playlistName.set('');
        this.playlistMessage.set(`Playlist « ${playlist.name} » créée.`);
      },
      error: (error: unknown) => {
        console.error('[TracksPage] Erreur de création de playlist', error);
        this.playlistError.set(this.errorMessage(error, 'Impossible de créer cette playlist.'));
      },
    });
  }

  addToPlaylist(track: Track): void {
    const playlistId = this.selectedPlaylistId();
    if (!playlistId) {
      this.playlistError.set('Créez ou choisissez une playlist avant d’y ajouter un morceau.');
      return;
    }
    this.service.updatePlaylistTrack(playlistId, track.id, 'add').subscribe({
      next: (playlist) => {
        this.replacePlaylist(playlist);
        this.playlistMessage.set(`« ${track.title} » ajouté à « ${playlist.name} ».`);
        this.playlistError.set('');
      },
      error: (error: unknown) => {
        console.error('[TracksPage] Erreur d’ajout à la playlist', error);
        this.playlistError.set(this.errorMessage(error, 'Impossible de modifier cette playlist.'));
      },
    });
  }

  removeFromPlaylist(trackId: string): void {
    const playlist = this.playlists().find((item) => item.id === this.selectedPlaylistId());
    if (!playlist) return;
    this.service.updatePlaylistTrack(playlist.id, trackId, 'remove').subscribe({
      next: (updated) => this.replacePlaylist(updated),
      error: (error: unknown) => {
        console.error('[TracksPage] Erreur de retrait de playlist', error);
        this.playlistError.set(this.errorMessage(error, 'Impossible de modifier cette playlist.'));
      },
    });
  }

  deletePlaylist(): void {
    const playlist = this.playlists().find((item) => item.id === this.selectedPlaylistId());
    if (!playlist || !window.confirm(`Supprimer la playlist « ${playlist.name} » ?`)) return;
    this.service.deletePlaylist(playlist.id).subscribe({
      next: () => {
        this.playlists.update((items) => items.filter((item) => item.id !== playlist.id));
        this.selectedPlaylistId.set('');
        this.playlistMessage.set(`Playlist « ${playlist.name} » supprimée.`);
      },
      error: (error: unknown) => {
        console.error('[TracksPage] Erreur de suppression de playlist', error);
        this.playlistError.set(this.errorMessage(error, 'Impossible de supprimer cette playlist.'));
      },
    });
  }

  enqueue(track: Track): void {
    if (this.queue().some((item) => item.id === track.id) || this.currentTrack()?.id === track.id) {
      this.queueMessage.set(`« ${track.title} » est déjà en lecture ou dans la file.`);
      return;
    }
    this.queue.update((items) => [...items, track]);
    this.queueMessage.set(`« ${track.title} » ajouté à la file d’attente.`);
  }

  removeFromQueue(trackId: string): void {
    this.queue.update((items) => items.filter((item) => item.id !== trackId));
  }

  playQueued(track: Track): void {
    this.removeFromQueue(track.id);
    this.play(track);
  }

  private replacePlaylist(updated: Playlist): void {
    this.playlists.update((items) => items.map((item) => item.id === updated.id ? updated : item));
  }

  private metadataFromForm(
    form: FormGroup<TrackMetadataControls> | FormGroup<TrackUploadControls>,
  ): TrackMetadata {
    const { bpm, key, tuning, genre, level } = form.controls;
    return {
      bpm: bpm.value,
      key: key.value.trim(),
      tuning: tuning.value.trim(),
      genre: genre.value.trim(),
      level: level.value,
    };
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
    this.removeFromQueue(track.id);
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
