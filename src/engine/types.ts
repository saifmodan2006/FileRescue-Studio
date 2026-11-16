export type Format = 'PDF' | 'MP4' | 'Unknown';
export type Finding = {severity: 'info' | 'warning' | 'error'; title: string; detail: string};
export type PageCheck = {number: number; readable: boolean; image?: Blob; text?: string; detail?: string};
export type Diagnosis = {
  name: string; size: number; format: Format; signature: string;
  findings: Finding[]; pages?: PageCheck[]; pageCount?: number; tracks?: string[];
  options: {id: Operation; title: string; description: string}[];
};
export type Operation = 'copy-pdf' | 'render-pdf' | 'extract-text' | 'trim-mp4';
export type Output = {
  blob: Blob; name: string; checks: string[]; limitations: string[]; pages?: PageCheck[];
  partial: boolean; requiresPlayback?: boolean;
};
export type Attempt = {operation: Operation; state: 'Verified' | 'Failed' | 'Cancelled'; detail: string};
export type Report = {diagnosis: Diagnosis; result?: Output; attempts: Attempt[]};
export type Job = {file: File} & ({action: 'analyze'} | {action: 'recover'; operation: Operation; pages: number[]});
export type Reply = {stage: string} | {error: string} | {diagnosis: Diagnosis} | {output: Output};

export const MAX_BYTES = 64 * 1024 * 1024;

export function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function outputName(name: string, extension: string) {
  const base = (name.replace(/\.[^.]+$/, '') || 'file').slice(0, 160);
  return `${base}-recovered.${extension}`;
}
