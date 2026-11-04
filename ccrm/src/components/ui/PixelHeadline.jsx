import * as React from 'react'
import { gsap } from 'gsap'

/*
 * Pixel Headline (ported to plain JSX): a headline set in a pixel face drawn in code, where every
 * pixel is an SVG square. When it comes into view the pixels fly in from everywhere and assemble
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

function PixelLine({ text, maxWidth }) {
  const lay = React.useMemo(() => layoutPixels(text), [text])
  const vw = lay.width + 1
  const vh = lay.height + 1
  return (
    <svg className="pxh-line" viewBox={'-0.5 -0.5 ' + vw + ' ' + vh} aria-hidden="true" focusable="false"
      style={{ '--w': vw, '--wmax': maxWidth, aspectRatio: vw + ' / ' + vh }}>
      {lay.glyphs.map((g, gi) => (
        <g key={gi}>
          {g.cells.map(([x, y], i) => (
            <rect key={i} className="pxh-px" x={x + 0.06} y={y + 0.06} width={0.88} height={0.88} rx={0.16} data-x={x + 0.06} data-y={y + 0.06} />
          ))}
        </g>
      ))}
    </svg>
  )
}

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
  const widest = React.useMemo(() => Math.max(...lines.map((l) => layoutPixels(l).width + 1)), [lines])
  const key = lines.join('|')

  useIsoLayoutEffect(() => {
    const root = rootRef.current
    if (!root || reduced) return
    const px = Array.from(root.querySelectorAll('.pxh-px'))
    const ctx = gsap.context((self) => {
      // the pixels fly in from everywhere and assemble the words
      if (assemble !== 'none') {
        gsap.set(px, { opacity: 0 })
        const play = () =>
          gsap.fromTo(
            px,
            { x: () => gsap.utils.random(-40, 40), y: () => gsap.utils.random(-26, 26), scale: () => gsap.utils.random(0, 2.4), opacity: 0, transformOrigin: '50% 50%' },
            { x: 0, y: 0, scale: 1, opacity: 1, duration: 1.5, ease: 'expo.out', stagger: { amount: 0.75, from: 'random' } },
          )
        if (assemble === 'load') play()
        else {
          const io = new IntersectionObserver(([e]) => {
            if (!e.isIntersecting) return
            io.disconnect()
            self.add(play)
          }, { threshold: 0.2 })
          io.observe(root)
          self.add(() => () => io.disconnect())
        }
      }
      // a few pixels catch the accent now and then
      if (shimmer) {
        const lightUp = () => {
          const lit = gsap.utils.shuffle(px.slice()).slice(0, 7)
          lit.forEach((el, i) => {
            gsap.delayedCall(i * 0.09, () => el.classList.add('is-lit'))
            gsap.delayedCall(0.9 + i * 0.09, () => el.classList.remove('is-lit'))
          })
          gsap.delayedCall(gsap.utils.random(1.8, 3.2), lightUp)
        }
        gsap.delayedCall(2.4, lightUp)
      }
    }, root)

    // the pixels step aside from the pointer, by attribute, so they never fight the transform tweens
    const svgs = Array.from(root.querySelectorAll('.pxh-line'))
    const pts = svgs.map((svg) =>
      Array.from(svg.querySelectorAll('.pxh-px')).map((el) => ({ el, x: +(el.dataset.x || 0), y: +(el.dataset.y || 0), off: false })),
    )
    let pending = 0
    let last = { x: -1e4, y: -1e4 }
    const RADIUS = 3.4
    const push = () => {
      pending = 0
      svgs.forEach((svg, si) => {
        const r = svg.getBoundingClientRect()
        const unit = r.width / (svg.viewBox.baseVal.width || 1)
        const ux = (last.x - r.left) / unit - 0.5
        const uy = (last.y - r.top) / unit - 0.5
        pts[si].forEach((p) => {
          const dx = p.x + 0.44 - ux
          const dy = p.y + 0.44 - uy
          const d = Math.hypot(dx, dy)
          if (d < RADIUS) {
            const k = (1 - d / RADIUS) * 1.5
            const nx = d ? dx / d : 0
            const ny = d ? dy / d : -1
            p.off = true
            gsap.to(p.el, { attr: { x: p.x + nx * k, y: p.y + ny * k }, duration: 0.35, ease: 'power3.out', overwrite: 'auto' })
          } else if (p.off) {
            p.off = false
            gsap.to(p.el, { attr: { x: p.x, y: p.y }, duration: 0.9, ease: 'elastic.out(1,0.45)', overwrite: 'auto' })
          }
        })
      })
    }
    const onMove = (e) => {
      if (e.pointerType !== 'mouse') return
      last = { x: e.clientX, y: e.clientY }
      if (!pending) pending = requestAnimationFrame(push)
    }
    const onLeave = () => {
      last = { x: -1e4, y: -1e4 }
      if (!pending) pending = requestAnimationFrame(push)
    }
    if (repel) {
      root.addEventListener('pointermove', onMove)
      root.addEventListener('pointerleave', onLeave)
    }
    return () => {
      cancelAnimationFrame(pending)
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerleave', onLeave)
      ctx.revert()
    }
  }, [reduced, key, assemble, repel, shimmer])

  return (
    <Tag
      ref={rootRef}
      className={'pxh-root' + (className ? ' ' + className : '')}
      data-align={align}
      style={{ '--pxh-size': pixelSize, '--pxh-color': color, '--pxh-accent': accent }}
    >
      <style>{PXH_CSS}</style>
      <span className="pxh-sr">{lines.join('. ')}</span>
      {lines.map((line, i) => (
        <PixelLine key={i + line} text={line} maxWidth={widest} />
      ))}
    </Tag>
  )
}

// No drop shadow here: the original's dark glow is for black backgrounds and would smudge a light page.
const PXH_CSS = `
.pxh-root{display:flex;flex-direction:column;align-items:center;gap:calc(var(--pxh-size) * 2.1);margin:0;padding:0;width:100%;container-type:inline-size;color:var(--pxh-color);fill:currentColor;cursor:default}
.pxh-root[data-align="left"]{align-items:flex-start}
.pxh-root :where(svg){display:block;max-width:none}
.pxh-line{height:auto;overflow:visible;width:min(calc(var(--pxh-size) * var(--w)),calc(100cqi * var(--w) / var(--wmax)))}
.pxh-px{transition:fill .7s ease}
.pxh-px.is-lit{fill:var(--pxh-accent);transition:fill .25s ease}
.pxh-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media (prefers-reduced-motion:reduce){
.pxh-px{transition:none}
}
`
