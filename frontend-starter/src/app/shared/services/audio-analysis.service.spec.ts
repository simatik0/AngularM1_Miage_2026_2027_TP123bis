import { describe, expect, it } from 'vitest';
import { analyzeDecodedAudio } from './audio-analysis.service';

describe('Analyse audio locale', () => {
  it('calcule un tempo, une tonalité et une forme d’onde à partir du signal PCM', () => {
    const sampleRate = 8000;
    const seconds = 12;
    const samples = new Float32Array(sampleRate * seconds);
    const notes = [261.63, 329.63, 392];

    for (let index = 0; index < samples.length; index++) {
      const time = index / sampleRate;
      samples[index] = notes.reduce(
        (sum, frequency) => sum + 0.12 * Math.sin(2 * Math.PI * frequency * time),
        0,
      );
      if (time % 0.5 < 0.02) {
        samples[index] += 0.7 * Math.sin(2 * Math.PI * 1000 * time);
      }
    }

    const decoded = {
      numberOfChannels: 1,
      sampleRate,
      getChannelData: () => samples,
    } as unknown as AudioBuffer;

    const result = analyzeDecodedAudio(decoded);

    expect(result.bpm).toBeGreaterThanOrEqual(118);
    expect(result.bpm).toBeLessThanOrEqual(122);
    expect(result.key).toBe('Do majeur');
    expect(result.waveform).toHaveLength(128);
    expect(Math.max(...result.waveform)).toBeGreaterThan(0.5);
    expect(result.waveform.every((amplitude) => amplitude >= 0 && amplitude <= 1)).toBe(true);
  });
});
