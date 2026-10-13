# CONTACT

Four controls that respond while your finger is still down. The switch and segmented choice travel on springs. The checkbox gives under pressure. The range slider follows your hand directly.

Open [demo.html](demo.html) to try them. It works as a local file; there is no build step.

## Files

- `contact.css` and `contact.js` are the controls. Copy these two files into your project.
- `demo.html`, `demo.css`, and `demo.js` are the showcase with the output monitor and preset buttons.
- `fonts/` is used by the showcase only. The control CSS uses system fonts.

## Put a control on your page

Load the CSS, add the markup, then mount the script on a parent element:

```html
<link rel="stylesheet" href="contact.css">

<div id="my-controls" data-ct-profile="cushioned" style="--ct-accent: #ff6a3c">
  <label class="ct-switch" data-contact-switch>
    <input id="notifications" type="checkbox" role="switch" aria-label="Notifications" checked>
    <span class="ct-switch__track" aria-hidden="true">
      <span class="ct-switch__thumb"></span>
    </span>
  </label>
</div>

<script src="contact.js"></script>
<script>
  const controls = ContactControls.mount(document.getElementById('my-controls'));
  document.getElementById('notifications').addEventListener('change', event => {
    console.log('Notifications:', event.target.checked);
  });
</script>
```

The inputs keep their normal `input` and `change` events. If you change a value in code without dispatching an event, call `controls.refresh()` to update the visuals. Calling `ContactControls.mount(root)` again returns the same controller until you call `destroy()`.

## Themes

Four color themes are built in: orange (the default), `ice`, `lime` and `violet`. Each one sets the fill, the thumb, the check mark and the selected label together. Put the attribute on the same element as `data-ct-profile`:

```html
<div id="my-controls" data-ct-profile="cushioned" data-ct-theme="lime">
```

Or switch it live:

```js
controls.setTheme('violet')   // 'ice', 'lime', 'violet', or null for orange
controls.getTheme()           // 'violet'
```

Want your own color? Set `--ct-accent` and, if the thumb needs it, `--ct-thumb-bg`, `--ct-thumb-dot`, `--ct-mark` and `--ct-on-text`.

## The other three

Put any of these inside the same mounted parent. Give each radio group its own `name`.

```html
<!-- Checkbox: independent selection -->
<label class="ct-check" data-contact-check>
  <input type="checkbox" aria-label="Show trace">
  <span class="ct-check__box" aria-hidden="true">
    <svg class="ct-check__mark" viewBox="0 0 28 28">
      <path d="M5.5 14.5 11.6 20l11-12.2"/>
    </svg>
  </span>
</label>

<!-- Segmented choice: one of three -->
<fieldset class="ct-segment" data-contact-segment>
  <legend>Pattern</legend>
  <div class="ct-segment__track">
    <span class="ct-segment__plate" aria-hidden="true"></span>
    <label><input type="radio" name="pattern" value="orbit" checked><span>Orbit</span></label>
    <label><input type="radio" name="pattern" value="pulse"><span>Pulse</span></label>
    <label><input type="radio" name="pattern" value="sweep"><span>Sweep</span></label>
  </div>
</fieldset>

<!-- Range: continuous value -->
<div class="ct-range" data-contact-range>
  <input id="output" type="range" min="0" max="100" value="68" aria-label="Output level">
  <output for="output">68</output>
</div>
```

The range reads its `min`, `max`, and current value. The segmented control sizes its plate to the number of radio buttons in the group. Use any number of equal-width options that fits your layout, and give each group a distinct `name`.

## Change the feel

```js
controls.setProfile('precise');   // quick, little overshoot
controls.setProfile('cushioned'); // slower, heavy landing
controls.setProfile('springy');   // bounces once, then settles

document.getElementById('my-controls').style.setProperty('--ct-accent', '#88b7d5');
```

Call `controls.destroy()` if your app removes the mounted UI. `ContactControls.mount()` defaults to the whole page; you can pass an element or `document`. The controls use native form inputs, visible keyboard focus, form reset, disabled states, and `prefers-reduced-motion`. The range slider tracks the pointer immediately; the spring profiles affect the switch and segmented choice. Tested in headless Edge at 1440px, 390px, and 320px. Other browsers and physical phones still need a pass.

The original code is MIT licensed. The two bundled demo fonts retain their SIL OFL notices in `fonts/`.
