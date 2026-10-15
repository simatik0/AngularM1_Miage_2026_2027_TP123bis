import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { finalize, Subscription } from 'rxjs';
import { Track } from '../models/track.model';
import { TrackService } from './track.service';

@Injectable({ providedIn: 'root' })
export class AudioPlaybackService {
  private readonly tracksService = inject(TrackService);
  private audioRequest?: Subscription;
  private autoPlayPending = false;

  readonly currentTrack = signal<Track | null>(null);
  readonly audioUrl = signal('');
  readonly audioBlob = signal<Blob | null>(null);
  readonly audioLoading = signal(false);
  readonly audioError = signal('');
  readonly currentTime = signal(0);
  readonly duration = signal(0);
  readonly isPlaying = signal(false);
  readonly volume = signal(1);
  readonly playbackRate = signal(1);
  readonly repeatTrack = signal(false);
  readonly queue = signal<Track[]>([]);

  play(track: Track): void {
    this.removeFromQueue(track.id);
    this.audioRequest?.unsubscribe();
    this.releaseAudio();
    this.currentTrack.set(track);
    this.currentTime.set(0);
    this.duration.set(0);
    this.audioError.set('');
    this.autoPlayPending = true;
    this.audioLoading.set(true);
    this.audioRequest = this.tracksService.audio(track.id).pipe(
      finalize(() => this.audioLoading.set(false)),
    ).subscribe({
      next: (blob) => {
        console.debug('[AudioPlayback] Audio chargé', track.id);
        this.audioBlob.set(blob);
        this.audioUrl.set(URL.createObjectURL(blob));
      },
      error: (error: unknown) => {
        this.autoPlayPending = false;
        this.audioError.set(this.audioErrorFallback(error));
        void this.resolveAudioError(error, track.id);
      },
    });
  }

  togglePlayback(audio: HTMLAudioElement | undefined): void {
    if (!audio || !this.audioUrl()) return;
    if (audio.paused) {
      this.audioError.set('');
      void audio.play().catch((error: unknown) => {
        const message = error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Le navigateur a bloqué le démarrage automatique. Utilisez le bouton lecture du lecteur.'
          : 'Impossible de démarrer la lecture audio.';
        this.audioError.set(this.errorMessage(error, message));
      });
    } else {
      audio.pause();
    }
  }

  onCanPlay(audio: HTMLAudioElement | undefined): void {
    if (!this.autoPlayPending) return;
    this.autoPlayPending = false;
    this.togglePlayback(audio);
  }

  syncTime(audio: HTMLAudioElement | undefined): void {
    if (!audio) return;
    this.currentTime.set(audio.currentTime);
    if (Number.isFinite(audio.duration)) this.duration.set(audio.duration);
  }

  seek(audio: HTMLAudioElement | undefined, time: number): void {
    if (!audio || !Number.isFinite(time)) return;
    audio.currentTime = time;
    this.currentTime.set(time);
  }

  setVolume(audio: HTMLAudioElement | undefined, volume: number): void {
    if (!Number.isFinite(volume)) return;
    this.volume.set(volume);
    if (audio) audio.volume = volume;
  }

  setPlaybackRate(audio: HTMLAudioElement | undefined, rate: number): void {
    if (!Number.isFinite(rate)) return;
    this.playbackRate.set(rate);
    if (audio) audio.playbackRate = rate;
  }

  toggleRepeat(audio: HTMLAudioElement | undefined): void {
    this.repeatTrack.update((repeat) => !repeat);
    if (audio) audio.loop = this.repeatTrack();
  }

  onPlaybackChange(playing: boolean): void {
    this.isPlaying.set(playing);
  }

  onEnded(): void {
    this.isPlaying.set(false);
    const [next, ...remaining] = this.queue();
    if (!next) return;
    this.queue.set(remaining);
    this.play(next);
  }

  onError(): void {
    this.audioError.set('Le navigateur ne peut pas lire ce fichier audio. Il est peut-être endommagé ou son encodage n’est pas pris en charge.');
    this.releaseAudio();
  }

  enqueue(track: Track): void {
    if (this.queue().some((item) => item.id === track.id) || this.currentTrack()?.id === track.id) return;
    this.queue.update((items) => [...items, track]);
  }

  removeFromQueue(trackId: string): void {
    this.queue.update((items) => items.filter((item) => item.id !== trackId));
  }

  playQueued(track: Track): void {
    this.removeFromQueue(track.id);
    this.play(track);
  }

  clearQueue(): void {
    this.queue.set([]);
  }

  stopTrack(trackId: string): void {
    this.removeFromQueue(trackId);
    if (this.currentTrack()?.id !== trackId) return;
    this.audioRequest?.unsubscribe();
    this.releaseAudio();
    this.currentTrack.set(null);
    this.currentTime.set(0);
    this.duration.set(0);
  }

  stop(): void {
    this.audioRequest?.unsubscribe();
    this.releaseAudio();
    this.currentTrack.set(null);
    this.currentTime.set(0);
    this.duration.set(0);
  }

  formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remainingSeconds}`;
  }

  private releaseAudio(): void {
    const url = this.audioUrl();
    if (url) URL.revokeObjectURL(url);
    this.audioUrl.set('');
    this.audioBlob.set(null);
    this.isPlaying.set(false);
    this.autoPlayPending = false;
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) return fallback;
    if (error.status === 0) return 'Le serveur est injoignable. Vérifiez votre connexion puis réessayez.';
    const body: unknown = error.error;
    if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
      return body.message;
    }
    return fallback;
  }

  private audioErrorFallback(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 404) {
      return 'Cette piste est introuvable ou ne vous appartient pas.';
    }
    return 'Impossible de charger cet audio. Réessayez.';
  }

  private async resolveAudioError(error: unknown, trackId: string): Promise<void> {
    if (!(error instanceof HttpErrorResponse) || !(error.error instanceof Blob)) return;
    try {
      const body: unknown = JSON.parse(await error.error.text());
      if (
        body && typeof body === 'object' &&
        'message' in body && typeof body.message === 'string' &&
        this.currentTrack()?.id === trackId
      ) this.audioError.set(
        body.message === 'Piste inconnue' ? this.audioErrorFallback(error) : body.message,
      );
    } catch (parseError: unknown) {
      console.warn('[AudioPlayback] La réponse d’erreur audio n’est pas un JSON lisible', parseError);
    }
  }
}
