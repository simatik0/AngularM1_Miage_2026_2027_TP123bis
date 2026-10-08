import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Page } from '../models/page.model';
import { Track, TrackMetadata } from '../models/track.model';

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

  upload(file: File, title: string, metadata: TrackMetadata) {
    const body = new FormData();
    body.append('audio', file);
    body.append('title', title);
    for (const [key, value] of Object.entries(metadata)) {
      if (value !== null && value !== '') body.append(key, String(value));
    }
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
