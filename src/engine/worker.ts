import {inspectMP4, repairMP4} from './mp4';
import {MAX_BYTES} from './types';
import type {Diagnosis, Job, Reply} from './types';

const post = (reply: Reply) => self.postMessage({source:'filerescue-engine',...reply});
const stage = (status: string) => post({stage:status});

self.onmessage = async ({data:job}: MessageEvent<Job>) => {
  const {file} = job;
  try {
    stage('Checking file signature');
    if (!file.size) throw new Error('This file is empty. Choose a file that contains data.');
    if (file.size > MAX_BYTES) throw new Error('This file exceeds the 64 MB workspace limit.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const header = new TextDecoder().decode(bytes.subarray(0,1024));
    const pdf = /%PDF-\d\.\d/.exec(header);
    const mp4 = String.fromCharCode(...bytes.subarray(4,8)) === 'ftyp';
    const format = pdf ? 'PDF' : mp4 ? 'MP4' : 'Unknown';
    const diagnosis: Diagnosis = {name:file.name,size:file.size,format,signature:pdf?.[0] ?? (mp4 ? 'ftyp' : 'Unknown'),findings:[],options:[]};
    if ((format === 'PDF' && !/\.pdf$/i.test(file.name)) || (format === 'MP4' && !/\.mp4$/i.test(file.name))) {
      diagnosis.findings.push({severity:'warning',title:'Unexpected file extension',detail:`The file signature indicates ${format}.`});
    }
    if (job.action === 'recover') {
      stage('Reconstructing recoverable content');
      if (pdf) post({output:await (await import('./pdf')).recoverPDF(file,bytes,job.operation,job.pages,stage)});
      else if (mp4 && job.operation === 'trim-mp4') post({output:repairMP4(file,bytes,diagnosis)});
      else throw new Error('The selected recovery option does not match this file.');
      return;
    }
    if (pdf) {
      stage('Reading the PDF structure');
      await (await import('./pdf')).inspectPDF(bytes,diagnosis,stage);
    } else if (mp4) {
      stage('Inspecting MP4 container boxes');
      inspectMP4(bytes,diagnosis);
    } else {
      diagnosis.findings.push({severity:'error',title:'Unsupported file signature',detail:'This workspace recognizes PDFs and MP4s with an ftyp header. The selected file does not match either signature.'});
    }
    post({diagnosis});
  } catch (error) {
    post({error:error instanceof Error ? error.message : 'The processor could not finish this operation.'});
  }
};
