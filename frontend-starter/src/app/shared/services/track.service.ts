import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Page } from '../models/page.model';
import { Track, TrackAnalysis, TrackMetadata } from '../models/track.model';

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: string;
}

/** Encapsulates all HTTP operations for backing tracks. */
@Injectable({ providedIn: 'root' })
export class TrackService {
  private readonly http = inject(HttpClient);

  list(page = 1, limit = 5) {
    return this.http.get<Page<Track>>('/api/tracks', {
      params: { page, limit },
    });
  }

  upload(file: File, title: string, analysis: TrackAnalysis) {
    const body = new FormData();
    body.append('audio', file);
    body.append('title', title);
    body.append('bpm', analysis.bpm === null ? '' : String(analysis.bpm));
    body.append('key', analysis.key);
    body.append('tuning', '');
    body.append('genre', '');
    body.append('level', '');
    body.append('waveform', JSON.stringify(analysis.waveform));
    return this.http.post<Track>('/api/tracks', body, {
      observe: 'events',
      reportProgress: true,
    });
  }

  audio(id: string) {
    return this.http.get(`/api/tracks/${id}/audio`, {
      responseType: 'blob',
    });
  }

  delete(id: string) {
    return this.http.delete<void>(`/api/tracks/${id}`);
  }

  updateAnalysis(id: string, analysis: TrackAnalysis) {
    return this.http.put<Track>(`/api/tracks/${id}`, analysis);
  }

  updateMetadata(id: string, metadata: TrackMetadata) {
    return this.http.put<Track>(`/api/tracks/${id}`, metadata);
  }

  playlists() {
    return this.http.get<Playlist[]>('/api/playlists');
  }

  createPlaylist(name: string) {
    return this.http.post<Playlist>('/api/playlists', { name });
  }

  updatePlaylistTrack(playlistId: string, trackId: string, action: 'add' | 'remove') {
    return this.http.put<Playlist>(`/api/playlists/${playlistId}/tracks`, { trackId, action });
  }

  deletePlaylist(id: string) {
    return this.http.delete<void>(`/api/playlists/${id}`);
  }
}
