import type {Diagnosis, Job, Output, Reply} from './types';

type Result = {diagnosis: Diagnosis} | {output: Output};

export function runJob(job: Job, signal: AbortSignal, onStage: (status: string) => void): Promise<Result> {
  return new Promise((resolve,reject) => {
    signal.throwIfAborted();
    const worker = new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
    const finish = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort',abort);
      worker.terminate();
    };
    const abort = () => {finish();reject(signal.reason);};
    const timeout = setTimeout(() => {
      finish();
      reject(new Error('The processor exceeded its two-minute limit. Try a smaller file or fewer pages.'));
    },120_000);
    signal.addEventListener('abort',abort,{once:true});
    worker.onerror = () => {
      finish();
      reject(new Error('The file processor could not start or ran out of resources.'));
    };
    worker.onmessage = ({data}: MessageEvent<Reply & {source?:string}>) => {
      if (data?.source !== 'filerescue-engine') return;
      if ('stage' in data) {onStage(data.stage); return;}
      finish();
      if ('error' in data) reject(new Error(data.error));
      else resolve(data);
    };
    try {worker.postMessage(job);}
    catch (error) {finish();reject(error);}
  });
}

export async function verifyPlayback(blob: Blob, signal: AbortSignal) {
  signal.throwIfAborted();
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  const url = URL.createObjectURL(blob);
  const waitFor = (event: string, action: () => void) => new Promise<void>((resolve,reject) => {
    const finish = (error?: unknown) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      video.removeEventListener('error', failed);
      video.removeEventListener(event, done);
      if (error) reject(error); else resolve();
    };
    const done = () => finish();
    const abort = () => finish(signal.reason);
    const failed = () => finish(new Error('This browser could not decode the video. The media may be damaged or use an unsupported codec.'));
    const timer = setTimeout(() => finish(new Error('The video playback check timed out.')),8000);
    video.addEventListener(event,done,{once:true});
    video.addEventListener('error',failed,{once:true});
    signal.addEventListener('abort',abort,{once:true});
    action();
  });
  try {
    await waitFor('loadeddata',() => {video.src = url;});
    if (!video.videoWidth || !Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error('The browser could not confirm a video frame and a finite duration.');
    }
    for (const ratio of [0.5,0.9]) {
      signal.throwIfAborted();
      await waitFor('seeked',() => {video.currentTime = video.duration * ratio;});
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) throw new Error('A sampled position could not be decoded.');
    }
    return `Browser decoded the first frame and sought to positions midway and near the end (${video.duration.toFixed(2)} s, ${video.videoWidth} × ${video.videoHeight}).`;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
