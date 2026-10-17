# What real AR games do — watched 17 Oct 2026

The user, after four rounds of sensor-only fixes: "not at all good … watch some AR videos, Pokémon GO and
other games, understand". These notes are what the videos show, frame by frame, and what it means
for Saath. (Companion to `ar-stability.md`, which explains *why* our version slides.)

## Videos watched

| Video | What it shows |
|---|---|
| "POKEMON GO - AR+ MODE GAMEPLAY FOOTAGE" (Drumil), <https://www.youtube.com/watch?v=hCaP4jZPl5M> | Screen recording of AR+ encounters (ARKit). Zangoose and Snorlax on grass, the player walking up to them. |
| "Pokemon GO's new AR+ Mode for iOS" (TechCrunch), <https://www.youtube.com/watch?v=E7nwr6sA6Es> | Over-the-shoulder demo of the same mode. |
| "\*NEW\* 2024 GO SNAPSHOT POKÉMON GO TUTORIAL!" (PkmnMasterHolly), <https://www.youtube.com/watch?v=-YN48-cJa_c> | GO Snapshot: finding the ground, placing several Pokémon, walking among them. |
| "Pokemon Go Buddy Adventures Tutorial & Test on Normal AR & AR+" (DarshD), <https://www.youtube.com/watch?v=pyWHqeOVZqE> | The same buddy screen on a phone **without** AR+ (normal AR) and **with** AR+ (Galaxy S7). |
| "Peridot Gameplay Review Niantic AR Pet Game" (Alan Yu), <https://www.youtube.com/watch?v=p-kOMKYDQXM> | A Niantic AR pet walking on real pavements and paths. |

## What they do

1. **Finding the ground is quiet and quick.**
   - AR+ starts with just the live camera and one line: "Slowly look around a flat, open area with your camera".
   - There's no radar and no progress bar. ARCore/ARKit finds the ground plane while you look around.
2. **It appears at its spot; it doesn't walk in.**
   - AR+ sends leaves flying out of the grass, then "A wild Zangoose appeared!": it stands 2–3 m ahead on a patch of churned-up dirt.
   - In Snapshot, Mewtwo pops in with a burst of sparkles on the reticle.
3. **Feet are glued to the ground with contact cues.**
   - A dirt patch or burst decal under the feet.
   - A thin target ring on the ground.
   - A soft shadow, which is clearest under Peridot's pets.
4. **It stays exactly there while you move, not just while you turn.**
   - Snorlax grows as the player walks up and shrinks as they step back. He never slides on the grass.
   - Charizard towers over the camera when the player stands at his feet.
   - Peridot's pet walks along a real path next to a real cat.
5. **Life size.**
   - Snorlax is huge, Charizard is big, and Eevee and Peridot's pets are small.
   - Size alone tells you how far away it is.
6. **Placement in photo mode (Snapshot).**
   - A small reticle lies flat on the detected ground at the centre of the screen: an orange, then yellow, ring with a Poké Ball icon.
   - A blue arc on the ground marks where placement is allowed.
   - A big round yellow button places the chosen Pokémon, picked from a carousel above it.
7. **Too close is handled, not glitched.**
   - AR+ greys the camera and says "You're too close to the Pokémon!"
8. **Without real tracking, they don't pretend.**
   - Normal AR on a phone without AR+ (the Nokia 5 in DarshD's video) shows Eevee small, floating in the middle of the screen.
   - There's no floor contact, no shadow and no claim that it stands anywhere.
   - TechCrunch, 2017, on classic AR: Pokémon "would just glide around with you".
9. **The UI is minimal.** The camera is full screen, the name sits at the top, and one or two round buttons sit at the bottom.

## Saath now vs the real thing

| | Pokémon GO AR+ / Snapshot / Peridot | Saath today |
|---|---|---|
| Phone tracking | **ARCore/ARKit: rotation *and* position (6DoF)**, using the camera image plus the sensors | Gyroscope only: rotation (3DoF). It can't sense the phone moving. |
| Ground | **Detected by ARCore** (a real plane at its real height) | Assumed: flat floor at eye height (1.4 / 1.05 m). A bed or desk breaks it. |
| Character vs picture | Drawn in the **same frame** as the camera image, with the pose for that image | Separate WebView layer over the native camera, about 15 ms apart |
| Arrival | Pops up at the spot with an effect | Pops up at the ring with his arrival clip (same idea) |
| Ground contact | Dirt or burst decal, ring, soft shadow | Blurred contact shadow (same idea) |
| Walk up to him | Works: he grows | Can't: steps were removed because they jumped him |

The look and the flow are close already: scan, ring, place, pop-in, shadow. **The difference that makes theirs feel solid is the tracking.** All the working examples use ARCore/ARKit. The only Pokémon GO mode without it floats the Pokémon on purpose.

## What this means (systematic debugging, Phase 4.5)

Four rounds of fixes on the sensor-only overlay all left it "not good":
1. smoothing, an arm model and a shadow;
2. no walk-in, and a standing/sitting question;
3. no step jumps, no smoothing, a delay and the real field of view;
4. prediction and the measured field of view.

That's the pattern the debugging skill calls an architecture problem, not a tuning problem: **a gyro-only overlay cannot stand still on a floor it cannot see while the phone moves.** The fix is to put Saath's friend into an ARCore session. The options are in `ar-stability.md` (option C) and in the plan that follows these notes.
