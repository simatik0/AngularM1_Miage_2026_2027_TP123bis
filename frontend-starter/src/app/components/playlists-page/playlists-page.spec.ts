import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authInterceptor } from '../../shared/interceptors/auth.interceptor';
import { Track } from '../../shared/models/track.model';
import { AuthService } from '../../shared/services/auth.service';
import { AudioPlaybackService } from '../../shared/services/audio-playback.service';
import { PlaylistsPageComponent } from './playlists-page';

describe('PlaylistsPageComponent', () => {
  let fixture: ComponentFixture<PlaylistsPageComponent>;
  let http: HttpTestingController;
  let playback: AudioPlaybackService;
  const track: Track = {
    id: 'track-1', title: 'Blues', originalName: 'blues.mp3',
    mimeType: 'audio/mpeg', size: 2048, createdAt: '2026-10-07T12:00:00Z',
    bpm: 120, key: '', tuning: '', genre: '', level: '',
    waveform: [],
  };
  const createObjectURL = vi.fn();
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    createObjectURL.mockReset().mockReturnValue('blob:playlist-audio');
    revokeObjectURL.mockReset();
    vi.stubGlobal('URL', class extends URL {
      static override createObjectURL = createObjectURL;
      static override revokeObjectURL = revokeObjectURL;
    });
    TestBed.configureTestingModule({
      imports: [PlaylistsPageComponent],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    TestBed.inject(AuthService).token.set('synthetic-test-token');
    playback = TestBed.inject(AudioPlaybackService);
    playback.stop();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PlaylistsPageComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    playback.stop();
    http.verify();
    vi.unstubAllGlobals();
  });

  it('centralise les playlists et permet de lancer leur contenu depuis cette page', () => {
    http.expectOne('/api/playlists').flush([
      { id: 'playlist-1', name: 'Répétition', trackIds: [track.id], createdAt: track.createdAt },
    ]);
    http.expectOne('/api/tracks?page=1&limit=20').flush({
      items: [track], page: 1, limit: 20, total: 1, pages: 1,
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Vos playlists');
    expect(fixture.nativeElement.textContent).toContain('Répétition');
    expect(fixture.nativeElement.textContent).toContain('Blues');
    (fixture.nativeElement.querySelector('.playlist-track') as HTMLButtonElement).click();
    const audioRequest = http.expectOne('/api/tracks/track-1/audio');
    audioRequest.flush(new Blob(['audio'], { type: 'audio/mpeg' }));
    expect(playback.currentTrack()?.id).toBe(track.id);
    expect(playback.audioUrl()).toBeTruthy();
  });

  it('charge toutes les pages de pistes pour pouvoir résoudre le contenu des playlists', () => {
    http.expectOne('/api/playlists').flush([]);
    http.expectOne('/api/tracks?page=1&limit=20').flush({
      items: [track], page: 1, limit: 20, total: 21, pages: 2,
    });
    http.expectOne('/api/tracks?page=2&limit=20').flush({
      items: [{ ...track, id: 'track-2', title: 'Jazz' }],
      page: 2, limit: 20, total: 21, pages: 2,
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Aucune playlist');
    expect(fixture.componentInstance.tracks()).toHaveLength(2);
  });
});
