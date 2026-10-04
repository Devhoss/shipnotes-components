# FOLD

A folded metal material for six AI interface states. Made in code by Ship Notes.

Open `index.html` in a WebGL2 browser. All dependencies, fonts, and music are local; no build step or API key. A static HTTP server also works:

```sh
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Controls

Choose a state, play the 18.75-second reel, or replay it. Music is off until you enable it. Keys `1` through `6` select states; `Space` toggles playback. Reduced-motion preferences show a still until you choose to play.

The search request and place result are fictional demonstration content. This page does not access a model, microphone, maps, or your location.

## Use in an interface

The page exposes a small state API after `window.filmReady` becomes true:

```js
fold.setState('listening');
fold.setState('thinking');
fold.setState('searching');
fold.setState('tool-call');
fold.setState('answer');
fold.setState('idle');

fold.pause();
fold.play();
```

`fold.renderAt(seconds)` renders a deterministic frame of the reel. For frame capture, use `?record=1`; add `&format=x` for the independently arranged 4:5 version. Recording mode hides controls and stops the live animation loop. Design canvases are 1080x1920 and 1080x1350. `fold.stats()` returns the drawing resolution and scene counts.

Animation, layout, geometry, studio lighting, and shaders live in `index.html`. Six parametric surfaces share one mesh topology; the search state adds 32,768 seeded points. The material uses analytic studio reflections, not a photographic environment map or a physical simulation.

## Music

`score.m4a` is the original 128 BPM procedural score. Ten bars, 18.75 seconds. The intended master is -14 LUFS, with a 100 ms silent anticipation before the drop.

To synthesize it again, install Python, NumPy, SciPy, and FFmpeg, then run:

```sh
pip install numpy scipy
python compose.py --output ./music-output
```

`--ffmpeg` can point to your FFmpeg executable. `beat-map.json` gives the beat grid and score sections. No recordings or third-party music samples are used.

## License

Original page code and procedural music: MIT, see `LICENSE`.

Bundled dependencies retain their licenses:

- Three.js r180: MIT, see `THREE-LICENSE.txt`.
- IBM Plex Sans and IBM Plex Sans Condensed: SIL Open Font License, see `OFL-Plex.txt` and `OFL-PlexCondensed.txt`.

WebGL2 is required. Drawing resolution scales with the browser viewport to keep the interactive preview manageable. Device-specific frame rates are not guaranteed.
