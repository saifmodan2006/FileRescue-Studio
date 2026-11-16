# Deterministic fixtures

- PDF fixtures are generated in `pdf.ts` from plain text. The healthy file has two pages. The missing-marker variant keeps both pages and removes the last five bytes. The unparseable variant keeps only the first 32 bytes.
- The unreadable-page variant replaces the second page’s content stream with invalid zlib data. The first page remains recoverable.
- `sample.mp4` is a one-second synthetic 96 × 64 H.264 test pattern. To regenerate it with FFmpeg, run the command below from the project root.
- `trailing-box.mp4` appends 12 bytes after the complete sample. They start with a 64-byte size and a `free` box label. The remaining four bytes are zero. Recovery should produce a byte-for-byte copy of `sample.mp4`.
- Other MP4 fixtures derive from that sample in `mp4.ts`. They remove the `moov` box, cut the `mdat` box in half, replace the video codec identifier with `zzzz`, or set a chunk offset to point outside the media box.

```sh
ffmpeg -f lavfi -i testsrc2=size=96x64:rate=12 -t 1 -an -c:v libx264 -preset veryslow -crf 29 -pix_fmt yuv420p -movflags +faststart -map_metadata -1 -y tests/fixtures/sample.mp4
```
