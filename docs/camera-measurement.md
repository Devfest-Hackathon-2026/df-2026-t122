# Camera measurement records

`blinkRecordedMinutes` now increases by actual credited seconds / 60, rather
than a fixed minute. Existing values (including historical 192-minute totals)
are retained, without migration, deletion, or inferred correction.

## Valid time

`PoseDetector` accepts face results only while the camera has started, the video
is playing with current data, a live/enabled/unmuted video track exists, and the
document is visible. Consecutive valid results establish a measured interval.
Missing faces, video pause/wait/end, track mute/end, visibility changes, errors,
and result gaps over 1 second break the interval. Time without results is never
extrapolated by the periodic save timer. Only complete 100 ms slots inside each
interval are credited (boundary fragments are conservatively discarded).
Closing Settings does not hide the browser document, so measurement continues.
Video playback is not a prerequisite.

## Storage and deduplication

- Existing summary: `users/{uid}/daily_records/{local YYYY-MM-DD}`.
- New ledger: `users/{uid}/camera_measurements/{UTC YYYY-MM-DD}`.
- Ledger `slots` is a map from UTC epoch-minute strings to hexadecimal 600-bit
  masks. A set bit identifies one already-credited 100 ms slot. The daily map is
  bounded to 1440 entries (roughly 250 KB of mask data and keys at full coverage).
- A Firestore transaction reads the UTC ledger, merges incoming slots, and adds
  only unseen time and its associated blinks to the summary. The ledger and
  summary commit atomically. Retries, partially overlapping batches, and
  concurrent tabs/devices therefore cannot credit the same slot twice.
- Blinks in overlapping slots are credited from the first committed batch; the
  system does not sum multiple devices' views of the same instant. Boundary
  fragments' blinks are excluded with their uncredited time.
- Batches split at both UTC and local midnight. The shared UTC ledger prevents
  duplicate credit even when devices use different local timezone settings.
  A newly credited slot belongs to the first writer's local summary date.
- Normal operation flushes about once per minute, plus completed partial batches
  on hide/OFF/unmount. A batch within one day takes two document reads and two
  writes if it adds time; a fully duplicate batch takes one read and zero writes.
  Empty batches do not access Firestore. Midnight boundaries and contention can
  cause additional operations. No per-frame Firestore access or heartbeat exists.

## Account boundaries and deployment

App remounts the detector on Auth session changes. Old callbacks and transaction
retries check session identity, including A → B → A. An operation already sent
before a change always targets the old UID, never the new one.

The deployed Firestore rules must permit the signed-in user to access **their
own** `camera_measurements` documents, in addition to the existing daily records.
If existing rules do not cover the new path, add an appropriately scoped match
inside the existing rules (do not replace the rest of the rules):

```text
match /users/{uid}/camera_measurements/{utcDay} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

No rules or application deployment is performed by this change. Permission
errors fail the transaction without updating either document.

## Limits

Deduplication relies on devices having reasonably synchronized wall clocks;
substantial clock skew requires a trusted server clock/backend design. Old app
versions which still increment minutes without consulting the ledger must be
updated: their writes cannot be deduplicated retrospectively. Offline/failed
batches are retried unchanged while the detector remains mounted; this is an
in-memory queue, so abrupt tab termination or permanent failure on cleanup can
lose unsaved time. This causes undercounting, not duplicate credit. Historical
minutes and historical blinks remain mixed with new measurements in the same
legacy cumulative fields.

Run deterministic tests with `node --test tests/*.test.mjs`. These simulate
MediaPipe callbacks, camera/video events, Auth changes, and optimistic Firestore
transaction retries; they do not replace testing deployed security rules or
multiple physical devices.
