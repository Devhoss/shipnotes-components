# A face for each reply

Serve this folder over HTTP. For example:

```sh
python -m http.server 8022 --bind 127.0.0.1
```

Open `http://127.0.0.1:8022/index.html?mode=dialogue`.
Press **Play a reply**. **Pause voice** keeps the face assembled; **Resume voice** continues the same reply. **Finish reply** releases the face after a short hold. **Interrupt** releases it immediately.

The page renders 180,000 flow particles and 12,000 eye particles using Three.js and WebGL 2. All runtime assets are local. The sample voice is a local Ava recording. No microphone, camera or AI service is connected.

## Connect your application

The page creates `window.faceFlow` after `window.faceReady === true`. Its animation loop already calls `tick()` on each frame. The sample buttons in `dialogue-demo.js` can be removed when your app owns playback.

```js
// Give each reply a unique ID, including after an interruption.
const id = faceFlow.beginResponse('reply-42');

// Option A: supply a normalised voice envelope (0..1), ideally every frame.
faceFlow.setLevel(0.65, id);

// A silent interval changes the mouth, not the response state.
faceFlow.setLevel(0, id);

// Call only when the final audio chunk has finished playing.
faceFlow.endResponse(id);

// Or cancel on a user interruption. Stop your audio queue too.
// faceFlow.cancelResponse(id);
```

Start assembly when a reply is ready to play. To show a fully formed face before its first word, start assembly about 1.25 seconds before playback, as the demo does. You can also let the face assemble during speech.

**Use the playback queue as the end signal.** A network response may finish before its buffered audio. An individual audio chunk may end before the next chunk arrives. Neither event alone means the whole spoken reply has ended. Call `endResponse(id)` once the server has finished producing the reply AND the playback queue is empty.

## Use actual audio

Instead of sending levels yourself, attach a Web Audio node. Connect the node to your audible output separately; the controller adds only an analyser branch.

```js
// Run inside a user gesture if the browser requires it for audio playback.
const context = new AudioContext();
const audio = new Audio('your-reply.mp3');
const source = context.createMediaElementSource(audio);
source.connect(context.destination);
const detach = faceFlow.attachAudioNode(source, { gain: 5 });
await context.resume();

const id = faceFlow.beginResponse('reply-43');
audio.onended = () => faceFlow.endResponse(id);
await audio.play();

// When this audio source is no longer used:
// detach();
```

For streamed speech, attach the analyser to a shared gain/output node used by all chunks. Keep the same reply ID for the entire queue. Do not drive `setLevel` manually at the same time as the analyser. With remote media, configure media CORS before creating the source. Create a media-element source only once per audio element; reuse it for later replies. Your app owns the AudioContext, media elements and output connections.

## Lifecycle

| Call / state | Behaviour |
| --- | --- |
| `beginResponse(id)` | Assemble from the current shape; repeated starts for the active ID are ignored |
| `setLevel(value, id)` | Smooth mouth motion, fast attack and softer release |
| Silence or missing levels | Mouth closes; face stays assembled, with no 12-second limit |
| `endResponse(id)` | Hold 0.65 seconds, then dissolve over 1.15 seconds |
| `cancelResponse(id)` | Begin dissolving immediately |
| New reply during dissolution | Reverse from the current shape without snapping to the initial flow |
| Events for an older ID | Ignored, so a late end event cannot close the new reply |
| `detachAudio()` | Disconnect the analyser branch; leave audible routing intact |
| `destroy()` | Dispose of this controller's analyser and stop its updates |

`FaceFlowController` can also be used independently: pass `onFrame(snapshot)` and call `tick()` from your own animation loop. Constructor options are `assembleSeconds`, `releaseSeconds`, `holdSeconds`, `reducedMotion`, and an optional `clock` in seconds. The snapshot contains `time`, `form`, `level`, `state`, and `responseId`.

This starter owns one full-window canvas. It is not a multi-instance React package. `destroy()` disposes of the controller, not the page's renderer; the starter page's renderer is owned by the page. For an embedded view, a same-origin iframe isolates the canvas and its lifecycle. Connect through the frame's `contentWindow.faceFlow` after it is ready.

## Film and capture

`index.html` plays the separate 12-second film. `?mode=dialogue` uses events. `?capture` freezes automatic updates for deterministic screenshots; omit it in a real integration. `?palette=amber` selects amber.

## Limits and credits

The mouth follows volume, not phonemes. Browser autoplay rules still apply. Mobile screenshots were checked at 390px width; this does not certify frame rate on a physical phone. Reduced-motion mode removes continuous material motion in dialogue mode and snaps assembly transitions.

Keep the head scan attribution and bundled licence files when distributing: Infinite, 3D Head Scan by Lee Perry-Smith, CC BY 3.0, based on www.triplegangers.com. See `CREDITS.md`.
