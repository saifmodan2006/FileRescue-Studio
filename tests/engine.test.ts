import {describe, expect, it} from 'vitest';
import {inspectMP4, repairMP4} from '../src/engine/mp4';
import type {Diagnosis} from '../src/engine/types';
import {healthyVideo,invalidChunkOffset,missingMovieIndex,trailingVideo,truncatedMedia,unknownCodec} from './fixtures/mp4';

function check(bytes: Uint8Array) {
  const diagnosis:Diagnosis = {format:'MP4',name:'test.mp4',signature:'ftyp',size:bytes.length,options:[],findings:[]};
  return {diagnosis,...inspectMP4(bytes,diagnosis)};
}
describe('MP4 container diagnosis', () => {
  it('lists the track from a real healthy MP4',() => {
    const result = check(healthyVideo);
    expect(result.complete).toBe(true);
    expect(result.diagnosis.tracks).toEqual(['Video · avc1']);
    expect(result.diagnosis.options).toHaveLength(0);
  });

  it('reports missing metadata and truncated media without offering repair',() => {
    expect(check(missingMovieIndex).diagnosis.findings.map(finding => finding.title)).toContain('Track metadata is missing or invalid');
    expect(check(truncatedMedia).diagnosis.findings.map(finding => finding.title)).toContain('No complete media data box');
    expect(check(missingMovieIndex).trimAt).toBeUndefined();
    expect(check(truncatedMedia).trimAt).toBeUndefined();
  });

  it('reports codec identifiers without treating a parsed track as decodable',() => {
    expect(check(unknownCodec).diagnosis.tracks).toEqual(['Video · zzzz']);
    expect(check(unknownCodec).diagnosis.findings.map(finding => finding.detail).join(' ')).toMatch(/playback check is still needed/);
  });

  it('rejects a chunk offset that points outside media data',() => {
    const result = check(invalidChunkOffset);
    expect(result.complete).toBe(false);
    expect(result.diagnosis.findings.map(item => item.title)).toContain('Invalid media chunk offsets');
  });

  it('preserves every original box when removing a malformed trailer',async () => {
    const bytes = new Uint8Array(trailingVideo);
    const {diagnosis,trimAt} = check(bytes);
    expect(trimAt).toBe(healthyVideo.length);
    expect(diagnosis.options.map(option => option.id)).toEqual(['trim-mp4']);
    const output = repairMP4(new File([bytes],'trailer.mp4'),bytes,diagnosis);
    expect(output.requiresPlayback).toBe(true);
    expect(Buffer.from(await output.blob.arrayBuffer())).toEqual(healthyVideo);
  });

  it('rejects repair for a truncated media payload',() => {
    const data = new Uint8Array(truncatedMedia);
    expect(() => repairMP4(new File([data],'truncated.mp4'),data,check(data).diagnosis)).toThrow(/no safely removable/);
  });
});
