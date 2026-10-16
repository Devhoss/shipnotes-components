# Secret Garden

Type on dark glass and a winter garden grows around your words: frozen leaves, red rowan berries, snow settling on the letters, vines that climb in front of and behind them. Space cracks the ice, Backspace melts the last letter, Enter shatters the whole thing. Move your pointer across the lettering and it warms up, then freezes again. Made for [Ship Notes](https://www.instagram.com/shipnotesai/).

## Try it

**[Open the live demo](https://aqualang89.github.io/shipnotes-components/components/secret-garden/demo.html)**. On a phone, tap "Your words" to open the keyboard.

To run it locally:

1. [Download the repository ZIP](https://github.com/aqualang89/shipnotes-components/archive/refs/heads/main.zip) and extract it.
2. Open `components/secret-garden/demo.html` in a browser.
3. Type. Settings (top right) change the ice colour, font, growth speed, density and glow, and "Copy code" gives you the snippet with your settings.

Canvas 2D, no libraries, no build step, no network requests beyond its own files.

## Use it on your site

Keep `type-frost.js`, `type-frost.css` and the `fonts` folder together.

```html
<link rel="stylesheet" href="./type-frost.css">
<div id="frost" style="height:70vh"></div>
<script src="./type-frost.js"></script>
<script>
  const frost = TypeFrost.mount(document.querySelector('#frost'), {
    theme: 'Frozen',
    font: 'playfair',
    seed: 20261014
  });
</script>
```

The host element needs a height; the width can change. Wait for the font before calling methods:

```js
await frost.ready;
frost.type('Hello');
frost.space();
frost.type('winter');
```

## Options

| Option | Default | Values |
| --- | --- | --- |
| `theme` | `Frozen` | `Frozen`, `Aurora`, `Rose quartz`, `Ember ice`, or a `#rrggbb` colour |
| `font` | `playfair` | `playfair`, `cormorant`, `unbounded`, `shoulders` |
| `growth` | `1` | growth speed, `0.5` to `1.6` |
| `density` | `1` | leaf and hoarfrost density, `0.5` to `1.6` |
| `length` | `1` | how far the plants reach, `0.5` to `1.6` |
| `glow` | `0.8` | local glow, `0` to `1.5` |
| `seed` | `20261014` | number or string, same seed = same garden |
| `film` | `false` | larger lettering, no caret, for recording |
| `sample` | `true` | show the frozen sample word on load |
| `text` | unset | start with your own fully grown text |
| `sound` | `false` | see "Sound" below |

Text is limited to 40 characters; it wraps and shrinks to fit. Playfair Display, Cormorant and Unbounded include Cyrillic.

## Controller

| Method | Action |
| --- | --- |
| `type(str)` | append text with growth |
| `space()` | append a space and crack the glass |
| `backspace()` | melt the last letter |
| `shatter()` | break the lettering into shards |
| `setText(str)` | replace the text with a fully grown garden |
| `setTheme(nameOrHex)` | change the ice colour |
| `await setFont(name)` | load and apply a font |
| `configure({growth, density, length, glow, film})` | update options |
| `focus()` | focus the input and open the mobile keyboard |
| `getText()` / `getOptions()` | read the current state |
| `destroy()` | stop everything and release memory |

## Events

```js
document.querySelector('#frost').addEventListener('frost:grow', e => {
  const {time, x, y, char} = e.detail; // hook your own sound or UI here
});
```

`frost:grow` (a letter), `frost:crack` (space), `frost:melt` (backspace), `frost:shatter` (Enter), `frost:breath` (pointer warming, with `strength`). `x` and `y` are in host CSS pixels, so you can put a sound or a light right where the plant grows.

## Sound

The video used recorded wind and frost samples we can't redistribute, so this package ships silent. The component looks for `window.WINTER_AUDIO` (base64 WAV clips keyed by name) and plays them through WebAudio if you provide it; without it, `sound: true` simply stays quiet. The events above are the easier way to add your own sounds.

## Recording a video

- `demo.html?film=1` hides the controls and the caret.
- `Alt+H` toggles that while you type, `H` when you're not in the field.
- `demo.html?film=1&script=demo` plays a 13-second sequence and exposes `window.renderAt(t)` for frame-exact capture.

## Notes

Native textarea for typing, paste and IME. Respects `prefers-reduced-motion` (letters appear grown, no camera movement), no full-screen flashes, 16 px input so Safari doesn't zoom. The drawing surface follows the device pixel ratio, capped at 2. Large pastes build their textures synchronously, so expect a short pause there. Checked in desktop and mobile browser emulation; a real iPhone hasn't been tested yet.

Fonts are under the SIL Open Font License, the notices are in `fonts/`.
