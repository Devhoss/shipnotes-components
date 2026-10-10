# AI Face Flow

A flowing particle field assembles into a face for a spoken reply. Made with Three.js: 180,000 flow and surface particles, plus 12,000 eye particles.

**[Try it live](https://aqualang89.github.io/shipnotes-components/components/face-flow/?mode=dialogue)**, sound on: tap Play a reply. The data is about 8 MB, give it a few seconds on mobile.

## Try it locally

```sh
python -m http.server 8022 --bind 127.0.0.1
```

Open `http://127.0.0.1:8022/index.html?mode=dialogue` for the dialogue demo, or `http://127.0.0.1:8022/index.html` for the 12-second film.

**Play a reply** plays a local Ava recording. Pause it to see the mouth stop while the face stays assembled. Resume it to continue. At the end of the reply, the face dissolves. **Interrupt** cancels the response. All runtime files are local, with no build step or CDN dependencies.

## Connect an AI voice

Use `beginResponse(id)`, `setLevel(0..1, id)`, and `endResponse(id)`. Or attach a Web Audio node for live amplitude analysis. Call the end method when the entire audio queue has finished playing, including the final chunk.

[API.md](API.md) covers streamed audio, interruption, stale events, audio ownership and embedding. This is a single-canvas starter; the AI service and its playback queue belong to your application.

Free from Ship Notes · @shipnotesai

The mouth follows amplitude, not individual phonemes. The built-in sample is Ava, "Now... I can see you." No microphone or camera input is used.

## Controls and requirements

- WebGL 2 and a local HTTP server; direct `file://` access cannot fetch the scene assets.
- `?palette=amber` selects amber; ice is the default.
- `?capture` freezes automatic updates for deterministic frame capture.
- Dialogue mode respects reduced motion by freezing material travel and snapping assembly transitions.
- The browser may require a click to allow audio.
- Layout was checked at 390px width. Physical-phone frame rate has not been certified.

## Source

`scene.js` renders both modes. `dialogue-controller.js` owns reply states; `dialogue-demo.js` shows one audio integration. `vendor/` and `assets/` contain local dependencies and attributed assets. Particle and path buffers use Float16 storage and total 7.87 MB. Path row indices stay Float32 to preserve sampling accuracy.

## Credits

Infinite, 3D Head Scan by Lee Perry-Smith, CC BY 3.0, based on www.triplegangers.com. Changes include surface sampling, flow paths, procedural eyes, mouth and jaw deformation, lighting and animation. Preserve the attribution and bundled licences when sharing. See [CREDITS.md](CREDITS.md).
