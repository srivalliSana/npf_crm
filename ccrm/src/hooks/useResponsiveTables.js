import { useEffect } from 'react'

// Tags every <table> inside <main> with class "rt" and copies each column
// heading onto its cells as data-label, so the phone stylesheet in index.css
// can show each row as a labelled card. Re-runs when the page content changes.
// Tables that should stay tables on phones can opt out with data-rt="off".
export default function useResponsiveTables() {
  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return
    let frame = 0
    const enhance = () => {
      frame = 0
      main.querySelectorAll('table').forEach((table) => {
        if (table.dataset.rt === 'off') return
        const heads = Array.from(table.querySelectorAll('thead th')).map(th => (th.innerText || th.textContent || '').trim())
        if (!heads.length) return
        table.classList.add('rt')
        table.querySelectorAll('tbody tr').forEach((tr) => {
          Array.from(tr.children).forEach((td, i) => {
            if (td.tagName !== 'TD' || td.hasAttribute('colspan')) return
            const label = heads[i] || ''
            if (td.getAttribute('data-label') !== label) td.setAttribute('data-label', label)
          })
        })
      })
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(enhance) }
    enhance()
    const observer = new MutationObserver(schedule)
    observer.observe(main, { childList: true, subtree: true })
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame) }
  }, [])
}
