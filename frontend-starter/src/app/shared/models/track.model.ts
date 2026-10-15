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
  waveform: number[];
}

export type TrackAnalysis = Pick<Track, 'bpm' | 'key' | 'waveform'>;
