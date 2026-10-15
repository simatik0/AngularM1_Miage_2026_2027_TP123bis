import { DatePipe } from '@angular/common';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { Component, computed, DestroyRef, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { finalize, Subscription } from 'rxjs';
import { Track, TrackAnalysis, TrackMetadata } from '../../shared/models/track.model';
import { Playlist, TrackService } from '../../shared/services/track.service';
import { AudioPlaybackService } from '../../shared/services/audio-playback.service';
import { AudioAnalysisService } from '../../shared/services/audio-analysis.service';
import { SnackBarComponent } from '../snack-bar/snack-bar';

type TrackMetadataControls = {
  bpm: FormControl<number | null>;
  key: FormControl<string>;
  tuning: FormControl<string>;
  genre: FormControl<string>;
  level: FormControl<Track['level']>;
};

@Component({
  imports: [DatePipe, ReactiveFormsModule, SnackBarComponent],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
})
export class TracksPageComponent {
  private readonly service = inject(TrackService);
  private readonly playback = inject(AudioPlaybackService);
  private readonly audioAnalysis = inject(AudioAnalysisService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private listRequest?: Subscription;
  private destroyed = false;

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
  readonly analysisStatus = signal('');
  readonly uploadProgress = signal<number | null>(null);
  readonly uploadError = signal('');
  readonly uploadSuccess = signal('');
  readonly audioLoading = this.playback.audioLoading;
  readonly audioError = this.playback.audioError;
  readonly deleteError = signal('');
  readonly deleteSuccess = signal('');
  readonly deletingTrackId = signal<string | null>(null);
  readonly currentTrack = this.playback.currentTrack;
  readonly audioUrl = this.playback.audioUrl;
  readonly currentTime = this.playback.currentTime;
  readonly duration = this.playback.duration;
  readonly isPlaying = this.playback.isPlaying;
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
  readonly playlistError = signal('');
  readonly playlistDialogOpen = signal(false);
  readonly playlistDraftName = signal('');
  readonly pendingPlaylistTrack = signal<Track | null>(null);
  readonly createdPlaylistForTrack = signal<Playlist | null>(null);
  readonly trackMenu = signal<Track | null>(null);
  readonly trackMenuX = signal(0);
  readonly trackMenuY = signal(0);
  readonly queue = this.playback.queue;
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
  });
  readonly title = this.form.controls.title;
  readonly file = signal<File | null>(null);

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
    });
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

  async upload(): Promise<void> {
    if (this.uploading()) return;

    const file = this.file();
    this.uploadSuccess.set('');
    this.uploadError.set(this.validateFile(file));
    if (!file || this.uploadError()) return;
    this.uploading.set(true);
    this.analysisStatus.set('Analyse audio en cours…');
    this.uploadProgress.set(null);
    const title = this.title.value.trim() || file.name;
    this.form.disable();
    let analysis: TrackAnalysis;
    try {
      analysis = await this.audioAnalysis.analyze(file);
    } catch (error: unknown) {
      console.error('[TracksPage] Erreur d’analyse du fichier audio', error);
      if (!this.destroyed) {
        this.uploadError.set(
          'Impossible d’analyser ce fichier audio dans votre navigateur. Essayez un MP3, WAV, OGG ou M4A lisible.',
        );
        this.uploading.set(false);
        this.analysisStatus.set('');
        this.form.enable();
      }
      return;
    }
    if (this.destroyed) return;

    this.analysisStatus.set('Analyse terminée, envoi du morceau…');
    this.uploadProgress.set(0);
    this.service.upload(file, title, analysis).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => {
        this.uploading.set(false);
        this.uploadProgress.set(null);
        this.analysisStatus.set('');
        this.form.enable();
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
    this.playback.play(track);
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

  showTrackMenu(event: MouseEvent, track: Track): void {
    event.preventDefault();
    this.trackMenu.set(track);
    this.trackMenuX.set(Math.max(8, Math.min(event.clientX, window.innerWidth - 220)));
    this.trackMenuY.set(Math.max(8, Math.min(event.clientY, window.innerHeight - 220)));
  }

  @HostListener('document:click', ['$event'])
  closeTrackMenuOnOutsideClick(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Element && target.closest('.track-context-menu, .track-row__more')) return;
    this.trackMenu.set(null);
  }

  closeTrackMenu(): void {
    this.trackMenu.set(null);
  }

  openPlaylistDialog(track: Track): void {
    this.pendingPlaylistTrack.set(track);
    this.createdPlaylistForTrack.set(null);
    this.playlistDraftName.set('');
    this.playlistError.set('');
    this.playlistDialogOpen.set(true);
    this.closeTrackMenu();
  }

  closePlaylistDialog(): void {
    this.playlistDialogOpen.set(false);
    this.pendingPlaylistTrack.set(null);
    this.createdPlaylistForTrack.set(null);
    this.playlistError.set('');
  }

  setPlaylistDraftName(event: Event): void {
    this.playlistDraftName.set((event.target as HTMLInputElement).value);
  }

  addTrackToPlaylist(playlistId: string, track: Track): void {
    this.playlistError.set('');
    this.service.updatePlaylistTrack(playlistId, track.id, 'add')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.replacePlaylist(updated);
          this.closeTrackMenu();
        },
        error: (error: unknown) => {
          console.error('[TracksPage] Erreur d’ajout à la playlist', error);
          this.playlistError.set(this.errorMessage(error, 'Impossible d’ajouter cette piste à la playlist.'));
        },
      });
  }

  createPlaylistForTrack(): void {
    const existingPlaylist = this.createdPlaylistForTrack();
    if (existingPlaylist) {
      this.addCreatedPlaylistTrack(existingPlaylist);
      return;
    }
    const name = this.playlistDraftName().trim();
    const track = this.pendingPlaylistTrack();
    if (!track) return;
    if (!name || name.length > 60) {
      this.playlistError.set('Le nom doit contenir de 1 à 60 caractères.');
      return;
    }
    this.playlistError.set('');
    this.service.createPlaylist(name).pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (playlist) => {
        this.playlists.update((items) => [playlist, ...items]);
        this.createdPlaylistForTrack.set(playlist);
        this.addCreatedPlaylistTrack(playlist);
      },
      error: (error: unknown) => {
        console.error('[TracksPage] Erreur de création de playlist', error);
        this.playlistError.set(this.errorMessage(error, 'Impossible de créer cette playlist.'));
      },
    });
  }

  private addCreatedPlaylistTrack(playlist: Playlist): void {
    const track = this.pendingPlaylistTrack();
    if (!track) return;
    this.service.updatePlaylistTrack(playlist.id, track.id, 'add')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.replacePlaylist(updated);
          this.closePlaylistDialog();
        },
        error: (error: unknown) => {
          console.error('[TracksPage] Playlist créée, mais piste non ajoutée', error);
          this.playlistError.set(this.errorMessage(
            error,
            `La playlist « ${playlist.name} » est créée, mais impossible d’y ajouter cette piste. Réessayez.`,
          ));
        },
      });
  }

  formatLabel(mimeType: string): string {
    const subtype = mimeType.replace('audio/', '').toLowerCase();
    if (subtype.includes('mpeg')) return 'MP3';
    if (subtype.includes('wav')) return 'WAV';
    if (subtype.includes('ogg')) return 'OGG';
    if (subtype.includes('mp4') || subtype.includes('m4a')) return 'M4A';
    return subtype.toUpperCase();
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
    this.service.playlists().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (playlists) => this.playlists.set(playlists),
      error: (error: unknown) => {
        console.error('[TracksPage] Erreur de chargement des playlists', error);
        this.playlistError.set('Impossible de charger vos playlists.');
      },
    });
  }

  enqueue(track: Track): void {
    this.playback.enqueue(track);
  }

  removeFromQueue(trackId: string): void {
    this.playback.removeFromQueue(trackId);
  }

  playQueued(track: Track): void {
    this.playback.playQueued(track);
  }

  private replacePlaylist(updated: Playlist): void {
    this.playlists.update((items) => items.map((item) => item.id === updated.id ? updated : item));
  }

  private metadataFromForm(
    form: FormGroup<TrackMetadataControls>,
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

  private removeTrackLocally(track: Track): void {
    this.favorites.update((favorites) => favorites.filter((id) => id !== track.id));
    this.playback.stopTrack(track.id);
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
