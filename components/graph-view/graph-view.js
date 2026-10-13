// <graph-view> - Obsidian-style graph view. One file, no libraries.
// Physics runs in a Web Worker with the same forces Obsidian ships:
// center .1, link 1, distance 250, repel -1000, velocity *.6, cools down in ~300 ticks at 60/s.
(() => {
  const SIM = `
const DECAY = 1 - Math.pow(0.001, 1 / 300)
let N = [], L = [], alpha = 1, target = 0, timer = null
let F = { center: .1, link: 1, distance: 250, repel: -1000 }
function setGraph(nodes, links) {
  N = nodes.map(n => ({ x: n.x, y: n.y, vx: 0, vy: 0, fx: null, fy: null }))
  const deg = new Array(N.length).fill(0)
  for (const l of links) { deg[l.s]++; deg[l.t]++ }
  L = links.map(l => ({ a: N[l.s], b: N[l.t], bias: deg[l.s] / (deg[l.s] + deg[l.t]), k: 1 / Math.min(deg[l.s], deg[l.t]) }))
  alpha = 1
}
function tick() {
  alpha += (target - alpha) * DECAY
  for (const l of L) {
    const s = l.a, t = l.b
    let x = t.x + t.vx - s.x - s.vx || 1e-6, y = t.y + t.vy - s.y - s.vy || 1e-6
    let d = Math.sqrt(x * x + y * y)
    d = (d - F.distance) / d * alpha * l.k * F.link
    x *= d; y *= d
    t.vx -= x * l.bias; t.vy -= y * l.bias; s.vx += x * (1 - l.bias); s.vy += y * (1 - l.bias)
  }
  charge()
  for (const n of N) {
    n.vx -= n.x * F.center * alpha; n.vy -= n.y * F.center * alpha
    if (n.fx == null) n.x += n.vx *= .6; else { n.x = n.fx; n.vx = 0 }
    if (n.fy == null) n.y += n.vy *= .6; else { n.y = n.fy; n.vy = 0 }
  }
}
const box = (x0, y0, s) => ({ x0, y0, s, kids: null, pts: null, n: 0, cx: 0, cy: 0 })
function insert(q, p) {
  while (q.kids) q = child(q, p)
  if (!q.pts) { q.pts = [p]; return }
  if (q.s < .01) { q.pts.push(p); return }
  const old = q.pts; q.pts = null; q.kids = [null, null, null, null]
  for (const o of old) insert(q, o)
  insert(q, p)
}
function child(q, p) {
  const h = q.s / 2, i = (p.x >= q.x0 + h) | ((p.y >= q.y0 + h) << 1)
  return q.kids[i] ||= box(q.x0 + (i & 1) * h, q.y0 + (i >> 1) * h, h)
}
function sum(q) {
  let n = 0, cx = 0, cy = 0
  if (q.pts) for (const p of q.pts) { n++; cx += p.x; cy += p.y }
  else for (const k of q.kids) if (k) { sum(k); n += k.n; cx += k.cx * k.n; cy += k.cy * k.n }
  q.n = n; q.cx = cx / n; q.cy = cy / n
}
function apply(q, p) {
  if (!q || !q.n) return
  const k = F.repel * alpha
  let x = q.cx - p.x, y = q.cy - p.y, l = x * x + y * y
  if (q.kids) {
    if (q.s * q.s / .81 < l) { if (l < 1) l = Math.sqrt(l); p.vx += x * q.n * k / l; p.vy += y * q.n * k / l }
    else for (const c of q.kids) apply(c, p)
    return
  }
  for (const o of q.pts) {
    if (o === p) continue
    x = o.x - p.x || (Math.random() - .5) * 1e-6; y = o.y - p.y || (Math.random() - .5) * 1e-6
    l = x * x + y * y; if (l < 1) l = Math.sqrt(l)
    p.vx += x * k / l; p.vy += y * k / l
  }
}
function charge() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const n of N) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y) }
  const t = box(x0, y0, Math.max(x1 - x0, y1 - y0) + 1)
  for (const n of N) insert(t, n)
  sum(t)
  for (const n of N) apply(t, n)
}
function loop() {
  timer = null
  if (alpha < .001 && target === 0) return
  tick()
  const buf = new Float32Array(N.length * 2)
  N.forEach((n, i) => { buf[2 * i] = n.x; buf[2 * i + 1] = n.y })
  postMessage(buf, [buf.buffer])
  timer = setTimeout(loop, 1000 / 60)
}
onmessage = ({ data: m }) => {
  if (m.forces) Object.assign(F, m.forces)
  if (m.nodes) setGraph(m.nodes, m.links)
  if (m.pin) { const n = N[m.pin.i]; n.fx = m.pin.x; n.fy = m.pin.y }
  if (m.unpin != null) { const n = N[m.unpin]; n.fx = n.fy = null }
  if (m.target != null) target = m.target
  if (m.alpha != null) alpha = Math.max(alpha, m.alpha)
  if (!timer) timer = setTimeout(loop, 1000 / 60)
}`

  const PALETTE = ['#a78bfa', '#5eead4', '#fbbf24', '#f472b6', '#60a5fa', '#e2e8f0', '#a3e635', '#fb923c']
  const workerURL = URL.createObjectURL(new Blob([SIM], { type: 'text/javascript' }))
  const css = `:host{display:block;position:relative;height:480px;background:var(--graph-bg,#000);border-radius:var(--graph-radius,16px);overflow:hidden;touch-action:none;cursor:grab}
:host(:active){cursor:grabbing}canvas{display:block;width:100%;height:100%}
.tip{position:absolute;pointer-events:none;font:500 13px/1.2 system-ui,sans-serif;color:#fff;background:rgba(20,20,28,.85);padding:5px 9px;border-radius:8px;transform:translate(-50%,-150%);opacity:0;transition:opacity .15s;white-space:nowrap}`

  class GraphView extends HTMLElement {
    constructor() {
      super()
      const r = this.attachShadow({ mode: 'open' })
      r.innerHTML = `<style>${css}</style><canvas part="canvas"></canvas><div class="tip"></div>`
      this.cv = r.querySelector('canvas'); this.tip = r.querySelector('.tip'); this.ctx = this.cv.getContext('2d')
      this.cam = { x: 0, y: 0, z: 1 }; this.auto = true; this.hover = -1; this.drag = null
    }
    connectedCallback() {
      this.worker = new Worker(workerURL)
      this.worker.onmessage = e => { this.pos = e.data; this.dirty = true }
      new ResizeObserver(() => this.resize()).observe(this)
      this.bind()
      if (this.getAttribute('src')) fetch(this.getAttribute('src')).then(r => r.json()).then(d => this.data = d)
      else if (!this._data) this.data = GraphView.demo()
      const frame = () => { if (this.dirty || this.hk > 0 && this.hk < 1) this.draw(); this.raf = requestAnimationFrame(frame) }
      this.raf = requestAnimationFrame(frame)
    }
    disconnectedCallback() { this.worker?.terminate(); cancelAnimationFrame(this.raf) }

    // data: { nodes: [{ id, label?, group? }], links: [{ source, target }] }
    set data(d) {
      this._data = d
      const idx = new Map(d.nodes.map((n, i) => [n.id, i]))
      this.nodes = d.nodes.map(n => ({ ...n, deg: 0 }))
      this.links = d.links.map(l => ({ s: idx.get(l.source), t: idx.get(l.target) })).filter(l => l.s != null && l.t != null && l.s !== l.t)
      for (const l of this.links) { this.nodes[l.s].deg++; this.nodes[l.t].deg++ }
      const groups = [...new Set(this.nodes.map(n => n.group).filter(g => g != null))]
      this.nodes.forEach(n => n.color = n.group == null ? '#8a93a6' : PALETTE[groups.indexOf(n.group) % PALETTE.length])
      // спираль-подсолнух у центра, как d3: граф раскрывается из одной точки
      const start = this.nodes.map((n, i) => { const r = 10 * Math.sqrt(.5 + i), a = i * Math.PI * (3 - Math.sqrt(5)); return { x: r * Math.cos(a), y: r * Math.sin(a) } })
      this.pos = new Float32Array(start.flatMap(p => [p.x, p.y]))
      this.auto = true
      this.worker?.postMessage({ nodes: start, links: this.links })
    }
    get data() { return this._data }

    resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2), b = this.getBoundingClientRect()
      this.w = b.width; this.h = b.height
      this.cv.width = b.width * dpr; this.cv.height = b.height * dpr
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.dirty = true
    }
    toScreen(x, y) { return [this.w / 2 + (x - this.cam.x) * this.cam.z, this.h / 2 + (y - this.cam.y) * this.cam.z] }
    toWorld(x, y) { return [(x - this.w / 2) / this.cam.z + this.cam.x, (y - this.h / 2) / this.cam.z + this.cam.y] }
    radius(n) { return (3 + 2.2 * Math.sqrt(n.deg)) }
    pick(mx, my) {
      const [wx, wy] = this.toWorld(mx, my)
      let best = -1, bd = Infinity
      for (let i = 0; i < this.nodes.length; i++) {
        const dx = this.pos[2 * i] - wx, dy = this.pos[2 * i + 1] - wy, d = dx * dx + dy * dy
        const r = this.radius(this.nodes[i]) + 6 / this.cam.z
        if (d < r * r && d < bd) { bd = d; best = i }
      }
      return best
    }

    bind() {
      const pts = new Map(); let pinch = 0
      const local = e => { const b = this.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top] }
      this.addEventListener('pointerdown', e => {
        this.setPointerCapture(e.pointerId); pts.set(e.pointerId, local(e))
        if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); this.drag = null; return }
        const [mx, my] = local(e), i = this.pick(mx, my)
        this.auto = false
        this.drag = i >= 0 ? { node: i, moved: false } : { pan: [mx, my, this.cam.x, this.cam.y] }
        if (i >= 0) { const [wx, wy] = this.toWorld(mx, my); this.worker.postMessage({ pin: { i, x: wx, y: wy }, target: .3 }) }
      })
      this.addEventListener('pointermove', e => {
        const [mx, my] = local(e)
        if (pts.has(e.pointerId)) pts.set(e.pointerId, [mx, my])
        if (pts.size === 2) {
          const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1])
          if (pinch) this.cam.z = Math.min(4, Math.max(.05, this.cam.z * d / pinch))
          pinch = d; this.dirty = true; return
        }
        if (this.drag?.node != null) {
          const [wx, wy] = this.toWorld(mx, my); this.drag.moved = true
          this.worker.postMessage({ pin: { i: this.drag.node, x: wx, y: wy } })
        } else if (this.drag?.pan) {
          const [sx, sy, cx, cy] = this.drag.pan
          this.cam.x = cx - (mx - sx) / this.cam.z; this.cam.y = cy - (my - sy) / this.cam.z; this.dirty = true
        } else {
          const h = this.pick(mx, my)
          if (h !== this.hover) { this.hover = h; this.dirty = true }
        }
      })
      const up = e => {
        pts.delete(e.pointerId); pinch = 0
        if (this.drag?.node != null) {
          this.worker.postMessage({ unpin: this.drag.node, target: 0 })
          if (!this.drag.moved) this.dispatchEvent(new CustomEvent('nodeclick', { detail: this.nodes[this.drag.node], bubbles: true }))
        }
        this.drag = null
      }
      this.addEventListener('pointerup', up); this.addEventListener('pointercancel', up)
      this.addEventListener('pointerleave', () => { if (!this.drag && this.hover >= 0) { this.hover = -1; this.dirty = true } })
      this.addEventListener('wheel', e => {
        e.preventDefault(); this.auto = false
        const [mx, my] = local(e), [wx, wy] = this.toWorld(mx, my)
        this.cam.z = Math.min(4, Math.max(.05, this.cam.z * Math.exp(-e.deltaY * .0015)))
        this.cam.x = wx - (mx - this.w / 2) / this.cam.z; this.cam.y = wy - (my - this.h / 2) / this.cam.z
        this.dirty = true
      }, { passive: false })
    }

    fit() {
      const p = this.pos, n = p.length / 2
      if (!n) return
      const xs = [], ys = []
      for (let i = 0; i < n; i++) { xs.push(p[2 * i]); ys.push(p[2 * i + 1]) }
      xs.sort((a, b) => a - b); ys.sort((a, b) => a - b)
      const q = a => [a[Math.floor(a.length * .03)], a[Math.ceil(a.length * .97) - 1]]
      const [x0, x1] = q(xs), [y0, y1] = q(ys)
      const z = Math.min(1.4, this.w * .9 / (x1 - x0 + 1), this.h * .9 / (y1 - y0 + 1))
      const dx = (x0 + x1) / 2 - this.cam.x, dy = (y0 + y1) / 2 - this.cam.y, dz = z - this.cam.z
      this.cam.x += dx * .08; this.cam.y += dy * .08; this.cam.z += dz * .08
      return Math.abs(dz) > 1e-4 || Math.abs(dx) * z > .1 || Math.abs(dy) * z > .1
    }

    draw() {
      this.dirty = false
      if (!this.nodes || !this.w) return
      if (this.auto && this.fit()) this.dirty = true
      const { ctx, pos, nodes, links } = this, z = this.cam.z
      const focus = this.drag?.node ?? this.hover
      this.hk = Math.max(0, Math.min(1, (this.hk || 0) + (focus >= 0 ? .15 : -.15)))
      if (focus >= 0) this.focus = focus
      const f = this.focus ?? -1, hk = this.hk
      const near = new Set([f])
      if (f >= 0) for (const l of links) { if (l.s === f) near.add(l.t); if (l.t === f) near.add(l.s) }
      ctx.clearRect(0, 0, this.w, this.h)
      const S = i => this.toScreen(pos[2 * i], pos[2 * i + 1])

      ctx.lineWidth = Math.max(.7, 1.2 * z)
      for (const hot of [false, true]) {
        ctx.beginPath()
        for (const l of links) {
          const on = hk > 0 && (l.s === f || l.t === f)
          if (on !== hot) continue
          const [ax, ay] = S(l.s), [bx, by] = S(l.t); ctx.moveTo(ax, ay); ctx.lineTo(bx, by)
        }
        ctx.strokeStyle = hot ? `rgba(255,255,255,${.6 * hk})` : `rgba(160,170,190,${.28 * (1 - .6 * hk)})`
        ctx.stroke()
      }
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i], [x, y] = S(i)
        if (x < -30 || y < -30 || x > this.w + 30 || y > this.h + 30) continue
        const r = Math.max(2, this.radius(n) * z), dim = hk > 0 && !near.has(i) ? 1 - .7 * hk : 1
        ctx.globalAlpha = .3 * dim
        ctx.fillStyle = n.color; ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, 7); ctx.fill()
        ctx.globalAlpha = dim
        ctx.fillStyle = i === f && hk > 0 ? '#fff' : n.color; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill()
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
      if (f >= 0 && hk > 0) {
        const [x, y] = S(f)
        this.tip.textContent = nodes[f].label ?? nodes[f].id
        this.tip.style.left = x + 'px'; this.tip.style.top = y - Math.max(2, this.radius(nodes[f]) * z) + 'px'
        this.tip.style.opacity = hk
      } else this.tip.style.opacity = 0
    }

    // демо-хранилище: темы-хабы, заметки вокруг, немного перекрёстных ссылок
    static demo(n = 260, topics = 9) {
      let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
      const nodes = [], links = [], members = []
      for (let c = 0; c < topics; c++) {
        nodes.push({ id: 'topic-' + c, label: 'Topic ' + (c + 1), group: c }); members.push(['topic-' + c])
        if (c) links.push({ source: 'topic-' + c, target: 'topic-' + Math.floor(rnd() ** 1.6 * c) })
      }
      for (let i = 0; i < n; i++) {
        const c = Math.floor(rnd() ** 1.25 * topics), id = 'note-' + i, m = members[c]
        nodes.push({ id, label: 'Note ' + (i + 1), group: c })
        links.push({ source: id, target: rnd() < .62 ? m[0] : m[Math.floor(rnd() * m.length)] })
        if (rnd() < .1) links.push({ source: id, target: m[Math.floor(rnd() * m.length)] })
        if (rnd() < .03) { const o = members[Math.floor(rnd() * topics)]; links.push({ source: id, target: o[Math.floor(rnd() * o.length)] }) }
        m.push(id)
      }
      for (let i = 0; i < 12; i++) nodes.push({ id: 'orphan-' + i, label: 'Orphan ' + (i + 1) })
      return { nodes, links }
    }
  }
  customElements.define('graph-view', GraphView)
})()
