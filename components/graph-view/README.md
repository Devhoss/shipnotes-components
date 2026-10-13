# Graph View

An Obsidian-style graph of linked notes for your own site. Notes bloom out of one point, settle into clusters, and you can drag any note and watch the whole web follow. Built with Claude Code for [Ship Notes](https://www.instagram.com/shipnotesai/).

The physics uses the same numbers Obsidian ships in its graph engine: center force 0.1, link strength 1, link distance 250, repulsion -1000, velocity decay 0.6, and a cooldown of about 300 ticks at 60 per second. Like Obsidian, it runs in a Web Worker, so the page never freezes while the graph moves. The code is written from scratch, no Obsidian source.

## Try it

**[Open the live demo](https://aqualang89.github.io/shipnotes-components/components/graph-view/demo.html)**. Works on phones too.

To run it locally:

1. [Download the repository ZIP](https://github.com/aqualang89/shipnotes-components/archive/refs/heads/main.zip) and extract it.
2. Open `components/graph-view/demo.html` in a browser.
3. Drag a note. Scroll or pinch to zoom. Drag empty space to pan. Hover a note to light up its links.

No libraries, no build step. One file: `graph-view.js`.

## Use it on your site

```html
<script src="graph-view.js" defer></script>
<graph-view style="height: 520px"></graph-view>
```

With no data it shows a demo vault. Give it your own notes in one of two ways.

From a JSON file:

```html
<graph-view src="notes.json"></graph-view>
```

From JavaScript:

```js
document.querySelector('graph-view').data = {
  nodes: [
    { id: 'ideas', label: 'Ideas', group: 'writing' },
    { id: 'draft', label: 'Draft post', group: 'writing' },
    { id: 'repo', label: 'Side project', group: 'code' }
  ],
  links: [
    { source: 'draft', target: 'ideas' },
    { source: 'repo', target: 'ideas' }
  ]
}
```

- `id` is required and must be unique. `label` is what the tooltip shows (falls back to `id`).
- `group` colors the note, like color groups in Obsidian. Notes without a group are grey.
- Links point at node ids. Unknown ids and self-links are skipped.

Click a note without dragging and the element fires `nodeclick` with that node:

```js
document.querySelector('graph-view').addEventListener('nodeclick', e => {
  location.href = '/notes/' + e.detail.id
})
```

## Style it

```css
graph-view {
  height: 520px;          /* give it a height */
  --graph-bg: #0b0b12;    /* background */
  --graph-radius: 20px;   /* corner radius */
}
```

Node size grows with the number of links, like in Obsidian. A few thousand notes stay smooth on a laptop.

## License

MIT. Use it in anything, credit appreciated.
