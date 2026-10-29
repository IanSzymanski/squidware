# Portable productions and audio — #71

In the desktop app, choose **Export → Portable production with audio**, or search **Export portable production with audio** in the Command palette. Attach WAV, MP3, OGG, M4A or FLAC audio up to 200 MiB. Decoding also depends on Electron's installed codecs. The preview shows the production, set count, recording size, offset and estimated output size. The native review after choosing a destination shows the exact package size and reference path before any bytes are written.

**Bundle recording** includes the recording inside a single `.squidpack` file. Transfer that file to another computer, then use **Open**. The recording and waveform load automatically, with the same offset and media-clock timing. Bundling uses the attached bytes even if the original file has moved.

**Reference recording** stores a portable path relative to the package's folder. Select the recording through Attach audio, then choose a package destination in a folder that contains it (subfolders are supported). Transfer the whole folder. Parent-directory references, absolute paths, Windows drive/UNC paths, reserved filenames and escaping symlinks are rejected. The reference is verified against the attached recording when exporting and reopening; another recording with the same filename cannot silently replace it. A missing, changed or inaccessible recording opens the drill with a persistent explanation and **Relink audio**. Relinking deliberately selects the replacement without changing any coordinates, timing or offset; export another package to retain the new choice.

## Save and recovery

Plain `.squid` remains the existing schema-v2 JSON workflow, containing drill and offset without recording bytes. Exporting a package is a snapshot; it does not mark the plain project saved or change its Save destination. Opening a package starts a new editing session; the next Save chooses a `.squid` destination. After editing, export the package again to update the portable copy. Recovery retains drill data, not recording bytes; keep the package for its recording. Files stay local. No package or recording is uploaded, and hosted-viewer/release delivery is not implemented here.

Files are written beside their destination, flushed, then renamed atomically using the shared native writer. Canceled dialogs and failed replacements leave prior files intact. Invalid packages leave the current production intact. When a reference alone fails, the validated drill still opens. Both main and renderer validate project data using the established codec. Audio decoding failures retain the drill and show a persistent relink action.

## Package format v1

The extension is `.squidpack`. It is a small uncompressed binary container, not ZIP. Readers never extract files or decompress attacker-controlled entries; ZIP and other archive signatures are rejected.

| Bytes | Meaning |
| --- | --- |
| 0–7 | ASCII `SQUIDPK1` |
| 8–11 | Unsigned little-endian manifest byte length |
| 12 onward | UTF-8 JSON manifest, exactly that many bytes |
| Remainder | Bundled recording bytes, or zero bytes for a reference |

The manifest has `format: "squidware-package"`, `version: 1`, `project` (a full production: schema v2, or schema v3 with a tempo map) and `audio`. Audio fields are `mode` (`bundle` or `reference`), `name` (plain supported filename), `type` (matching MIME type), `size` (positive integer bytes), `sha256` (64 lowercase hex characters), and `path` for a reference only. A bundled payload must exactly match its size and digest. A reference must have no payload. The project is validated against the shared v1/v2/v3 import codec; mapped timing uses schema v3 and ordinary exports use schema v2. Unsupported package versions fail with an update message.

Manifest size is at most 11 MiB; the validated project's UTF-8 serialization remains limited to 10 MiB. Recording size is at most 200 MiB; the complete file is at most 12 + 11 MiB + 200 MiB. Native readers bound both stat and actual read size and require regular files. References use `/` separators, nonempty portable segments, no `.` or `..`, and remain within the real package directory. Final-component symlink replacement is refused where `O_NOFOLLOW` is available. Checksums identify bytes, not authenticity or ownership.

## Validation and design

The `audio-package` suite owns actual production renderer/preload/main attach, preview/cancel/export, folder transfer, automatic recording load, offset/playback, missing audio/relink, malformed import and rendered themes/scaling. Dialog choices are controlled while pointer and keyboard events are native. Native tests own codec corruption, traversal/absolute/drive/UNC paths, symlink escape, oversized reads, sender trust, stale attachments and atomic write failures. The `audio-clock` and `editor` owners retain their detailed timing and ordinary file-race checks. An immutable Linux-authored `src/fixtures/audio-package-v1.squidpack`, assembled with independent Python code, verifies the same imported bytes and offset on every native host. CI runs it, registered desktop owners and packaging on Windows, macOS and Linux.

[Design guidance](DESIGN_GUIDANCE.md) sections 1–5 apply. The feature reuses Modal, shared controls/type/theme tokens, the existing Export and command-dialog routes, native file request trust and save replacement. It adds no physical geometry edits. The unused audio lane remains hidden. A missing-reference status row temporarily consumes field height to retain an explicit keyboard-accessible relink action. Measured layouts, screenshots and results are in [the review evidence](evidence/audio-package/README.md). Software checks do not claim physical output or human usability qualification.
