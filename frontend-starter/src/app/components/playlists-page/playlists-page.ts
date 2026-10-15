import { Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { Track } from '../../shared/models/track.model';
import { AudioPlaybackService } from '../../shared/services/audio-playback.service';
import { Playlist, TrackService } from '../../shared/services/track.service';

@Component({
  imports: [RouterLink],
  templateUrl: './playlists-page.html',
  styleUrl: './playlists-page.css',
})
export class PlaylistsPageComponent {
  private readonly service = inject(TrackService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly playback = inject(AudioPlaybackService);

  readonly playlists = signal<Playlist[]>([]);
  readonly tracks = signal<Track[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly actionError = signal('');
  readonly success = signal('');

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      playlists: this.service.playlists(),
      firstPage: this.service.list(1, 20),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ playlists, firstPage }) => {
        this.playlists.set(playlists);
        if (firstPage.pages <= 1) {
          this.tracks.set(firstPage.items);
          this.loading.set(false);
          return;
        }
        const remainingPages = Array.from({ length: firstPage.pages - 1 }, (_, index) => index + 2);
        forkJoin(remainingPages.map((page) => this.service.list(page, 20)))
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (pages) => {
              this.tracks.set([...firstPage.items, ...pages.flatMap((page) => page.items)]);
              this.loading.set(false);
            },
            error: (error: unknown) => this.failLoading(error),
          });
      },
      error: (error: unknown) => this.failLoading(error),
    });
  }

  tracksFor(playlist: Playlist): Track[] {
    return playlist.trackIds
      .map((id) => this.tracks().find((track) => track.id === id))
      .filter((track): track is Track => track !== undefined);
  }

  play(track: Track): void {
    this.playback.play(track);
  }

  playPlaylist(playlist: Playlist): void {
    const tracks = this.tracksFor(playlist);
    if (!tracks.length) return;
    this.playback.clearQueue();
    for (const track of tracks.slice(1)) this.playback.enqueue(track);
    this.playback.play(tracks[0]);
  }

  removeTrack(playlist: Playlist, track: Track): void {
    this.actionError.set('');
    this.success.set('');
    this.service.updatePlaylistTrack(playlist.id, track.id, 'remove')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.playlists.update((items) => items.map((item) => item.id === updated.id ? updated : item));
          this.success.set(`« ${track.title} » retiré de « ${playlist.name} ».`);
        },
        error: (error: unknown) => {
          console.error('[PlaylistsPage] Erreur de retrait de piste', error);
          this.actionError.set(this.message(error, 'Impossible de modifier cette playlist.'));
        },
      });
  }

  deletePlaylist(playlist: Playlist): void {
    if (!window.confirm(`Supprimer la playlist « ${playlist.name} » ?`)) return;
    this.actionError.set('');
    this.success.set('');
    this.service.deletePlaylist(playlist.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.playlists.update((items) => items.filter((item) => item.id !== playlist.id));
        this.success.set(`Playlist « ${playlist.name} » supprimée.`);
      },
      error: (error: unknown) => {
        console.error('[PlaylistsPage] Erreur de suppression de playlist', error);
        this.actionError.set(this.message(error, 'Impossible de supprimer cette playlist.'));
      },
    });
  }

  private failLoading(error: unknown): void {
    console.error('[PlaylistsPage] Erreur de chargement des playlists et pistes', error);
    this.error.set(this.message(error, 'Impossible de charger vos playlists et vos pistes.'));
    this.loading.set(false);
  }

  private message(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && error.status === 0) {
      return 'Le serveur est injoignable. Vérifiez votre connexion puis réessayez.';
    }
    if (
      error instanceof HttpErrorResponse &&
      error.error && typeof error.error === 'object' &&
      'message' in error.error && typeof error.error.message === 'string'
    ) return error.error.message;
    return fallback;
  }
}
