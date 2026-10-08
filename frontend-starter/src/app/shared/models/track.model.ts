/** Audio track metadata returned by the API. */
export interface Track {
  id: string;
  title: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  bpm: number | null;
  key: string;
  tuning: string;
  genre: string;
  level: '' | 'debutant' | 'intermediaire' | 'avance';
}

export type TrackMetadata = Pick<Track, 'bpm' | 'key' | 'tuning' | 'genre' | 'level'>;
