# Glyph Void

An empty word inside a field of moving type. Drag across the marks and they bend around your cursor, leave a short wake, then settle back. Type a new word and the opening changes shape.

**[Try it live](https://aqualang89.github.io/shipnotes-components/components/glyph-void/demo.html)**. No build step or runtime dependencies.

## Try it locally

Open `demo.html` in a browser. Move a mouse or finger through the field and type in the box at the bottom. Short words such as `YOU` or `404` have the clearest outline.

## Add it to a page

Copy `glyph-void.js`, `glyph-void.css`, and `fonts/` together. Then add:

```html
<link rel="stylesheet" href="glyph-void.css">
<style>glyph-void { display: block; height: min(72vh, 720px); }</style>
<glyph-void text="YOU" density="0.8" color="#d5dfdd" accent="#8bcfc7"></glyph-void>
<script src="glyph-void.js" defer></script>
```

Set the `text` attribute or call `element.setText('404')` to change the word. `density` defaults to `1`; try `0.6` on a slower device. `color` and `accent` set the mark colors. The component also exposes `renderAt(seconds, pointer)` for full-quality frame capture. Pass `{x, y, at, power, vx, vy}` in component pixels for a repeatable frame; `vx` and `vy` are optional.

The field adapts to its size and draw cost, pauses when off screen or when the tab is hidden, and responds to changes in `prefers-reduced-motion`. It labels the word for assistive technology. It supports uppercase Latin letters and digits; two to six characters read best. Arbitrary shapes and multiline text are outside this version.

Canvas 2D draws the marks on the CPU. In a local headless Edge check, v2 full-quality `renderAt` had a median cost of 11.6 ms with about 6,400 marks at 390 x 844. Live playback can reduce background density when drawing takes longer. This is a local measurement, not a device frame-rate guarantee.

The code is covered by the repository's [MIT license](../../LICENSE). Bundled Onest, Big Shoulders Display, and IBM Plex Mono fonts keep their SIL OFL 1.1 notices in `fonts/`.
