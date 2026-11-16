# Technical limitations

## PDF

- The studio reads files with a PDF header in the first 1,024 bytes. It checks the terminal marker and cross-reference pointer, attempts to open the document and renders up to the first 60 pages.
- Single-filter Flate compressed page content streams are checked independently when the secondary parser can read the page tree. This catches certain damaged streams that can otherwise appear as empty pages. The check stops at 8 MiB of expanded data per stream.
- PDF.js can open certain files with a missing end marker or a damaged object index. Any unreadable, unselected or unchecked pages are excluded from the output. Missing page data cannot be recreated.
- Page copying preserves page content where the secondary parser can open the source. It excludes annotations and form widgets, and does not preserve document-level features like attachments and bookmarks. Verified copies reopen, render, and match available selectable text from the saved source pages.
- Image-only PDF output uses raster page previews, up to 960 pixels on the long edge. Text is no longer selectable. Links, forms, and interactive content are excluded. PDF render checks do not measure pixel fidelity or guarantee that all original page elements survived.
- Text export uses the selectable text exposed by the parser, with a 200,000-character limit per page. OCR, password entry, reconstruction of missing page objects and full verification of specialized PDF features are outside the supported workflow.

## MP4

- The inspector recognizes an `ftyp` header and reads bounded MP4 box lengths, movie metadata, codec identifiers and up to 100,000 chunk offsets. Chunk checks test that the checked offsets land within complete media boxes. They do not prove every sample is present.
- Repair is available when a nonfragmented video has intact leading boxes and valid chunk offsets, followed by a malformed auxiliary box or fewer than eight trailing bytes. Repair removes this suffix and leaves every original byte in the verified prefix at the same offset.
- The output must pass a fresh container inspection and decode frames in the current browser at the beginning, midpoint and near the end. The check does not cover every frame, audio sample or playback device. Codec availability depends on the browser and operating system.
- The application cannot recreate a missing movie index, recover truncated media bytes or missing frames, remux arbitrary media, transcode unsupported codecs, or export arbitrary playable segments. It does not ship FFmpeg/WASM workloads. Its implemented MP4 repair is a bounded container cleanup.

## Browser and resource limits

- Files are limited to 64 MiB. The queue holds up to 10 files and processes one at a time. Each worker job has a two-minute timeout. Browser video checks have per-step time limits.
- Use a current browser supporting module and nested workers, OffscreenCanvas, canvas Blob output and DecompressionStream. Browser automation was performed in Chromium. Firefox, Safari, native mobile devices and OS-level PWA installation were outside the automated test matrix.
- The built site prepares its offline cache when you first open the workspace. The cache needs a successful online setup and can be cleared or evicted by the browser. Offline PDF and MP4 recovery use the same local files and engines as online recovery. Backend services need a connection to the local API.
- Recovery output and the detailed report live in tab memory. Download them before replacing the active file or closing the tab. Optional session history holds metadata only and expires with the tab.
