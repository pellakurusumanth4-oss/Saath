# Why the character won't stay still on the floor

Notes from 17 Oct 2026, after the user's test: "how unstable the character position".
"Checked" sources were read first-hand; the rest come from two research helpers and are marked.
Nothing here has been measured on the S24 yet — see "How to measure" before tuning numbers.

## In one minute

- Our camera mode is **rotation-only AR ("3DoF")**: the phone knows how it is *turned* (gyroscope),
  not where it *is*. Pokémon GO's old AR mode worked the same way, and its Pokémon "would just glide
  around with you". Niantic needed ARKit/ARCore (AR+) to fix a Pokémon to a real spot.
- With rotation only, the character can stay glued to the floor **only while you turn the phone in
  place**, and only if (1) he is drawn at the same moment as the camera picture, (2) we use the
  camera's real field of view, and (3) nothing else moves him.
- Today all three are off, and two of the errors are our own doing: the smoothing filter drags him
  behind, and the step detector can jump him 0.7 m closer.
- **Moving** the phone (sway, leaning, walking) can never be tracked this way. Only ARCore can,
  because it watches the camera image as well as the sensors.

## How the two pictures reach the screen

```
Camera:     light → sensor → CameraX → its own SurfaceView layer ──────────────────────┐
            ≈ 60–100 ms, 30 fps or less (estimate; no S24 measurement published)       ├→ screen
Character:  gyro → game rotation vector → Chrome, 60 Hz timer, only on ≥ 0.1° change   │
            → our smoothing (+16–48 ms) → SVG move → WebView → app window ─────────────┘
            ≈ 35–60 ms before smoothing (estimate)
```

Two separate pipelines with no shared clock. While the phone turns, they disagree for a moment,
and the overlay "swims" — the word Azuma's 1997 survey uses for exactly this.

## What each error costs

Scale: near the middle of the screen, 1° of turn ≈ 10 CSS px (about 1.6 mm on the S24's screen).

| Cause | Size in our app | When you see it | Fixable without ARCore? |
|---|---|---|---|
| **False steps.** Every detected step moves you 0.7 m the way the camera points (`floorStep`). The detector in `src/fusion.ts` only needs two 0.12 g bumps 0.25–1.6 s apart. | He suddenly jumps 0.7 m closer, or out of view. | Lifting, bobbing or shaking the phone. | **Yes.** Stop moving him on steps, or make detection much stricter. |
| **Our smoothing.** One-euro filter in `scripts/rig-ar.js`. | 16–48 ms behind: 5–20 px while turning, up to 32 px on fast turns, 6 px from a small hand wobble. Simulated with the same constants. | While turning: he drags, then catches up. | **Yes.** Remove it. Gyro data is already smooth. |
| **Camera delay differs from character delay.** | **Measured:** the character is about 15 ms *slower* than the camera (see below), so 5 px at 30°/s. | While turning. | **Yes.** Draw him about 15 ms ahead (prediction). |
| **Camera at 30 fps, character at 60 Hz.** | ±5 px at 30°/s. | While turning. | Only by drawing both in one page (option B). |
| **Field of view.** We assume 70°; the S24 preview is about 72.5–74°. | Our scale is 5–8% too big. The error grows towards the screen edges, up to ~20 px. | He ends up off his spot after a turn and stays off. | **Yes.** Use the measured value. |
| **Arm model.** 0.3 m pivot behind the phone (`ARM_M`). | ±15–30 px after a 20° turn at 2 m, depending on whether you turn your wrist or your body. | Turning. | Partly. Tune it. |
| **The phone moves**, not just turns. | 5 cm of movement ≈ 15 px at 2 m, 30 px at 1 m. | Always, while holding the phone. | **No.** Needs ARCore. |
| **Gyro drift** (yaw). | Slow creep, likely a few degrees a minute (not measured on the S24). | Over a minute or more. | No, but small for a short visit. |
| **Chrome's 60 Hz, 0.1° steps on a 120 Hz screen.** | 1–5 px of judder. | While moving. | **Yes.** Interpolate between readings. |

How to tell them apart on the phone:
- Delay errors disappear the moment you stop moving.
- Field-of-view and phone-movement errors stay after you stop.
- Step jumps are sudden, even without turning.

## What the pros do

- **ARCore, and Pokémon GO AR+:**
  - It draws the camera image itself, as a texture in the *same frame* as the 3D content.
  - It uses the phone's pose from the moment *that* image was captured, so content cannot slide
    against the picture.
  - It uses the real lens values.
  - It tracks movement by watching the image (visual-inertial odometry) and finds real floors (planes).
- **Pokémon GO classic AR:** gyroscope only, anchored to a direction, not a place. It never claimed
  the Pokémon stood on the floor.
- **AR.js and LocAR.js** (web, location-based): they smooth heavily because they read the noisy
  compass event. Their objects are far away, so phone movement doesn't show. Not our case.
- **The four cures for delay errors** (Azuma 1997):
  1. cut the delay;
  2. shift the image at the last moment;
  3. delay the faster stream to match the slower one ("match temporal streams");
  4. predict ahead, which only helps for delays under ~80 ms.

## Options

**A. Quick fixes, still in Expo Go (about 1–2 h).** Expected: he stays put when you turn in place,
and still slides a little when the phone itself moves.
1. Stop the step jumps.
2. Remove the smoothing. Keep a short history of orientations and draw the one that matches the
   camera picture, blended between readings, which also removes the 60 Hz judder. Measured: 15 ms
   *ahead* on the S24 (see below).
3. Use the S24's measured field of view.
4. Prefer a spot 1.5–3 m away, since phone movement shows less with distance. Re-tune the arm model.

**B. One page draws both camera and character (Expo Go, about 4–6 h, untested).**
- The WebView opens the camera itself (`getUserMedia`) and draws him over its own video.
- With `requestVideoFrameCallback`, each video frame can use the orientation from when it was
  captured. That removes the delay and 30 fps mismatch at the root.
- Unknowns:
  - it needs a secure page origin;
  - whether WebView gives `captureTime`;
  - the video quality.
- Phone movement is still not tracked.

**C. Real AR: ARCore through WebXR in Chrome (about 6–8 h).**
- Real floor detection, with his feet truly on it, and you can walk around him. This is AR+ quality.
- The S24 is on ARCore's device list. WebXR is switched off inside Android WebView, so the app
  would open a page in Chrome.
- That page needs HTTPS (localhost works for testing). For the demo it must be hosted somewhere,
  which counts as publishing, so ask first.

## How to measure on the phone (before tuning)

1. **Lens values.** With Saath's camera open and the phone on USB, `adb shell dumpsys media.camera`
   lists the real focal length, sensor size, preview size and frame rate. This confirms the
   field of view.
2. **Field of view by hand.** Put a far-away point in the middle of the screen, then tilt up until
   it reaches the top edge. The change in tilt angle is half the vertical field of view.
3. **Delay gap.** Screen-record a slow left-right pan (`adb shell screenrecord`, up to 60 fps).
   Frame by frame, compare how far the floor moved with how far the ring moved. The time offset
   between the two is *D*. The recording shows the user's room, so ask first. It stays on the
   laptop, only numbers come out of it, and it is deleted afterwards.

## What we measured on the S24 (17 Oct, ~20:20)

**Lens.** From `dumpsys media.camera`, the back main camera reports:
- focal length 5.4 mm;
- sensor 8.16 × 6.12 mm, 4080 × 3060 px;
- calibrated focal length fx = 2770.3 px, fy = 2767.6 px;
- distortion terms 0.083, −0.122, 0.054.

So the vertical field of view of the full-height preview is 2·atan(2040 / 2770.3) = **72.7°**. The helpers' estimates were 72.5° (Samsung's diagonal figure) and 74.1° (nominal 5.4 mm). `VFOV_DEG` is now 72.7.

**Timing.** Measured from a 20 s screen recording at about 60 fps, with the spot set and the phone panned by hand. The method:
1. Follow the gold ring in each frame by its colour.
2. Follow the camera picture beside it.
3. Find the time shift that best lines the two motions up.

With a 30 ms delay added, the ring **trailed** the picture by 32–48 ms across three versions of the analysis. So without any added delay, the WebView is about 15 ms *slower* than the camera preview. The research guess, that the camera is the slower one, was backwards for this phone. The page now draws the phone's orientation **15 ms ahead** (`LEAD_S`, a capped prediction).

The analysis was checked on synthetic videos with known answers first: it recovered the delay to within 4 ms and the size ratio to within 1%.

**Not settled:** the size ratio (ring motion versus picture motion) came out between 0.8 and 1.3 depending on the method. The arm model (`ARM_M` 0.3 m) therefore stays as it is for now.

**The test spot was on a bed, not the floor.** The page puts the ring on the floor at your eye height, so a ring that *looks* on the bed is really on the floor under it. Any movement of the phone then slides it across the bed. Test on open floor.

**Tools:** `pantest.mjs`, `pantest2.mjs` and `leadtest.mjs` in the session scratchpad, not in the project. The video was deleted after the analysis.

## Sources

**Checked first-hand**
- R. Azuma, *A Survey of Augmented Reality*, 1997, §4.2–4.4. It covers:
  - static errors from wrong viewing parameters, including field of view;
  - dynamic errors only during motion, with objects that "swim around" and "lag behind";
  - 100 ms at 50°/s gives 5° of error;
  - delay as the largest error source, larger than all others combined;
  - the four cures.

  https://www.hitl.washington.edu/projects/knowledge_base/ARfinal.pdf
- Chromium `device_orientation_event_pump.cc`. It fires only on a change of 0.1° or more, falls
  back from relative to absolute orientation, and passes no sensor timestamp to the page.
  https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/modules/device_orientation/device_orientation_event_pump.cc
- Chromium `device_sensor_event_pump.h`: events pumped by a 60 Hz timer.
  https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/modules/device_orientation/device_sensor_event_pump.h
- Chromium `platform_sensor_provider_android.cc` and `PlatformSensorProvider.java`. Relative
  orientation comes only from Android's `TYPE_GAME_ROTATION_VECTOR`, which is gyro plus
  accelerometer with no compass. There is no accelerometer-and-gyro fallback.
  https://github.com/chromium/chromium/blob/main/services/device/generic_sensor/platform_sensor_provider_android.cc
- Chromium `platform_sensor_util.h`: angles are rounded to 0.1° against fingerprinting.
  https://github.com/chromium/chromium/blob/main/services/device/generic_sensor/platform_sensor_util.h
- TechCrunch, 20 Dec 2017. Pokémon GO's classic AR used only the gyroscope, so Pokémon glided
  along with the player; AR+ uses ARKit.
  https://techcrunch.com/2017/12/20/pokemon-go-gets-a-new-and-improved-augmented-reality-mode-but-only-on-ios/
- expo-camera 57.0.6, `node_modules/expo-camera/android/.../ExpoCameraView.kt`. No implementation
  mode is set, so CameraX uses its default SurfaceView. The preview is FILL_CENTER unless `ratio` is
  set (L461–465).
- Our smoothing's lag: simulated with the same filter constants (16–48 ms at 120–10°/s).

**From the research helpers (not re-checked)**
- R. Holloway, *Registration Error Analysis for Augmented Reality*, 1997: the delay error bound,
  and typical head speeds.
  https://www.eecs.yorku.ca/course_archive/2011-12/F/6326/papers/holloway.pdf
- Azuma & Bishop, SIGGRAPH 1994: inertial prediction cuts dynamic error 5–10×.
  https://history.siggraph.org/?p=119698
- J. Jerald, latency thresholds (people notice from about 3–60 ms, mean 17 ms).
  https://techreports.cs.unc.edu/papers/10-013.pdf
- Jacobs et al., I3D 1997: matching relative latency.
  https://www.cs.unc.edu/~andrei/pubs/1997_I3D_latency.pdf
- Kämäräinen et al., HotMobile 2017. On phones, the gyro reaches the app in about 12 ms; camera
  frames take 60–89 ms, plus about 37 ms to display. https://arxiv.org/abs/1611.08520
- inovex, 2024: Pixel 2 camera glass-to-glass latency of 57–106 ms.
  https://www.inovex.de/de/blog/the-glass-to-glass-latency-on-android/
- Galaxy S24 camera:
  - Samsung's spec sheet gives 50 MP, f/1.8, OIS and an 85° FOV.
    https://www.samsungmobilepress.com/media-assets/galaxy-s24?tab=specs
  - Camera FV-5's device data gives a 5.4 mm focal length and an 8.16 × 6.12 mm active area.
    https://www.camerafv5.com/devices/manufacturers/samsung/sm-s921b_e1s_0/
- ARCore:
  - `Session.update()`, `Frame.getTimestamp()`, and the camera texture drawn with the content.
    https://developers.google.com/ar/reference/java/com/google/ar/core/Frame
  - The hello_ar_java sample. https://github.com/google-ar/arcore-android-sdk
- WebXR is switched off in Android WebView (`android_webview/browser/aw_field_trials.cc`). Chrome's
  WebXR uses ARCore. https://developers.google.com/ar/develop/webxr/arcore-comparison
- AR.js location-based docs, on smoothing against "shaking".
  https://ar-js-org.github.io/AR.js-Docs/location-based/
- LocAR.js. https://github.com/AR-js-org/locar.js
- Niantic on AR+. https://pokemongo.com/post/arplus
- The one-euro filter (jitter versus lag). https://gery.casiez.net/1euro/
- Android sensor types (game rotation vector drift).
  https://source.android.com/docs/core/interaction/sensors/sensor-types
