# Initial setup

First visit: Welcome → Setup → video screen. A previously seen Welcome without
a completed setup advances straight to Setup. Both complete and skip persist
completion, so subsequent visits go to the video screen. The header's help
reopens Welcome without rerunning setup or remounting the player. Skipped items
remain available in Settings.

`neck-app:initial-setup:v1` stores `completed`, `cameraEnabled`, `tiltEnabled`.
These are feature choices, **not browser permission grants**. Settings updates
these choices. Blocked/malformed storage never prevents starting in the current
tab; if storage is blocked, a later visit may show setup again.

- Firebase sign-in uses `googleSignIn.ts`, shared with Settings' Login. It does
  not invoke the separate YouTube/GIS token flow or request YouTube scopes.
- Camera permission is observed where Permissions API camera queries exist;
  otherwise it is labelled unconfirmed. Only a button requests getUserMedia.
  The probe requests video only and stops every temporary track in `finally`.
  Its single pending promise is also awaited by PoseDetector before normal
  startup. Skipping while a browser prompt is open does not leak a late stream
  or overlap that stream with MediaPipe. After a successful probe, users can
  independently select whether to enable detection when setup completes.
- Orientation setup first classifies the device with User-Agent Client Hints
  (`mobile`) where available, otherwise mobile UA/platform identifiers, with an
  iPadOS desktop-identity + multitouch exception. It then checks secure context
  and DeviceOrientationEvent support. Viewport width, a PC touchscreen or a PC
  exposing a permission API alone never enables the card. Device classification
  is a browser-supplied hint, not physical hardware attestation. API presence
  alone does not prove a physical sensor exists. iOS requestPermission is called directly in
  the button's activation chain, before any await. Android does not need that
  call. Both require a finite beta sample; null/NaN are ignored. A 5-second
  timeout after permission resolves reports no-data, separately from denial or
  unsupported API. Abort/unmount removes listeners and timers. The same check
  is reused by TiltDetector in Settings.
- Neither credentials nor permission results are persisted in setup storage.
  Skipping disables both features without signing out or revoking browser
  permissions. Sensors stay disabled throughout initial setup, even if login
  changes the Firebase UID.

Deterministic tests mock Auth, media acquisition, permission state changes,
orientation samples and timeouts. Real Firebase popup completion, iOS Safari
permission dialogs and Android physical sensor data still need device checks.

Browser behavior references:
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static

## YouTube test-mode notice

Setup includes an optional YouTube card with the message
「現在テスト提供中。対応アカウントのみ連携可能」. It contains no OAuth
button and does not import/call the GIS service. Firebase Google sign-in remains
separate and optional. Existing supported-account linkage stays available from
「登録チャンネル」; public search, playback and posture detection do not depend
on linking. Neither the OAuth test-user list nor deployment settings are changed.

Device-classification references:
- https://developer.mozilla.org/en-US/docs/Web/API/NavigatorUAData
- https://webkit.org/blog/9674/new-webkit-features-in-safari-13/
