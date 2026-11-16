import {readFileSync} from 'node:fs';

export const healthyVideo = readFileSync(new URL('./sample.mp4',import.meta.url));
export const trailingVideo = readFileSync(new URL('./trailing-box.mp4',import.meta.url));

function topBox(type: string) {
  let offset = 0;
  while (offset < healthyVideo.length) {
    const size = healthyVideo.readUInt32BE(offset);
    if (healthyVideo.toString('ascii',offset + 4,offset + 8) === type) return {offset,size};
    if (size < 8) break;
    offset += size;
  }
  throw new Error('Fixture box not found');
}

const moov = topBox('moov');
const mdat = topBox('mdat');
export const missingMovieIndex = Buffer.concat([healthyVideo.subarray(0,moov.offset),healthyVideo.subarray(moov.offset + moov.size)]);
export const truncatedMedia = healthyVideo.subarray(0,mdat.offset + Math.floor(mdat.size / 2));
export const unknownCodec = Buffer.from(healthyVideo);
const codecAt = unknownCodec.indexOf('avc1',moov.offset);
if (codecAt < 0) throw new Error('Fixture codec sample entry not found');
unknownCodec.write('zzzz',codecAt);
export const invalidChunkOffset = Buffer.from(healthyVideo);
const chunkTable = invalidChunkOffset.indexOf('stco',moov.offset);
if (chunkTable < 0) throw new Error('Fixture chunk offset table not found');
invalidChunkOffset.writeUInt32BE(0,chunkTable + 12);
