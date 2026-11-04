import * as React from 'react'

/*
 * Pixel Headline (plain JSX): a headline set in a pixel face drawn in code, where every pixel is a
 * small square painted on ONE canvas (hundreds of SVG nodes made the page janky, so none are used). When it comes into view the pixels fly in from everywhere and assemble
 * the words; they step aside from the pointer and spring back, and now and then a few catch the
 * accent colour. A real text copy sits underneath for screen readers. No font file is loaded.
 */

// Rows top to bottom, `#` lit. Capitals are 7 rows; lowercase descends into row 8.
const GLYPHS = {
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.###./#...#/#..../#..../#..../#...#/.###.',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####',
  F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.####',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '###/.#./.#./.#./.#./.#./###',
  J: '..###/...#./...#./...#./...#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  N: '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/#.#.#/.#.#.',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '#####/....#/...#./..#../.#.../#..../#####',
  a: '...../...../.###./....#/.####/#...#/.####',
  b: '#..../#..../####./#...#/#...#/#...#/####.',
  c: '..../..../.###/#.../#.../#.../.###',
  d: '....#/....#/.####/#...#/#...#/#...#/.####',
  e: '...../...../.###./#...#/#####/#..../.###.',
  f: '.##/#../###/#../#../#../#..',
  g: '...../...../.####/#...#/#...#/.####/....#/.###.',
  h: '#..../#..../####./#...#/#...#/#...#/#...#',
  i: '#/./#/#/#/#/#',
  j: '..#/.../..#/..#/..#/..#/..#/##.',
  k: '#.../#.../#..#/#.#./##../#.#./#..#',
  l: '#./#./#./#./#./#./.#',
  m: '...../...../##.#./#.#.#/#.#.#/#...#/#...#',
  n: '...../...../####./#...#/#...#/#...#/#...#',
  o: '...../...../.###./#...#/#...#/#...#/.###.',
  p: '...../...../####./#...#/#...#/####./#..../#....',
  q: '...../...../.####/#...#/#...#/.####/....#/....#',
  r: '..../..../#.##/##../#.../#.../#...',
  s: '...../...../.####/#..../.###./....#/####.',
  t: '.#../.#../####/.#../.#../.#../..##',
  u: '...../...../#...#/#...#/#...#/#...#/.####',
  v: '...../...../#...#/#...#/#...#/.#.#./..#..',
  w: '...../...../#...#/#...#/#.#.#/#.#.#/.#.#.',
  x: '...../...../#...#/.#.#./..#../.#.#./#...#',
  y: '...../...../#...#/#...#/#...#/.####/....#/.###.',
  z: '...../...../#####/...#./..#../.#.../#####',
  0: '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
  1: '..#../.##../..#../..#../..#../..#../.###.',
  2: '.###./#...#/....#/...#./..#../.#.../#####',
  3: '####./....#/....#/.###./....#/....#/####.',
  4: '...#./..##./.#.#./#..#./#####/...#./...#.',
  5: '#####/#..../####./....#/....#/#...#/.###.',
  6: '.###./#..../#..../####./#...#/#...#/.###.',
  7: '#####/....#/...#./..#../.#.../.#.../.#...',
  8: '.###./#...#/#...#/.###./#...#/#...#/.###.',
  9: '.###./#...#/#...#/.####/....#/....#/.###.',
  '.': '././././././#',
  ',': '././././././#/#',
  "'": '#/#/././././.',
  '!': '#/#/#/#/#/./#',
  '?': '.###./#...#/....#/...#./..#../...../..#..',
  '-': '.../.../.../###/.../.../...',
  ':': '././#/././././#',
  '/': '....#/...#./...#./..#../.#.../.#.../#....',
  '&': '.##../#..#./#.#../.#.../#.#.#/#..#./.##.#',
}

/** Lays a line of text out on the pixel grid: one cell per lit pixel, one blank column between glyphs, 3 columns for a space. */
export function layoutPixels(text) {
  const glyphs = []
  let x = 0
  for (const ch of text) {
    const g = GLYPHS[ch] || GLYPHS[ch.toUpperCase()]
    if (!g) { x += 3; continue }
    const rows = g.split('/')
    const w = Math.max(...rows.map((r) => r.length))
    const cells = []
    rows.forEach((r, y) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') cells.push([x + i, y]) })
    glyphs.push({ x, w, cells })
    x += w + 1
  }
  return { width: Math.max(1, x - 1), height: 8, glyphs }
}

const useIsoLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect

function useReducedMotion() {
  const [reduced, setReduced] = React.useState(false)
  useIsoLayoutEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

const rand = (a, b) => a + Math.random() * (b - a)
const easeOut = (t) => 1 - Math.pow(1 - t, 3)

export default function PixelHeadline({
  lines = ['Describe an app', "We'll build it"],
  as: Tag = 'h1',
  pixelSize = 'clamp(3.4px, .62vw + 1.6px, 8.2px)',
  color = '#ffffff',
  accent = '#a9dcff',
  assemble = 'view',
  repel = true,
  shimmer = true,
  align = 'center',
  className,
}) {
  const reduced = useReducedMotion()
  const rootRef = React.useRef(null)
  const canvasRef = React.useRef(null)
  const probeRef = React.useRef(null)
  const key = lines.join('|')

  useIsoLayoutEffect(() => {
    const root = rootRef.current, canvas = canvasRef.current, probe = probeRef.current
    if (!root || !canvas || !probe) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const laid = lines.map((l) => layoutPixels(l))
    const widest = Math.max(...laid.map((l) => l.width + 1))
    const rowH = laid[0].height + 1            // one line's height in pixel units
    const gapU = 2.1                            // gap between lines, in pixel units
    const totalH = laid.length * rowH + (laid.length - 1) * gapU

    // particles: home position in pixel units, current offset, delay, lit state
    const P = []
    laid.forEach((lay, li) => {
      const oy = li * (rowH + gapU)
      const ox = align === 'left' ? 0 : (widest - (lay.width + 1)) / 2
      lay.glyphs.forEach((g) => g.cells.forEach(([cx, cy]) => {
        P.push({ hx: ox + cx, hy: oy + cy, ox: rand(-30, 30), oy: rand(-18, 18), delay: Math.random() * 0.5, a: 0, dx: 0, dy: 0, vx: 0, vy: 0, lit: 0 })
      }))
    })

    let unit = 6, W = 0, H = 0, dpr = 1
    let t0 = 0, started = false, raf = 0, running = false, last = 0
    const mouse = { x: -1e4, y: -1e4 }
    let timers = []

    const measure = () => {
      const base = probe.getBoundingClientRect().width || 6        // --pxh-size resolved to px
      const avail = root.getBoundingClientRect().width || widest * base
      unit = Math.max(2, Math.min(base, avail / widest))
      W = Math.ceil(widest * unit + unit); H = Math.ceil(totalH * unit + unit)
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
    }

    const pathPx = (list) => {
      const r = unit * 0.14
      ctx.beginPath()
      for (const p of list) {
        const left = 1 - (p.e || 0)
        const x = (p.hx + 0.56 + p.dx + p.ox * left) * unit
        const y = (p.hy + 0.56 + p.dy + p.oy * left) * unit
        const s = unit * 0.88
        if (ctx.roundRect) ctx.roundRect(x, y, s, s, r); else ctx.rect(x, y, s, s)
      }
    }

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      const normal = [], lit = []
      for (const p of P) { if (p.a <= 0.01) continue; (p.lit ? lit : normal).push(p) }
      // fade by drawing opacity buckets would cost more than it is worth: use the average and keep the rest solid
      ctx.globalAlpha = 1
      ctx.fillStyle = color; pathPx(normal); ctx.fill()
      ctx.fillStyle = accent; pathPx(lit); ctx.fill()
    }

    const rad = 3.4
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now
      const t = (now - t0) / 1000
      let busy = false
      const m = canvas.getBoundingClientRect()
      const mx = (mouse.x - m.left) / unit - 0.5, my = (mouse.y - m.top) / unit - 0.5
      for (const p of P) {
        // assemble: ease from the scattered offset to home
        const k = (t - p.delay) / 1.0
        p.e = k <= 0 ? 0 : k >= 1 ? 1 : easeOut(k)
        p.a = k <= 0 ? 0 : 1
        if (p.e < 1) busy = true
        // step aside from the pointer, spring back
        let tx = 0, ty = 0
        if (repel && p.e >= 1) {
          const ddx = p.hx + 0.44 - mx, ddy = p.hy + 0.44 - my, d = Math.hypot(ddx, ddy)
          if (d < rad) { const f = (1 - d / rad) * 1.5; tx = (ddx / d || 0) * f; ty = (ddy / d || -1) * f }
        }
        p.vx += ((tx - p.dx) * 220 - p.vx * 14) * dt; p.vy += ((ty - p.dy) * 220 - p.vy * 14) * dt
        p.dx += p.vx * dt; p.dy += p.vy * dt
        if (Math.abs(p.vx) > 0.01 || Math.abs(p.vy) > 0.01 || Math.abs(tx - p.dx) > 0.005 || Math.abs(ty - p.dy) > 0.005) busy = true
      }
      draw()
      if (busy) raf = requestAnimationFrame(tick); else { running = false; raf = 0 }
    }
    const kick = () => { if (running || reduced) return; running = true; last = performance.now(); raf = requestAnimationFrame(tick) }

    const begin = () => { if (started) return; started = true; t0 = performance.now(); kick() }

    // reduced motion: draw the finished headline once, no motion
    const drawStatic = () => { for (const p of P) { p.e = 1; p.a = 1 } draw() }

    measure()
    if (reduced || assemble === 'none') { drawStatic(); started = true } else { for (const p of P) p.a = 0 }

    let io = null, f1 = 0, f2 = 0
    if (!reduced && assemble === 'load') { f1 = requestAnimationFrame(() => { f2 = requestAnimationFrame(begin) }) }       // after first paint
    else if (!reduced && assemble === 'view') { io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); begin() } }, { threshold: 0.2 }); io.observe(root) }

    // a few pixels catch the accent now and then
    const flash = () => {
      const picks = []
      for (let i = 0; i < 5; i++) picks.push(P[(Math.random() * P.length) | 0])
      picks.forEach((p, i) => {
        timers.push(setTimeout(() => { p.lit = 1; kick(); draw() }, i * 90))
        timers.push(setTimeout(() => { p.lit = 0; draw() }, 900 + i * 90))
      })
      timers.push(setTimeout(flash, rand(1800, 3200)))
    }
    if (shimmer && !reduced) timers.push(setTimeout(flash, 2600))

    const onMove = (e) => { if (e.pointerType !== 'mouse') return; mouse.x = e.clientX; mouse.y = e.clientY; kick() }
    const onLeave = () => { mouse.x = -1e4; mouse.y = -1e4; kick() }
    if (repel && !reduced) { root.addEventListener('pointermove', onMove); root.addEventListener('pointerleave', onLeave) }
    const ro = new ResizeObserver(() => { measure(); if (!running) { if (started) { for (const p of P) { if (p.a > 0) p.e = 1 } } draw() } })
    ro.observe(root)

    return () => {
      cancelAnimationFrame(raf); cancelAnimationFrame(f1); cancelAnimationFrame(f2)
      timers.forEach(clearTimeout); io && io.disconnect(); ro.disconnect()
      root.removeEventListener('pointermove', onMove); root.removeEventListener('pointerleave', onLeave)
    }
  }, [reduced, key, assemble, repel, shimmer, align, color, accent])

  return (
    <Tag
      ref={rootRef}
      className={'pxh-root' + (className ? ' ' + className : '')}
      data-align={align}
      style={{ '--pxh-size': pixelSize, display: 'block', width: '100%', margin: 0, padding: 0, lineHeight: 0, textAlign: align === 'left' ? 'left' : 'center', position: 'relative' }}
    >
      <span className="pxh-sr" style={{ position: 'absolute', width: 1, height: 1, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>{lines.join('. ')}</span>
      <span ref={probeRef} aria-hidden="true" style={{ display: 'block', width: 'var(--pxh-size)', height: 0, visibility: 'hidden' }} />
      <canvas ref={canvasRef} aria-hidden="true" style={{ display: 'inline-block', maxWidth: '100%' }} />
    </Tag>
  )
}
