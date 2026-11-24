import { ADTS, FLAC, MATROSKA, MP3, MP4, OGG, WAVE, WEBM, AudioSampleSink, AudioSampleSource,
  BlobSource, BufferTarget, CanvasSource, Input, Output, WebMOutputFormat, canEncodeAudio, canEncodeVideo,
  type InputAudioTrack } from 'mediabunny';
import { countToSeconds, sampleProject, secondsToCount, serializeProject, setStartCount } from './domain';
import type { Project, TimelineSample } from './types';

export const VIDEO_LIMITS = { seconds: 120, bytes: 64 * 1024 * 1024 } as const;
export const VIDEO_RESOLUTIONS = {
  '480p': { width: 854, height: 480, bitrate: 900_000 },
  '720p': { width: 1280, height: 720, bitrate: 1_800_000 },
  '1080p': { width: 1920, height: 1080, bitrate: 3_500_000 },
} as const;
export const VIDEO_FRAME_RATES = [15, 24, 30] as const;
const recordingFormats = [ADTS, FLAC, MATROSKA, MP3, MP4, OGG, WAVE, WEBM];

export function videoTiming(project: Project, from: number, to: number, fps: number) {
  const startCount = setStartCount(project, from);
  const endCount = setStartCount(project, to);
  const start = countToSeconds(project, startCount);
  const end = countToSeconds(project, endCount);
  const duration = end - start;
  return { start, startCount, endCount, duration, frames: Math.ceil(duration * fps - 1e-9) + 1 };
}

export function countAtVideoFrame(project: Project, timing: ReturnType<typeof videoTiming>, frame: number, fps: number): number {
  if (frame === 0) return timing.startCount;
  if (frame === timing.frames - 1) return timing.endCount;
  return secondsToCount(project, timing.start + frame / fps);
}

async function addRecording(track: InputAudioTrack, source: AudioSampleSource, start: number, duration: number, check: () => void) {
  const end = start + duration;
  const outsideRange = () => new Error('The recording falls outside this set range. Choose a different range or export without audio.');
  if (end <= 0) throw outsideRange();
  const sink = new AudioSampleSink(track);
  let added = false;
  for await (const original of sink.samples(Math.max(0, start), end)) {
    try {
      check();
      const { timestamp, sampleRate, numberOfFrames } = original;
      const from = Math.max(0, Math.ceil((Math.max(0, start) - timestamp) * sampleRate - 1e-6));
      const to = Math.min(numberOfFrames, Math.floor((end - timestamp) * sampleRate + 1e-6));
      if (to <= from) continue;
      const sample = original.trim(from, to);
      try {
        sample.setTimestamp(Math.max(0, sample.timestamp - start));
        await source.add(sample);
        added = true;
      } finally { sample.close(); }
    } finally { original.close(); }
  }
  if (!added) throw outsideRange();
  source.close();
}

export async function renderRehearsalVideo({ project, timing, resolution, fps, recording, draw, signal, onProgress }: {
  project: Project;
  timing: ReturnType<typeof videoTiming>;
  resolution: keyof typeof VIDEO_RESOLUTIONS;
  fps: typeof VIDEO_FRAME_RATES[number];
  recording?: Blob;
  draw: (sample: TimelineSample, context: CanvasRenderingContext2D) => void;
  signal: AbortSignal;
  onProgress: (complete: number) => void;
}): Promise<ArrayBuffer> {
  if (timing.duration <= 0 || timing.duration > VIDEO_LIMITS.seconds) throw new Error(`Choose a set range of up to ${VIDEO_LIMITS.seconds} seconds.`);
  const { width, height, bitrate } = VIDEO_RESOLUTIONS[resolution];
  const videoConfig = { codec: 'vp8', bitrate, latencyMode: 'quality' } as const;
  const audioConfig = { codec: 'opus', bitrate: 128_000, transform: { sampleRate: 48_000, numberOfChannels: 2 } } as const;
  const limitError = () => new Error('The export exceeded 64 MiB. Try a shorter range or a lower resolution.');
  if (!await canEncodeVideo(videoConfig.codec, { ...videoConfig, width, height, frameRate: fps })) {
    throw new Error('This device cannot encode WebM with these settings. Try a lower resolution or frame rate, or export a drill book from the Export menu.');
  }
  signal.throwIfAborted();

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('This device could not create a video canvas.');
  const target = new BufferTarget();
  const output = new Output({ format: new WebMOutputFormat(), target });
  let overLimit = false;
  let payload = 0;
  const countBytes = (packet: { byteLength: number }) => { payload += packet.byteLength; };
  target.on('write', ({ end }) => { if (end > VIDEO_LIMITS.bytes) overLimit = true; });
  const check = () => {
    signal.throwIfAborted();
    if (overLimit || payload > VIDEO_LIMITS.bytes) throw limitError();
  };
  const cancel = () => { void output.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });

  const video = new CanvasSource(canvas, { ...videoConfig, onEncodedPacket: countBytes });
  const input = recording ? new Input({ source: new BlobSource(recording), formats: recordingFormats }) : undefined;
  try {
    const audio = input ? new AudioSampleSource({ ...audioConfig, onEncodedPacket: countBytes }) : undefined;
    const track = input ? await input.getPrimaryAudioTrack() : null;
    if (audio && (!track || !await track.canDecode() || !await canEncodeAudio(audioConfig.codec, {
      bitrate: audioConfig.bitrate, ...audioConfig.transform,
    }))) throw new Error('This device cannot encode the attached recording. Uncheck Include recording to export a silent video.');

    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serializeProject(project)));
    const revision = Array.from(new Uint8Array(hash).subarray(0, 6), byte => byte.toString(16).padStart(2, '0')).join('');
    output.setMetadataTags({ title: project.title, description: `Squidware rehearsal preview · Revision ${revision}`, creationTime: null });
    output.addVideoTrack(video, { frameRate: fps });
    if (audio) output.addAudioTrack(audio);
    check();
    await output.start();

    // Mux streams together so encoder backpressure never requires queuing a whole track.
    const addFrames = async () => {
      const size = Math.round(height * .027);
      context.font = `600 ${size}px system-ui, sans-serif`;
      context.textBaseline = 'middle';
      for (let frame = 0; frame < timing.frames; frame++) {
        check();
        const count = countAtVideoFrame(project, timing, frame, fps);
        draw(sampleProject(project, count), context);
        context.fillStyle = '#111b18';
        context.fillRect(0, height - size * 2, width, size * 2);
        context.fillStyle = '#eef5ec';
        context.textAlign = 'left';
        context.fillText(project.title, size, height - size, width * .57);
        context.textAlign = 'right';
        context.fillText(`Revision ${revision}  ·  Count ${Number(count.toFixed(2))}`, width - size, height - size);
        await video.add(frame / fps, 1 / fps, { keyFrame: frame % (fps * 2) === 0 });
        if (frame % 4 === 0) {
          onProgress(frame + 1);
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      video.close();
      onProgress(timing.frames);
    };
    await Promise.all([addFrames(), audio && track ? addRecording(track, audio, timing.start + project.audioOffsetSeconds, timing.duration, check) : undefined]);
    check();
    await output.finalize();
    check();
    if (!target.buffer || target.buffer.byteLength > VIDEO_LIMITS.bytes) throw limitError();
    return target.buffer;
  } catch (error) {
    await output.cancel().catch(() => {});
    signal.throwIfAborted();
    throw error;
  } finally {
    input?.dispose();
    signal.removeEventListener('abort', cancel);
  }
}
