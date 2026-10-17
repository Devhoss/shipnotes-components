# Iris

A living light orb for a voice assistant. Thin membranes and 960 separate light fibres around a dark pupil. It rests, turns toward you when it listens, sends light through its fibres when it thinks, and pulses with the actual loudness of the voice when it speaks. Two palettes: Blue hour and Afterglow. Made for [Ship Notes](https://www.instagram.com/shipnotesai/).

## Try it

**[Open the live demo](https://aqualang89.github.io/shipnotes-components/components/iris/demo.html)**. Turn the sound on, then try Listen, Think and Speak. "Use microphone" makes it listen to you (the audio stays in your browser, nothing is recorded or sent). Press H to hide the controls.

To run it locally:

1. [Download the repository ZIP](https://github.com/aqualang89/shipnotes-components/archive/refs/heads/main.zip) and extract it.
2. Open `components/iris/demo.html` in Chrome, Edge or Safari.
3. If the browser blocks the microphone for a local file, run `python -m http.server 8091` in this folder and open `http://localhost:8091/demo.html`.

Three.js r180 and WebGL 2, own shaders, no textures, no network requests beyond its own files.

## Use it in your app

```html
<div id="stage" style="height:70vh"></div>
<script src="./vendor/three-r180.js"></script>
<script src="./vendor/motion.js"></script>
<script src="./iris.js"></script>
<script>
  const orb = new IrisOrb(document.querySelector('#stage'));
  orb.setState('listening');   // 'idle' | 'listening' | 'thinking' | 'speaking'
  orb.setLevel(0.4);           // loudness 0..1 from your own audio
  orb.setState('thinking');
  orb.beginAnswer();           // start of the assistant's reply
  orb.setLevel(0);             // a pause inside the reply keeps it speaking
  orb.endAnswer();             // back to idle
  orb.setPalette(true);        // Afterglow; false = Blue hour
  // when removing the widget:
  orb.dispose();
</script>
```

The container needs a width and a height. Feed `setLevel` with the real level of the reply audio for the whole answer (an `AnalyserNode` on your TTS stream is enough); `setLevel(null)` brings back the built-in demo envelope.

## Sound

The demo ships with its own sound, Air + glass: a quiet air bed and short glass responses for every state, three variations each. Load `assets/air-glass-data.js` and `sound.js`, then:

```js
const sound = new IrisSound(orb);
button.onclick = () => sound.toggle();   // browsers need a click before audio
sound.setAmbience(80);                   // 0..100, 0 turns the bed off
sound.setResponses(100);
```

State changes and palette switches play their own responses automatically. The bed ducks by 12 dB while it speaks. Call `sound.dispose()` before `orb.dispose()`.

## Notes

- Pixel ratio is capped at 1.5, the glow is blurred at a third of the resolution, a hidden tab stops rendering. Around 60 fps on an integrated Intel Iris Xe.
- `prefers-reduced-motion` freezes the flow, states still change.
- `renderAt(time, state)` sets an exact frame for screenshots or video; `resume()` goes back to live.

MIT, like the rest of the repository. Three.js is MIT.
