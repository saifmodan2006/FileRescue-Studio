import {outputName} from './types';
import type {Diagnosis, Finding, Output} from './types';

type Box = {type: string; start: number; data: number; end: number};
const ascii = (bytes: Uint8Array, at: number, count: number) => String.fromCharCode(...bytes.subarray(at, at + count));

function readBoxes(bytes: Uint8Array, start: number, end: number, limit = 4000) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes: Box[] = [];
  let offset = start;
  while (offset < end && boxes.length < limit) {
    if (end - offset < 8) break;
    const type = ascii(bytes, offset + 4, 4);
    if (!/^[\x20-\x7e]{4}$/.test(type) && type.charCodeAt(0) !== 169) break;
    let size = view.getUint32(offset);
    let header = 8;
    if (size === 1) {
      if (end - offset < 16) break;
      size = Number(view.getBigUint64(offset + 8));
      header = 16;
    } else if (size === 0) size = end - offset;
    if (type === 'uuid') header += 16;
    if (size < header || size > end - offset) break;
    boxes.push({type, start: offset, data: offset + header, end: offset + size});
    offset += size;
  }
  return {boxes, offset, complete: offset === end};
}

const auxiliary = new Set(['free', 'skip', 'wide', 'udta', 'uuid']);

function containsMediaByte(ranges: Box[], offset: number) {
  let lo = 0;
  let hi = ranges.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const box = ranges[mid];
    if (offset < box.data) hi = mid;
    else if (offset >= box.end) lo = mid + 1;
    else return true;
  }
  return false;
}

export function inspectMP4(bytes: Uint8Array, diagnosis: Diagnosis) {
  const top = readBoxes(bytes, 0, bytes.length);
  const find = (name: string) => top.boxes.find(box => box.type === name);
  const findings: Finding[] = diagnosis.findings;
  const ftyp = find('ftyp');
  const moov = find('moov');
  const media = top.boxes.filter(box => box.type === 'mdat' && box.end > box.data);
  const fragmented = top.boxes.some(box => box.type === 'moof');
  const tracks: string[] = [];
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let trackBoxesValid = true;
  let chunkOffsetsValid = true;
  let offsetChecks = 0;
  let skippedOffsets = false;
  const validBrandBox = Boolean(ftyp && ftyp.end - ftyp.data >= 8);
  if (ftyp && validBrandBox) {
    findings.push({severity:'info', title:'Container brand', detail:ascii(bytes, ftyp.data, 4)});
  } else {
    findings.push({severity:'error',title:'Incomplete file type box',detail:'The MP4 file type box does not contain a complete brand header.'});
  }
  if (moov) {
    const movie = readBoxes(bytes, moov.data, moov.end);
    trackBoxesValid = movie.complete && movie.boxes.some(box => box.type === 'mvhd');
    for (const trak of movie.boxes.filter(box => box.type === 'trak')) {
      const track = readBoxes(bytes, trak.data, trak.end);
      const mdia = track.boxes.find(box => box.type === 'mdia');
      const children = mdia && readBoxes(bytes, mdia.data, mdia.end);
      const handler = children && children.boxes.find(box => box.type === 'hdlr');
      const handlerType = handler && handler.end - handler.data >= 12 ? ascii(bytes, handler.data + 8, 4) : '';
      if (!track.complete || !children || !children.complete || !handlerType) trackBoxesValid = false;
      const minf = children && children.boxes.find(box => box.type === 'minf');
      const table = minf && readBoxes(bytes, minf.data, minf.end).boxes.find(box => box.type === 'stbl');
      const sampleTable = table && readBoxes(bytes,table.data,table.end);
      const description = sampleTable?.boxes.find(box => box.type === 'stsd');
      const entries = description && description.end - description.data >= 8
        ? readBoxes(bytes, description.data + 8, description.end).boxes : [];
      if (handlerType) {
        tracks.push(`${handlerType === 'vide' ? 'Video' : handlerType === 'soun' ? 'Audio' : handlerType} · ${entries.map(entry => entry.type).join(', ') || 'codec unknown'}`);
      }
      const offsets = sampleTable?.boxes.find(box => box.type === 'stco' || box.type === 'co64');
      if (!fragmented && offsets && media.length) {
        const entrySize = offsets.type === 'co64' ? 8 : 4;
        const available = offsets.end - offsets.data - 8;
        const count = available >= 0 ? view.getUint32(offsets.data + 4) : -1;
        if (count < 0 || count * entrySize > available) chunkOffsetsValid = false;
        else {
          const limit = Math.min(count,Math.max(0,100_000 - offsetChecks));
          for (let index = 0; index < limit; index++) {
            const at = offsets.data + 8 + index * entrySize;
            const offset = entrySize === 8 ? Number(view.getBigUint64(at)) : view.getUint32(at);
            if (!containsMediaByte(media,offset)) chunkOffsetsValid = false;
          }
          offsetChecks += limit;
          if (limit < count) skippedOffsets = true;
        }
      }
    }
  }

  if (!moov || !trackBoxesValid || !tracks.length) findings.push({
    severity:'error',title:'Track metadata is missing or invalid',
    detail:'The movie index describes how to locate and decode samples. This studio cannot reconstruct a missing index.',
  });
  if (!media.length) findings.push({
    severity:'error', title:'No complete media data box',
    detail:'The file contains no complete, nonempty media data box. It may be truncated or missing its media.',
  });
  if (!top.complete) findings.push({
    severity:'warning',title:'Invalid container boundary',
    detail:`A top-level box could not be read at byte ${top.offset.toLocaleString()}.`,
  });
  if (tracks.length) findings.push({severity:'info',title:'Tracks identified',detail:tracks.join(' · ')});
  if (!chunkOffsetsValid) findings.push({
    severity:'error',title:'Invalid media chunk offsets',detail:'Some recorded chunk locations do not point into a complete media data box.',
  });
  if (skippedOffsets) findings.push({
    severity:'warning',title:'Media offset check limit reached',detail:'The inspector checked the first 100,000 recorded chunk locations. Trailing-data repair requires the complete table to be checked.',
  });

  const video = tracks.some(track => track.startsWith('Video · '));
  const kind = ascii(bytes, top.offset + 4, 4);
  const minimumLayout = validBrandBox && moov && trackBoxesValid && chunkOffsetsValid && video && media.length > 0;
  const safeTail = bytes.length - top.offset < 8 || auxiliary.has(kind);
  const canTrim = Boolean(minimumLayout && !top.complete && top.boxes.length < 4000
    && safeTail && !fragmented && !skippedOffsets && offsetChecks > 0);
  if (canTrim) diagnosis.options.push({
    id:'trim-mp4', title:'Remove invalid trailing data',
    description:'Keep complete container boxes at their original offsets and check that the saved video plays.',
  });
  if (minimumLayout && top.complete) findings.push({
    severity:'info',title:'Required container boxes found',
    detail:'A playback check is still needed to confirm this browser can decode the video.',
  });
  diagnosis.tracks = tracks;
  return {trimAt: canTrim ? top.offset : undefined, complete: Boolean(minimumLayout && top.complete)};
}

export function repairMP4(file: File, bytes: Uint8Array<ArrayBuffer>, diagnosis: Diagnosis): Output {
  const first = inspectMP4(bytes, {...diagnosis, findings:[], options:[]});
  if (first.trimAt === undefined) throw new Error('The video has no safely removable trailing data.');
  const trimmed = bytes.subarray(0, first.trimAt);
  const checked = inspectMP4(trimmed, {...diagnosis, findings:[], options:[]});
  if (!checked.complete) throw new Error('The repaired video did not pass structural verification.');
  return {
    blob:new Blob([trimmed], {type:'video/mp4'}), name:outputName(file.name,'mp4'), partial:false, requiresPlayback:true,
    checks:['Reopened container and confirmed complete box boundaries, movie metadata and a video track.'],
    limitations:['Media samples were left at their original offsets. Playback checks sample frames and do not verify every frame or audio sample.'],
  };
}
