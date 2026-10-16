/* Type Frost 1.8. Layered botanical growth. */
(()=>{let Motion,FrostMaterial,FrostAudio;
/* craft motion engine. Everything is a pure function of time: renderAt(t) stays seekable,
   frames come out identical on every render. Copy this file next to the scene and load it with
   <script src="motion.js"></script>; it sets Motion.
   Born on FLY v2 (05.10.2026), Max: "на ИИ не похоже абсолютли". Recipes: kit/engine.md */
(() => {
  const TAU = Math.PI * 2
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x))
  const mix = (a, b, p) => a + (b - a) * p
  const smooth = x => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10) }
  const gate = (t, a, b) => smooth((t - a) / (b - a))
  const outCubic = x => 1 - Math.pow(1 - clamp(x), 3)

  // landing with overshoot: 0 at tau=0, crosses 1 at ~period/4, ~7% over, settled by ~period
  const spring = (tau, decay = .11, period = .6) => tau <= 0 ? 0 : 1 - Math.exp(-tau / decay) * Math.cos(TAU * tau / period)
  // squash/stretch after an impact: 1 -> squash -> small stretch -> rest. multiply heights by (1 - k*s)
  const impact = (tau, decay = .07, period = .26) => tau <= 0 ? 0 : Math.exp(-tau / decay) * Math.cos(TAU * tau / period)
  // start time of the i-th element, a fixed gap reads as a cascade, not a crowd
  const stagger = (i, start, step = .055) => start + i * step
  // light event: jumps to 1 at te, decays exponentially
  const flash = (t, te, len = .28) => t >= te ? Math.exp(-(t - te) / len) : 0
  // pulse on every beat of a grid, for glow riding the music
  const beatPulse = (t, beat, offset = 0, len = .16) => { const p = ((t - offset) % beat + beat) % beat; return Math.exp(-p / len) }

  const centroid = p => { let x = 0, y = 0; for (const q of p) { x += q[0]; y += q[1] } return [x / p.length, y / p.length] }
  const area = p => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1] }, 0)) / 2
  // numeric velocity of any position function pos(t) -> [x, y]
  const velocity = (pos, t, h = 1 / 240) => { const a = pos(t - h), b = pos(t + h); return [(b[0] - a[0]) / (2 * h), (b[1] - a[1]) / (2 * h)] }
  // how stretched a shape should be at speed v (px/s); 1 = at rest
  const smearK = (v, from = 700, span = 3600, max = .85) => 1 + clamp((Math.hypot(v[0], v[1]) - from) / span, 0, max)

  // stretch a local outline (around 0,0) along v, area kept
  function smear(pts, v, k) {
    if (k <= 1.001) return pts
    const sp = Math.hypot(v[0], v[1]), ux = v[0] / sp, uy = v[1] / sp, kp = 1 / Math.sqrt(k)
    return pts.map(q => { const a = (q[0] * ux + q[1] * uy) * k, b = (-q[0] * uy + q[1] * ux) * kp; return [a * ux - b * uy, a * uy + b * ux] })
  }
  // fast flight: the stroke melts into a drop of the same area, long axis along v. amount 0..1
  function blob(pts, v, k, amount) {
    if (amount <= .001) return pts
    const A = area(pts), sp = Math.hypot(v[0], v[1]) || 1, ux = v[0] / sp, uy = v[1] / sp
    const ratio = Math.max(1, k * k), b = Math.sqrt(A / (Math.PI * ratio)), a = b * ratio
    return pts.map(q => {
      const r = Math.hypot(q[0], q[1]) || 1e-6, cx = q[0] / r, cy = q[1] / r
      const ca = cx * ux + cy * uy, sa = -cx * uy + cy * ux
      // teardrop: fuller at the head, thinner tail
      const R = a * b / Math.sqrt((b * ca) ** 2 + (a * sa) ** 2) * (1 + .18 * ca)
      return [mix(q[0], cx * R, amount), mix(q[1], cy * R, amount)]
    })
  }

  // asymmetric wingbeat / any flap: slow up, snap down past rest, settle.
  // f: 0 rest .. amp folded (negative = past rest), bob: body jolt (px), hit: decaying impulse after each snap
  function wingbeat(t, hits, o = {}) {
    const { up = .19, down = .09, settle = .14, amp = .82, over = -.07, jolt = 24, sink = 7 } = o
    let f = 0, bob = 0, hit = 0
    for (const T of hits) {
      const a = T - .03 - up, b = T - .03, c = b + down, e = c + settle
      if (t > a && t <= b) { f = amp * smooth((t - a) / up); bob += sink * smooth((t - a) / up) }
      else if (t > b && t <= c) f = mix(amp, over, smooth((t - b) / down))
      else if (t > c && t < e) f = over * (1 - smooth((t - c) / settle))
      if (t > b) { const k = t - b; bob += -jolt * Math.exp(-k / .13) * Math.sin(Math.min(k / .06, 1) * Math.PI / 2); hit += Math.exp(-k / .18) }
    }
    return { f, bob, hit }
  }

  // --- fitted to pronin.media (06.10), every curve matches the reference within 1-3 px ---
  const sineInOut = x => .5 - .5 * Math.cos(Math.PI * clamp(x))
  // overshoot once and come back with no wobble (unlike spring). s=2.4 gives ~8.6% over
  const backOut = (x, s = 2.4) => { x = clamp(x) - 1; return 1 + (s + 1) * x * x * x + s * x * x }
  // icon pop: scale s0 -> peak ~1.086 at ~.24s -> 1 at dur. content inside fades in ~.23s later
  const popIn = (tau, dur = .525, s0 = .45, s = 2.4) => tau <= 0 ? 0 : mix(s0, 1, backOut(tau / dur, s))
  // a line pushed by a newcomer: slow lead-in (amt of the way, sine.out), then the rest fast (cubic.out)
  const push = (tau, pre = .28, amt = .33, dur = .25) => tau <= 0 ? 0
    : tau < pre ? amt * Math.sin(Math.PI / 2 * tau / pre) : mix(amt, 1, outCubic((tau - pre) / dur))
  // text selection: handle pops in one frame, fill grows from the left edge. returns 0..1 of width
  const sweep = (tau, dur = .39) => sineInOut(tau / dur)
  // word in: blur and opacity in ~.1s. returns {o, blur(px)}
  const blurIn = (tau, dur = .1, from = 8) => { const p = outCubic(tau / dur); return { o: p, blur: from * (1 - p) } }

  // --- fitted to bentomotion (06.10), ring -> heart ---
  const quadIn = x => clamp(x) ** 2
  const cubicIn = x => clamp(x) ** 3
  const expoOut = x => { x = clamp(x); return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x) }
  // trim path: show the part [a, b] (0..1) of an SVG path of length L. apply to stroke-dasharray/offset
  const dash = (L, a, b) => ({ array: `${Math.max(0, b - a) * L} ${L * 2}`, offset: -a * L })
  // relay: one stroke never disappears. the old shape shrinks accelerating (quad.in), at its shortest
  // the new shape takes over and writes itself decelerating (expo.out). returns {old, neu} lengths 0..1
  const relay = (tau, inDur = 1.12, outDur = 1.86) => tau < inDur
    ? { old: 1 - quadIn(tau / inDur), neu: 0 } : { old: 0, neu: expoOut((tau - inDur) / outDur) }
  // hit: fast rise to 1+amp, then smooth exponential settle, no wobble. 1 at rest
  const hitPop = (tau, amp = .19, rise = .12, decay = .21) => tau <= 0 ? 1
    : tau < rise ? 1 + amp * outCubic(tau / rise) : 1 + amp * Math.exp(-(tau - rise) / decay)
  // heartbeat: a hitPop every period from t0
  const heartbeat = (t, t0, period = .9, amp = .15) => t < t0 ? 1 : hitPop((t - t0) % period, amp)

  // --- fitted to the Gemini promo (06.10) ---
  // U-speed pan inside one shot: leaves the previous cut fast and brakes (k1), cruises, accelerates into
  // the next cut (k2). speeds in px/s, T = shot length (s). returns displacement in px. no zoom, no roll
  const uPan = (t, T, v0, vm, v1, k1 = .12, k2 = .1) => vm * t + (v0 - vm) * k1 * (1 - Math.exp(-t / k1))
    + (v1 - vm) * k2 * (Math.exp((t - T) / k2) - Math.exp(-T / k2))

  // keyframes measured off a reference: [[t, v], ...] sorted by t. smooth monotone cubic between keys
  // (Fritsch-Carlson), no overshoot between points. use when no named curve fits the measurement
  function keys(t, k) {
    const n = k.length
    if (t <= k[0][0]) return k[0][1]
    if (t >= k[n - 1][0]) return k[n - 1][1]
    const d = [], m = []
    for (let i = 0; i < n - 1; i++) d.push((k[i + 1][1] - k[i][1]) / (k[i + 1][0] - k[i][0]))
    m.push(d[0]); for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2); m.push(d[n - 2])
    for (let i = 0; i < n - 1; i++) if (d[i] === 0) { m[i] = m[i + 1] = 0 } else {
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b
      if (s > 9) { const q = 3 / Math.sqrt(s); m[i] = q * a * d[i]; m[i + 1] = q * b * d[i] }
    }
    let i = 0; while (t > k[i + 1][0]) i++
    const h = k[i + 1][0] - k[i][0], u = (t - k[i][0]) / h, u2 = u * u, u3 = u2 * u
    return (2 * u3 - 3 * u2 + 1) * k[i][1] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * k[i + 1][1] + (u3 - u2) * h * m[i + 1]
  }

  // --- fitted to the Gemini promo (06.10), white frames cut the shot into windows ---
  // cubic-bezier ease like CSS / the AE speed graph: returns p -> value. y1/y2 may leave 0..1 (overshoot)
  function bezier(x1, y1, x2, y2) {
    const cx = u => 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u
    const cy = u => 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u
    return p => {
      p = clamp(p); let lo = 0, hi = 1
      for (let i = 0; i < 30; i++) { const u = (lo + hi) / 2; if (cx(u) < p) lo = u; else hi = u }
      return cy((lo + hi) / 2)
    }
  }
  // a value from v0 to v1 between t0 and t1 along an ease. tw = {v0, v1, t0, t1, bz:[x1,y1,x2,y2]} from a fit
  const tween = (t, tw) => { const e = tw.ease || (tw.ease = bezier(...tw.bz)); return mix(tw.v0, tw.v1, e((t - tw.t0) / (tw.t1 - tw.t0))) }
  // leaving the shot with a run-up: 0 before t0, dist covered at t0+dur, power p (4-6 = sits still, then gone)
  const exitIn = (t, ex) => t <= ex.t0 ? 0 : ex.dist * Math.pow((t - ex.t0) / ex.dur, ex.p)
  // camera zoom about a fixed point of the shot (an AE layer scaled around its anchor, not its centre)
  const zoomAbout = (P, s, x, y) => [P[0] + s * (x - P[0]), P[1] + s * (y - P[1])]
  // frame split: a vertical white bar at vx and a horizontal one at hy (from the vertical bar to the right
  // edge) cut a W x H shot into three windows. th = bar thickness. returns window rects and bar rects
  function frameSplit(W, H, vx, hy, th = 17) {
    const h = th / 2, xr = Math.max(0, vx + h)
    return {
      left: { x: 0, y: 0, w: Math.max(0, vx - h), h: H },
      top: { x: xr, y: 0, w: W - xr, h: Math.max(0, hy - h) },
      bottom: { x: xr, y: hy + h, w: W - xr, h: Math.max(0, H - hy - h) },
      vbar: { x: vx - h, y: 0, w: th, h: H },
      hbar: { x: xr, y: hy - h, w: W - xr, h: th }
    }
  }
  // motion blur like AE (shutter 180 = .5): gaussian sigma in px for a speed in px/frame
  const motionBlur = (vPerFrame, shutter = .5) => Math.abs(vPerFrame) * shutter / Math.sqrt(12)


  // --- Gemini promo, начало (06.10): текст на живом фоне и интерфейс, который строится на глазах ---
  // линейно между ключами [[t, v], ...]: ступеньки (слово стёрто за кадр), где кубик keys дал бы перелёт
  function lin(t, k) {
    if (t <= k[0][0]) return k[0][1]
    for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * (t - k[i - 1][0]) / (k[i][0] - k[i - 1][0])
    return k[k.length - 1][1]
  }
  // печать: n букв напечатано (дробное), k-я буква (с 0) проступает за ramp; свежая буква светится голубым и остывает за tau (кадры)
  const typed = (n, k, ramp = 1) => clamp((n - k) / ramp + 1)
  const glowDecay = (age, tau = 4.2) => age <= 0 ? 1 : Math.exp(-age / tau)
  // чип прыгает сверху: сдвиг dist гаснет по экспоненте tau (кадры), из размытия и прозрачности. f, ts в кадрах
  const chipPop = (f, ts, tau = 4.5, dist = 30) => { const a = f - ts; return { on: a > -.5, dy: -dist * Math.exp(-Math.max(0, a) / tau), o: clamp((a + .5) / 3.5), blur: 5 * clamp(1 - a / 6) } }
  // живой фон: сумма гауссовых пятен [cx, cy, sx, sy, r, g, b] на тёмной основе, рисуется в канвас малого размера
  // (браузер растягивает с интерполяцией). blobs берутся по кадру из подгонки (etudes/gemini-text/zamer/bgfit.py)
  function paintBlobs(canvas, blobs, base = [6.5, 4.5, 9.5], vw = 720, vh = 405) {
    const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height
    const img = canvas._img || (canvas._img = ctx.createImageData(W, H)), d = img.data
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = (i + .5) * vw / W, y = (j + .5) * vh / H; let r = base[0], g = base[1], b = base[2]
      for (const p of blobs) {
        const dx = (x - p[0]) / Math.max(Math.abs(p[2]), 8), dy = (y - p[1]) / Math.max(Math.abs(p[3]), 8), w = Math.exp(-.5 * (dx * dx + dy * dy))
        r += w * p[4]; g += w * p[5]; b += w * p[6]
      }
      const o = (j * W + i) * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }
  // SVG-фильтр «срезы»: горизонтальные полосы со сдвигом и смаз по x. рывок камеры, стирание слова. set(amount 0..1, seed)
  function sliceFilter(defs, id, ns = 'http://www.w3.org/2000/svg') {
    const f = document.createElementNS(ns, 'filter')
    for (const [k, v] of Object.entries({ id, x: '-30%', y: '-40%', width: '160%', height: '180%', 'color-interpolation-filters': 'sRGB' })) f.setAttribute(k, v)
    const mk = (tag, attrs) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); f.appendChild(e); return e }
    const noise = mk('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.004 0.3', numOctaves: 1, seed: 1, result: 'n' })
    const disp = mk('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: 0, xChannelSelector: 'R', yChannelSelector: 'G', result: 'd' })
    const blur = mk('feGaussianBlur', { in: 'd', stdDeviation: '0 0' })
    defs.appendChild(f)
    return { id, set(a, seed = 1) { noise.setAttribute('seed', seed); disp.setAttribute('scale', 34 * a); blur.setAttribute('stdDeviation', `${2.2 * a} 0`) } }
  }
  // SVG-фильтр «плавление»: шум сдвигает буквы, размытие и порог по альфе дробят их на искры; m 1 -> 0 собирает чистый текст
  function meltFilter(defs, id, ns = 'http://www.w3.org/2000/svg') {
    const f = document.createElementNS(ns, 'filter')
    for (const [k, v] of Object.entries({ id, x: '-10%', y: '-80%', width: '120%', height: '260%', 'color-interpolation-filters': 'sRGB' })) f.setAttribute(k, v)
    const mk = (tag, attrs, par = f) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); par.appendChild(e); return e }
    mk('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.1 0.13', numOctaves: 2, seed: 7, result: 'n' })
    const disp = mk('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: 0, xChannelSelector: 'R', yChannelSelector: 'G', result: 'd' })
    const blur = mk('feGaussianBlur', { in: 'd', stdDeviation: 0, result: 'b' })
    const ct = mk('feComponentTransfer', { in: 'b' }), fa = mk('feFuncA', { type: 'linear', slope: 1, intercept: 0 }, ct)
    defs.appendChild(f)
    return { id, set(m) { disp.setAttribute('scale', 22 * m); blur.setAttribute('stdDeviation', .9 * m); fa.setAttribute('slope', 1 + 5 * m); fa.setAttribute('intercept', -4 * m) } }
  }
  // --- fitted to the Gemini promo (06.10, cloud), blurred gradients that no analytic model holds ---
  // measured colour field: G = {first, cols, rows, cell, frames:[[r,g,b,...] per frame]} (cell-median colours of the
  // reference, star/text/frames cut out). Draws frame f (fractional = linear mix of the neighbours) into ctx as a
  // W x H bicubic (Catmull-Rom) surface. For a 1:1 copy of an AE gradient/blur background: no curve to fit, no seams
  function fieldDraw(ctx, G, f, W = 720, H = 405) {
    const n = G.frames.length, fi = clamp(f - G.first, 0, n - 1), i0 = Math.floor(fi), i1 = Math.min(n - 1, i0 + 1), a = fi - i0
    const { cols, rows, cell } = G
    const wts = (size, count) => { // per output pixel: 4 clamped taps + Catmull-Rom weights
      const idx = new Int16Array(size * 4), w = new Float32Array(size * 4)
      for (let x = 0; x < size; x++) {
        const u = (x + .5) / cell - .5, b = Math.floor(u), t = u - b
        const k = [(-t * t * t + 2 * t * t - t) / 2, (3 * t * t * t - 5 * t * t + 2) / 2, (-3 * t * t * t + 4 * t * t + t) / 2, (t * t * t - t * t) / 2]
        for (let j = 0; j < 4; j++) { idx[x * 4 + j] = Math.max(0, Math.min(count - 1, b - 1 + j)); w[x * 4 + j] = k[j] }
      }
      return { idx, w }
    }
    const c = G._c && G._c.W === W && G._c.H === H ? G._c : (G._c = { W, H, X: wts(W, cols), Y: wts(H, rows), tmp: new Float32Array(rows * W * 3), img: ctx.createImageData(W, H) })
    const A = G.frames[i0], B = G.frames[i1], { X, Y, tmp, img } = c
    for (let r = 0; r < rows; r++) for (let x = 0; x < W; x++) for (let ch = 0; ch < 3; ch++) {
      let v = 0
      for (let j = 0; j < 4; j++) { const o = (r * cols + X.idx[x * 4 + j]) * 3 + ch; v += X.w[x * 4 + j] * (A[o] * (1 - a) + B[o] * a) }
      tmp[(r * W + x) * 3 + ch] = v
    }
    const d = img.data
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let ch = 0; ch < 3; ch++) {
      let v = 0
      for (let j = 0; j < 4; j++) v += Y.w[y * 4 + j] * tmp[(Y.idx[y * 4 + j] * W + x) * 3 + ch]
      d[(y * W + x) * 4 + ch] = v < 0 ? 0 : v > 255 ? 255 : v + .5
    }
    for (let i = 3; i < d.length; i += 4) d[i] = 255
    ctx.putImageData(img, 0, 0)
  }

  // --- fitted to the Gemini promo hub (06.10, cloud) ---
  // line that draws itself from both ends toward the middle (hub connectors): p 0..0.5 is the drawn share from each
  // end, L the path length. returns the stroke-dasharray string; at p >= .5 the line is whole
  const dashBoth = (L, p) => p >= .5 ? `${L} ${L}` : `${p * L} ${L - 2 * p * L} ${p * L} ${L}`
  // soft front of a left-to-right reveal: x1..x2 of a white -> black gradient (userSpaceOnUse) for a mask. edge = where
  // the text is fully gone, w = how wide the fade is. the typed/wiped text trails a glowing blur like the reference
  const softFront = (edge, w = 18) => ({ x1: edge - w, x2: edge + 1 })
  // camera zoom about a fixed point as an SVG transform (scene content stays in "gauge" units of the last shot)
  const camZoom = (s, cx, cy) => `translate(${cx} ${cy}) scale(${s.toFixed(4)}) translate(${-cx} ${-cy})`

  // breathing that loops exactly over a clip of length D: n whole cycles
  const breathe = (t, D, cycles = 6, phase = 0) => Math.sin(TAU * cycles / D * t + phase)

  // liquid outline (Gemini 06.10, zamery in etudes/etude-gemini-pushin/ZAMERY.md): a hit at the source xs sends a wave along the edge of a
  // glass field. displacement (px, inward positive) at x and time t: exp(-(xs-x)/L) * s(t - (xs-x)/c). w = {xs, c, L, s: keys [[t, v], ...]}
  // (t, c in one unit, e.g. frames and px/frame). Past the source the edge follows s(t) itself (the cap of the pill)
  const liquidEdge = (t, x, w) => { const d = Math.max(0, w.xs - x); return Math.exp(-d / w.L) * keys(t - d / w.c, w.s) }
  // outline of a rounded field (w x h, radius h/2) with the wave pushed in along the top, the bottom and the right cap (normal inward).
  // disp(x) -> px. returns an SVG path string in the field's own coordinates; the left cap stays round (the wave dies long before it)
  function liquidPill(w, h, disp, step = 4) {
    const r = h / 2, pts = [], cx = w - r
    for (let x = r; x <= cx; x += step) pts.push([x, disp(x)])
    for (let a = -90; a <= 90; a += 6) {   // right cap, clockwise
      const th = a * Math.PI / 180, nx = Math.cos(th), ny = Math.sin(th), x = cx + r * nx, d = disp(Math.min(x, w))
      pts.push([x - nx * d, r + r * ny - ny * d])
    }
    for (let x = cx; x >= r; x -= step) pts.push([x, h - disp(x)])
    const left = []; for (let a = 90; a <= 270; a += 6) { const th = a * Math.PI / 180; left.push([r + r * Math.cos(th), r + r * Math.sin(th)]) }
    return 'M' + pts.concat(left).map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join('L') + 'Z'
  }
  // soft ring of light running out of a click: radius v*(t-t0), amplitude from keys a (any unit), asymmetric profile: the inner side is
  // soft (sin), the outer side falls off quickly (sout). returns {r, a, sin, sout}; a = 0 before t0
  const clickRing = (t, o) => t < o.t0 ? { r: 0, a: 0, sin: o.sin, sout: o.sout } : { r: o.v * (t - o.t0), a: keys(t, o.a), sin: o.sin, sout: o.sout }

  // SVG pixel glitch: <filter> that turns a shape into blocks. region = user space of the element
  // that uses it ({x,y,w,h}, e.g. a group translated to the centre: x:-540, y:-880, w:1080, h:1920).
  // returns {id, set(size)}; apply with filter="url(#id)" only while size > 0
  function pixelFilter(defs, id, region, ns = 'http://www.w3.org/2000/svg') {
    const f = document.createElementNS(ns, 'filter'), r = region
    for (const [k, v] of Object.entries({ id, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', x: r.x, y: r.y, width: r.w, height: r.h })) f.setAttribute(k, v)
    const mk = (tag, attrs) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); f.appendChild(e); return e }
    const flood = mk('feFlood', { 'flood-color': '#fff', width: 2, height: 2 })
    const comp = mk('feComposite', { x: r.x, y: r.y })
    mk('feTile', { result: 'grid' })
    mk('feComposite', { in: 'SourceGraphic', in2: 'grid', operator: 'in' })
    const morph = mk('feMorphology', { operator: 'dilate' })
    defs.appendChild(f)
    const set = size => {
      const s = Math.max(2, Math.round(size))
      flood.setAttribute('x', r.x + s / 2); flood.setAttribute('y', r.y + s / 2)
      comp.setAttribute('width', s); comp.setAttribute('height', s)
      morph.setAttribute('radius', s / 2)
    }
    set(10)
    return { id, set }
  }

  // --- bentomotion 07: веер iPhone -> лепестки -> спицы ---------------------------------------------------
  // веер: n одинаковых деталей по кругу вокруг (cx, cy). theta - общий поворот веера в градусах (деталь 0 стоит на этом угле,
  // отсчёт как в экране: 0 = вправо, по часовой), i-я идёт на 360*i/n дальше. деталь рисуют ОДИН раз в системе веера:
  // начало в центре веера, наружу = вверх (y < 0). возвращает {angle, transform} для <g> i-й детали.
  // свой разброс старта деталей это просто своя theta/своё t у i-й: передавать theta + stagger.
  function fan(i, n, theta, cx = 0, cy = 0) {
    const a = theta + 360 * i / n
    return { angle: a, transform: `translate(${cx} ${cy}) rotate(${(a + 90).toFixed(3)})` }
  }
  // таблица замера по кадрам, линейно между кадрами: tab = {f0, v:[...]}, v[j] число, массив или объект {поле: массив}.
  // с key берёт поле строки; нет поля ни слева, ни справа -> null, есть с одной стороны -> держит его.
  function frameTable(tab, f, key) {
    const i = f - tab.f0, n = tab.v.length - 1, j = clamp(Math.floor(i), 0, n), k = Math.min(j + 1, n), u = clamp(i - j, 0, 1)
    let a = tab.v[j], b = tab.v[k]
    if (key !== undefined) { a = a && a[key]; b = b && b[key] }
    if (a == null || b == null) return a == null ? (b == null ? null : b) : a
    return Array.isArray(a) ? a.map((x, q) => x + (b[q] - x) * u) : a + (b - a) * u
  }
  // замкнутый путь по точкам, Катмулл-Ром -> кубики
  function smoothClosed(P) {
    const n = P.length, f = q => q.map(v => v.toFixed(2)).join(' ')
    let d = `M${f(P[0])}`
    for (let i = 0; i < n; i++) {
      const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n]
      d += `C${f([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ${f([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${f(p2)}`
    }
    return d + 'Z'
  }
  // контур формы по радиусам из центра: row = [cx, cy, r0 .. r(N-1)], луч i под углом -pi + 2 pi i / N. многоугольник (углы остаются острыми)
  // при N >= 64, smooth=true гладит кубиками для малого N. так лепесток-полудиск идёт по кадрам замера
  function polarPath(row, N = row.length - 2, smooth = false) {
    const P = []
    for (let i = 0; i < N; i++) { const a = -Math.PI + i * 2 * Math.PI / N, r = row[2 + i]; P.push([row[0] + r * Math.cos(a), row[1] + r * Math.sin(a)]) }
    return smooth ? smoothClosed(P) : 'M' + P.map(q => q.map(v => v.toFixed(2)).join(' ')).join('L') + 'Z'
  }
  // «форма в штрих»: лепесток сплющивается в линзу-спицу. L = [cx, cy, ux, uy, lo, hi, w0..w8, s0..s8]: ось (u) через центр,
  // lo..hi вдоль оси, w - ширина на 9 станциях, s - уход оси вбок. pad дорисовывает то, что порог замера съедает (концы +1,2 px, ширина +0,9)
  function lensPath(L, padEnd = 1.2, padW = .9) {
    const [cx, cy, ux, uy] = L, lo = L[4] - padEnd, hi = L[5] + padEnd, W = L.slice(6, 15), S = L.slice(15, 24), n = 9, nx = -uy, ny = ux, up = [], dn = []
    up.push([cx + ux * lo, cy + uy * lo])
    for (let i = 0; i < n; i++) {
      const t = lo + (hi - lo) * (i + .5) / n, c = [cx + ux * t + nx * S[i], cy + uy * t + ny * S[i]], hw = (Math.max(W[i], .2) + padW) / 2
      up.push([c[0] + nx * hw, c[1] + ny * hw]); dn.push([c[0] - nx * hw, c[1] - ny * hw])
    }
    up.push([cx + ux * hi, cy + uy * hi]); dn.reverse()
    return smoothClosed([...up, ...dn])
  }

  Motion = { TAU, clamp, mix, smooth, gate, outCubic, spring, impact, stagger, flash, beatPulse,
    centroid, area, velocity, smearK, smear, blob, wingbeat, breathe, pixelFilter,
    sineInOut, backOut, popIn, push, sweep, blurIn,
    quadIn, cubicIn, expoOut, dash, relay, hitPop, heartbeat, keys, uPan,
    bezier, tween, exitIn, zoomAbout, frameSplit, motionBlur,
    lin, typed, glowDecay, chipPop, paintBlobs, sliceFilter, meltFilter,
    fieldDraw, dashBoth, softFront, camZoom,
    liquidEdge, liquidPill, clickRing,
    fan, frameTable, smoothClosed, polarPath, lensPath }
})()

// --- bentomotion 05, Mac из свечения (07.10): подмена через свет и морф скругления. Дописано в конец, чтобы не конфликтовать с параллельными задачами ---
;(() => {
  const { clamp, smooth, lin } = Motion
  // подмена через вспышку света: старая форма гаснет в свету (до середины), новая выходит из него (после середины).
  // tau = t - t0, dur = длина подмены. Возвращает {out, in, light}: непрозрачность старой, новой и сила света (колокол, пик в середине)
  const lightSwap = (tau, dur = .3, power = 1.4) => {
    const u = clamp(tau / dur)
    return { out: 1 - smooth(clamp(u * 2)), in: smooth(clamp(u * 2 - 1)), light: Math.pow(Math.sin(Math.PI * u), power) }
  }
  // морф скругления: прямоугольник -> капсула -> круг по ключам рамки. k = {x0, y0, x1, y1, r}: каждый канал [[t, v], ...] (линейно, ключи с замера по кадру).
  // r ограничен половиной меньшей стороны: когда r дорос, форма стала капсулой (w != h) или кругом (w == h)
  const roundMorph = (t, k) => {
    const x0 = lin(t, k.x0), y0 = lin(t, k.y0), x1 = lin(t, k.x1), y1 = lin(t, k.y1), w = x1 - x0, h = y1 - y0
    const rx = Math.min(lin(t, k.r), w / 2, h / 2)
    return { x: x0, y: y0, w, h, r: rx, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, round: rx / (Math.min(w, h) / 2) }
  }
  Object.assign(Motion, { lightSwap, roundMorph })
})()

// --- bentomotion Home -> отпечаток (cloud/06): загрузка по обводке, скруглённый квадрат, повтор трассы ---
;(() => {
  const M = Motion
  // loadArc: бегущий кусок обводки-круга ("загрузка"). круг радиуса R из центра (0,0), идёт по часовой от угла a0 (град),
  // нарисован ДВА раза подряд, поэтому голова может обгонять старт. from/to в градусах по ходу (to может быть > 360).
  // d класть в path один раз, array/offset менять каждый кадр. хвост догоняет голову: from -> to
  const loadArc = (R, a0 = 0) => {
    const a = a0 * Math.PI / 180, p = k => [R * Math.cos(a + k * Math.PI), R * Math.sin(a + k * Math.PI)]
    const f = n => n.toFixed(3), P = k => p(k).map(f).join(' ')
    const d = `M${P(0)}A${R} ${R} 0 1 1 ${P(1)}A${R} ${R} 0 1 1 ${P(2)}A${R} ${R} 0 1 1 ${P(3)}A${R} ${R} 0 1 1 ${P(4)}`
    const L = 4 * Math.PI * R
    return { d, L, at: (from, to) => M.dash(L, from / 720, Math.max(from, to) / 720) }
  }
  // roundRect: скруглённый квадрат (центр cx,cy, полусторона h, скругление rc, поворот phi град). rc >= h даёт круг:
  // квадрат плавно становится кругом и обратно одной кривой (кнопка Home: круг -> квадрат за 18 кадров)
  const roundRect = (cx, cy, h, rc, phi = 0) => {
    rc = Math.max(.01, Math.min(rc, h)); const q = h - rc, a = phi * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
    const P = (x, y) => `${(cx + x * c - y * s).toFixed(2)} ${(cy + x * s + y * c).toFixed(2)}`
    const A = (x, y) => `A${rc} ${rc} 0 0 1 ${P(x, y)}`
    return `M${P(-q, -h)}L${P(q, -h)}${A(h, -q)}L${P(h, q)}${A(q, h)}L${P(-q, h)}${A(-h, q)}L${P(-h, -q)}${A(-q, -h)}Z`
  }
  // traceSync: повтор векторной трассы кадра. items = [[толщина, 'rrggbb', [x,y,x,y...]], ...] (скелет штрихов с кадра),
  // рисует их round-cap путями в группу g, лишние пути прячет. ключи прямо по замеру, когда штрихи рвутся и не отслеживаются
  const traceSync = (g, items) => {
    const ns = 'http://www.w3.org/2000/svg'
    while (g.children.length < items.length) {
      const p = document.createElementNS(ns, 'path'); p.setAttribute('fill', 'none')
      p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); g.appendChild(p)
    }
    for (let i = 0; i < g.children.length; i++) {
      const p = g.children[i], it = items[i]
      if (!it) { p.style.display = 'none'; continue }
      const a = it[2]; let d = `M${a[0]} ${a[1]}`
      if (a.length === 2) d += `l.01 0`; for (let j = 2; j < a.length; j += 2) d += `L${a[j]} ${a[j + 1]}`
      p.style.display = ''; p.setAttribute('d', d); p.setAttribute('stroke-width', it[0]); p.setAttribute('stroke', '#' + it[1])
    }
  }
  Object.assign(M, { loadArc, roundRect, traceSync })
})()

// --- game feel (13.10): тряска травмой, стоп-кадр, уровни силы, цифра на ударе.
// Из скилла game-feel (gamedev-skills, Apache-2.0), переложено на чистые функции времени ---
;(() => {
  const M = Motion, { clamp, mix, outCubic, backOut } = M
  // травма 0..1 к моменту t: удары [[t0, сила], ...] прибавляют, между ними тает на decay в секунду
  const trauma = (t, hits, decay = 1.2) => {
    let tr = 0, last = -1e9
    for (const [th, a] of [...hits].sort((p, q) => p[0] - q[0])) {
      if (th > t) break
      tr = Math.min(1, Math.max(0, tr - decay * (th - last)) + a); last = th
    }
    return Math.max(0, tr - decay * (t - last))
  }
  // тряска камеры: сила = травма^pow (мелкое почти не шевелит, крупное бьёт), качание суммой синусов, а не рандомом (рандом жужжит).
  // {x, y} px, rot в градусах, k = текущая сила. Двигать камеру/обёртку, не сам предмет
  const shake = (t, hits, { x = 12, y = 8, rot = 4, decay = 1.2, pow = 2, seed = 0 } = {}) => {
    const k = Math.pow(trauma(t, hits, decay), pow), n = s => .6 * Math.sin(t * 11 + s) + .4 * Math.sin(t * 23 + s * 2)
    return { x: x * k * n(seed + 1.3), y: y * k * n(seed + 7.1), rot: rot * k * n(seed + 3.7), k }
  }
  // стоп-кадр: время сцены почти встаёт на dur с момента t0 (scale доля скорости), потом идёт дальше с отставанием.
  // stops [[t0, dur, scale=.05], ...] в реальном времени ролика. renderAt(hitStop(t, stops)) вместо renderAt(t)
  const hitStop = (t, stops) => {
    let lt = t
    for (const [t0, dur, scale = .05] of stops) if (t > t0) lt -= (Math.min(t, t0 + dur) - t0) * (1 - scale)
    return lt
  }
  // уровни силы: один удар = пачка откликов за ~100 мс, сила по важности события. tick интерфейса не трясёт кадр как взрыв.
  // sfx = какой звук ставить (тот же уровень в звуковом движке)
  const TIERS = {
    small: { trauma: .15, stop: 0, flash: 0, zoom: 0, particles: 3, sfx: 'tick' },
    medium: { trauma: .4, stop: .05, flash: .6, zoom: .012, particles: 8, sfx: 'hit' },
    large: { trauma: .85, stop: .12, flash: 1, zoom: .03, particles: 30, sfx: 'boom' },
  }
  // всё сразу: events [[t0, 'small'|'medium'|'large'], ...] -> {t: время сцены после стоп-кадров, x, y, rot, flash, zoom}
  const juice = (t, events, opts = {}) => {
    const ev = events.map(([t0, tier]) => [t0, TIERS[tier] || tier])
    const s = shake(t, ev.map(([t0, p]) => [t0, p.trauma]), opts)
    let flash = 0, zoom = 1
    for (const [t0, p] of ev) if (t >= t0) { const a = t - t0; flash = Math.max(flash, p.flash * Math.exp(-a / .06)); zoom += p.zoom * Math.exp(-a / .12) }
    return { t: hitStop(t, ev.filter(([, p]) => p.stop).map(([t0, p]) => [t0, p.stop])), x: s.x, y: s.y, rot: s.rot, flash, zoom }
  }
  // цифра на ударе: выскакивает с перелётом, всплывает, гаснет; i задаёт свой разлёт вбок, пачка расходится веером. tau = t - t0
  const numberPop = (tau, i = 0, { rise = 60, drift = 26, dur = .9 } = {}) => {
    if (tau < 0 || tau > dur) return { on: false, x: 0, y: 0, s: 0, o: 0 }
    // чётные влево, нечётные вправо, разброс .45-1 от drift: соседи никогда не слипаются
    const u = tau / dur, h = Math.sin(i * 12.9898 + 4.1) * 43758.5453, side = (i % 2 ? 1 : -1) * (.45 + .55 * (h - Math.floor(h)))
    return { on: true, x: side * drift * outCubic(u), y: -rise * outCubic(u), s: mix(.4, 1, backOut(tau / .22)), o: clamp((1 - u) / .4) }
  }
  Object.assign(M, { trauma, shake, hitStop, TIERS, juice, numberPop })
})()

// Type Garden observation: extend, open, then reveal internal drawing.
// Durations are an authored interpretation of IMG_3012, not a pixel-fitted curve.
;(() => {
  const M=Motion;
  function botanicalGrowth(age,{duration=.95,attach=0}={}){
    const u=M.clamp(age/Math.max(.001,duration),0,1);
    return {
      stem:1-(1-u)**2,
      arrival:duration*(1-Math.sqrt(1-M.clamp(attach,0,1))),
      silhouette:M.smooth(M.clamp(age/.58,0,1)),
      fruit:M.smooth(M.clamp(age/.42,0,1)),
      blade:M.smooth(M.clamp((age-.08)/.56,0,1)),
      ink:M.smooth(M.clamp((age-.27)/.43,0,1))
    };
  }
  Object.assign(M,{botanicalGrowth});
})();

// Analytic critically damped tracking, preserving both position and velocity.
// No frame integration: interrupted transitions and renderAt share the same path.
Motion.follow=(from,velocity,target,elapsed,tau=.115)=>{
  const t=Math.max(0,elapsed),w=1/tau,d=from-target,b=velocity+w*d,e=Math.exp(-w*t);
  return {value:target+(d+b*t)*e,velocity:(velocity-w*b*t)*e};
};

;
/* One ice composition per phrase. Glyph masks guide growth, never clip it into letter boxes. */
(() => {
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  const random=seed=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};
  const hash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.codePointAt(0),16777619);return h>>>0;};
  const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(w));c.height=Math.max(1,Math.ceil(h));return c;};
  const fonts={playfair:'Frost Playfair',cormorant:'Frost Cormorant',unbounded:'Frost Unbounded',shoulders:'Frost Shoulders'};
  const themes={Frozen:'#a0bddb',Aurora:'#45dbb4','Rose quartz':'#dd72b4','Ember ice':'#f4a65d'};
  const rgb=hex=>{const m=/^#([\da-f]{6})$/i.exec(hex);return m?[0,2,4].map(i=>parseInt(m[1].slice(i,i+2),16)):[160,189,219];};
  let grain=null;
  function glyph(char,size,font,seed,options){
    const dpr=options.dpr||1,rand=random(seed),pad=12,probe=canvas(1,1).getContext('2d');probe.font=`400 ${size}px "${fonts[font]}"`;
    const met=probe.measureText(char),advance=met.width,baseline=pad+size,w=Math.ceil(advance+pad*2+4),h=Math.ceil(size*1.35+pad*2);
    const ink=canvas(w*dpr,h*dpr),ig=ink.getContext('2d',{willReadFrequently:true});ig.scale(dpr,dpr);ig.font=probe.font;ig.textBaseline='alphabetic';
    const tint=rgb(options.color),fill=ig.createLinearGradient(0,baseline-size,0,baseline+size*.15);
    fill.addColorStop(0,'#f4faff');fill.addColorStop(.48,'#e0eef7');fill.addColorStop(1,`rgb(${tint.map(x=>Math.round(x*.42+142)).join(',')})`);ig.fillStyle=fill;ig.fillText(char,pad,baseline);
    if(!grain){grain=canvas(64,64);const gc=grain.getContext('2d'),im=gc.createImageData(64,64),r=random(123);for(let i=0;i<im.data.length;i+=4){im.data[i]=im.data[i+1]=im.data[i+2]=r()>.6?255:16;im.data[i+3]=r()*15;}gc.putImageData(im,0,0);}
    ig.globalCompositeOperation='source-atop';ig.fillStyle=ig.createPattern(grain,'repeat');ig.fillRect(0,0,w,h);ig.globalCompositeOperation='source-over';
    // Low-resolution mask is used only for topology. Visible lettering stays at device resolution.
    const ratio=Math.min(1,100/size),mw=Math.ceil(w*ratio),mh=Math.ceil(h*ratio),mask=canvas(mw,mh),mc=mask.getContext('2d',{willReadFrequently:true});mc.scale(ratio,ratio);mc.font=probe.font;mc.fillStyle='#fff';mc.fillText(char,pad,baseline);const data=mc.getImageData(0,0,mw,mh).data;
    const at=(x,y)=>{const px=(x*ratio)|0,py=(y*ratio)|0;return px<0||py<0||px>=mw||py>=mh?0:data[(py*mw+px)*4+3];};
    const contour=[],step=1/ratio;
    for(let y=pad;y<h-pad;y+=step)for(let x=pad;x<w-pad;x+=step){if(at(x,y)<100||Math.min(at(x-step,y),at(x+step,y),at(x,y-step),at(x,y+step))>80)continue;const dx=at(x+step*2,y)-at(x-step*2,y),dy=at(x,y+step*2)-at(x,y-step*2),n=Math.hypot(dx,dy)||1;contour.push({x:x-pad,y:y-baseline,nx:-dx/n,ny:-dy/n});}
    // Tiny frost hairs remain attached to the letter, but large ornaments belong to the phrase.
    ig.strokeStyle='rgba(237,248,255,.42)';ig.lineWidth=.48;ig.beginPath();for(let i=0;i<contour.length;i+=Math.max(4,Math.round(contour.length/90))){const p=contour[i],len=(1+rand()*2)*Math.min(1,size/160);ig.moveTo(p.x+pad,p.y+baseline);ig.lineTo(p.x+pad+p.nx*len,p.y+baseline+p.ny*len);}ig.stroke();
    const halo=canvas(1,1),blurred=canvas(1,1),frozen=canvas(1,1);mask.width=mask.height=1;
    return{char,size,w,h,pad,baseline,advance,ink,halo,blurred,frozen,segments:[],tips:[],roots:0,maxAge:0,contour,at,disposed:false};
  }
  function compose(items,size,W,H,options){
    const letters=items.filter(g=>g.asset),dpr=options.dpr||1;
    if(!letters.length)return null;
    const randomSeed=hash(`${options.seed}:phrase:${letters.map(g=>g.ch).join('')}`),rand=random(randomSeed),range=(a,b)=>a+(b-a)*rand();
    const pts=[];for(const g of letters)for(const p of g.asset.contour)pts.push({x:g.x+p.x,y:g.y+p.y,nx:p.nx,ny:p.ny,owner:g.id});
    if(!pts.length)return null;
    const box={left:Math.min(...letters.map(g=>g.x)),right:Math.max(...letters.map(g=>g.x+g.advance)),top:Math.min(...letters.map(g=>g.y-size*.78)),bottom:Math.max(...letters.map(g=>g.y+size*.1))};
    const bw=box.right-box.left,bh=box.bottom-box.top,rows=new Set(letters.map(g=>g.row)).size;
    const inside=(x,y)=>letters.some(g=>x>=g.x-3&&x<=g.x+g.advance+3&&y>=g.y-size*1.1&&y<=g.y+size*.3&&g.asset.at(x-g.x+g.asset.pad,y-g.y+g.asset.baseline)>70);
    const anchors=[];
    function anchor(tx,ty,dx,dy,minDistance=0){let best=null,score=Infinity;const norm=Math.hypot(dx,dy);dx/=norm;dy/=norm;for(const p of pts){if(p.nx*dx+p.ny*dy<.25||anchors.some(a=>Math.hypot(a.x-p.x,a.y-p.y)<minDistance))continue;const s=Math.hypot((p.x-tx)*.85,p.y-ty);if(s<score){score=s;best=p;}}if(best){anchors.push(best);return best;}return pts[0];}
    const lead=anchor(box.left+bw*.13,box.top,-.35,-1),counter=anchor(box.right-bw*.12,box.bottom,.55,1),upper=anchor(box.right-bw*.04,box.top,.6,-1,size*.15);
    const roots=[],base=Math.min(size*.92,W*.16,H*.19)*options.length;
    const add=(a,angle,length,strength=1,bend=0)=>roots.push({x:a.x+a.nx*4,y:a.y+a.ny*4,angle,len:length,strength,bend,owner:a.owner});
    // Asymmetrical fan is the lead; the other end receives a smaller descending response.
    add(lead,-1.98,base,1,-.22);add(lead,-2.70,base*.72,.8,.18);add(lead,-1.13,base*.69,.8,.24);
    add(counter,.86,base*.67,.8,-.25);add(counter,.13,base*.48,.55,.18);
    add(upper,-.80,base*.42,.55,-.25);
    if(letters.length>=4){const sweep=anchor(box.left+bw*.20,box.bottom,0,1,size*.12);add(sweep,.28,Math.min(bw*.43,size*1.55),.75,-.44);}
    if(letters.length>=8){const crown=anchor(box.left+bw*.55,box.top,.2,-1,size*.2);add(crown,-1.3,base*.57,.65,.34);add(crown,-2.0,base*.39,.45,-.2);}
    const count=Math.min(7,Math.max(1,Math.floor(letters.length/3)));
    for(let i=0;i<count;i++){const q=(i+1)/(count+1),up=(i%3!==0),tx=box.left+bw*q,ty=up?box.top:box.bottom,a=anchor(tx,ty,(q-.5)*.5,up?-1:1,size*.23);add(a,(up?-Math.PI/2:Math.PI/2)+(q-.5)*.8,base*range(.19,.37),range(.32,.55),range(-.25,.25));}
    if(rows>1){const middle=letters.filter(g=>g.row>0);const g=middle[Math.floor(middle.length*.25)];if(g){const a=anchor(g.x,g.y-size*.2,-1,0,size*.22);add(a,-2.7,base*.43,.5,.25);}}
    const segments=[],tips=[],occupied=new Map(),cell=3,edge=18;
    const detail=Math.cbrt(options.density);
    function path(x,y,ang,len,width,level,root,delay,bend=0){
      const resolution=Math.max(.65,(level===0?3.2:2.6)*size/288)/detail,count=Math.max(2,Math.min(Math.round(len/resolution),Math.round([42,10,4][level]*detail))),step=len/count;let last={x,y};
      for(let i=0;i<count;i++){
        const f=i/count,a=ang+bend*f+range(-.025,.025),xx=x+Math.cos(a)*step,yy=y+Math.sin(a)*step;
        if(xx<edge||yy<edge||xx>W-edge||yy>H-edge||((level>0||i>3)&&inside(xx,yy)))break;
        const key=`${xx/cell|0},${yy/cell|0}`,other=occupied.get(key);if(other!==undefined&&other!==root&&!(other<3&&root<3)&&level===0&&i>3)break;occupied.set(key,root);
        const birth=(delay+f*.62)/options.growth;segments.push({x,y,xx,yy,w:Math.max(.3,width*(1-.8*f)),level,root,birth,dur:.045/options.growth,light:roots[root].strength*(.7+rand()*.3),facet:level===1&&i%3===0});
        if(level<2&&i>1&&i<count-2){
          const side=i%2?-1:1,child=len*Math.pow(1-f,.85)*range(level===0?.27:.20,level===0?.43:.34);
          if(child>2.5){const childAngle=level===0?a+side*(Math.PI/3+range(-.07,.07)):roots[root].angle+range(-.10,.10);path(xx,yy,childAngle,child,width*.5,level+1,root,delay+f*.62+.025,bend*.25);}
        }
        x=xx;y=yy;last={x,y};
      }
      if(level<2&&tips.length<100)tips.push({...last,t:(delay+.7)/options.growth,phase:rand()*6.28,r:.6+rand()*.6});
    }
    roots.forEach((r,i)=>path(r.x,r.y,r.angle,r.len,1.6*(.6+r.strength*.4),0,i,.08+Motion.stagger(i,0,.065),r.bend));
    segments.sort((a,b)=>a.birth-b.birth);const frozen=canvas(W*dpr,H*dpr),fg=frozen.getContext('2d',{willReadFrequently:true});fg.setTransform(dpr,0,0,dpr,0,0);fg.lineCap='round';
    const color=rgb(options.color).join(',');
    return{w:W,h:H,pad:0,baseline:0,size,frozen,fg,segments,tips:tips.filter((_,i)=>i%Math.max(1,Math.ceil(tips.length/20))===0).slice(0,20),roots:roots.length,index:0,lastAge:-1,maxAge:Math.max(0,...segments.map(s=>s.birth+s.dur)),color,box,seed:randomSeed};
  }
  function batch(g,list){const groups=new Map(),facets=new Path2D();for(const s of list){const level=s.level===0?0:s.level===1?1:2,shade=s.light>.64?1:0,key=level*4+shade*2+(s.w>.6?1:0);if(!groups.has(key))groups.set(key,new Path2D());const p=groups.get(key);p.moveTo(s.x,s.y);p.lineTo(s.xx,s.yy);if(s.facet){const dx=s.xx-s.x,dy=s.yy-s.y,n=Math.hypot(dx,dy)||1,k=Math.max(.4,s.w*.8);facets.moveTo(s.x,s.y);facets.lineTo((s.x+s.xx)/2-dy/n*k,(s.y+s.yy)/2+dx/n*k);facets.lineTo(s.xx,s.yy);facets.closePath();}}
    for(const[key,path]of groups){const level=key>>2,bright=(key>>1)%2,thick=key%2;g.fg.lineWidth=level===0?(thick?1.6:.75):level===1?(thick?.9:.55):.38;g.fg.strokeStyle=level===0?`rgba(${g.color},${bright?.92:.55})`:`rgba(235,247,255,${bright?.93:.5})`;g.fg.stroke(path);}g.fg.fillStyle='rgba(218,239,255,.28)';g.fg.fill(facets);
  }
  function update(g,age){if(!g.fg)return;if(age<g.lastAge){g.fg.clearRect(0,0,g.w,g.h);g.index=0;}const from=g.index;while(g.index<g.segments.length&&g.segments[g.index].birth+g.segments[g.index].dur<=age)g.index++;if(g.index>from)batch(g,g.segments.slice(from,g.index));g.lastAge=age;}
  function partial(ctx,g,age){if(!g.fg)return;ctx.strokeStyle='rgba(230,245,255,.78)';ctx.lineWidth=.55;ctx.beginPath();for(let i=g.index;i<g.segments.length&&g.segments[i].birth<=age;i++){const s=g.segments[i],f=clamp((age-s.birth)/s.dur);ctx.moveTo(s.x,s.y);ctx.lineTo(s.x+(s.xx-s.x)*f,s.y+(s.yy-s.y)*f);}ctx.stroke();}
  function dispose(g){if(!g)return;for(const k of ['ink','halo','blurred','frozen'])if(g[k])g[k].width=g[k].height=1;g.segments.length=g.tips.length=0;g.contour=[];g.at=()=>0;}
  FrostMaterial={glyph,compose,update,partial,dispose,random,hash,canvas,fonts,themes,rgb};
})();

;
/* Snow rests on upward, sky-facing glyph edges. Built once per glyph texture. */
(() => {
  const F=FrostMaterial,original=F.glyph,dispose=F.dispose;
  F.glyph=(...args)=>{
    const a=original(...args),dpr=args[4].dpr||1,seed=F.hash('snow:'+args[0]),random=F.random(seed);
    const width=Math.ceil(a.w),height=Math.ceil(a.h),probe=F.canvas(width,height),pg=probe.getContext('2d',{willReadFrequently:true});
    pg.drawImage(a.ink,0,0,width,height);const pixels=pg.getImageData(0,0,width,height).data;
    const tops=new Float32Array(width).fill(-1);
    for(let x=1;x<width-1;x++)for(let y=1;y<height-1;y++){
      // Reject antialias fringes and the fine frost hairs.
      if(pixels[(y*width+x)*4+3]>180&&pixels[((y+1)*width+x)*4+3]>150){tops[x]=y;break;}
    }
    const patches=[];let run=[];
    const finish=()=>{if(run.length>=3)patches.push(run);run=[];};
    for(let x=2;x<width-2;x++){
      const y=tops[x],l=tops[x-2],r=tops[x+2],slope=l>=0&&r>=0?(r-l)/4:0;
      if(y<0||Math.abs(slope)>1.75||(run.length&&Math.abs(y-run.at(-1).y)>3)){finish();if(y<0||Math.abs(slope)>1.75)continue;}
      run.push({x,y,slope});
    }finish();
    const snow=F.canvas(a.w*dpr,a.h*dpr),g=snow.getContext('2d');g.scale(dpr,dpr);
    let area=0;
    for(const points of patches){
      const left=points[0].x,right=points.at(-1).x,span=right-left,phase=random()*6.28;
      const depth=Math.min(14,a.size*.041+1.6)*( .8+random()*.45),mounds=[random(),random(),random()];
      const top=[],bottom=[];
      points.forEach((q,i)=>{
        const u=i/(points.length-1),edge=Math.pow(Math.max(0,Math.sin(Math.PI*u)),.35);
        const pile=mounds.reduce((n,c)=>n+Math.exp(-(((u-c)/.20)**2))*.20,.55);
        const slopeWeight=1/(1+Math.abs(q.slope)*.9);
        const grain=Math.sin(q.x*2.3+phase)*.22+Math.sin(q.x*.79+phase)*.27;
        const thickness=Math.max(.35,depth*edge*pile*slopeWeight+grain);
        top.push({x:q.x,y:q.y-thickness});bottom.push({x:q.x,y:q.y+1.1+Math.max(0,Math.sin(q.x*.35+phase))*.85*edge});area+=thickness;
      });
      const outline=new Path2D();outline.moveTo(top[0].x-.7,top[0].y+1);
      for(const q of top)outline.lineTo(q.x,q.y);outline.lineTo(right+.9,bottom.at(-1).y-.2);
      for(let i=bottom.length-1;i>=0;i--)outline.lineTo(bottom[i].x,bottom[i].y);outline.closePath();
      const low=Math.min(...top.map(p=>p.y)),high=Math.max(...bottom.map(p=>p.y));
      const wash=g.createLinearGradient(0,low,0,high);wash.addColorStop(0,'#fffef8');wash.addColorStop(.52,'#f2f7f3');wash.addColorStop(.86,'#dfecef');wash.addColorStop(1,'#adc6d5');
      g.fillStyle=wash;g.fill(outline);
      // A softly shaded lip and uneven powder grains give thickness without a glow.
      g.save();g.clip(outline);for(let i=0;i<Math.min(340,span*6);i++){
        const x=left+random()*span,q=points[Math.min(points.length-1,Math.floor(x-left))],y=q.y-depth+random()*(depth+3);
        g.fillStyle=i%4?'#ffffff':'#93b2c3';g.globalAlpha=.08+random()*.25;const r=.25+random()*.5;g.fillRect(x,y,r,r);
      }g.restore();
      g.strokeStyle='#fbfff9c9';g.lineWidth=.5;g.beginPath();top.forEach((q,i)=>i?g.lineTo(q.x,q.y):g.moveTo(q.x,q.y));g.stroke();
      for(let i=0;i<span*.6;i++){const q=top[Math.floor(random()*top.length)];g.fillStyle='#f1f7f3';g.globalAlpha=.25+random()*.45;g.fillRect(q.x+(random()-.5),q.y-random()*1.5,.45+random()*.5,.45+random()*.5);}g.globalAlpha=1;
    }
    probe.width=probe.height=1;a.snow=snow;a.snowTips=patches.filter(p=>p.length>8).slice(0,2).map(p=>p.at(-2));a.snowPhase=seed%170/10;a.snowPatches=patches.length;a.snowArea=area;return a;
  };
  F.dispose=a=>{if(a?.snow){a.snow.width=a.snow.height=1;}dispose(a);};
  F.drawLetterSnow=(g,a,age,x,y)=>{
    if(!a.snow)return;
    const reveal=Motion.smooth((age-.18)/1.6);if(reveal<=0)return;
    g.save();g.globalAlpha*=reveal;g.drawImage(a.snow,x,y,a.w,a.h);
    if(F.motionEnabled&&age>2){const local=(F.motionTime+a.snowPhase)%17;if(local<1.8){g.fillStyle='#f3f7f5';g.globalAlpha*=Math.sin(local/1.8*Math.PI)*.6;for(const tip of a.snowTips)for(let j=0;j<2;j++){const dt=Math.max(0,local-j*.08);g.fillRect(x+tip.x+dt*5+j,y+tip.y+dt*dt*12,.6+j*.25,.7+j*.3);}}}
    g.restore();
  };
})();

;
/* Winter botanical materials. */
(()=>{let ctx;
  const rng=seed=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
  function dot(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
  function line(points,color,width=1){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();}
  function sparkle(x,y,r=5){const g=ctx.createRadialGradient(x,y,0,x,y,r*2);g.addColorStop(0,'#effaffbb');g.addColorStop(.13,'#cbefff55');g.addColorStop(1,'#cbefff00');dot(x,y,r*2,g);line([[x-r,y],[x+r,y]],'#e8f8ffb0',.6);line([[x,y-r],[x,y+r]],'#e8f8ffb0',.6);}
  function snow(x,y,w,h,seed){
    const r=rng(seed);ctx.save();ctx.translate(x,y);const path=new Path2D();path.moveTo(-w*.5,0);
    path.bezierCurveTo(-w*.39,-h*.16,-w*.36,-h*.78,-w*.22,-h*.62);
    path.bezierCurveTo(-w*.11,-h*1.25,w*.03,-h*.92,w*.1,-h*.7);
    path.bezierCurveTo(w*.24,-h*.93,w*.32,-h*.12,w*.5,0);
    path.bezierCurveTo(w*.21,h*.14,-w*.22,h*.09,-w*.5,0);
    const g=ctx.createLinearGradient(0,-h,0,h*.16);g.addColorStop(0,'#fbfdff');g.addColorStop(.32,'#dbe8ee');g.addColorStop(.68,'#91aebf');g.addColorStop(1,'#294858');ctx.fillStyle=g;ctx.fill(path);
    ctx.save();ctx.clip(path);
    for(let i=0;i<w*h*.9;i++){const xx=(r()-.5)*w,yy=-r()*h,rr=.13+r()*.6;dot(xx,yy,rr,r()>.3?'#f8ffff8a':'#20394b38');}
    const shade=ctx.createRadialGradient(w*.15,-h*.1,0,w*.15,-h*.1,w*.3);shade.addColorStop(0,'#a4d1e244');shade.addColorStop(1,'#a4d1e200');ctx.fillStyle=shade;ctx.fillRect(-w*.5,-h,w,h*1.2);ctx.restore();
    for(let i=0;i<22;i++){dot((r()-.5)*w*1.08,r()*h*.25,.25+r()*.75,'#c7e0eb77');}ctx.restore();
  }
  function berry(x,y,r,seed){
    const random=rng(seed);ctx.save();ctx.translate(x,y);ctx.rotate((random()-.5)*.4);
    // Thin clear envelope around the fruit, with a dark refracted rim.
    const ice=ctx.createRadialGradient(-r*.4,-r*.55,r*.1,0,0,r*1.16);ice.addColorStop(0,'#e2f4ff48');ice.addColorStop(.68,'#7bb4c017');ice.addColorStop(.87,'#5a9eac55');ice.addColorStop(.94,'#c6dbe25a');ice.addColorStop(1,'#789ba433');dot(0,0,r*1.16,ice);
    const fruit=ctx.createRadialGradient(-r*.42,-r*.45,0,r*.13,r*.16,r*1.1);fruit.addColorStop(0,'#ec6b64');fruit.addColorStop(.3,'#bd363d');fruit.addColorStop(.64,'#861d2e');fruit.addColorStop(.88,'#4d1527');fruit.addColorStop(1,'#1f1622');dot(0,0,r,fruit);
    ctx.save();ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.clip();
    for(let i=0;i<750;i++){let xx=(random()*2-1)*r,yy=(random()*2-1)*r;dot(xx,yy,.12+random()*.45,random()>.4?'#ffb1a42b':'#230e263d');}
    const blush=ctx.createRadialGradient(-r*.35,-r*.52,0,-r*.35,-r*.52,r*.5);blush.addColorStop(0,'#ffc8b540');blush.addColorStop(1,'#ffc8b500');dot(-r*.35,-r*.52,r*.5,blush);ctx.restore();
    // A five-point calyx belongs to the berry rather than an abstract glossy bead.
    ctx.save();ctx.translate(r*.14,r*.28);ctx.scale(1,.72);ctx.fillStyle='#39121d';ctx.beginPath();for(let i=0;i<10;i++){let a=i*Math.PI/5,rr=r*(i%2?.08:.23);let xx=Math.cos(a)*rr,yy=Math.sin(a)*rr;i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);}ctx.closePath();ctx.fill();dot(0,0,r*.055,'#100e15');ctx.restore();
    ctx.lineWidth=.8;ctx.strokeStyle='#d6f6ff99';ctx.beginPath();ctx.ellipse(-r*.09,-r*.02,r*1.1,r*1.12,-.2,Math.PI*.94,Math.PI*1.65);ctx.stroke();
    line([[-r*.62,-r*.9],[-r*.55,-r*.38],[-r*.72,-r*.12],[-r*.61,r*.5]],'#ccedf65c',.5);
    line([[r*.67,-r*.76],[r*.79,-r*.21],[r*.63,r*.06],[r*.78,r*.57]],'#c2e9f338',.65);
    for(let i=0;i<110;i++){const a=Math.PI+random()*Math.PI*.9,rr=r*(.78+random()*.28);dot(Math.cos(a)*rr,Math.sin(a)*rr,.25+random()*.7,'#e5f7ff91');}
    sparkle(-r*.65,-r*.75,2.6);ctx.restore();
  }
  function icicle(x,y,w,h,seed){
    const random=rng(seed);ctx.save();ctx.translate(x,y);const p=new Path2D();p.moveTo(-w*.5,0);p.bezierCurveTo(-w*.44,h*.16,-w*.2,h*.4,-w*.14,h*.67);p.quadraticCurveTo(-w*.03,h*.97,w*.045,h);p.quadraticCurveTo(w*.18,h*.78,w*.21,h*.44);p.bezierCurveTo(w*.19,h*.29,w*.51,h*.11,w*.5,0);p.closePath();
    const g=ctx.createLinearGradient(-w*.5,0,w*.5,0);g.addColorStop(0,'#c9eaf39a');g.addColorStop(.15,'#a8d3e040');g.addColorStop(.38,'#0e1b2460');g.addColorStop(.57,'#f0fbff80');g.addColorStop(.67,'#b7d8e51b');g.addColorStop(1,'#b6d8e49a');ctx.fillStyle=g;ctx.fill(p);ctx.strokeStyle='#c5e6ee77';ctx.lineWidth=.65;ctx.stroke(p);
    ctx.save();ctx.clip(p);line([[-w*.37,3],[-w*.23,h*.29],[-w*.06,h*.76],[w*.045,h]],'#edfaffba',.9);line([[w*.29,1],[w*.07,h*.4],[w*.08,h*.82]],'#e7f7ff66',.5);
    for(let i=0;i<16;i++){let yy=random()*h;line([[-w*.55,yy],[w*.5,yy-w*.2]],'#b4dce828',.5);}for(let i=0;i<12;i++)dot((random()-.5)*w*.35,random()*h*.65,.3+random()*.8,'#d9f4ff70');ctx.restore();sparkle(w*.045,h,2);ctx.restore();
  }
  function curve(p,t){const q=1-t;return{x:q*q*q*p[0]+3*q*q*t*p[2]+3*q*t*t*p[4]+t*t*t*p[6],y:q*q*q*p[1]+3*q*q*t*p[3]+3*q*t*t*p[5]+t*t*t*p[7]};}
  function stem(p,seed,width=2){
    const r=rng(seed);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.bezierCurveTo(...p.slice(2));ctx.strokeStyle='#091923';ctx.lineWidth=width+3;ctx.stroke();ctx.strokeStyle='#40667d';ctx.lineWidth=width;ctx.stroke();ctx.strokeStyle='#b7d9e483';ctx.lineWidth=.65;ctx.stroke();
    for(let i=0;i<250;i++){const t=r(),a=curve(p,t),b=curve(p,Math.min(1,t+.004)),angle=Math.atan2(b.y-a.y,b.x-a.x),side=r()>.5?1:-1,len=.4+r()*3.4;line([[a.x,a.y],[a.x+Math.cos(angle+side*1.2)*len,a.y+Math.sin(angle+side*1.2)*len]],'#deedf07a',.35);}
  }
  function iceLeaf(x,y,len,width,angle,bend,seed){
    const r=rng(seed);ctx.save();ctx.translate(x,y);ctx.rotate(angle);
    const mid=t=>({x:len*t,y:Math.sin(t*Math.PI*.85)*bend});
    const half=t=>width*Math.pow(Math.sin(Math.PI*t),.85)*(.92+.08*Math.sin(t*17));
    const outline=new Path2D();outline.moveTo(0,0);
    const edge=[];
    for(let i=1;i<=60;i++){let t=i/60,a=mid(t),w=half(t)*(1+(i%2?.055:-.025));outline.lineTo(a.x,a.y-w);edge.push([a.x,a.y-w]);}
    for(let i=59;i>=0;i--){let t=i/60,a=mid(t),w=half(t)*(1+(i%2?.025:-.05));outline.lineTo(a.x,a.y+w*.74);edge.push([a.x,a.y+w*.74]);}outline.closePath();
    const g=ctx.createLinearGradient(0,-width,0,width+bend);g.addColorStop(0,'#9db9ca');g.addColorStop(.15,'#648da6');g.addColorStop(.4,'#24465f');g.addColorStop(.51,'#0d263b');g.addColorStop(.58,'#527d96');g.addColorStop(.8,'#34566e');g.addColorStop(1,'#152e46');ctx.fillStyle=g;ctx.fill(outline);
    ctx.save();ctx.clip(outline);
    for(let i=0;i<1500;i++){const xx=r()*len,yy=(r()*2-1)*(width+Math.abs(bend));dot(xx,yy,.12+r()*.45,r()>.55?'#d3e9ed33':'#020e202e');}
    ctx.lineWidth=.65;ctx.strokeStyle='#a6d6e6a0';ctx.beginPath();for(let i=0;i<=40;i++){const a=mid(i/40);i?ctx.lineTo(a.x,a.y):ctx.moveTo(a.x,a.y);}ctx.stroke();
    for(let i=1;i<13;i++){const t=.06+i*.063,a=mid(t),end=mid(Math.min(.98,t+.13)),w=half(Math.min(.98,t+.13));for(const side of [-1,1]){
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(a.x+len*.07,a.y+side*w*.24,end.x,end.y+side*w*(side===1?.72:1));ctx.strokeStyle='#c7e3ec6a';ctx.lineWidth=.55;ctx.stroke();
      for(let j=1;j<4;j++){const f=j/4,xx=a.x+(end.x-a.x)*f,yy=a.y+(end.y+side*w-a.y)*f;line([[xx,yy],[xx+len*.045,yy-side*width*.04]],'#c4e4f13e',.35);}
    }}
    ctx.restore();
    ctx.strokeStyle='#d0dfe575';ctx.lineWidth=.7;ctx.stroke(outline);
    // Sparse grains collect along the upper edge. They vary in density and height.
    for(let i=0;i<200;i++){let t=r(),a=mid(t),yy=a.y-half(t);dot(a.x+(r()-.5)*1.8,yy+(r()-.5)*2.5,.2+r()*.65,'#d4e0e47a');if(i%5===0){const n=1+r()*3;line([[a.x,yy],[a.x+n*.3,yy-n]],'#d6f4fa88',.45);}}
    ctx.restore();
  }
  function hoar(x,y,len,angle,seed){
    const r=rng(seed);ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.lineCap='round';
    for(let side of [-1,1])for(let i=0;i<46;i++){const t=i/46,xx=t*len,yy=Math.sin(t*2.8)*len*.12,reach=len*.22*Math.sin(Math.PI*t)**.7*(.65+r()*.35),ex=xx+reach*.63,ey=yy+reach*side;
      line([[xx,yy],[ex,ey]],'#c6e7f183',.7);
      for(let j=1;j<8;j++){let f=j/8,px=xx+(ex-xx)*f,py=yy+(ey-yy)*f,l=(1-f)*reach*.26;line([[px,py],[px+l,py+side*l*.8]],'#e6f5fa9c',.4);line([[px,py],[px+l*.7,py-side*l*.5]],'#c1e6f37d',.35);}
    }
    const pts=[];for(let i=0;i<=30;i++){const t=i/30;pts.push([t*len,Math.sin(t*2.8)*len*.12]);}line(pts,'#b6d9e6bf',1);ctx.restore();
  }

  // Two passes keep the painted silhouette and the later pen drawing independent.
  function leafDrawing(variant,detail){
    const form=variant%5,bend=(variant%2?1:-1)*(form===0?8:14+variant%5),width=[13.5,19,22,9,26][form],random=rng(71+variant*43);
    const mid=x=>bend*Math.sin(Math.PI*x/100)*.75;
    function edge(x,side){const taper=form===2?1.18-.38*x/100:1;return mid(x)+side*width*Math.pow(Math.sin(Math.PI*x/100),form===0||form===3?1.05:form===4?.65:.83)*taper*(side===1?.94:1)*(1+.055*Math.sin(x*1.33+variant));}
    ctx.lineCap='round';ctx.lineJoin='round';
    if(!detail){
      const path=new Path2D();path.moveTo(0,0);for(let x=2;x<=100;x+=2)path.lineTo(x,edge(x,-1));for(let x=98;x>=0;x-=2)path.lineTo(x,edge(x,1));path.closePath();
      const wash=ctx.createLinearGradient(22,-24,55,27);wash.addColorStop(0,'#c4dbe1');wash.addColorStop(.44,'#668f9e');wash.addColorStop(1,'#294c62');ctx.fillStyle=wash;ctx.fill(path);
      ctx.save();ctx.clip(path);ctx.globalAlpha=.14;ctx.strokeStyle='#e3eef0';ctx.lineWidth=.7;for(let i=0;i<34;i++){const x=random()*100;ctx.beginPath();ctx.moveTo(x-11,-28);ctx.lineTo(x+14,30);ctx.stroke();}ctx.restore();
      ctx.strokeStyle='#a9c7d2';ctx.lineWidth=.8;ctx.stroke(path);
    }else{
      ctx.strokeStyle='#dce9e8';ctx.lineWidth=.85;ctx.beginPath();ctx.moveTo(0,0);for(let x=2;x<=99;x+=2)ctx.lineTo(x,mid(x));ctx.stroke();
      for(let i=0;i<12;i++){const x=9+i*6.4;for(const side of[-1,1]){const end=Math.min(99,x+16+(i%3));ctx.strokeStyle=i%3?'#bed3d8b0':'#eef4efdb';ctx.lineWidth=.55;ctx.beginPath();ctx.moveTo(x,mid(x));ctx.quadraticCurveTo(x+7,mid(x)+side*5,end,edge(end,side)*.92);ctx.stroke();
        ctx.strokeStyle='#c1d5dd70';ctx.lineWidth=.35;for(let j=1;j<=4;j++){const u=j/5,xx=x+(end-x)*u,yy=mid(xx)+(edge(end,side)-mid(end))*u*.87;ctx.beginPath();ctx.moveTo(xx,yy);ctx.lineTo(xx+5,yy+side*3.7);ctx.stroke();}}
      }
      ctx.fillStyle='#e5efed';for(let i=0;i<80;i++){const x=random()*96+2,side=i%2?1:-1;ctx.globalAlpha=.35+random()*.5;ctx.fillRect(x,edge(x,side)+(random()-.5)*1.6,.45+random()*.7,.6);}ctx.globalAlpha=1;
    }
  }
  function fruitDrawing(variant,detail){
    const random=rng(81+variant*17),r=25;
    if(!detail){
      ctx.beginPath();for(let i=0;i<=64;i++){const a=i/64*Math.PI*2,rr=r*(1+.024*Math.sin(a*5+variant));const x=Math.cos(a)*rr,y=Math.sin(a)*rr;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();
      const wash=ctx.createRadialGradient(-9,-10,2,2,4,31);wash.addColorStop(0,'#d6666b');wash.addColorStop(.48,'#b34050');wash.addColorStop(1,'#70283e');ctx.fillStyle=wash;ctx.fill();ctx.strokeStyle='#9dbcc6';ctx.lineWidth=1.4;ctx.stroke();
      ctx.save();ctx.clip();for(let i=0;i<160;i++){ctx.globalAlpha=.05+random()*.1;ctx.fillStyle=i%2?'#f0b7ae':'#491e35';ctx.fillRect((random()-.5)*55,(random()-.5)*55,.7+random(),.7+random());}ctx.restore();
    }else{
      ctx.strokeStyle='#e2e9e4';ctx.lineWidth=.65;ctx.beginPath();ctx.arc(-1,0,23,-2.8,-.35);ctx.stroke();
      ctx.fillStyle='#4e2438';ctx.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-1.4,rr=i%2?1.8:5.3;const x=5+Math.cos(a)*rr,y=5+Math.sin(a)*rr;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();
      ctx.fillStyle='#e2edf0';for(let i=0;i<65;i++){const a=random()*Math.PI*2,rr=21+random()*4;ctx.globalAlpha=.35+random()*.55;ctx.fillRect(Math.cos(a)*rr,Math.sin(a)*rr,.6+random()*.6,.7);}ctx.globalAlpha=1;
    }
  }

  // Cached ink-and-wash studies. Coordinates start at the petiole, facing right.
  function firDrawing(variant,detail){
    const random=rng(401+variant*37),bend=variant%2?7:-5;
    ctx.lineCap='round';
    if(!detail){
      ctx.strokeStyle='#638c96';ctx.lineWidth=1.25;ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(48,bend,103,0);ctx.stroke();
    }
    for(let i=0;i<28;i++){
      const x=5+i*3.35,mid=Math.sin(x/103*Math.PI)*bend*.5;
      for(const side of [-1,1]){
        const length=(8+Math.sin(x/103*Math.PI)*19)*(1-.28*x/103)*( .78+random()*.3);
        const ex=x+length*.65,ey=mid+side*length;
        ctx.strokeStyle=detail?'#d7e8e4b0':i%3?'#739fa8':'#b2ced1';
        ctx.lineWidth=detail?.4:1.25;
        ctx.beginPath();ctx.moveTo(x,mid);ctx.quadraticCurveTo(x+length*.25,ey*.8,ex,ey);ctx.stroke();
        if(detail&&i%3===0){ctx.fillStyle='#f3f5e9';ctx.globalAlpha=.55;ctx.fillRect(ex-.5,ey-.5,1,1);ctx.globalAlpha=1;}
      }
    }
  }
  function flowerDrawing(variant,detail){
    const random=rng(950+variant*97);
    for(let i=0;i<5;i++){
      ctx.save();ctx.rotate(i*Math.PI*2/5+variant*.13);
      const length=27+(i%3)*2,width=11+(i%2)*2;
      const petal=new Path2D();petal.moveTo(-2,2);petal.bezierCurveTo(-width,-8,-width-3,-length+1,-2,-length);petal.bezierCurveTo(width+2,-length-5,width+3,-8,2,3);petal.closePath();
      if(!detail){
        const wash=ctx.createLinearGradient(0,-length,4,4);wash.addColorStop(0,'#e5ebe0');wash.addColorStop(.44,'#bfcec5');wash.addColorStop(1,'#536f79');
        ctx.fillStyle=wash;ctx.fill(petal);ctx.strokeStyle='#f0f4e4ad';ctx.lineWidth=.6;ctx.stroke(petal);
        ctx.save();ctx.clip(petal);ctx.fillStyle='#dce7e1';for(let j=0;j<60;j++){ctx.globalAlpha=.07+random()*.12;ctx.fillRect((random()-.5)*24,-random()*length,.8,.8);}ctx.restore();
      }else{
        ctx.strokeStyle='#789c9b99';ctx.lineWidth=.35;
        for(let j=-2;j<=2;j++){ctx.beginPath();ctx.moveTo(j*.4,0);ctx.quadraticCurveTo(j*3,-length*.45,j*2.6,-length+5);ctx.stroke();}
      }
      ctx.restore();
    }
    if(detail){
      ctx.fillStyle='#738c75';ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.fill();
      for(let i=0;i<19;i++){const a=i*2.39996,r=4+Math.sqrt(i)*1.3,x=Math.cos(a)*r,y=Math.sin(a)*r;
        ctx.strokeStyle='#cad1aa';ctx.lineWidth=.45;ctx.beginPath();ctx.moveTo(x*.37,y*.37);ctx.lineTo(x,y);ctx.stroke();ctx.fillStyle=i%3?'#d9d4ab':'#edf0d5';ctx.beginPath();ctx.arc(x,y,.85,0,Math.PI*2);ctx.fill();}
    }
  }
  function seedDrawing(variant,detail){
    const random=rng(327+variant*19);ctx.lineCap='round';
    for(let i=0;i<13;i++){
      const x=20+i*5.7,side=i%2?1:-1,y=side*(10+random()*12)*(1-i/18);
      ctx.strokeStyle=detail?'#d7dedc':'#74919c';ctx.lineWidth=detail?.4:.7;ctx.beginPath();ctx.moveTo(x-15,0);ctx.quadraticCurveTo(x-2,y*.3,x,y);ctx.stroke();
      ctx.save();ctx.translate(x,y);ctx.rotate(side*.5);ctx.fillStyle=detail?'#c9dad6b0':'#76979e';ctx.beginPath();ctx.ellipse(0,0,detail?1:2.2,detail?2.8:4.5,0,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    if(!detail){ctx.strokeStyle='#8ca5a9';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(46,-1,100,0);ctx.stroke();}
  }

  const F=FrostMaterial,M=Motion,cache=new Map(),baseUpdate=F.update,basePartial=F.partial,baseDispose=F.dispose;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function vinePoint(p,t){const count=(p.length-2)/6,u=clamp(t,0,.999999)*count,i=Math.floor(u);return curve(p.slice(i*6,i*6+8),u-i);}
  function weaveFront(t){return (t>.12&&t<.33)||(t>.53&&t<.73)||t>.9;}
  function sprite(kind,variant,dpr,color){
    const key=[kind,variant,dpr,color].join(':');if(cache.has(key))return cache.get(key);
    const bounds={fir:[-6,-40,125,85],flower:[-38,-38,76,76],seed:[-6,-32,118,66],leaf:[-6,-48,114,100],hoar:[-6,-38,116,85],berry:[-36,-36,72,72],snow:[-59,-27,118,43],icicle:[-13,-4,26,110]}[kind];
    const [x,y,w,h]=bounds,c=F.canvas(w*dpr,h*dpr);ctx=c.getContext('2d',{willReadFrequently:true});ctx.scale(dpr,dpr);ctx.translate(-x,-y);
    if(kind==='leaf')leafDrawing(variant,false);
    if(kind==='fir')firDrawing(variant,false);
    if(kind==='flower')flowerDrawing(variant,false);
    if(kind==='seed')seedDrawing(variant,false);
    if(kind==='hoar')hoar(0,0,100,0,53+variant*19);
    if(kind==='berry')fruitDrawing(variant,false);
    if(kind==='snow')snow(0,0,100,18,88+variant*11);
    if(kind==='icicle')icicle(0,0,15,100,19+variant*7);
    if(kind!=='berry'&&kind!=='flower'&&color!=='#a0bddb'){
      const g=c.getContext('2d'),data=g.getImageData(0,0,c.width,c.height),rgb=F.rgb(color);for(let i=0;i<data.data.length;i+=4){if(!data.data[i+3])continue;for(let j=0;j<3;j++)data.data[i+j]=Math.min(255,data.data[i+j]*(.48+.52*rgb[j]/[160,189,219][j]));}g.putImageData(data,0,0);
    }
    let detail=null;if(['leaf','berry','fir','flower','seed'].includes(kind)){detail=F.canvas(w*dpr,h*dpr);ctx=detail.getContext('2d');ctx.scale(dpr,dpr);ctx.translate(-x,-y);({leaf:leafDrawing,berry:fruitDrawing,fir:firDrawing,flower:flowerDrawing,seed:seedDrawing})[kind](variant,true);}
    const value={canvas:c,detail,x,y,w,h};cache.set(key,value);while(cache.size>64)cache.delete(cache.keys().next().value);return value;
  }
  function compose(items,s,W,H,opt){
    const glyphs=items.filter(g=>g.asset);if(!glyphs.length)return null;
    const words=[];let word=null;for(const g of items){if(!g.asset){word=null;continue;}if(!word||word.row!==g.row){word={id:g.id,row:g.row,letters:[],left:g.x,base:g.y,top:g.y-s*.71};words.push(word);}word.letters.push(g);word.right=g.x+g.advance-s*.025;}
    words.forEach(w=>w.width=w.right-w.left);
    const nodes=[],tips=[],rows=[...new Set(words.map(w=>w.row))],density=opt.density,reach=opt.length;
    const unit=Math.min(clamp(s*1.18,Math.min(70,s*1.5),230),W*.22,H*.24)*Math.sqrt(reach),leafUnit=unit*.42;
    let index=0;
    function add(kind,id,x,y,scale=1,angle=0,front=false,variant=0,sy=scale){
      const sp=sprite(kind,variant+F.hash(opt.seed)%17,opt.dpr,opt.color);const n={key:id,kind,x,y,scale,sy,angle,front,sp,delay:.05+Math.min(.38,index++*.023)/opt.growth,offset:0};nodes.push(n);
      if((kind==='leaf'||kind==='berry')&&tips.length<12){const len=kind==='leaf'?100*scale:16*scale;tips.push({nodeKey:id,x:x+Math.cos(angle)*len,y:y+Math.sin(angle)*len,t:n.delay+.5/opt.growth,phase:variant*1.7,r:.75});}return n;
    }
    function branch(id,p,leaves){
      const path=new Path2D(),fuzz=new Path2D(),random=F.random(F.hash(id));path.moveTo(p[0],p[1]);path.bezierCurveTo(...p.slice(2));
      for(let i=0;i<100;i++){const t=random(),a=curve(p,t),b=curve(p,Math.min(1,t+.004)),angle=Math.atan2(b.y-a.y,b.x-a.x)+(random()>.5?1:-1)*1.2,len=(.5+random()*2.2)*Math.min(1,s/150);fuzz.moveTo(a.x,a.y);fuzz.lineTo(a.x+Math.cos(angle)*len,a.y+Math.sin(angle)*len);}
      nodes.push({key:id,kind:'stem',path,fuzz,p,x:0,y:0,scale:1,sy:1,angle:0,front:false,delay:.02,offset:0});
      const count=leaves?Math.max(2,Math.round(leaves*density)):0;for(let i=0;i<count;i++){const t=.13+(i+.2)/(count+.4)*.70,a=curve(p,t),b=curve(p,Math.min(.995,t+.005)),angle=Math.atan2(b.y-a.y,b.x-a.x)+(i%2?-1.12:1.15),len=leafUnit*(i%4===3?.43:.70+(i%3)*.13);const leaf=add('leaf',id+':leaf:'+i,a.x,a.y,len/100,angle,false,i%4);leaf.parent=id;leaf.attach=t;if(i%3===0&&density>.8){const h=add('hoar',id+':hoar:'+i,a.x,a.y,len*.8/100,angle-.3,false,i%3);h.parent=id;h.attach=t;}}
    }
    const first=words[0],last=words.at(-1),k=clamp(unit/240,.16,.97),lead={x:first.left+first.width*Math.min(.32,.12+.20/first.letters.length),y:first.top+5};
    add('leaf','lead:leaf:0',lead.x-18*k,lead.y-37*k,.84*k,-2.09,false,1);
    add('leaf','lead:leaf:1',lead.x-8*k,lead.y-21*k,.58*k,2.97,false,2);
    add('hoar','lead:hoar',lead.x-4*k,lead.y-5*k,.95*k,-1.94,false,1);
    for(const [i,dx,dy,r]of[[0,43,-66,18],[1,2,-64,22],[2,25,-34,24]])add('berry','lead:berry:'+i,lead.x+dx*k,lead.y+dy*k,r*k/26,0,true,i);
    add('snow','lead:snow',lead.x+24*k,lead.y-51*k,.34*k,0,true,1,.39*k);
    // A maximum of three distinct word groups keeps long phrases from repeating the same ornament.
    const selected=words.length<=3?words:[first,words[Math.floor(words.length/2)],last];
    const joined=words.length===2&&first.letters.length<=3&&first.row===last.row;
    selected.forEach((w,wi)=>{
      const nextRow=rows.includes(w.row+1),depth=nextRow?.30:.47;
      if(w.letters.length>=2&&!(joined&&wi===1)){const width=joined?last.left+last.width*.42-w.left:w.width;const p=wi%2?[w.left+width*.18,w.base-3,w.left+width*.13,w.base+unit*depth*1.10,w.left+width*.46,w.base+unit*depth*.74,w.left+width*.66,w.base+unit*.06]:[w.left+width*.12,w.base-3,w.left+width*.27,w.base+unit*depth,w.left+width*.74,w.base+unit*depth*.85,w.left+width*.94,w.base-4];branch('arc:'+w.id,p,wi===0?5:3);}
      if(wi===0){const foot=w.letters[Math.min(1,w.letters.length-1)];add('snow','foot:'+w.id,foot.x+foot.advance*.55,foot.y+1,unit*.43/100,0,true,0,unit*.06/18);}
      if(w.letters.length>=5){const crown=w.letters[2];add('leaf','crown:'+w.id,crown.x+crown.advance*.40,w.top+1,unit*.32/100,-2.04,false,1);add('hoar','crown-hoar:'+w.id,crown.x+crown.advance*.40,w.top+1,unit*.25/100,-1.19,false,2);}
    });
    // Secondary accent moves with a real letter in the last word, not a hardcoded character name.
    if(glyphs.length>=5){const mid=last.letters[Math.min(last.letters.length-1,2)],bx=mid.x+mid.advance*.56,by=last.top-unit*.17;
      branch('budstem',[mid.x+mid.advance*.52,last.base-unit*.12,mid.x+mid.advance*.9,last.base-unit*.54,bx-unit*.18,by+unit*.17,bx,by],2);
      add('berry','bud:0',bx,by,unit*.048/26,0,true,2);add('berry','bud:1',bx+unit*.069,by-unit*.024,unit*.037/26,0,true,1);
    }
    if(glyphs.length>=3){const p=[last.right-unit*.09,last.base-3,last.right+unit*.50,last.base+unit*.23,last.right+unit*.44,last.top+unit*.31,last.right-unit*.03,last.top+5];branch('tail',p,3);}
    const cap=glyphs.find(g=>/[TТЕEF]/.test(g.ch))||glyphs[0],capY=cap.y+(cap.asset.contour.length?Math.min(...cap.asset.contour.map(p=>p.y)):-s*.71);add('snow','cap',cap.x+cap.advance*.48,capY+1,Math.min(cap.advance*.79,unit*.32)/100,0,true,2,unit*.023/18);
    const a=glyphs.find(g=>/[AА]/.test(g.ch));if(a){const ax=a.x+(a.advance-s*.025)*.46,ay=a.y-s*.272;add('icicle','ice:0',ax,ay,s*.042/15,0,true,0,s*.32/100);add('icicle','ice:1',ax+s*.068,ay,s*.025/15,0,true,1,s*.21/100);add('snow','ice:snow',ax+s*.025,ay,s*.19/100,0,true,1,s*.028/18);}
    const end=last.letters.at(-1);if(glyphs.length>2)add('snow','end:snow',end.x+end.advance*.72,end.y+1,unit*.21/100,0,true,1,unit*.023/18);
    // Composition-level safety bounds, never per-letter rectangles.
    for(const n of nodes){if(n.kind==='stem')continue;const r=Math.max(Math.abs(n.sp.x),n.sp.x+n.sp.w,Math.abs(n.sp.y),n.sp.y+n.sp.h)*Math.max(n.scale,n.sy);n.x=clamp(n.x,r+3,W-r-3);n.y=clamp(n.y,r+3,H-r-3);}
    // Climbing plants occupy selected glyph interiors as well as the word's outline.
    selected.forEach((word,wi)=>{
      const anchors=[word.letters[Math.min(1,word.letters.length-1)],...(word.letters.length>=6?[word.letters[4]]:[])];
      anchors.forEach((letter,ai)=>{
        const id='climb:'+letter.id,variation=(F.hash(letter.ch+opt.seed)%100)/100,mirror=(wi+ai)%2?-1:1,x=letter.x+letter.advance*(mirror>0?.43:.57),y=letter.y,wide=Math.min(letter.advance*(.5+variation*.18),s*.33)*mirror,tall=s*(.77+variation*.10);
        const p=[x,y-s*.08,
          x+wide*(1.10+variation*.35),y+s*.04,x+wide*1.25,y-tall*(.32+variation*.10),x-wide*.20,y-tall*.34,
          x-wide*1.12,y-tall*.29,x-wide*(.8+variation*.3),y-tall*.79,x+wide*.10,y-tall*.73,
          x+wide*.95,y-tall*.69,x+wide*.65,y-tall*1.06,x+wide*(.05+variation*.4),y-tall*1.16];
        const stem={key:id,kind:'stem',p,x:0,y:0,scale:1,sy:1,angle:0,front:false,weave:true,delay:.07+ai*.13,offset:0};nodes.push(stem);
        const count=clamp(Math.round(5*density),3,7);
        for(let i=0;i<count;i++){const at=.14+i/(count-1)*.76,q=vinePoint(p,at),next=vinePoint(p,at+.004),angle=Math.atan2(next.y-q.y,next.x-q.x)+(i%2?-1.05:1.05),len=Math.min(unit*.36,s*.36)*(i%2?.86:1);
          const leaf=add('leaf',id+':leaf:'+i,q.x,q.y,len/100,angle,weaveFront(at),i+ai);leaf.parent=id;leaf.attach=at;
        }
        // A small winter fruit terminal, with independent stagger and ink reveal.
        if(ai===0&&wi>0){for(let i=0;i<2;i++){const at=.94,q=vinePoint(p,at),fruit=add('berry',id+':fruit:'+i,q.x+(i?10:-5)*k,q.y+(i?-10:2)*k,unit*(i?.048:.063)/26,0,true,i+wi);fruit.parent=id;fruit.attach=at;}}
      });
    });

    if(last.letters.length>=3){
      const letter=last.letters[Math.floor(last.letters.length*.67)],x=letter.x+letter.advance*.62,y=letter.y-s*.04,r=unit*.065;
      const p=[x,y,x+r*.8,y+r*1.2,x+r*3.8,y+r*1.2,x+r*3.7,y+r*3,
        x+r*3.6,y+r*4.8,x+r*.9,y+r*4.7,x+r*.9,y+r*3.1,
        x+r*.9,y+r*2.1,x+r*2.4,y+r*2.1,x+r*2.3,y+r*3.05];
      nodes.push({key:'tendril:'+letter.id,kind:'stem',p,x:0,y:0,scale:1,sy:1,angle:0,front:false,delay:.16,offset:0,delicate:true});
      const joint=vinePoint(p,.30),bud=add('leaf','young:'+letter.id,joint.x,joint.y,unit*.15/100,-.6,false,0);bud.parent='tendril:'+letter.id;bud.attach=.30;
    }

    // One evergreen cluster and a small winter bloom, separated by quiet space.
    // Stable word/letter ids keep these plants alive while more text is entered.
    selected.forEach((word,wi)=>{
      const letter=word.letters[Math.min(2,word.letters.length-1)];
      if(word.letters.length>=3){
        const x=letter.x+letter.advance*.52,y=word.top+3,id='evergreen:'+word.id;
        const p=[x,y,x-unit*.04,y-unit*.1,x+unit*.05,y-unit*.20,x+unit*.02,y-unit*.27];branch(id,p,0);
        for(let j=0;j<3;j++){
          const at=.35+j*.27,q=curve(p,at),n=add('fir',id+':spray:'+j,q.x,q.y,unit*(j===1?.37:.29)/100,-1.55+(j-1)*.67,false,j+wi);
          n.parent=id;n.attach=at;
        }
      }
      if(word.letters.length>=4&&wi===0){
        const stem=nodes.find(n=>n.key==='arc:'+word.id);
        if(stem){
          const at=.68,q=vinePoint(stem.p,at),id='winterflower:'+word.id;
          const p=[q.x,q.y,q.x+unit*.03,q.y-unit*.13,q.x+unit*.15,q.y-unit*.25,q.x+unit*.23,q.y-unit*.22];
          // The flowering pedicel grows from the main branch, not the empty air.
          branch(id,p,0);const pedicel=nodes.at(-1);pedicel.parentStem=stem.key;pedicel.attach=.68;
          const flower=add('flower',id+':bloom',p[6],p[7],unit*.17/30,.19,true,wi);flower.parent=id;flower.attach=1;
          const leaf=add('leaf',id+':sepal',p[4],p[5],unit*.18/100,-2.65,false,3);leaf.parent=id;leaf.attach=.70;
        }
      }
      if(word.letters.length>=5&&wi===selected.length-1){
        const stem=nodes.find(n=>n.key==='tail');
        if(stem){const at=.78,q=vinePoint(stem.p,at),n=add('seed','seed:'+word.id,q.x,q.y,unit*.35/100,-1.85,false,wi);n.parent=stem.key;n.attach=at;}
      }
    });

    // Match every plant root to a sampled point on the actual glyph outline.
    function rootAt(x,y){let result={x,y,d:Infinity};for(const g of glyphs)for(const point of g.asset.contour){const xx=g.x+point.x,yy=g.y+point.y,dist=Math.hypot(xx-x,yy-y);if(dist<result.d)result={x:xx,y:yy,d:dist,glyph:g.id};}return result;}
    branch('leadstem',[lead.x,lead.y,lead.x-12*k,lead.y-22*k,lead.x+10*k,lead.y-49*k,lead.x+17*k,lead.y-72*k],0);
    for(const n of nodes){if(n.key.startsWith('lead:')){n.parent='leadstem';n.attach=clamp((lead.y-n.y)/(72*k),.08,1);}if(n.key.startsWith('bud:')){n.parent='budstem';n.attach=1;}}
    for(const n of [...nodes])if((n.kind==='leaf'||n.kind==='hoar')&&!n.parent){const id='root:'+n.key;branch(id,[n.x,n.y,n.x,n.y-5,n.x,n.y-8,n.x,n.y],0);n.parent=id;n.attach=1;}
    const rootErrors=[];
    for(const stem of nodes.filter(n=>n.kind==='stem')){const root=stem.parentStem?{x:stem.p[0],y:stem.p[1]}:rootAt(stem.p[0],stem.p[1]);stem.p[0]=root.x;stem.p[1]=root.y;stem.phase=F.hash(stem.key+opt.seed)%1000/159;stem.duration=.82+(F.hash(stem.key)%27)/100;rootErrors.push({key:stem.key,distanceToContour:Math.hypot(stem.p[0]-root.x,stem.p[1]-root.y)});}
    for(const stem of nodes.filter(n=>n.parentStem)){const parent=nodes.find(n=>n.key===stem.parentStem);stem.restJoint=vinePoint(parent.p,stem.attach);stem.delay=parent.delay+(1-Math.sqrt(1-stem.attach))*parent.duration;}
    for(const n of nodes)if(n.parent){const stem=nodes.find(q=>q.key===n.parent);n.restJoint=vinePoint(stem.p,n.attach);n.delay=stem.delay+(1-Math.sqrt(1-n.attach))*stem.duration+.06;}
    nodes.sort((a,b)=>(a.kind==='stem'?0:1)-(b.kind==='stem'?0:1));
    const box={left:Math.min(...glyphs.map(g=>g.x)),right:Math.max(...glyphs.map(g=>g.x+g.advance)),top:Math.min(...glyphs.map(g=>g.y-s*.78)),bottom:Math.max(...glyphs.map(g=>g.y+s*.1))};
    return{kind:'winter',nodes,tips,rootErrors,segments:[],roots:nodes.length,maxAge:1.8/opt.growth,w:W,h:H,size:s,box,fg:true,frozen:F.canvas(1,1),growth:opt.growth,color:opt.color,stemWidth:clamp(s/145,.65,1.8)};
  }
  function tracked(target,track,age){
    return track?M.follow(track.value,track.velocity,target,age):{value:target,velocity:0};
  }
  function location(n,age){
    const result={};for(const key of ['x','y','scale','sy','angle'])result[key]=tracked(n[key],n.tracks?.[key],age).value;return result;
  }
  function baseStemPose(n,age){if(n.baseAge!==age||!n.basePose){n.baseAge=age;n.basePose=n.p.map((v,i)=>tracked(v,n.pathTracks?.[i],age).value);}return n.basePose.slice();}
  function compositionSize(a,age){return tracked(a.size,a.sizeTrack,age).value;}
  function retarget(next,prev,age){
    if(!next||!prev||prev.kind!=='winter')return;
    next.sizeTrack=tracked(prev.size,prev.sizeTrack,age);
    next.widthTrack=tracked(prev.stemWidth,prev.widthTrack,age);
    const old=new Map(prev.nodes.map(n=>[n.key,n]));
    for(const n of next.nodes){
      const prior=old.get(n.key);if(!prior)continue;
      n.tracks={};for(const key of ['x','y','scale','sy','angle'])n.tracks[key]=tracked(prior[key],prior.tracks?.[key],age);
      n.angle=n.tracks.angle.value+Math.atan2(Math.sin(n.angle-n.tracks.angle.value),Math.cos(n.angle-n.tracks.angle.value));
      n.offset=age+prior.offset;n.delay=prior.delay;
      if(n.kind==='stem'&&prior.p&&prior.p.length===n.p.length)n.pathTracks=prior.p.map((v,i)=>tracked(v,prior.pathTracks?.[i],age));
    }
    prev.retiring=new Set(prev.nodes.filter(n=>!next.nodes.some(q=>q.key===n.key)).map(n=>n.key));
  }

  function stemPose(n,age,a){
    if(a.poseCache?.has(n.key))return a.poseCache.get(n.key);
    const p=baseStemPose(n,age);
    if(n.parentStem){const parent=a.stemMap.get(n.parentStem),q=vinePoint(stemPose(parent,age,a),n.attach),rest=vinePoint(baseStemPose(parent,age),n.attach);for(let i=0;i<p.length;i+=2){p[i]+=q.x-rest.x;p[i+1]+=q.y-rest.y;}}
    if(F.motionEnabled){const t=F.motionTime,wind=windAt(t,n.phase)*Math.min(6.5,compositionSize(a,age)*.029);for(let i=2;i<p.length;i+=2){const along=i/(p.length-2);p[i]+=wind*along; p[i+1]+=wind*.24*along;}}
    a.poseCache?.set(n.key,p);
    return p;
  }
  function draw(g,a,age,front,retiring=false){if(!a)return;if(a.kind!=='winter'){if(!front)g.drawImage(a.frozen,0,0,a.w,a.h);return;}
    const stems=a.stemMap||(a.stemMap=new Map(a.nodes.filter(n=>n.kind==='stem').map(n=>[n.key,n])));
    const stemWidth=tracked(a.stemWidth,a.widthTrack,age).value;
    if(a.poseTime!==F.motionTime||a.poseAge!==age){a.poseCache=new Map();a.poseTime=F.motionTime;a.poseAge=age;}
    for(const n of a.nodes){if((!n.weave&&n.front!==front)||(retiring&&a.retiring&&!a.retiring.has(n.key)))continue;const life=(age+n.offset-n.delay)*a.growth;if(life<0)continue;const pos=location(n,age);g.save();
      if(n.kind==='stem'){
        const u=M.botanicalGrowth(life,{duration:n.duration}).stem,p=stemPose(n,age,a);n.renderPose={p:[...p]};g.strokeStyle=a.color;g.lineWidth=stemWidth*(n.delicate?.65:n.weave?1.55:1)*(.4+.6*clamp(life/.5,0,1));g.lineCap='round';g.globalAlpha*=.87;g.beginPath();let pen=false;for(let i=0;i<=90;i++){const t=i/90*u,q=vinePoint(p,t),visible=!n.weave||weaveFront(t)===front;if(visible){if(!pen&&i){const before=vinePoint(p,(i-1)/90*u);g.moveTo(before.x,before.y);}g.lineTo(q.x,q.y);}pen=visible;}g.stroke();
        // Sparse ink-like burrs follow the deformed stem, including at rest.
        g.lineWidth=.4;g.strokeStyle='#d7e7e8';g.globalAlpha*=.60;g.beginPath();for(let i=1;i<50*u;i++){const t=i/50;if(n.weave&&weaveFront(t)!==front)continue;const q=vinePoint(p,t),r=vinePoint(p,t+.005),angle=Math.atan2(r.y-q.y,r.x-q.x)+((i%2)?1:-1)*1.2,len=Math.min(2.4,a.size*.012)*(1+(i%3)*.3);g.moveTo(q.x,q.y);g.lineTo(q.x+Math.cos(angle)*len,q.y+Math.sin(angle)*len);}g.stroke();
      }else{
        let angle=pos.angle,px=pos.x,py=pos.y;
        if(n.parent){const stem=stems.get(n.parent),p=stemPose(stem,age,a),joint=vinePoint(p,n.attach),base=baseStemPose(stem,age),rest=vinePoint(base,n.attach),restNext=vinePoint(base,Math.min(1,n.attach+.01)),next=vinePoint(p,Math.min(1,n.attach+.01));px+=joint.x-rest.x;py+=joint.y-rest.y;
          const turn=Math.atan2(next.y-joint.y,next.x-joint.x)-Math.atan2(restNext.y-rest.y,restNext.x-rest.x);angle+=Number.isFinite(turn)?turn:0;
          if(F.motionEnabled)angle+=(.035*M.breathe(F.motionTime,4.9,1,F.hash(n.key)%100/19)+.018*windAt(F.motionTime-.35,F.hash(n.key)%10))*Math.min(1,life);
          // Short petioles join the branch skeleton to asymmetric berry / crown clusters.
          if(Math.hypot(px-joint.x,py-joint.y)>2){g.save();g.strokeStyle=a.color;g.lineWidth=Math.max(.45,stemWidth*.65);g.globalAlpha*=clamp(life/.22,0,1)*.72;g.beginPath();g.moveTo(joint.x,joint.y);g.lineTo(px,py);g.stroke();g.restore();}
        }
        n.renderPose={x:px,y:py,angle,scale:pos.scale,sy:pos.sy};
        const stages=M.botanicalGrowth(life),reveal=n.kind==='berry'?stages.fruit:stages.silhouette,melt=retiring?.65+.35*g.globalAlpha:1;
        if(n.kind==='leaf'&&life>1.2)n.worldTip={x:px+Math.cos(angle)*pos.scale*95,y:py+Math.sin(angle)*pos.scale*95};
        g.translate(px,py);g.rotate(angle);
        if(['leaf','hoar','fir','seed'].includes(n.kind)){
          // A narrow shoot extends from its petiole, then unfurls in width.
          const unfold=.08+.92*stages.blade;g.scale(pos.scale*melt,pos.sy*unfold*melt);g.beginPath();g.rect(n.sp.x,-80,6+100*reveal,160);g.clip();g.globalAlpha*=clamp(life/.09,0,1);
        }else{g.scale(pos.scale*reveal*melt,pos.sy*reveal*melt);}
        g.drawImage(n.sp.canvas,n.sp.x,n.sp.y,n.sp.w,n.sp.h);
        if(n.sp.detail){g.save();const ink=stages.ink;g.globalAlpha*=ink;if(n.kind==='leaf'){g.beginPath();g.rect(-6,-80,114*ink,160);g.clip();}g.drawImage(n.sp.detail,n.sp.x,n.sp.y,n.sp.w,n.sp.h);g.restore();}
      }g.restore();
    }
  }
  F.tipPosition=(a,p)=>{const n=a.nodes?.find(n=>n.key===p.nodeKey),q=n?.renderPose;if(!q||n.kind==='stem')return p;const length=(n.kind==='leaf'?100:16)*q.scale;return{x:q.x+Math.cos(q.angle)*length,y:q.y+Math.sin(q.angle)*length};};
  function windAt(t,phase=0){
    const sweep=Math.pow(Math.max(0,Math.sin(t*.39-.8)),4);
    return M.breathe(t,7.7,1,phase)*.7+M.breathe(t,11.3,1,phase*.7)*.25+sweep*Math.sin(t*1.3-phase*.12)*1.2;
  }
  let snowSprites=null;
  function snowSprite(){
    if(snowSprites)return snowSprites;
    snowSprites=[false,true].map(soft=>{const c=F.canvas(24,24),g=c.getContext('2d'),wash=g.createRadialGradient(11,10,0,12,12,10);wash.addColorStop(0,soft?'#f2f8ffe0':'#ffffff');wash.addColorStop(soft?.2:.5,soft?'#e8f4ff80':'#e7f0f4ed');wash.addColorStop(1,'#e4f2ff00');g.fillStyle=wash;g.fillRect(0,0,24,24);return c;});return snowSprites;
  }
  function drawVisitor(g,a,t){
    // Global time: typing cannot restart the wind or the snowfall.
    const random=F.random(28371),count=Math.min(280,Math.max(85,Math.round(a.w*a.h/4900))),wind=windAt(t),sprites=snowSprite();
    g.save();g.fillStyle='#dceef1';
    for(let i=0;i<count;i++){
      const z=random(),x0=random()*a.w,y0=random()*(a.h+40),speed=13+z*z*48;
      const x=((x0+t*(4+z*9)+Math.sin(t*(.24+z*.25)+i)*18+wind*z*14)%(a.w+40)+a.w+40)%(a.w+40)-20,y=(y0+t*speed)%(a.h+40)-20;
      const near=z>.87,size=near?6+z*3:1.7+z*3.2;
      g.globalAlpha=near?.28:.27+z*.45;g.drawImage(sprites[near?1:0],x-size/2,y-size/2,size,size*(1+.16*Math.sin(t+i)));
    }
    // Occasionally a little hoarfrost detaches from a real, moving leaf tip.
    for(const n of a.nodes){
      if(n.kind!=='leaf'||(F.hash(n.key)%7)!==0||!n.worldTip)continue;
      const phase=F.hash(n.key)%131/10,local=(t+phase)%13;if(local>2.4)continue;
      const fade=Math.sin(Math.PI*local/2.4);
      for(let j=0;j<3;j++){const dt=Math.max(0,local-j*.08);g.globalAlpha=fade*(.33-j*.05);const x=n.worldTip.x+dt*9+Math.sin(dt*3+j)*4,y=n.worldTip.y+dt*dt*11;g.fillRect(x,y,.7+j*.17,.9+j*.13);}
    }
    g.restore();
  }
  F.drawVisitor=drawVisitor;

  F.compose=compose;F.retarget=retarget;F.drawComposition=draw;
  F.update=(g,age)=>g.kind==='winter'?null:baseUpdate(g,age);F.partial=(g,a,age)=>a.kind==='winter'?null:basePartial(g,a,age);
  F.dispose=g=>{if(g?.kind==='winter'){g.nodes=[];g.tips=[];g.frozen.width=g.frozen.height=1;}else baseDispose(g);};
  F.clearWinterCache=()=>cache.clear();F.winterCacheBytes=()=>[...cache.values()].reduce((n,s)=>n+s.canvas.width*s.canvas.height*4*(s.detail?2:1),0);

})();
;
/* Optional local sample adapter. No oscillator tones. Never autoplay. */
FrostAudio=class {
  constructor(){this.enabled=false;this.ctx=null;this.buffers={};this.voices=new Set();this.last={};this.dead=false;this.loading=null;}
  async enable(on){
    this.enabled=!!on;
    if(!on){this.stop();return;}
    if(!globalThis.WINTER_AUDIO){this.enabled=false;return;}
    if(!this.ctx){
      const AC=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AC){this.enabled=false;return;}
      this.ctx=new AC();this.master=this.ctx.createGain();this.master.gain.value=.8;this.master.connect(this.ctx.destination);
      this.analyser=this.ctx.createAnalyser();this.master.connect(this.analyser);
      this.loading=Promise.all(Object.entries(globalThis.WINTER_AUDIO).map(async([key,b64])=>{const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));this.buffers[key]=await this.ctx.decodeAudioData(bytes.buffer);}));
    }
    await this.ctx.resume();await this.loading;
    if(this.enabled&&!this.dead&&!Array.from(this.voices).some(v=>v.loop&&!v.stopping))this.start('air',true,1);
  }
  start(key,loop=false,volume=1){
    if(!this.enabled||!this.buffers[key]||this.voices.size>=6||this.ctx.state!=='running')return;
    const s=this.ctx.createBufferSource(),g=this.ctx.createGain(),t=this.ctx.currentTime;s.buffer=this.buffers[key];s.loop=loop;
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+(loop?.8:.08));
    if(!loop){const end=t+s.buffer.duration;g.gain.setValueAtTime(volume,Math.max(t+.08,end-.22));g.gain.linearRampToValueAtTime(0,end);}
    s.connect(g);g.connect(this.master);const v={s,g,loop,stopping:false};this.voices.add(v);
    s.onended=()=>{s.disconnect();g.disconnect();this.voices.delete(v);};s.start();
  }
  play(kind){
    if(!this.enabled||!this.ctx)return;
    const key={grow:'growth',melt:'frost',crack:'frost',shatter:'shed'}[kind];if(!key)return;
    const t=this.ctx.currentTime,cooldown=key==='growth'?.75:key==='frost'?.55:1;
    if(t-(this.last[key]??-100)<cooldown)return;this.last[key]=t;this.start(key,false,key==='growth'?.6:.7);
  }
  stop(){if(!this.ctx)return;for(const v of this.voices){if(v.stopping)continue;v.stopping=true;v.g.gain.cancelScheduledValues(this.ctx.currentTime);v.g.gain.setTargetAtTime(0,this.ctx.currentTime,.06);try{v.s.stop(this.ctx.currentTime+.3);}catch{}}}
  debug(){let peak=0;if(this.analyser&&this.enabled){const a=new Float32Array(this.analyser.fftSize);this.analyser.getFloatTimeDomainData(a);for(const v of a)peak=Math.max(peak,Math.abs(v));}return{enabled:this.enabled,state:this.ctx?.state||'not-created',voices:this.voices.size,peak};}
  destroy(){this.enabled=false;this.dead=true;this.stop();this.ctx?.close();this.buffers={};this.voices.clear();}
};

;
/* Public controller. Event time is in seconds relative to mount, positions in CSS pixels. */
(() => {
  'use strict';
  const F=FrostMaterial,M=Motion,instances=new WeakMap(),splitter=globalThis.Intl?.Segmenter?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
  const chars=s=>splitter?[...splitter.segment(String(s))].map(x=>x.segment):Array.from(String(s));
  const fontName=f=>F.fonts[f]||F.fonts.playfair;
  const clean=s=>chars(String(s).replace(/[\r\n\t]/g,' ').replace(/[\u0000-\u001f\u007f]/g,'')).slice(0,40);
  const SCRIPT=[{t:.50,op:'type',text:'T'},{t:.68,op:'type',text:'y'},{t:.86,op:'type',text:'p'},{t:1.04,op:'type',text:'e'},{t:1.90,op:'space'},{t:2.35,op:'type',text:'F'},{t:2.53,op:'type',text:'r'},{t:2.71,op:'type',text:'o'},{t:2.89,op:'type',text:'s'},{t:3.07,op:'type',text:'t'},{t:5.20,op:'backspace'},{t:5.55,op:'backspace'},{t:6.15,op:'type',text:'s'},{t:6.40,op:'type',text:'t'},{t:8.20,op:'shatter'},{t:9.30,op:'type',text:'F'},{t:9.48,op:'type',text:'r'},{t:9.66,op:'type',text:'o'},{t:9.84,op:'type',text:'s'},{t:10.02,op:'type',text:'t'}];
  function mount(el,options={}){
    if(!(el instanceof HTMLElement))throw new TypeError('TypeFrost.mount expects an element');
    instances.get(el)?.destroy();
    const opt={theme:'Frozen',font:'playfair',growth:1,density:1,length:1,glow:.8,sound:false,seed:20261014,film:false,sample:true,...options};
    if(!F.fonts[opt.font])opt.font='playfair';
    let color=F.themes[opt.theme]||(/^#[\da-f]{6}$/i.test(opt.theme)?opt.theme:F.themes.Frozen);
    for(const k of ['growth','density','length','glow'])opt[k]=M.clamp(Number.isFinite(Number(opt[k]))?Number(opt[k]):1,k==='glow'?0:.5,k==='glow'?1.5:1.6);
    const abort=new AbortController(),signal=abort.signal,media=matchMedia('(prefers-reduced-motion: reduce)'),audio=new FrostAudio();
    const canvas=F.canvas(1,1),ctx=canvas.getContext('2d'),content=F.canvas(1,1),cg=content.getContext('2d'),settledLayer=F.canvas(1,1);
    let settledKey='',sparkBudget=25,composition=null,previousComposition=null,compositionKey='',compositionRevision=0;
    canvas.className='tf-canvas';canvas.setAttribute('aria-hidden','true');
    const externalInput=opt.inputElement instanceof HTMLInputElement||opt.inputElement instanceof HTMLTextAreaElement;
    const input=externalInput?opt.inputElement:document.createElement('textarea');if(!externalInput){input.className='tf-input';input.setAttribute('aria-label','Type on the frozen glass');input.rows=1;}input.autocapitalize='off';input.setAttribute('autocorrect','off');input.spellcheck=false;input.setAttribute('enterkeyhint','done');
    const description=document.createElement('span');description.className='tf-sr';description.textContent='Type to grow frost. Space cracks the ice. Backspace melts a letter. Enter shatters the glass.';
    const priorPosition=el.style.position;if(getComputedStyle(el).position==='static')el.style.position='relative';el.classList.add('type-frost');el.append(canvas,description);if(!externalInput)el.append(input);
    let destroyed=false,loaded=false,raf=0,start=performance.now(),manual=false,current=0,lastRender=-1,W=1,H=1,dpr=1,size=100;
    let items=[],ghosts=[],cracks=[],shards=[],shardImage=null,breaths=[],hits=[],hitOffset=0,events=[],serial=0,sample=!!opt.sample,composing=false,lastBreath=-1,pointer=null;
    let script=null,scriptIndex=0,replaying=false,fontRevision=0,resizePending=false;
    const clock=()=>manual?current:(performance.now()-start)/1000;
    const simulation=t=>media.matches?t:M.hitStop(t,hits.filter(h=>M.TIERS[h[1]].stop).map(h=>[h[0],M.TIERS[h[1]].stop]))-hitOffset;
    const listen=(target,name,fn,opts={})=>target.addEventListener(name,fn,{...opts,signal});
    const stateText=()=>items.map(g=>g.ch).join('');
    function invalidate(){settledKey='';settledLayer.width=settledLayer.height=1;}
    function clearAssets(){invalidate();if(composition)F.dispose(composition.asset);if(previousComposition)F.dispose(previousComposition.asset);composition=previousComposition=null;compositionKey='';for(const g of items)if(g.asset)F.dispose(g.asset);for(const g of ghosts)if(g.asset)F.dispose(g.asset);items=[];ghosts=[];cracks=[];breaths=[];shards=[];if(shardImage){shardImage.width=shardImage.height=1;shardImage=null;}cg.clearRect(0,0,content.width,content.height);}
    function reset(t=0){clearAssets();hits=[];hitOffset=0;events=[];serial=0;scriptIndex=0;current=t;lastRender=-1;sample=!!opt.sample&&!script;input.value='';if(sample){items=chars('Frost').map(ch=>({ch,id:serial++,born:-20}));layout(0);} }
    function sizeToFit(){
      const probe=ctx;let fs=Math.min(330,W*(opt.film?.31:.28),H*.32);fs=Math.max(24,fs);
      const available=W*(W<600?.67:.70),height=H*.52;let rows;
      if(W/H>1.4&&items.length>7){probe.font=`400 100px "${fontName(opt.font)}"`;const total=items.reduce((n,g)=>n+(g.ch===' '?32:probe.measureText(g.ch).width+2.5),0);const single=W*.76/Math.max(1,total)*100;if(single>=Math.min(72,H*.11))return{fs:Math.min(fs,Math.floor(single)),rows:[{width:0,items:items.map(item=>({item,advance:0}))}]};}
      for(let k=0;k<30;k++){
        probe.font=`400 ${fs}px "${fontName(opt.font)}"`;rows=[{width:0,items:[]}];const groups=[];let group=[];
        for(const item of items){const q={item,advance:item.ch===' '?fs*.32:probe.measureText(item.ch).width+fs*.025};if(item.ch===' '){if(group.length)groups.push(group);groups.push([q]);group=[];}else group.push(q);}if(group.length)groups.push(group);
        if(groups.some(g=>g.reduce((n,q)=>n+q.advance,0)>available)&&fs>25){fs*=.9;continue;}
        for(const group of groups){let row=rows.at(-1);const width=group.reduce((n,q)=>n+q.advance,0);if(row.width+width>available&&row.items.length&&group[0].item.ch!==' '){row={width:0,items:[]};rows.push(row);}for(const q of group){if(row.width+q.advance>available&&row.items.length&&q.item.ch!==' '){row={width:0,items:[]};rows.push(row);}row.items.push(q);row.width+=q.advance;}}
        if(rows.length*fs*1.32<=height||fs<=25)break;fs*=.9;
      }
      return {fs:Math.round(fs),rows};
    }
    function layout(t){
      if(!loaded)return;invalidate();const found=sizeToFit();size=found.fs;
      // Re-measure at the rounded font size so geometry and positioning agree.
      ctx.font=`400 ${size}px "${fontName(opt.font)}"`;const top=H*.49-(found.rows.length*size*1.32)/2;
      found.rows.forEach((row,ri)=>{
        row.width=row.items.reduce((n,q)=>n+(q.advance=q.item.ch===' '?size*.32:ctx.measureText(q.item.ch).width+size*.025),0);
        let x=(W-row.width)/2;
        row.items.forEach(({item:g,advance},i)=>{
          const gx=x,gy=top+ri*size*1.32+size*.99;
          const prior=g.x!==undefined?glyphState(g,simulation(t)):null;g.track=prior;g.fx=prior?.x.value??gx;g.fy=prior?.y.value??gy;g.displaySize=size;
          g.x=gx;g.y=gy;g.moved=simulation(t);g.advance=advance;g.row=ri;
          if(g.ch!==' '){const key=[g.ch,size,opt.font,color,dpr].join('|');if(g.key!==key){if(g.asset)F.dispose(g.asset);g.asset=F.glyph(g.ch,size,opt.font,F.hash(`${opt.seed}:${g.id}:${g.ch}`),{...opt,color,dpr});g.key=key;}g.scale=1;}
          x+=advance;
        });
      });
      const nextKey=items.map(g=>`${g.ch}:${g.x}:${g.y}:${g.key}`).join('|')+JSON.stringify([opt.density,opt.length,opt.growth,W,H,dpr]);
      if(nextKey!==compositionKey){
        if(previousComposition)F.dispose(previousComposition.asset);previousComposition=null;
        if(composition){F.update(composition.asset,simulation(t)-composition.born);previousComposition={...composition,t0:simulation(t)};}
        const asset=F.compose(items,size,W,H,{...opt,color,dpr});
        if(asset&&previousComposition)F.retarget(asset,previousComposition.asset,simulation(t)-previousComposition.born);
        composition=asset?{asset,born:!previousComposition&&items.every(g=>g.born<0)?simulation(t)-20:simulation(t)}:null;compositionKey=nextKey;compositionRevision++;
      }
    }
    function glyphState(g,t){const values={x:g.x,y:g.y,size:g.displaySize??g.asset?.size??size},out={};for(const [key,target]of Object.entries(values)){const from=g.track?.[key];out[key]=!media.matches&&from?M.follow(from.value,from.velocity,target,t-g.moved):{value:target,velocity:0};}return out;}
    function position(g,t){const p=glyphState(g,t);return{x:p.x.value,y:p.y.value,size:p.size.value};}
    function emit(kind,t,at={},extra={}){
      const detail={time:t,x:at.x??W/2,y:at.y??H*.49,index:serial,...extra};
      if(!replaying){el.dispatchEvent(new CustomEvent(`frost:${kind}`,{detail}));audio.play(kind,serial,extra.strength??1);}
      events.push({type:`frost:${kind}`,...detail});if(events.length>256)events.shift();
    }
    function hit(t,tier){if(media.matches||tier!=='large')return;hits.push([t,tier]);if(hits.length>128){const old=hits.shift();hitOffset+=M.TIERS[old[1]].stop*.95;}}
    function retire(g,t){if(!g?.asset)return;if(media.matches){F.dispose(g.asset);return;}g.asset.fastMelt=!opt.film;const p=position(g,simulation(t));ghosts.push({...g,x:p.x,y:p.y,displaySize:p.size,track:null,fx:p.x,fy:p.y,t0:simulation(t),ageAt:Math.max(0,simulation(t)-g.born)});if(ghosts.length>40){const old=ghosts.shift();F.dispose(old.asset);}}
    function beginTyping(t){if(!sample)return;sample=false;for(const g of items)retire(g,t);items=[];input.value='';if(composition)F.dispose(composition.asset);if(previousComposition)F.dispose(previousComposition.asset);composition=previousComposition=null;compositionKey='';}
    function type(text,t=clock()){
      if(!loaded||destroyed)return;beginTyping(t);
      const added=[];for(const ch of clean(text)){if(items.length>=40)break;const g={ch,id:serial++,born:simulation(t)};items.push(g);added.push(g);}layout(t);
      for(const g of added){if(g.ch===' ')makeCrack(g,t);else{hit(t,'small');emit('grow',t,{x:g.x+g.advance/2,y:g.y-size*.4},{char:g.ch});}}
      input.value=stateText();input.setSelectionRange(input.value.length,input.value.length);
    }
    function space(t=clock()){
      if(!loaded||destroyed||items.length>=40)return;beginTyping(t);const g={ch:' ',id:serial++,born:simulation(t)};items.push(g);layout(t);
      makeCrack(g,t);input.value=stateText();
    }
    function makeCrack(g,t){
      const rng=F.random(F.hash(`${opt.seed}:${g.id}:crack`)),points=[[g.x,g.y-size*.7]];let x=g.x,y=g.y-size*.7;
      for(let i=0;i<12;i++){x+=(rng()-.48)*size*.12;y+=size*.105;points.push([x,y]);}
      cracks.push({points,t0:simulation(t)});if(cracks.length>8)cracks.shift();hit(t,'medium');emit('crack',t,{x:g.x,y:g.y-size*.3});
    }
    function backspace(t=clock()){
      if(!loaded||destroyed)return;beginTyping(t);const g=items.pop();if(!g)return;retire(g,t);layout(t);hit(t,'small');emit('melt',t,{x:g.x+g.advance/2,y:g.y-size*.4},{char:g.ch});input.value=stateText();
    }
    function shatter(t=clock()){
      if(!loaded||destroyed)return;
      paint(t);const rng=F.random(F.hash(`${opt.seed}:${serial++}:shatter`));
      if(shardImage){shardImage.width=shardImage.height=1;}shardImage=F.canvas(content.width,content.height);shardImage.getContext('2d').drawImage(content,0,0);
      invalidate();for(const g of [...items,...ghosts])if(g.asset)F.dispose(g.asset);items=[];ghosts=[];cracks=[];breaths=[];sample=false;input.value='';shards=[];
      if(composition)F.dispose(composition.asset);if(previousComposition)F.dispose(previousComposition.asset);composition=previousComposition=null;compositionKey='';F.clearWinterCache();
      if(!media.matches){const cols=7,rows=5,cw=W/cols,ch=H/rows;for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
        const cx=(x+.5)*cw,cy=(y+.5)*ch,dx=cx-W*.5,dy=cy-H*.49,n=Math.hypot(dx,dy)||1;
        shards.push({x:x*cw,y:y*ch,w:cw,h:ch,cx,cy,vx:dx/n*(80+rng()*230),vy:dy/n*(80+rng()*180)-50,spin:(rng()-.5)*3,t0:simulation(t)+rng()*.045,cut:.25+rng()*.5});
      }}else{shardImage.width=shardImage.height=1;shardImage=null;}
      hit(t,'large');emit('shatter',t,{x:W*.5,y:H*.49});
    }
    function setText(text,t=clock()){if(!loaded||destroyed)return;clearAssets();sample=false;items=clean(text).map(ch=>({ch,id:serial++,born:simulation(t)-20}));layout(t);input.value=stateText();}
    function drawGlyph(g,st,fade=1,melt=null,tips=true){
      if(!g.asset)return;const a=g.asset,age=media.matches?100:melt===null?st-g.born:melt;if(age<0)return;F.update(a,age);
      const pos=position(g,st),blur=media.matches?{o:1,blur:0}:{o:M.smooth((st-g.born)/.30),blur:0},spring=1;
      cg.save();
      const scale=pos.size/a.size;cg.translate(pos.x+a.advance*scale/2,pos.y-a.size*scale*.35);cg.scale(spring*scale,spring*scale);cg.translate(-a.advance/2,-a.size*-.35);
      cg.globalAlpha=fade*blur.o;const x=-a.pad,y=-a.baseline;
      cg.globalAlpha=fade*blur.o;cg.drawImage(a.ink,x,y,a.w,a.h);F.drawLetterSnow(cg,a,age,x,y);
      if(melt===null&&tips)drawTips(a,age,st,x,y);cg.restore();
    }
    function drawTips(a,age,st,x,y){
      const limit=a.fg?20:Math.max(1,Math.ceil(25/Math.max(1,items.length)));for(const p of a.tips.slice(0,limit)){const node=a.kind==='winter'?a.nodes.find(n=>n.key===p.nodeKey):null,tipAge=age+(node?.offset||0);if(tipAge<p.t||sparkBudget<=0)continue;sparkBudget--;const pulse=media.matches?.75:.55+.3*M.breathe(st,6,1,p.phase)+.45*M.flash(tipAge,p.t,.22),tip=F.tipPosition?.(a,p)||p,px=x+tip.x,py=y+tip.y;
        if(opt.glow){const halo=cg.createRadialGradient(px,py,0,px,py,Math.max(3,a.size*.022));halo.addColorStop(0,`rgba(222,244,255,${M.clamp(pulse)*.7*opt.glow})`);halo.addColorStop(1,'rgba(160,189,219,0)');cg.fillStyle=halo;const r=Math.max(3,a.size*.022);cg.fillRect(px-r,py-r,r*2,r*2);}
        cg.fillStyle=`rgba(244,250,255,${M.clamp(pulse)})`;const r=Math.min(1.4,Math.max(.6,a.size/280))*p.r;cg.fillRect(px-r,py-r,2*r,2*r);
      }
    }
    function paint(t){
      if(!loaded||destroyed)return;const started=performance.now();current=t;
      const j=media.matches?{t,x:0,y:0,rot:0,zoom:1}:M.juice(t,hits,{x:5,y:3,rot:.32});const st=j.t-hitOffset;
      cg.setTransform(dpr,0,0,dpr,0,0);cg.clearRect(0,0,W,H);sparkBudget=25;
      if(previousComposition&&(media.matches||st-previousComposition.t0>.35)){F.dispose(previousComposition.asset);previousComposition=null;}
      F.motionTime=media.matches?0:st;F.motionEnabled=!media.matches;
      const settled=!(composition?.asset.kind==='winter'&&!media.matches)&&items.length>0&&!previousComposition&&(!composition||st-composition.born>composition.asset.maxAge)&&items.every(g=>!g.asset||(st-g.born>.2&&st-g.moved>.7));
      const key=settled?items.map(g=>g.id+':'+g.key+':'+g.x+':'+g.y).join(';')+':'+opt.glow+':'+compositionRevision:'';
      if(settled&&key===settledKey)cg.drawImage(settledLayer,0,0,settledLayer.width,settledLayer.height,0,0,W,H);
      else{
        if(previousComposition){cg.save();cg.globalAlpha=1-M.smooth((st-previousComposition.t0)/.35);cg.translate(0,7*M.smooth((st-previousComposition.t0)/.35));F.drawComposition(cg,previousComposition.asset,st-previousComposition.born,false,true);F.drawComposition(cg,previousComposition.asset,st-previousComposition.born,true,true);cg.restore();}
        if(composition){const a=composition.asset,age=media.matches?100:st-composition.born;F.update(a,age);F.drawComposition(cg,a,age,false);F.partial(cg,a,age);}
        for(const g of items)drawGlyph(g,st,1,null,false);
        if(composition)F.drawComposition(cg,composition.asset,media.matches?100:st-composition.born,true);
        if(settled){settledLayer.width=content.width;settledLayer.height=content.height;settledLayer.getContext('2d').drawImage(content,0,0);settledKey=key;}
      }
      if(composition)drawTips(composition.asset,media.matches?100:st-composition.born,st,0,0);
      if(!media.matches)F.drawVisitor(cg,composition?.asset||{w:W,h:H,nodes:[]},st);
      for(let i=ghosts.length-1;i>=0;i--){const g=ghosts[i],u=(st-g.t0)/.72;if(u>=1.4){F.dispose(g.asset);ghosts.splice(i,1);continue;}if(u<1)drawGlyph(g,st,1-M.smooth(u),g.ageAt*(1-M.smooth(u)));
        if(u>0&&u<1.4){for(let k=0;k<4;k++){const x=g.x+g.advance*(.12+k*.23),y=g.y+(u*u*48)+(k%2)*8,opacity=Math.max(0,1-u/1.4)*.6;cg.strokeStyle=`rgba(160,189,219,${opacity*.2})`;cg.lineWidth=1;cg.beginPath();cg.moveTo(x,g.y);cg.lineTo(x,y);cg.stroke();cg.fillStyle=`rgba(221,240,250,${opacity})`;cg.beginPath();cg.ellipse(x,y,1.3,2.5,0,0,Math.PI*2);cg.fill();}}
      }
      for(const cr of cracks){const age=st-cr.t0;if(age<0)continue;const p=media.matches?1:M.clamp(age/.16),n=Math.ceil(cr.points.length*p);cg.lineWidth=.65;cg.strokeStyle=`rgba(236,247,255,${.4*Math.exp(-age*.35)})`;cg.beginPath();cr.points.slice(0,n).forEach(([x,y],i)=>i?cg.lineTo(x,y):cg.moveTo(x,y));cg.stroke();if(!media.matches&&age<.35){const end=cr.points[Math.max(0,n-1)];cg.fillStyle=`rgba(244,250,255,${M.flash(age,.08,.09)})`;cg.fillRect(end[0]-1,end[1]-1,2,2);}}
      cracks=cracks.filter(cr=>st-cr.t0<8);
      if(shardImage){for(const s of shards){const age=st-s.t0;if(age<0||age>1.45)continue;const x=s.cx+s.vx*age,y=s.cy+s.vy*age+190*age*age,opacity=1-M.smooth((age-.45)/1),vel=[s.vx,s.vy+380*age];
        cg.save();cg.translate(x,y);cg.rotate(s.spin*age);cg.globalAlpha=opacity;
        const poly=M.smear([[-s.w/2,-s.h/2],[s.w/2,-s.h/2+s.h*s.cut],[s.w/2,s.h/2],[-s.w/2,s.h/2-s.h*s.cut]],vel,1+Math.min(.15,M.motionBlur(Math.hypot(...vel)/60,.23)/40));
        cg.beginPath();poly.forEach(([px,py],i)=>i?cg.lineTo(px,py):cg.moveTo(px,py));cg.closePath();cg.clip();
        const trail=M.motionBlur(Math.hypot(...vel)/60,.23);for(let k=opt.film?2:0;k>=0;k--){cg.globalAlpha=opacity*(k?.10:1);cg.drawImage(shardImage,s.x*dpr,s.y*dpr,s.w*dpr,s.h*dpr,-s.w/2-vel[0]/60*k*.25,-s.h/2-vel[1]/60*k*.25,s.w,s.h);}
        cg.globalAlpha=opacity*.09;cg.strokeStyle='#a0bddb';cg.lineWidth=Math.min(1,trail+.25);cg.stroke();cg.restore();}
        if(shards.every(s=>st-s.t0>1.45)){shards=[];shardImage.width=shardImage.height=1;shardImage=null;}
      }
      breaths=breaths.filter(p=>t-p.t<5);if(breaths.length){cg.save();cg.globalCompositeOperation='destination-out';for(const p of breaths){const age=t-p.t,strength=media.matches?.8:Math.exp(-Math.max(0,age-.2)*1.05),r=Math.max(20,Math.min(65,W*.12));const grad=cg.createRadialGradient(p.x,p.y,r*.2,p.x,p.y,r);grad.addColorStop(0,`rgba(0,0,0,${strength})`);grad.addColorStop(1,'rgba(0,0,0,0)');cg.fillStyle=grad;cg.fillRect(p.x-r,p.y-r,r*2,r*2);}cg.restore();}
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);ctx.save();ctx.translate(W/2+j.x,H/2+j.y);ctx.rotate(j.rot*Math.PI/180);ctx.scale(j.zoom,j.zoom);ctx.drawImage(content,0,0,content.width,content.height,-W/2,-H/2,W,H);ctx.restore();
      if(!externalInput&&!opt.film&&!shardImage&&(document.activeElement===input||sample||!items.length)){
        const last=items.at(-1),x=last?last.x+last.advance+4:W/2,y=last?last.y:H*.49+size*.4;ctx.globalAlpha=media.matches?.65:.35+.35*Math.cos(t*Math.PI*2);ctx.fillStyle='#d2e7f3';ctx.fillRect(x,y-size*.72,1.3,size*.75);ctx.globalAlpha=1;
      }
      lastRender=t;api.lastFrameMs=performance.now()-started;
    }
    function applyEvent(e){const t=e.t;if(e.op==='type')type(e.text,t);else if(e.op==='space')space(t);else if(e.op==='backspace')backspace(t);else if(e.op==='shatter')shatter(t);else if(e.op==='setText')setText(e.text,t);}
    function renderAt(t){if(!Number.isFinite(t)||t<0)throw new RangeError('renderAt needs a non-negative time');manual=true;cancelAnimationFrame(raf);if(!loaded||destroyed)return;
      replaying=!!script;try{if(script){if(t<lastRender)reset(0);while(scriptIndex<script.length&&script[scriptIndex].t<=t)applyEvent(script[scriptIndex++]);}paint(t);}finally{replaying=false;}return api.lastFrameMs;
    }
    function resize(){if(destroyed)return;const w=Math.max(1,el.clientWidth),h=Math.max(1,el.clientHeight),ratio=Math.min(2,devicePixelRatio||1);if(W===w&&H===h&&dpr===ratio)return;W=w;H=h;dpr=ratio;canvas.width=content.width=Math.ceil(W*dpr);canvas.height=content.height=Math.ceil(H*dpr);layout(clock());if(loaded)paint(clock());}
    const observer=new ResizeObserver(()=>{if(resizePending)return;resizePending=true;queueMicrotask(()=>{resizePending=false;resize();});});observer.observe(el);
    function run(){if(destroyed||manual)return;if(!document.hidden)paint(clock());raf=requestAnimationFrame(run);}
    function syncInput(){
      if(composing)return;const next=clean(input.value).join(''),prev=sample?'':stateText();if(next===prev)return;
      const selection=input.selectionStart,a=chars(prev),b=chars(next);let prefix=0,suffix=0;
      while(prefix<a.length&&prefix<b.length&&a[prefix]===b[prefix])prefix++;
      while(suffix<a.length-prefix&&suffix<b.length-prefix&&a[a.length-1-suffix]===b[b.length-1-suffix])suffix++;
      const t=clock();beginTyping(t);
      const added=b.slice(prefix,b.length-suffix).map(ch=>({ch,id:serial++,born:simulation(t)}));
      const removed=items.splice(prefix,a.length-prefix-suffix,...added);
      for(const g of removed){retire(g,t);emit('melt',t,{x:g.x+g.advance/2,y:g.y-size*.4},{char:g.ch});}
      layout(t);
      for(const g of added){if(g.ch===' ')makeCrack(g,t);else emit('grow',t,{x:g.x+g.advance/2,y:g.y-size*.4},{char:g.ch});}
      input.value=stateText();input.setSelectionRange(Math.min(selection,input.value.length),Math.min(selection,input.value.length));
    }
    listen(input,'compositionstart',()=>{composing=true;});listen(input,'compositionend',()=>{composing=false;syncInput();});listen(input,'input',syncInput);
    listen(input,'keydown',e=>{if(e.isComposing)return;if(e.key==='Enter'){e.preventDefault();shatter();}if(e.key==='Escape')input.blur();});
    listen(input,'beforeinput',e=>{if(!e.isComposing&&(e.inputType==='insertLineBreak'||e.inputType==='insertParagraph')){e.preventDefault();shatter();}});
    listen(canvas,'pointerdown',e=>{if(!loaded)return;e.preventDefault();input.focus({preventScroll:true});if(opt.sound&&!audio.enabled)void audio.enable(true);if(e.pointerType!=='mouse')canvas.setPointerCapture(e.pointerId);pointer={x:e.offsetX,y:e.offsetY,t:clock()};});
    listen(input,'keydown',()=>{if(opt.sound&&!audio.enabled)void audio.enable(true);});
    listen(canvas,'pointermove',e=>{if(!loaded)return;const t=clock(),r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(t-lastBreath<.035)return;const speed=pointer?Math.hypot(x-pointer.x,y-pointer.y)/Math.max(.016,t-pointer.t):0;pointer={x,y,t};if(speed<8)return;lastBreath=t;breaths.push({x,y,t});if(breaths.length>32)breaths.shift();if(t-(api.lastBreathSound||-1)>.13){emit('breath',t,{x,y},{strength:M.clamp(speed/700)});api.lastBreathSound=t;}});
    listen(canvas,'pointerleave',()=>{pointer=null;});
    listen(media,'change',()=>{layout(clock());paint(clock());});
    async function setFont(font){if(!F.fonts[font])throw new TypeError('Unknown frost font');const rev=++fontRevision;await document.fonts.load(`400 100px "${fontName(font)}"`,'Frost Я');if(destroyed||rev!==fontRevision)return;opt.font=font;layout(clock());paint(clock());}
    function setTheme(theme){if(!F.themes[theme]&&!/^#[\da-f]{6}$/i.test(theme))throw new TypeError('Use a theme name or #rrggbb');opt.theme=theme;color=F.themes[theme]||theme;layout(clock());paint(clock());}
    function configure(patch){for(const k of ['growth','density','length','glow'])if(k in patch&&Number.isFinite(+patch[k]))opt[k]=M.clamp(+patch[k],k==='glow'?0:.5,k==='glow'?1.5:1.6);if('film'in patch){opt.film=!!patch.film;resize();}layout(clock());paint(clock());}
    function loadScript(value=SCRIPT){if(!Array.isArray(value)||value.length>256)throw new TypeError('Script must be an array of at most 256 events');const allowed=['type','space','backspace','shatter','setText'];for(const e of value)if(!Number.isFinite(e.t)||e.t<0||!allowed.includes(e.op)||(e.op==='type'&&typeof e.text!=='string'))throw new TypeError('Invalid script event');script=value.map(e=>({...e})).sort((a,b)=>a.t-b.t);manual=true;cancelAnimationFrame(raf);reset(0);renderAt(0);}
    function destroy(){if(destroyed)return;destroyed=true;cancelAnimationFrame(raf);observer.disconnect();abort.abort();audio.destroy();clearAssets();F.clearWinterCache();events=[];hits=[];script=null;canvas.width=canvas.height=content.width=content.height=1;canvas.remove();if(!externalInput)input.remove();description.remove();el.classList.remove('type-frost');el.style.position=priorPosition;instances.delete(el);}
    const api={type,space,backspace,shatter,setText,setTheme,setFont,destroy,configure,renderAt,loadScript,focus:()=>input.focus({preventScroll:true}),setSound:async on=>{opt.sound=!!on;await audio.enable(on);return audio.enabled;},getOptions:()=>({...opt}),getText:stateText,getCues:()=>events.map(e=>({...e})),lastFrameMs:0,
      debug:()=>({glyphPoses:items.map(g=>({id:g.id,ch:g.ch,...position(g,simulation(current)),velocity:glyphState(g,simulation(current))})),plantPoses:composition?.asset.nodes.filter(n=>n.renderPose).map(n=>({key:n.key,kind:n.kind,...n.renderPose}))||[],plantAges:composition?.asset.nodes.map(n=>({key:n.key,kind:n.kind,life:(simulation(current)-composition.born+n.offset-n.delay)*composition.asset.growth}))||[],winterNodes:composition?.asset.nodes?.length||0,rootErrors:composition?.asset.rootErrors||[],winterCacheBytes:F.winterCacheBytes(),text:stateText(),sample,width:W,height:H,dpr,fontSize:size,items:items.length,segments:composition?.asset.segments.length||0,compositionRoots:composition?.asset.roots||0,compositionBounds:composition?.asset.box||null,ghostSegments:previousComposition?.asset.segments.length||0,ghosts:ghosts.length,shards:shards.length,breaths:breaths.length,assetBytes:[...items,...ghosts].reduce((n,g)=>n+(g.asset?['ink','halo','frozen','blurred','snow'].reduce((sum,k)=>sum+g.asset[k].width*g.asset[k].height*4,0):0),0)+[composition,previousComposition].reduce((n,c)=>n+(c?c.asset.frozen.width*c.asset.frozen.height*4:0),0)+(shardImage?shardImage.width*shardImage.height*4:0)+(settledLayer.width>1?settledLayer.width*settledLayer.height*4:0),eventCount:events.length,hitCount:hits.length,audio:audio.debug(),frameMs:api.lastFrameMs,destroyed})};
    api.ready=(async()=>{await document.fonts.load(`400 100px "${fontName(opt.font)}"`,'Frost Я');if(destroyed)return api;loaded=true;resize();reset(0);if(options.text!==undefined)setText(options.text,0);paint(0);if(options.script)loadScript(options.script===true?SCRIPT:options.script);else run();return api;})();
    instances.set(el,api);return api;
  }
  globalThis.TypeFrost=Object.freeze({mount,themes:{...F.themes},fonts:{...F.fonts},script:SCRIPT.map(e=>({...e})),version:'1.8.0'});
})();

})();