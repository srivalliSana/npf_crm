import React, { useEffect, useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

// Layered parallax hero. As you scroll, each layer slides down at its own rate (the campus collage slowest,
// then the headline), so the scene gains depth. The campus photos are
// small files, so they are shown at their real size as a collage rather than stretched into a backdrop.
// Smooth scrolling (Lenis) runs only while this page is open, so it never touches the staff app.
// Reduced motion: the scene is shown still.

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
      ;[['1', 20], ['h', 32]].forEach(([layer, yPercent], i) => {
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
      <div data-parallax-layers className="absolute inset-0 pointer-events-none">
        {/* layer 1: the campus collage, slowest */}
        <img data-parallax-layer="1" src="/parallax/campus-collage.webp" alt="" className="absolute inset-x-0 -top-[30%] w-full h-[130%] object-cover will-change-transform" />
        <div className="absolute inset-0 bg-gradient-to-r from-primary-900/95 via-primary-900/80 to-primary-900/40" />
      </div>

      <div className="relative max-w-7xl mx-auto px-5 lg:px-8 min-h-[calc(100svh-5rem)] flex items-center">
        <div data-parallax-layers className="relative z-10 py-16">
          <div data-parallax-layer="h" className="will-change-transform max-w-[760px]">
            {eyebrow ? <p className="text-accent-400 font-semibold text-base mb-4">{eyebrow}</p> : null}
            <h1 className="text-[clamp(40px,5.8vw,88px)] font-semibold text-white leading-[1.02] tracking-[-0.03em]">{title}</h1>
            {text ? <p className="text-white/90 text-[clamp(17px,1.4vw,21px)] leading-relaxed mt-5 max-w-[30em]">{text}</p> : null}
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
      </div>
    </section>
  )
}
