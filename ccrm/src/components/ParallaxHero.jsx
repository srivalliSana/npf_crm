import React, { useEffect, useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

// Layered parallax hero (plain JSX port of the pasted "parallax-scrolling" component).
// As you scroll, four layers slide down at different rates (sky, mountain, title, foreground ridge),
// which gives the scene depth. Smooth scrolling (Lenis) is started here and stopped when the page is
// left, so it never touches the staff app. Reduced motion: the scene is shown still.
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
      ;[['1', 70], ['2', 55], ['3', 40], ['4', 10]].forEach(([layer, yPercent], i) => {
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

  const layer = 'absolute inset-0 w-full h-full object-cover will-change-transform'
  return (
    <section ref={rootRef} className="relative overflow-hidden bg-primary-900 mt-20 h-[calc(100svh-5rem)] min-h-[560px]" id="top">
      <div data-parallax-layers className="absolute inset-0">
        <img data-parallax-layer="1" src="/parallax/bg.webp" alt="" loading="eager" className={layer + ' object-[50%_72%]'} />
        <img data-parallax-layer="2" src="/parallax/mountain.webp" alt="" loading="eager" className={layer + ' object-[50%_72%]'} />
        <div data-parallax-layer="3" className="absolute inset-x-0 top-[12%] px-5 lg:px-8 will-change-transform">
          <div className="max-w-7xl mx-auto">
            {eyebrow ? <p className="text-accent-400 font-semibold text-base mb-4">{eyebrow}</p> : null}
            <h1 className="text-[clamp(42px,6.4vw,96px)] font-semibold text-white leading-[1.0] tracking-[-0.03em] max-w-[14ch] drop-shadow-[0_2px_24px_rgba(1,30,40,0.55)]">{title}</h1>
            {text ? <p className="text-white text-[clamp(17px,1.4vw,21px)] leading-relaxed mt-5 max-w-[17em] drop-shadow-[0_1px_12px_rgba(1,30,40,0.6)]">{text}</p> : null}
            <div className="flex flex-wrap gap-3 mt-8">
              <a href={primaryHref} className="inline-flex items-center gap-2 bg-accent-500 text-primary-900 font-semibold text-base px-7 py-3.5 hover:bg-accent-400 transition-colors">
                {primaryLabel} <ArrowRight size={16} />
              </a>
              {secondaryHref ? (
                <a href={secondaryHref} className="inline-flex items-center gap-2 border border-white/70 text-white font-medium text-base px-7 py-3.5 hover:bg-white/10 transition-colors">{secondaryLabel}</a>
              ) : null}
            </div>
          </div>
        </div>
        <img data-parallax-layer="4" src="/parallax/ridge.webp" alt="" loading="eager" className={layer + ' object-[50%_72%]'} />
      </div>
    </section>
  )
}
