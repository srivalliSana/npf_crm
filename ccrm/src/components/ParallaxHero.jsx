import React, { useEffect, useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

// Layered parallax hero. As you scroll, each layer slides down at its own rate (the emblem slowest of
// the background, then the photos, then the headline), so the scene gains depth. The campus photos are
// small files, so they are shown at their real size as a collage rather than stretched into a backdrop.
// Smooth scrolling (Lenis) runs only while this page is open, so it never touches the staff app.
// Reduced motion: the scene is shown still.

// Each photo belongs to a parallax layer (2 = further back, 4 = nearest) and sits on a 12-column-ish stage.
const PHOTOS = [
  { src: '/landing/images/cutm14.png', alt: 'The Centurion University gate',       layer: '2', cls: 'left-[2%]  top-[2%]  w-[40%]' },
  { src: '/landing/images/cutm13.jpg', alt: 'The campus buildings',                layer: '4', cls: 'right-[0%] top-[0%]  w-[52%]' },
  { src: '/landing/images/cutm3.jpg',  alt: 'Centurion students',                  layer: '4', cls: 'left-[16%] top-[40%] w-[34%]' },
  { src: '/landing/images/cutm6.png',  alt: 'Agriculture students on the farm',    layer: '2', cls: 'right-[3%] top-[44%] w-[36%]' },
  { src: '/landing/images/cutm9.jpg',  alt: 'The basketball team',                 layer: '3', cls: 'left-[44%] top-[72%] w-[34%]' },
]

export default function ParallaxHero({ eyebrow, title, text, primaryHref = '#apply', primaryLabel = 'Apply now', secondaryHref, secondaryLabel }) {
  const rootRef = useRef(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.registerPlugin(ScrollTrigger)
    const trigger = root.querySelector('[data-parallax-layers]')
    let tl
    if (trigger) {
      tl = gsap.timeline({ scrollTrigger: { trigger, start: '0% 0%', end: '100% 0%', scrub: 0 } })
      ;[['1', 55], ['2', 38], ['3', 22], ['4', 8], ['h', 30]].forEach(([layer, yPercent], i) => {
        tl.to(trigger.querySelectorAll('[data-parallax-layer="' + layer + '"]'), { yPercent, ease: 'none' }, i === 0 ? undefined : '<')
      })
    }
    const lenis = new Lenis({ lerp: 0.1 })
    lenis.on('scroll', ScrollTrigger.update)
    const tick = (time) => lenis.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    return () => {
      gsap.ticker.remove(tick)
      lenis.destroy()
      tl && tl.scrollTrigger && tl.scrollTrigger.kill()
      tl && tl.kill()
    }
  }, [])

  return (
    <section ref={rootRef} id="top" className="relative overflow-hidden bg-primary-900 mt-20 min-h-[calc(100svh-5rem)]">
      <div data-parallax-layers className="absolute inset-0 pointer-events-none lg:pointer-events-auto">
        {/* layer 1: the emblem, slowly */}
        <img data-parallax-layer="1" src="/emblem-512.png" alt="" className="absolute -left-24 top-[8%] w-[620px] max-w-none opacity-[0.07] will-change-transform" />
      </div>

      <div className="relative max-w-7xl mx-auto px-5 lg:px-8 py-16 lg:py-0 min-h-[calc(100svh-5rem)] grid lg:grid-cols-[1fr_1.05fr] gap-10 lg:gap-16 items-center">
        {/* headline: its own layer */}
        <div data-parallax-layers className="relative z-10">
          <div data-parallax-layer="h" className="will-change-transform">
            {eyebrow ? <p className="text-accent-400 font-semibold text-base mb-4">{eyebrow}</p> : null}
            <h1 className="text-[clamp(40px,5.6vw,84px)] font-semibold text-white leading-[1.02] tracking-[-0.03em]">{title}</h1>
            {text ? <p className="text-white/90 text-[clamp(17px,1.4vw,21px)] leading-relaxed mt-5 max-w-[28em]">{text}</p> : null}
            <div className="flex flex-wrap gap-3 mt-8">
              <a href={primaryHref} className="inline-flex items-center gap-2 bg-accent-500 text-primary-900 font-semibold text-base px-7 py-3.5 hover:bg-accent-400 transition-colors">
                {primaryLabel} <ArrowRight size={16} />
              </a>
              {secondaryHref ? (
                <a href={secondaryHref} className="inline-flex items-center gap-2 border border-white/60 text-white font-medium text-base px-7 py-3.5 hover:bg-white/10 transition-colors">{secondaryLabel}</a>
              ) : null}
            </div>
          </div>
        </div>

        {/* photos: three depths */}
        <div data-parallax-layers className="relative z-10 hidden md:block h-[min(620px,70svh)]" aria-hidden="false">
          {PHOTOS.map(p => (
            <div key={p.src} className={'absolute ' + p.cls}>
              <img data-parallax-layer={p.layer} src={p.src} alt={p.alt} loading="eager"
                className="block w-full h-auto border-[6px] border-white shadow-[0_18px_40px_rgba(1,30,40,0.35)] will-change-transform" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
