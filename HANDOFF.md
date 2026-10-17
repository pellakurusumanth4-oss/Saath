# Saath prototype: handoff (17 Oct 2026)

Read this first. It covers where everything lives, what the user wants, what is done, what is left and the rules to follow.

## 1. Where things are

| What | Path |
|---|---|
| Project (Expo SDK 57, runs in Expo Go on the user's Galaxy S24) | `~/Documents/Hackathons/bolt-builders-week/saath-prototype` |
| Map page: HTML and the single page script (IIFE) that pastes the three modules below | `src/mapHtml.ts` |
| Map look: style, toys and WebGL scene layers | `src/mapStyle.ts` (**rewritten in this session**) |
| Route guide: WebGL ribbon, beacon, edge arrow, confetti | `src/mapNav.ts` (not restyled yet) |
| Friend markers: round profile locators (face from `src/faces.ts`, ring in their colour, pointer tip on the spot), pills | `src/mapFigures.ts` |
| The friends' approved 2D anime rigs in the app, and their round portraits (both **generated**; re-run after a rig changes: `node scripts/build-rigs.mjs --faces <CDP port>`) | `src/rigs.ts`, `src/faces.ts`, `scripts/build-rigs.mjs` |
| A friend's live rig in the camera (transparent WebView on their spot) | `src/FriendRig.tsx`, used by `src/CameraScreen.tsx` |
| React Native screen hosting the WebView (top card, bottom bar, insets) | `src/MapScreen.tsx` |
| Headless test harness | `~/.cache/saath-recovery/harness/mapcheck/` (`shot.mjs`, `placement-test.mjs`, `roof-test.mjs`, `tap-test.mjs`, `cdp-eval.mjs`, `load-map.mjs`, `scene-wada.js`) |
| Backups of the 4 map modules from before the restyle | `~/.cache/saath-recovery/backup-v1/{mapStyle,mapNav,mapFigures,mapHtml}.ts` |
| Approved design, in Figma | https://www.figma.com/design/R4uZryTjtoaorGubniAG3x, page `0:1`, section `10:2` (7 frames: Direction, Navigate, Arrived, Dusk option, Palette & Light, Components, Build plan) |
| Design source files | `~/.cache/saath-recovery/design/`. `comp_golden.png` is **the target picture**; `render_comp.py` has the exact numbers (`PALETTES['golden']`, tree rules around lines 320–355); `comp_dusk.png`, `comp_arrive.png`, `screens.png`, `board.html`, `build_board.py` |
| Screenshots | `~/.cache/saath-recovery/shots/v2/before-wada.png` (old candy look), `shots/v3/a1-wada.png` (new look, first render), `shots/v3/tests.txt` (test run after the mapStyle rewrite) |
| Older project notes | `~/.claude-account1/projects/-home-sumanth/memory/bolt-builders-week-saath.md`; design doc `~/Documents/Hackathons/bolt-builders-week/2026-10-16-pune-ar-companions-design.md` (out of date) |

## 2. What the user wants

- **Saath** is the user's Bolt Builders Week entry, due **Wed 21 Oct 2026, 12:29 PM IST**. It is an AR app: Doraemon, Nobita, Shin-chan and Goku each stand at one fixed public Pune spot (Tom and Jerry are left out until their rigs are built and approved). Friends never move. The real entry gets built in Bolt later. This Expo prototype is a throwaway spike for testing ideas on the phone.
- The user disliked the previous candy map ("looks cartoonish… comedy"). They want a premium, Zootopia-like look, designed in Figma first. **The Figma design ("Golden Hour Pune") is done.**
- The current goal is to **finish building that look into the map**: style, route guide, friend figures, page tweaks. Verify it headless. Then tell the user it is ready to view on the phone. Their words: "you first build designs in figma later we see in mobile" and "complete map things".

## 3. Rules from the user (follow all of them)

- **Git hard freeze**: no `git` or `gh` commands at all, not even `git status` (see `~/.claude/CLAUDE.md`). Don't touch `.git/` or `.gitignore`. When the work is ready, say so; don't suggest committing.
- **The phone stays untouched** unless the user says otherwise. No taps or relaunches while they are away, and always say so before relaunching the app.
- Ask before `expo prebuild` or `run:android`. Never run `expo start --android` non-interactively: it silently uninstalls Expo Go.
- Never repeat or publish the user's real neighbourhood or location. Tests use public places only (Shaniwar Wada and similar).
- Delete with `gio trash`, never `rm`.
- Don't raise character copyright; the user accepted the risk.
- Spawn subagents only when the user asks.
- Figma: `generate_image` costs credits, so ask first. Read calls are limited (Starter plan, about 20 a month), so avoid `get_screenshot` and `get_design_context` unless needed.
- The Claude API key stays server-side only. Never put it in chat or in the client bundle.
- Style: the user likes the smallest complete change (they asked for the "ponytail" approach) and short, plain replies.

## 4. Status

### Session 2 (17 Oct, afternoon): items 1–5 below are DONE
- `mapStyle.ts`: comp-density trees (parks 1/55 m², gardens 1/80, grass 1/90, the comp's effective rates) plus street trees on trunk–minor roads, kept out of houses and off roads (`findRoads`, `openGround`); four-lobe crowns, drum shadows, two LODs (`TREE_NEAR` 400 at 960 verts, rest at 240, `TREE_MAX` 2400). Walls/roofs pre-brightened for MapLibre's darken-only light, vertical gradient off, light `#F2E6C2`, sky top `#5E98D2`, water `#307B90`, the comp's exact vignette, reach to 1 km. `map.styleToys` now also reports `cut`.
- `mapNav.ts`: azure/gold/amber looks, glowing tube with the comp's two-step glow, centre line, flowing capsules, soft shadow pass; `nav-guide` before `building-3d` + `nav-xray` (k 0.42); soft gold beacon rings; glass edge arrow; gold star confetti; new fallback lines.
- `mapFigures.ts`: ink `#2B2433`, `#fg-lit` sheen filter on the body, stone plinth + contact shadow, warm beam behind the target, glass pill, gold pointer, slate mystery/pins.
- `mapHtml.ts`: azure "me" dot/cone/accuracy, `PITCH = 68`, `maxPitch` 76.
- Tests: tsc clean, placement 40/40, roof 20/20, tap all passed. Log and after-shots: `~/.cache/saath-recovery/shots/v4/` (`compare.png` = before / after / comp).
- Not built (in the Figma design, not in this list): distance in the name pill ("Doraemon · 170 m"), the rumour pill for unmet friends, grey "rerouting" dots, the tracking card at the bottom of the screen (`MapScreen.tsx` still has it on top).
- Relaunched on the S24 with the user's go-ahead (17 Oct, 13:38); **the user says the new map looks good on the phone.** Metro was left running. If the phone is on USB but `adb devices` lists nothing, restart the adb server (`adb kill-server`, then `adb devices`) and re-run `adb reverse`.

### Session 2, later (17 Oct): Start navigation + "hold up your phone" hint
- Figma: frames 08 Ready to go, 09 Navigating, 10 Arrived: hold up your phone, 11 Start & arrive flow, in section `10:2` (nodes `28:2`–`31:2`). Built by `~/.cache/saath-recovery/design/nav/build_nav_frames.py` (board.css + real map renders made with `shot.mjs` and the `*.js` scenes beside it) via `html_to_figma`.
- App: the card is the frosted Golden Hour sheet at the bottom (`MapScreen.tsx`, tokens `G`/`softShadow` in `theme.ts`); locate button top-right. The route and the buzz only run after **Start navigation** (`navigating` in `App.tsx`, which pins the friend); **End** stops them. The bottom "Hold up your phone" button and the full-screen `HereAlert` are gone (file trashed). At ≤ 20 m the card turns gold with a "Hold up your phone" hint; lifting the phone (`RaiseDetector` in `fusion.ts`: view within 25° of the horizon for 0.5 s, re-arms below −45°) opens the camera; tapping the hint also does.
- Checks: tsc clean; `harness/mapcheck/raise-test.mjs` 7/7; Metro builds the Android bundle. The map page itself didn't change, so the placement/roof/tap results above still hold. Relaunched on the S24 with the user's go-ahead; **the user says Start navigation and the hold-up hint work well on the phone.**

### Characters design (17 Oct, Figma only; nothing built)
- Figma section `33:2` "Saath · Characters v1 — Captured, not stickered": frames 12 camera screen, 13 captured-not-stickered cues, 14 behaviour storyboard, 15 how we build it (options + sources). Recommendation there: Chrome web AR (WebXR + three.js on ARCore) first; ViroReact dev build if it must be in-app.
- Frames 12–14 were redone on **real photos** of the Delhi Gate (Wikimedia Commons, in `design/characters/photos/`: Pravega CC0; Jatin.mittal06 CC BY-SA 3.0; ny_nihal23 CC BY-SA 4.0; credited in the frames): AR+-style arrival (camera on → gold spot ring → he's there → he waves), sitting on a rock with kids, on the bastion at dusk. Frame 16 = how Pokémon GO does it (AR Classic / AR+ / Playgrounds). The first stand-in-street versions sit in a bottom row named "old · stand-in street".
- Composites: `design/characters/comp.html` (photo camera matched by focal length, horizon and height; shadow catcher; light presets) rendered by `rcomp.mjs`; frames by `build_real_frames.py` and `build_pogo_frame.py`.

### 2D anime characters (17 Oct; user wants 2D anime style, not 3D)
- Doraemon as an SVG cut-out rig in anime style (ink outline with a thicker outer contour, flat colour, one hard cel shadow, head shine), timed on 2s (12 drawings/s): clips idle, hi (wave + talk), walk, found-you hop. Plus a street mode on the real Delhi Gate photo (CC0): camera hint → gold spot → pop-in → walk up → "Hi! I'm Doraemon!".
- Files: `~/.cache/saath-recovery/design/characters/anime/` (`doraemon.html` with `window.renderAt(t)`, `cap.mjs` frame capture). Open source only: SVG + JS, headless Chromium, ffmpeg. Not wired into the app.
- **v3 (`doraemon-v3.html`, `doraemon-v3-*.mp4/.gif`)** was redrawn after the user showed an official-style reference: thin even lines, flat colour (no cel shading), a head wider than tall at over half the height, the face filling the hood with cheek bulges, big touching eyes (open/half/closed/happy/wink), a huge red mouth with an orange tongue, big feet in front, dynamic poses ("Yay!" jump = the reference pose). v1 (thick outlines, cel shading) is kept as `doraemon-v1.html`; comparison in `doraemon-before-after.png`.
- **v4 (`doraemon-v4.html`, `doraemon-v4-*.mp4/.gif`)**: the user said "Doraemon still needs work" and asked me to study his walk and behaviour from photos and YouTube first. Study: the 2005 opening (YouTube `Wi2O2lojWKE`, 64.4–65.4 s at 1080p) stepped at 1/12 s with a blue-pixel tracker crop, plus the profile walk at 72.4–73.3 s, official posters and GIF clips. Findings (`doraemon-walk-study.png`): walks are staged turned ~45°, rarely straight at the camera; 3 small quick steps a second (a stride = 8 drawings on 2s); the back foot peels off heel first and kicks up behind, sole showing; small bob and lean, head steady; happy walk = both arms out wide, the far one ahead and up, stretched longer than at rest; mouth wide open. Signature behaviours: the gadget reveal (hand in the pocket, rummage, flash, held up high with its name called) and flying on the Take-copter.
  - Rig changes: a `turn` pose value (head and body treated as balls, face clipped to the head, mouths and belly slide whole, whiskers shorten by cos), limbs are tubes out to the posed hand or foot (arms can stretch with `reach`), front-arm and in-pocket layers, a Take-copter (3 blade drawings for the spin).
  - Clips: Idle, Walk (3/4), Hi!, Gadget! (Take-copter reveal), Take-copter (flying), Yay!. Street (11.5 s): hint → gold ring → he flies down on the Take-copter and lands → walks over three-quarter on, feet planted (0.8 m/s for 3 steps/s, position on 2s too) → turns to you → "Hi! I'm Doraemon!" (the bubble moves to whichever side of his head has room).
  - Other friends: Nobita, Shin-chan and Goku were built in their own sessions; see "Friends in the app" below.
- **v5 (`doraemon-v5.html`, `doraemon-v5-*.mp4/.gif`)**: the user said "built doreamon rig accurately". Every view is now traced from official art and checked by overlay. `doraemon-v5-vs-official.png` shows the official drawing, the rig in the same pose, and the rig's lines over the official.
  - Colours are the official flat print colours, measured from TV Asahi's character art: blue #00A0E9, red #E60012 (nose, collar, inside of the mouth), ink #231815, bell #FCE200, tongue #EC6C1C.
  - Three-quarter head: traced from TV Asahi's character art (https://www.tv-asahi.co.jp/doraemon/character/img/doraemon.jpg, 320×380, facing left, head tilted 16°). It is kept in that image's coordinates inside a group that levels it, mirrors it to face right and scales it ×1.84 (`head3q()`).
    - The rig switches to it at |turn| ≥ 22°. Below that, the front head's small-angle warp acts as the in-between.
    - The body narrows by cos(turn), matching the official three-quarter proportions.
  - Front view: re-measured from official face-on art (Comic Natalie, `ogre.natalie.mu/media/news/comic/2018/1029/dorachan.jpg`). The head is a superellipse (exponent 2.2), and the face outline is a spline through the measured edge.
    - Head details: eyes are lower; pupils are bigger and solid; the nose is smaller; whiskers are straight and 15 units higher; the open mouth is wider, with a two-lobed tongue.
    - Body: wider (±110), with a big belly (rx 90) and pocket (140 wide). The bell is r 25, hands are r 30 and the feet are set at ±75. Arm poses were retuned for the new shoulder.
  - New `#mode=pose&p={json}` renders one drawing for overlays. `make_compare.py` builds the comparison sheet from screenshots of the two official images.
- **v6 (current, `doraemon.html`, `doraemon-v6-*.mp4/.gif`, APPROVED by the user on 17 Oct: "Doraemon v6 is accurate now")**: the user said v5 was "still not accurate" and asked to find another way to get the exact shape and to build an advanced rig.
  - Exact shapes: every part's outline is extracted from the official images instead of hand-measured. This ran in the browser on each image's own tab: colour classes, ray casting from part centres, and sub-pixel ink centres from the darkness profile.
    - Raw data: `official-front.json` (Comic Natalie face-on art) and `official-3q.json` (TV Asahi three-quarter art).
    - `build_shapes.py` cleans the data and writes `doraemon-shapes.js`:
      - mirrors half-shapes for symmetry
      - fits superellipses to the heads (exponent 2.16 face-on, 2.24 three-quarter)
      - levels the 3/4 head by 16° and scales it to the same head height
      - takes the face under the head's edge only where the official face meets it
      - resamples outlines with matching start points (faces are matched by angle round the head centre)
    - The data is also inlined in `doraemon.html`, so the rig is one file.
  - Advanced rig, Live2D style: a head-angle parameter (`turn`; ±35° is the full three-quarter drawing) blends every head part point by point. It runs from the official face-on drawing to the official three-quarter one or its mirror (left and right parts swapped), so he turns smoothly with no drawing switch. Limbs are bones, posed from the official rest arm (shoulder 302.7,327.7, hand 356.4,369.5); all arm poses were retuned for it. Eye and mouth variants draw inside the blended official outlines. Front pupils have the official white highlight.
  - Checked: the overlays of rig on official in `doraemon-v6-vs-official.png` line up for both views. `doraemon-v6-headturn.mp4` comes from the new `#mode=turn` page.
  - Fixed a v5 bug where a comment swallowed the wave's head tilt.

### Friends in the app (17 Oct, evening)
- **The rigs** (each has a NOTES.md in its folder under `~/.cache/saath-recovery/design/characters/anime/` with sources, findings and open points):
  - Doraemon v6 (`doraemon.html`): approved.
  - Shin-chan v1 (`shinchan/shinchan.html`): approved. Clips are Idle, Walk, Hi!, Buri-buri (clothed), Action Kamen, Yay!. Palette is from TV Asahi's art.
  - Goku v1 (`goku/goku.html`): approved. He's adult DBS Goku in Dragon Ball's own two-tone cel style, with two-bone IK. Clips are Idle, Walk, Hi!, Kamehameha!, Instant Transmission, Yosha!.
  - Nobita v1 (`nobita/nobita.html`): **still being reviewed in its own session**. Clips are Idle, Walk, Late!, Hi!, Doraemon~!, Nap, Bang!, Yatta!. Re-run the build when it changes.
- **Into the app**: `scripts/build-rigs.mjs` copies each rig page and injects a camera mode after `let render, loopLen = 1e9;`. The copy is a transparent page where he stands at 86% of its height and is 57% of it tall. `window.saath` takes `play(['arrive', 'hi'])`, `mystery(on)` and `still(t)`, and the page posts `ready` and `{type:'clip', role}`. The script writes `src/rigs.ts`; with `--faces` it also renders each head face-on to a 192 px PNG, plus a silhouette, into `src/faces.ts`. The approved design files are never edited. Roles per friend (arrive / extras) are in `RIGS` in the script:
  - Doraemon: Yay! / Gadget!
  - Nobita: Nap (wakes up) / Bang!, Yatta!, Doraemon~!
  - Shin-chan: Buri-buri / Action Kamen, Yay!
  - Goku: Instant Transmission / Kamehameha!, Yosha!
- **Map**: round profile locators replace the standing figures. A met friend shows their official face in a ring of their colour on a pointer whose tip is the spot. An unmet friend shows their real head silhouette in slate with a glowing gold "?". The tracked friend is bigger, has a gold pulse and shows the name pill. The bottom card's sticker is the same round portrait.
- **Camera**: the old stand-in figures (`FriendFigure.tsx`, trashed) are replaced by the live rig. It is placed by the same projection; its box is 2.2× his height wide.
  - Not met: a breathing silhouette with a "?".
  - Found: he does his arrival, then waves, and the "You found me!" bubble waits for the wave. Then he idles with an extra every 7–14 s.
  - The page stays loaded while you look away.
- **Data** (`friends.ts`): `look` is now `character`. Colours are from the official art: Doraemon #00A0E9, Goku #E96633, Shin-chan #E3002C, Nobita #FED23D.
  - Goku stands at the foot of the main Parvati Hill stairway (OSM way 212751762), 18.49829, 73.849545.
  - Saved test friends are migrated by `savedTestFriend`; ones that were Tom or Jerry become Goku.
  - The harness fixtures (`scene-wada.js`, `placement-test.mjs`, `tap-test.mjs`) use the new fields.
- **Checks**: tsc clean; raise 7/7; placement, tap and roof (20/20) all pass; `expo export --platform android` builds (2.5 MB). A mock camera page (all four over the Delhi Gate photo, silhouettes, then the reveal) showed no page errors.
  - On the S24 (17 Oct, 18:30) the transparent WebView composites fine over the camera.
  - The first launch showed only part of a giant head at the screen edge. Inside Android's WebView, `innerWidth`/`innerHeight` came back 2.6× too big (device pixels: 520×910 for a 200×350 box). Fixes:
    - the camera mode measures the page with `document.documentElement.clientWidth/clientHeight`;
    - it divides by `visualViewport.scale` (the WebView zooms the page by 1.037);
    - `FriendRig` sets `scalesPageToFit={false}`.
  - Now the whole friend shows at the right size and stays on the spot as the phone moves (checked with phone screenshots, test Nobita).
- **Floor flow, pinned to the floor (17 Oct, evening)**: the user said the friend "moves along with my camera" and that he should stay fixed on one spot.
  - The cause: the app's heading is corrected toward the compass within 0.6–2 s, and indoors the field is bent. Readings also lagged going through React and the bridge.
  - Now the rig page tracks the phone itself (`scripts/rig-ar.js`, pasted into each rig by `build-rigs.mjs`). It uses `deviceorientation` (Chrome on Android: gyroscope plus gravity, no compass, at the display rate). The camera's right/up/forward come from the W3C Z-X'-Y'' angles, and it projects in 3D, so roll is included.
  - If the WebView sends no events, `saath.orient(heading, elevation, roll)` from the app is the fallback. The debug view shows `gyro device|app`.
  - The flow, as the user asked:
    - Scan the floor: a radar on the floor. 1.6 s of pointing at floor 0.8–4 m ahead while moving slowly.
    - "Floor found": the gold ring with footprints follows the middle of the view. "Set the spot here" (`floorLock`) pins it.
    - "Call {name}" (`floorCall`) meets them. He walks in from the left at his rig's own speed (Doraemon 0.8, Nobita 0.72, Shin-chan 0.5, Goku 1.3 m/s; walk drawn facing right, flipped when going left). He stops on the ring and waves with a speech bubble, then walks up to 1.3 m from you and idles with extras.
    - Your steps moved the camera 0.7 m forward (`floorStep`; removed in option A, see below). "Set a new spot" restarts. "I'm sitting down" sets the phone height to 1.05 m instead of 1.4 m.
  - Far away, the GPS/compass view is unchanged (`saath.place`).
  - **Changed after the first phone test** (the user: "why is he coming near first? focus on putting the character on the floor exactly", plus "slides or shakes" and "feet not on floor"):
    - No walking any more. "Call" puts him right on the ring: his arrival plays in place, then hi with the bubble, and he stays on that spot.
    - Before scanning, the app asks "Are you standing or sitting?" (1.4 m or 1.05 m), remembered while the app runs. Sitting at a desk with the standing height had put his spot about a third further away than the ring.
    - The camera is modelled 0.3 m in front of the point you turn about (a VR-style neck model), so turning swings it round. Ignoring that made him slide as you turned.
    - A one-euro filter (1.2 Hz, β 2.5) smoothed the camera's forward and up vectors (removed in option A: it made him lag).
    - A blurred contact shadow sits on the floor under his feet (r 0.17 m), replacing his own flat one.
    - The ring and shadow are ellipses centred on the floor point's own projection. A projected circle's middle drifts towards you, which had put his feet off-centre on the ring.
  - Tested headless with simulated `deviceorientation` for all four friends (scan → lock → call → walk in → hi → walk up; ±15° pans move him the opposite way on screen); no page errors.
  - **Works on the S24** (17 Oct, 19:15), watched live with test Nobita:
    - The ring lay on the real floor and he walked in onto it, waved with the bubble, then walked up close at life size.
    - When the user turned to the desk he wasn't there, and turning back he was still on his spot. He stays pinned and no longer slides with the camera.
  - Watching the phone: `phone-mirror.mjs` in the session scratchpad serves `adb exec-out screencap` frames at http://127.0.0.1:8777 for the browser pane (about 2 fps, local only). Expo Go's shake menu pops up when you wave the phone around; close it with its ✕.
  - The research agent's ARCore report: real floor detection = a Chrome WebXR page opened from the app (6–8 h), or ViroReact 3.0.3 in a dev build (2–3 days; an open bug with a black camera on an S24 on Android 16). First check: the WebXR hit-test sample in Chrome on the S24. The user replied "i tested it's working", but it's unclear whether that meant the sample or the app's floor finder.
  - **Still unstable after the floor fixes** (17 Oct, ~19:30). The user said "how unstable the character position", and asked for research and notes before more code. The research is in `notes/ar-stability.md`:
    - the causes, ranked, with sizes in pixels;
    - the sources;
    - options A, B and C;
    - how to measure on the phone.
    - **Option A, approved and done in code (17 Oct, ~20:00):**
      - Steps no longer move him. `floorStep` and the 0.7 m jumps are gone: lifting or bobbing the phone passed the step test and jumped him closer. Walking up to him isn't tracked any more.
      - The one-euro filter is gone. The page keeps the last 40 `deviceorientation` readings and blends between them.
      - Measured on the S24 from a screen recording (details in the notes): the WebView is about 15 ms *slower* than the camera preview. So the page now draws the orientation `LEAD_S` = 0.015 s **ahead**. It carries on at the latest turning speed, for at most 50 ms, only while readings keep coming, with the speed taken over at least 10 ms.
        - Headless check: 13–15 ms ahead while turning; at most 0.7° off for about 30 ms after a sudden stop.
        - An earlier 30 ms delay (`DELAY_S`) went the wrong way.
      - The field of view is 72.7°, from the phone's own lens calibration (fx 2770 px over a 4080 px sensor height). It lives in `VFOV_DEG` in CameraScreen and is sent to the page in `floorStart`.
      - Not settled: the arm model (`ARM_M` 0.3 m). The test spot was on a bed, which breaks the floor model; re-test on open floor.

### AR camera in Chrome, replacing the in-app floor flow (17 Oct, night)
- **Why:**
  - The user called the sensor-only version "not at all good".
  - Real AR games all use ARCore (`notes/ar-games-study.md`). The only Pokémon GO mode without it floats the Pokémon.
  - A spike placed him under 1 m away on a box; the user said "floating on the screen, … needs to be a little bit far from the camera".
  - Four subagents then tried four methods (`spikes/webxr-demo/`: `floor-distance`, `auto-spawn`, `xr-planes`, `grounded` .html, each with an `out-*/` preview video).
  - The user chose to combine them.
- **Now:** at a friend's spot, CameraScreen shows "Meet {name} in AR". It opens `web/ar/` in **Chrome**, using `expo-intent-launcher` with package `com.android.chrome`, because the phone's default browser is Brave.
  - The URL is `?friend=<rig>&name=&tall=<m>&return=<app>/--/ar-done?friend=<id>`.
  - On the page:
    - ARCore's detected floor is used: the lowest plane facing up, then hit tests, then a `local-floor` guess.
    - The friend comes out **by himself** about 2.5 m ahead, or about 2 m on the flat floor when the mapped floor doesn't reach that far (small rooms). This happens 1 s after the phone looks ahead.
    - The view greys under 1 m.
    - Grounding: a two-layer shadow, depth occlusion, and gentle light (brightness only, 80–100%).
    - "Back to Saath" is an intent link into Expo Go (`exp://…/--/ar-done?friend=<id>&met=1`). App.tsx's `Linking` listener marks them met.
- **Removed:** the in-app floor flow (standing/sitting, scan, set the spot, call), from CameraScreen and from FriendRig's props.
  - `scripts/rig-ar.js` still contains the now-unused floor mode. Removing it is a separate cleanup.
- **Running it:**
  - `node web/serve.mjs` (port 8099), plus `adb reverse tcp:8099 tcp:8099` and `adb reverse tcp:8081 tcp:8081`.
  - `scripts/build-rigs.mjs` also writes `web/ar/rigs/<id>.html`.
  - shortcut: the page is served from the laptop. To demo without it, `web/` must be hosted on HTTPS, which is publishing, so ask first.
- **Tested:**
  - Headless, all four friends: they come out on the floor 2.5 m ahead, the box is ignored, "too close" greys and clears, no errors.
  - A fake-WebXR test of the AR path passes, including the "Back to Saath" link.
  - Types pass.
  - On the S24, the combined page (spike) worked: he came out 2.0 m away on the floor and held his spot.
  - **Round trip on the S24 (22:10).** Saath → "Meet Nobita in AR" → the AR page → Nobita came out by himself → "Back to Saath" → Saath showed "You met Nobita!". "Meet Nobita again" also worked.
  - The user: "stability is good", but "sometimes body is disappearing".
  - **Fixes after that test:**
    - The page opened in **Brave**, the default browser, because `expo-intent-launcher` ignores `packageName` without `className`. Fixed with `className: 'com.google.android.apps.chrome.IntentDispatcher'`. Not yet re-tested on the phone.
    - The body disappearing was **depth occlusion**: ARCore's coarse depth of the floor around his feet hid his feet and legs in open floor. Occlusion is removed, so he's always drawn whole.
    - Without occlusion he must never stand behind furniture (he did once, behind the bed). When the floor outline doesn't reach far enough, he now only stands on a **seen** floor point, 1.5–3 m away and within 35° of the view. Otherwise he waits.
    - Headless tests pass, including "floor seen only 1 m away → waits".
  - **Second test on the S24 (22:18):**
    - It opened in Chrome, and his body stayed whole.
    - In one session he still came out on the floor behind the bed, because ARCore's floor outline itself reached there. Every placement now needs a seen floor point within 0.5 m (regression test "floor outline reaches behind the bed, but that floor was never seen").
    - All 17 fake-ARCore checks pass. That fix isn't re-tried on the phone yet.
  - Test scripts are in the session scratchpad `combined/`: `web-preview-test.mjs`, `web-ar-mock-test.mjs`.

### Accuracy audit (17 Oct, by a subagent; scripts and outputs in `~/.cache/saath-recovery/accuracy/`)
The distance maths is fine: haversine R 6371 km is within 0.5% of WGS-84 (0.09 m at 20 m), bearings are within 0.17°, compass maths is exact, and the card, edge pill and levels agree. NOT fixed yet (waiting on the user):
1. Every number is straight-line while a walking route 1.14–1.94× longer is drawn (Dagdusheth→Doraemon: 434 m shown, 842 m to walk). Fix: post the remaining route length from `update()` and show it while navigating.
2. `final` (`mapNav.ts:180`) uses straight-line ≤ 60 m and drops the route with up to 239 m of it left. Fix: decide it on the remaining route length.
3. **Endless re-routing**: OSRM's snap point is up to 150 m away (`:163`), but drift is > 25 m (`:184`), so it re-asks every ~10 s (28 requests in 5 min from inside Shaniwar Wada). Fix: `pts.unshift(from.slice())` in `checkRoute`.
4. Steps move you the way the phone faces (`positioning.ts:77`): in a pocket you drift, then get ~30 m jumps every 15–25 s and extra buzzes. Fix: when speed > 0.8 m/s and the GPS course differs from facing by > 60°, step along the course.
5. Route trimming (`nearestOnLine`) has no memory and skips ahead or back on routes that pass near themselves (Wada→Tom: > 40 m jumps in 48% of noisy walks). Fix: search from the last segment index forward about 100 m.
6. "here" is a fixed 20 m: with ±15 m GPS, standing 30 m away gives a false "here" in 57% of 10-minute waits, and lane multipath can stop it ever firing. Mitigation: radius `max(20, min(35, accuracy))` plus a 2–3 s dwell, in both `levelFor` copies.

### Done: `src/mapStyle.ts` (type-checks, renders headless)
- Golden Hour palette:
  - Land `#E6DAC2`, water `#3F8FA5` with a `#9CCAD0` shine and a `#2B7489` edge.
  - Lawns and parks `#A7C47A` / `#93B868`.
  - Asphalt roads `#7A7067`–`#968C81` with pale sidewalks `#EFE5D2` and a new dashed `road-lanes` layer `#F6EFE1`.
  - Footpaths `#EFE5D2` with a `#D6C8AE` curb.
  - Walls `WALLS` (sandstone/cream/ochre) and roofs `ROOFS` (terracotta/tin/concrete). They are picked from the feature id with different steps, so a wall doesn't always get the same roof.
  - Warmer labels.
- Light: `{anchor: viewport, color #FFF2DA, intensity 0.34, position [1.3, 232, 56]}`, so the sun sits behind-left of the camera at 34° elevation. Sky: `#86B4E0` fading to `#F3D2AC`.
- Toys (GeoJSON source `style-toys`, fill-extrusion, zoom 15+):
  - Tree trunks.
  - A per-house roof lid in a `ROOFS` colour.
  - A black water tank on about 40% of roofs that are at least 6×6 m.
- Three WebGL custom layers (all ES5 strings inside `STYLE_JS`):
  - `style-shadow` (2D, just under `building-3d`): `prerender` draws every wall and tree shadow into a half-res FBO in 4 jittered passes. Each pass sits at its own `depthRange(z, z)` so overlaps never double-darken. `render` lays the result over the ground as `#34406A` at 34%.
  - `style-trees` (3D, before `road-name-small`): instanced lumpy icospheres (subdivision 2, 960 vertices). Each has 3 sun-shaded greens (`TREES`).
  - `style-air` (2D, before `road-name-small`, depth test off): warm haze `#EED9C1` rising to the horizon line, a glow `#FFE0AE` on the sunny side and a soft vignette `#2A2238`.
- `window.__styleDebug()` returns `{shadows, shadowsDrawn, trees, broken: [shadow, trees, haze]}` for tests.
- Verified headless at the Wada view:
  - Layer order: `building, style-shadow, building-3d, building-roof, style-toys, style-trees, style-air, road-name-small…`.
  - About 103k shadow vertices; 80 trees (240 blobs); 3500 roofs; `buildToys` takes about 22 ms.
  - Shadow and haze were confirmed by pixel diffs.
  - No GL errors and no failure messages.
- `building-3d` still uses `['get','render_height']` and `['get','render_min_height']`; the roof long-press needs them.
- **Tests after the rewrite (17 Oct):** `tsc` clean; placement test all passed; roof test **20/20**; tap test all passed. Full log: `~/.cache/saath-recovery/shots/v3/tests.txt`.
- `mapNav.ts`, `mapFigures.ts` and `mapHtml.ts` are **unchanged** (still the old candy/ink look). The phone has not been updated or relaunched with any of this.

### Left to do (in this order)
1. **Tune `mapStyle.ts` towards `comp_golden.png`.** Compare `shots/v3/a1-wada.png` with the comp.
   - **Trees are too small and too sparse.** The comp's rules (`render_comp.py`):
     - Crown radius `r = 2.4 + 2.6·rand` m (street trees `2.0 + 1.6·rand`).
     - Crown centre height `hc = 1.55·r + 1.5`.
     - Four lobes as (sideways offset, height offset, radius): `(0, −0.08r, r)`, `(0.45r, +0.28r, 0.66r)`, `(0.42r opposite side, +0.34r, 0.6r)`, `(0.02r, +0.62r, 0.52r)`.
     - Trunk `#5B4636`, about `0.09·r` radius.
     - Park density 1 per 95 m², garden 1 per 140 m².
     - **Street trees** every 13 m with a 42% chance along residential/tertiary/secondary/living_street/unclassified roads. Offset each from the centre line by half the road width + 1.6 m, on a random side.
     - Reject trees inside buildings or on roads; dedupe on a 3.4 m grid.
   - Where that lives in `mapStyle.ts`: `findTrees`, `greenDensity`, `trunk`, `blob(...)` in `setScene`, `TREE_MAX`.
     - Read street lines with `querySourceFeatures('openmaptiles', {sourceLayer: 'transportation'})`.
     - Building rejection can reuse the house rings that `findRoofs` already returns (call it first).
   - If the tree count grows a lot, add LOD: subdivision 2 for the nearest few hundred instances and subdivision 1 (240 vertices) for the rest. Use two instanced draws and offset the instance attribute pointers.
   - Tree shadow: a drum of radius `0.92·r` from `hc − 0.59r` to `hc + 0.59r`. That matches a sphere's shadow at 34° elevation.
   - **Walls read paler and greyer than the comp.** MapLibre's extrusion lighting can only darken, so make the `WALLS` base colours a little warmer and more saturated. The comp's lit walls are about `base × (1.10, 1.01, 0.87)`.
   - The haze works but reads weak, because its colour is close to the walls. Optionally strengthen it.
2. **Restyle `src/mapNav.ts`** (design: Figma frames "Navigate" and "Components"):
   - Colours: azure `#2F8DF6` [0.184, 0.553, 0.965], gold `#F9BC4D` [0.976, 0.737, 0.302], amber `#F49E3A` [0.957, 0.62, 0.227].
   - `LOOKS`: far/cold = azure body with white marks; warm = azure with gold marks; hot = gold; here = amber. Beacon ring gold. The route turns gold within `FINAL_M` (60 m).
   - `PATH_FS`:
     - Drop the ink outline and paw prints.
     - Soft shadow pass with `u_shift = (0, −6/H)`.
     - Body radius `u_core = 6·s` px with a glow out to `u_edge = 15·s` (`G = edge + 2`).
     - Tube shading `1.0 − smoothstep(0.0, u_core, r)` (never pass smoothstep reversed edges).
     - A thin `#E9F6FF` centre line about `0.9·s` px wide.
     - White capsule pulses flowing to the friend: `q = rem + u_phase`, spacing about `46·s`, `wave = 4·spacing`.
   - `BEACON_FS`: soft gold rings, no ink.
   - X-ray: change `render(g, matrix)` to `render(g, matrix, k)`.
     - Add the main layer `nav-guide` (k = 1) **before `building-3d`**, so buildings hide it.
     - Add a second layer `nav-xray` (k = 0.42) before `road-name-small`, only if `building-3d` exists.
     - For k < 1, call `gl.disable(gl.DEPTH_TEST)` and skip the shadow pass. The route then shows through buildings at 42%.
   - Edge arrow becomes glass: semi-white with `backdrop-filter: blur`, an azure arrow with a white stroke and an azure distance pill.
   - Arrival confetti becomes gold stars (clip-path), with `filter: drop-shadow` on the parent `.nav-party` only.
   - Fallback `nav-line` layers: glow `#4FB2FF`, body `#2F8DF6`, centre `#E9F6FF`.
3. **Restyle `src/mapFigures.ts`**:
   - `INK '#111318'` → `'#2B2433'`; ink stroke 3 → 2.4; limb under-stroke `w + 5` → `w + 4`; hand stroke 2.5 → 2.
   - A hidden SVG filter `#fg-lit`: a specular sheen from the upper-left (about 35° up, exponent about 25) plus a lower-right edge shade. Apply it **only to the static body group** via `<g filter>`.
   - Soft contact shadow: radial gradient `rgba(42,34,56,.42)`.
   - A warm `.fg-beam` light column behind the target friend.
   - Glass name pill: `rgba(255,255,255,.8)` with backdrop blur, an azure dot via `::before`, text `#1D2B3C`.
   - Gold pointer with a drop-shadow. Mystery silhouette `#433D5E`. Sparks without ink.
   - Badges: CSS drop-shadow; white pin with a faint stroke; the unmet pin is `#433D5E` with a gold "?".
   - Burst without borders; zz in azure.
   - Keep the `fg-` class prefix. **Never set `className` or `style.transform` on a Marker root element.** MapLibre owns those, and overwriting `className` once shifted markers 36 px per index.
4. **`src/mapHtml.ts`**:
   - `.me` dot: azure `#2F8DF6`, white ring, soft shadow and halo (no ink ring).
   - `.cone`: `rgba(47,141,246,.5)`.
   - Accuracy layers: `'#2F8DF6'`.
   - Add `var PITCH` for the initial view, the first-fix `jumpTo` and `recenter` (all currently 55). Pick 66–70 from screenshots taken with app-like insets (`saath.setInsets(170, 130)`), because the app's top card covers the top of the map.
   - `maxPitch` 70 → 76.
   - If the initial pitch changes, re-check `placement-test`, which uses the initial pitch.
5. Run every test (section 6) and take after-shots. Compare them with `comp_golden.png` and `before-wada.png`.
6. Tell the user it's ready to view on the phone. Relaunch only when they say so (section 7).
7. Optional:
   - Add a "08 · Built vs design" frame to the Figma section `10:2` (`html_to_figma`, then move it into the section).
   - Update the memory file named in section 1.

## 5. Technical notes (checked against MapLibre GL JS 4.7.1 source)

- The three modules are template strings pasted into **one ES5 IIFE** in `mapHtml.ts`.
  - Double every backslash (`'\\n'`).
  - Don't declare top-level names that `mapHtml` already uses: `post, VECTOR, RASTER, map, styleLoaded, usingRaster, useRaster, me, accuracy, meMarker, coneMarker, centredOnce, mode, heading, shownHeading, nav, figures, EMPTY, accuracyData, refresh, setMode, focus, frame, spotAt, along, inside, crossing, press, cancelPress`.
  - `post({type:'log', msg})` reaches the app; the harness prints these as "page messages".
- Custom layer GL state:
  - `prerender` runs in the offscreen pass. After `prerender` and `render`, MapLibre calls `context.setDirty()` and `setBaseState()`, which restore the viewport, cull face and blend equation; everything else is re-applied lazily.
  - So a custom layer must set every state it relies on: depth, blend, stencil, scissor, `depthRange`, framebuffer. `setCustomLayerDefaults` unbinds the VAO first.
- Depth:
  - **2D custom layers** get a read-only `LEQUAL` depth test at a constant sublayer depth near 1. If drawn after 3D buildings they are hidden behind them; call `gl.disable(gl.DEPTH_TEST)` to draw over them (haze, x-ray).
  - **3D custom layers** share the depth buffer with fill-extrusions.
- Sky and haze:
  - The sky is drawn first, only above the horizon line.
  - Style fog only applies with terrain, which is why the haze is a custom layer.
  - Horizon line from the top of the screen = `height/2 − transform.getHorizon()`; MapLibre's sky uses the same formula.
  - At 412×915: no sky at pitch 68; about 33 px of sky at pitch 70; about 78 px at pitch 72. The comp camera was pitch 74.3, 500 m away, bearing 160.
- Coordinates:
  - The custom layer matrix is Float64, in Web Mercator units (0..1). z is also in Mercator units: metres / (40075016.7·cos lat).
  - Move to a local origin in doubles before Float32 (`localMatrix` in mapStyle, `local(m, ox, oy)` in mapNav), or geometry wobbles.
  - For a fixed depth that still clips correctly, use `gl.depthRange(z, z)`. Don't fake `z = c·w`: that moves the near plane to w = 0.
- Light:
  - With the viewport anchor, azimuth 0 = top of the screen, clockwise; polar = 90 − elevation.
  - World azimuth = map bearing + viewport azimuth. The shadow and tree code use `bearing + 232`.
  - Fill-extrusion lighting only darkens: lit walls ≈ base × 0.89 × light colour; unlit ≈ × 0.66; roofs ≈ × 0.85.
- GLSL ES 1.0 pitfalls:
  - `pow(x, y)` is undefined for x < 0.
  - `smoothstep` is undefined when edge0 ≥ edge1.
  - Non-constant uniform-array indexing is only allowed in vertex shaders.
- Debugging:
  - `map.getStyle()` omits custom layers; use `map.getLayer(id)` or `map.style._order`.
  - Chrome gives WebGL2. The code also handles WebGL1 through `ANGLE_instanced_arrays`.
  - The scene layers build about 0.5 s after tiles settle (debounced 350 ms, max 1.5 s), so wait before measuring.
  - The old candy toys (lollipop crowns, `CANDY`, `TREE_CROWNS`) are gone; nothing else referenced them.

## 6. How to test

Headless Chrome must be listening on port 9333. Check with `curl -s 127.0.0.1:9333/json/version`. If it is down:
```
CH=~/.local/share/rea-tools/chrome/chrome-headless-shell/linux-155.0.8059.79/chrome-headless-shell-linux64/chrome-headless-shell
mkdir -p ~/.cache/saath-recovery/chrome-profile
$CH --headless --no-sandbox --remote-debugging-port=9333 --user-data-dir=$HOME/.cache/saath-recovery/chrome-profile --use-gl=swiftshader --enable-unsafe-swiftshader about:blank 2>~/.cache/saath-recovery/chrome.log
```
Then:
```
H=~/.cache/saath-recovery/harness; R=~/Documents/Hackathons/bolt-builders-week/saath-prototype
cd $R && npx tsc --noEmit -p .
node --no-warnings $H/mapcheck/placement-test.mjs $R 9333
node --no-warnings $H/mapcheck/roof-test.mjs $R 9333        # must stay 20/20
node --no-warnings $H/mapcheck/tap-test.mjs $R 9333
cd $H/mapcheck && node --no-warnings shot.mjs $R 9333 out.png --view 73.855534,18.520155,17.64,70,160 --js "$(cat scene-wada.js)" --wait 6000
```
- `shot.mjs` options: `--view lng,lat,zoom,pitch,bearing`, `--js '<expr or promise>'` (the result is printed as `js →`), `--wait ms`, `--frames n --every ms`, `--dpr n`. It prints page logs and problems.
- `scene-wada.js` sets up the public test scene: Doraemon at Shaniwar Wada as the target, Jerry unmet nearby, and a route.
- Headless gotcha: two CDP long-presses within 30 px become a double-click, which zooms the map. The tests re-jump the view before each press.

## 7. Running on the phone (only with the user's go-ahead)

```
cd ~/Documents/Hackathons/bolt-builders-week/saath-prototype
npx expo start --localhost --port 8081        # keep it running in the background
adb -s <phone-serial> reverse tcp:8081 tcp:8081
adb -s <phone-serial> shell am force-stop host.exp.exponent
adb -s <phone-serial> shell am start -W -a android.intent.action.VIEW -d exp://127.0.0.1:8081 host.exp.exponent
```
- The S24's Play Store Expo Go is 57.x, which is why the project stays on SDK 57.
- The phone drops off adb when One UI's battery protection stops charging. After replugging, re-run `adb reverse`.
