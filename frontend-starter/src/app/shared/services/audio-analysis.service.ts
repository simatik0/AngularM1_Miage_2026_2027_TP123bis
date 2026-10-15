import { Injectable } from '@angular/core';

export interface AudioAnalysis {
  bpm: number | null;
  key: string;
  waveform: number[];
}

const NOTE_NAMES = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const WAVEFORM_BARS = 128;

@Injectable({ providedIn: 'root' })
export class AudioAnalysisService {
  async analyze(file: Blob): Promise<AudioAnalysis> {
    const AudioContextConstructor = globalThis.AudioContext;
    if (!AudioContextConstructor) {
      throw new Error('Ce navigateur ne permet pas l’analyse audio automatique.');
    }

    const context = new AudioContextConstructor();
    try {
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      return analyzeDecodedAudio(buffer);
    } finally {
      await context.close();
    }
  }
}

export function analyzeDecodedAudio(buffer: AudioBuffer): AudioAnalysis {
  const samples = mixToMono(buffer);
  return {
    bpm: estimateBpm(samples, buffer.sampleRate),
    key: estimateKey(samples, buffer.sampleRate),
    waveform: createWaveform(samples, WAVEFORM_BARS),
  };
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const left = buffer.getChannelData(0);
  if (buffer.numberOfChannels < 2) return left;
  const right = buffer.getChannelData(1);
  const mono = new Float32Array(left.length);
  for (let index = 0; index < mono.length; index++) {
    mono[index] = (left[index] + right[index]) * 0.5;
  }
  return mono;
}

function createWaveform(samples: Float32Array, bars: number): number[] {
  return Array.from({ length: bars }, (_, bar) => {
    const start = Math.floor((bar * samples.length) / bars);
    const end = Math.max(start + 1, Math.floor(((bar + 1) * samples.length) / bars));
    let peak = 0;
    for (let index = start; index < Math.min(end, samples.length); index++) {
      peak = Math.max(peak, Math.abs(samples[index]));
    }
    return Math.round(Math.min(1, peak) * 1000) / 1000;
  });
}

function estimateBpm(samples: Float32Array, sampleRate: number): number | null {
  const frameSize = Math.max(128, Math.round(sampleRate * 0.01));
  const frameCount = Math.min(Math.floor(samples.length / frameSize), 12000);
  if (frameCount < 500) return null;

  const onset = new Float32Array(frameCount);
  let previousEnergy = 0;
  for (let frame = 0; frame < frameCount; frame++) {
    const start = frame * frameSize;
    let energy = 0;
    for (let index = start; index < start + frameSize; index++) {
      energy += samples[index] * samples[index];
    }
    const rms = Math.sqrt(energy / frameSize);
    onset[frame] = Math.max(0, rms - previousEnergy);
    previousEnergy = rms;
  }

  const mean = onset.reduce((sum, value) => sum + value, 0) / onset.length;
  for (let index = 0; index < onset.length; index++) onset[index] = Math.max(0, onset[index] - mean);

  const envelopeRate = sampleRate / frameSize;
  let bestLag = 0;
  let bestScore = 0;
  for (let bpm = 55; bpm <= 200; bpm++) {
    const lag = Math.round((60 * envelopeRate) / bpm);
    let score = 0;
    for (let index = lag; index < onset.length; index++) {
      score += onset[index] * onset[index - lag];
    }
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag === 0 || bestScore === 0) return null;
  return Math.round((60 * envelopeRate) / bestLag);
}

function estimateKey(samples: Float32Array, sampleRate: number): string {
  const chroma = new Float64Array(12);
  const fftSize = 4096;
  const stride = Math.max(1, Math.floor(sampleRate / 11025));
  const analysisRate = sampleRate / stride;
  const windowSamples = fftSize * stride;
  const hopSamples = Math.max(windowSamples, Math.floor(sampleRate * 0.7));
  const maximumSamples = Math.min(samples.length, sampleRate * 90);
  const real = new Float64Array(fftSize);
  const imaginary = new Float64Array(fftSize);

  for (let start = 0; start + windowSamples <= maximumSamples; start += hopSamples) {
    for (let index = 0; index < fftSize; index++) {
      let downsampled = 0;
      for (let sample = 0; sample < stride; sample++) {
        downsampled += samples[start + index * stride + sample];
      }
      downsampled /= stride;
      real[index] = downsampled * (0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (fftSize - 1)));
      imaginary[index] = 0;
    }
    fft(real, imaginary);
    for (let bin = 2; bin < fftSize / 2; bin++) {
      const frequency = (bin * analysisRate) / fftSize;
      if (frequency < 65 || frequency > 1400) continue;
      const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
      const magnitudeSquared = real[bin] * real[bin] + imaginary[bin] * imaginary[bin];
      chroma[(midi % 12 + 12) % 12] += magnitudeSquared / Math.max(1, bin);
    }
  }

  const total = chroma.reduce((sum, value) => sum + value, 0);
  if (total === 0) return '';
  const normalized = Array.from(chroma, (value) => value / total);
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestKey = '';
  for (let root = 0; root < 12; root++) {
    for (const [mode, profile] of [['majeur', MAJOR_PROFILE], ['mineur', MINOR_PROFILE]] as const) {
      let score = 0;
      for (let note = 0; note < 12; note++) {
        score += normalized[(note + root) % 12] * profile[note];
      }
      if (score > bestScore) {
        bestScore = score;
        bestKey = `${NOTE_NAMES[root]} ${mode}`;
      }
    }
  }
  return bestKey;
}

function fft(real: Float64Array, imaginary: Float64Array): void {
  const size = real.length;
  for (let index = 1, reversed = 0; index < size; index++) {
    let bit = size >> 1;
    for (; reversed & bit; bit >>= 1) reversed ^= bit;
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
    }
  }

  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let start = 0; start < size; start += length) {
      let factorReal = 1;
      let factorImaginary = 0;
      for (let offset = 0; offset < length / 2; offset++) {
        const even = start + offset;
        const odd = even + length / 2;
        const oddReal = real[odd] * factorReal - imaginary[odd] * factorImaginary;
        const oddImaginary = real[odd] * factorImaginary + imaginary[odd] * factorReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
        const nextFactorReal = factorReal * stepReal - factorImaginary * stepImaginary;
        factorImaginary = factorReal * stepImaginary + factorImaginary * stepReal;
        factorReal = nextFactorReal;
      }
    }
  }
}
