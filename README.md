# Foley Party

A party game for voicing over a scene's sounds without knowing what it is. The host loads a video clip and marks the sound moments. Each player hears only their own few seconds of sound, with no picture, and copies it into the microphone. When everyone's done, the scene plays for the whole room with only your sounds on it. Then you play the original to compare.

## How a round works

1. **The host loads a clip** from their own device (MP4 works best, up to 80 MB). The clip never leaves the host's device until the reveal.
2. **The host marks sounds.** Scrub to a sound, press "Start a sound here", then press again where it ends (up to 12 seconds each). Each sound is shared out to a player automatically, or the host can pick who gets what. The host can add a tip for each one, like "just the punch, ignore the music". Marks are saved on the host's device, so loading the same clip again brings them back.
3. **Players record.** Each player listens to their sound as often as they like, then presses Record. A 3-2-1 countdown starts the take in time with the clip.
4. **Players line it up.** After each take the game auto-matches the timing, so a copy that came in late is moved earlier. Players can check with "Hear both together" and fine-tune by dragging their take on the waveform, using the slider, or nudging by 0.05 s. They can also set the take's volume, then send it. Re-recording is unlimited.
5. **The reveal.** Everyone taps "Take my seat". The host presses play, and the scene starts at the same moment on every screen, with captions showing who made each sound. Any sound nobody recorded falls back to the original audio. The host can also play the original, or mix a little of it under your version.

## Sound parts (voices, music, effects…)

You can split the soundtrack into parts so each player hears only one of them, like just the sound effects or just the voices. Each part gets its own lane in the scene editor with its waveform, so you can see where the effects are. Click a lane, then mark sounds on it. The 🎧 button (or "Hear while previewing") lets you play the video with only that part.

There are two ways to get parts:

- **Add part files (best quality).** Upload your clip at [mvsep.com](https://mvsep.com) and pick a model:
  - **DnR v3** (SCNet or MelBand Roformer) gives **speech, music, sfx**. This is the one for film and anime scenes.
  - **Demucs** gives **vocals, drums, bass, other**. This is for music videos.

  Download the parts and use "Add part files…". Up to 6 parts per scene. They're named from the file name (vocals → Voices, sfx → Sound effects, and so on) and lined up with the video automatically, so it doesn't matter if a file starts a little late.
- **Quick split (built-in).** No download needed. It splits the scene into "Hits & bangs" (punches, footsteps, drums, door slams) and "Tones & voices" (music, singing, speech). It takes about a second per 15 seconds of audio, but it's rough: some music leaks into the hits.

At the reveal, the host chooses how each part sounds in your version:

- **Keep the original, swap in our sounds** (the default): the original part plays, and goes quiet only where one of your sounds replaces it. Keep the music, swap the effects.
- **Only our sounds:** that part is muted, apart from any sound nobody recorded.
- **Original quietly under ours:** the original plays at low volume under your sounds.

Parts are trimmed to the scene and uploaded hidden, like the video, so players can't listen ahead.

## What makes a good scene

- **20–60 seconds long**, cut down to just the scene before loading it.
- **Distinct, separate sounds:** punches, footsteps, doors, glass, a scream, an explosion, a cat. Short sounds (1–5 s) are funnier and easier to copy than long ones.
- **Not much music** under the sounds, or players will try to copy the soundtrack too. Use the tip box to say what to focus on.
- **About 2–4 sounds per player.**
- Fight scenes, chase scenes, cooking scenes and slapstick work especially well. Animated series and anime are full of exaggerated sound effects.
- Use clips you have the right to play for your friends, such as your own recordings or clips you've bought. This is a private party game. Don't use it to share or redistribute copyrighted video.

## Requirements

- Every player needs a microphone and a modern browser. Chrome, Edge, Firefox and Safari all work. Headphones help a lot, especially for "Play the original while I record".
- The microphone only works over HTTPS. Render provides this automatically.
- **The host must keep their tab open** from sending the sounds until the reveal, because the scene lives on their device until then.

## Files

- `server.js` serves the game page, passes messages between players, and holds sound clips, recordings, sound parts and the video for up to 3 hours. The video and parts stay hidden until the host reveals them, so players can't peek.
- `public/index.html` is the game.
- `package.json` lists the one dependency (`ws`).

## Put it online for free on Render

Set it up the same way as Spin Doodle, as its own service:

1. Create a new GitHub repository (for example `foley-party`) and upload `server.js`, `package.json`, `README.md` and the `public` folder. Drag in the items inside the folder, not the folder itself.
2. On Render choose **New → Web Service** and pick that repository.
3. Use these settings:
   - Region: Singapore, if it's offered
   - Build command: `npm install`
   - Start command: `node server.js`
   - Instance type: Free
4. Open your new address, press **Create a room and host**, and send everyone the invite link.

On the free plan the server sleeps after 15 minutes with nobody connected; the first visit after that takes about a minute to wake it. Files are kept in memory, so a restart clears them. That only matters in the middle of a round.

## Run it on your own computer

```
npm install
node server.js
```

Then open http://localhost:3000. The microphone works on localhost without HTTPS.
