import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { AudioPlaybackService } from '../../shared/services/audio-playback.service';

@Component({
  selector: 'app-audio-player',
  templateUrl: './audio-player.html',
  styleUrl: './audio-player.css',
})
export class AudioPlayerComponent {
  readonly playback = inject(AudioPlaybackService);
  readonly waveformOpen = signal(false);
  readonly waveform = signal<number[]>([]);
  readonly waveformLoading = signal(false);
  readonly waveformError = signal('');
  readonly waveformProgress = computed(() => {
    const duration = this.playback.duration();
    if (duration <= 0) return 0;
    return Math.min(100, Math.max(0, (this.playback.currentTime() / duration) * 100));
  });
  private readonly audioPlayer = viewChild<ElementRef<HTMLAudioElement>>('audioPlayer');

  onCanPlay(): void {
    this.playback.onCanPlay(this.audioPlayer()?.nativeElement);
  }

  togglePlayback(): void {
    this.playback.togglePlayback(this.audioPlayer()?.nativeElement);
  }

  seek(event: Event): void {
    const time = Number((event.target as HTMLInputElement).value);
    this.playback.seek(this.audioPlayer()?.nativeElement, time);
  }

  setVolume(event: Event): void {
    const volume = Number((event.target as HTMLInputElement).value);
    this.playback.setVolume(this.audioPlayer()?.nativeElement, volume);
  }

  setPlaybackRate(event: Event): void {
    const rate = Number((event.target as HTMLSelectElement).value);
    this.playback.setPlaybackRate(this.audioPlayer()?.nativeElement, rate);
  }

  toggleRepeat(): void {
    this.playback.toggleRepeat(this.audioPlayer()?.nativeElement);
  }

  onTimeUpdate(): void {
    this.playback.syncTime(this.audioPlayer()?.nativeElement);
  }

  openWaveform(): void {
    this.waveformOpen.set(true);
    this.waveformError.set('');
    if (this.waveform().length || this.waveformLoading()) return;
    const blob = this.playback.audioBlob();
    if (!blob) {
      this.waveformError.set('La forme d’onde sera disponible une fois le fichier audio chargé.');
      return;
    }
    if (typeof AudioContext === 'undefined') {
      this.waveformError.set('La visualisation de la forme d’onde n’est pas prise en charge par ce navigateur.');
      return;
    }

    this.waveformLoading.set(true);
    void this.decodeWaveform(blob);
  }

  closeWaveform(): void {
    this.waveformOpen.set(false);
  }

  formatTime(seconds: number): string {
    return this.playback.formatTime(seconds);
  }

  private async decodeWaveform(blob: Blob): Promise<void> {
    const context = new AudioContext();
    try {
      const buffer = await context.decodeAudioData(await blob.arrayBuffer());
      const channel = buffer.getChannelData(0);
      const barCount = 96;
      const samplesPerBar = Math.max(1, Math.floor(channel.length / barCount));
      const peaks = Array.from({ length: barCount }, (_, index) => {
        const start = index * samplesPerBar;
        const end = Math.min(channel.length, start + samplesPerBar);
        let peak = 0;
        for (let sample = start; sample < end; sample++) {
          peak = Math.max(peak, Math.abs(channel[sample]));
        }
        return Math.max(5, Math.round(peak * 100));
      });
      this.waveform.set(peaks);
    } catch (error: unknown) {
      console.error('[AudioPlayer] Impossible de générer la forme d’onde', error);
      this.waveformError.set('Impossible de générer la forme d’onde pour ce fichier audio.');
    } finally {
      this.waveformLoading.set(false);
      await context.close();
    }
  }
}
