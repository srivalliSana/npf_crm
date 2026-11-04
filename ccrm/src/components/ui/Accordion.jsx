import React, { createContext, useCallback, useContext, useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'

// A small accessible accordion with the same shape as shadcn's:
//   <Accordion defaultValue={['account']} multiple>
//     <AccordionItem value="account">
//       <AccordionTrigger>Account</AccordionTrigger>
//       <AccordionContent>...</AccordionContent>
//     </AccordionItem>
//   </Accordion>
// `multiple` lets several items stay open; without it opening one closes the others.
// Use `value` + `onValueChange` to control it from outside.

const AccordionCtx = createContext(null)
const ItemCtx = createContext(null)

export function Accordion({ defaultValue = [], value, onValueChange, multiple = false, className = '', children }) {
  const [inner, setInner] = useState(defaultValue)
  const open = value ?? inner
  const set = useCallback((next) => { if (value === undefined) setInner(next); onValueChange?.(next) }, [value, onValueChange])
  const toggle = useCallback((v) => {
    const isOpen = open.includes(v)
    if (multiple) set(isOpen ? open.filter(x => x !== v) : [...open, v])
    else set(isOpen ? [] : [v])
  }, [open, multiple, set])
  return <AccordionCtx.Provider value={{ open, toggle }}><div className={className}>{children}</div></AccordionCtx.Provider>
}

export function AccordionItem({ value, className = '', children }) {
  const { open } = useContext(AccordionCtx)
  const id = useId()
  return (
    <ItemCtx.Provider value={{ value, isOpen: open.includes(value), triggerId: `acc-t-${id}`, panelId: `acc-p-${id}` }}>
      <div className={className}>{children}</div>
    </ItemCtx.Provider>
  )
}

export function AccordionTrigger({ className = '', children }) {
  const { toggle } = useContext(AccordionCtx)
  const { value, isOpen, triggerId, panelId } = useContext(ItemCtx)
  return (
    <button
      type="button" id={triggerId} aria-expanded={isOpen} aria-controls={panelId}
      onClick={() => toggle(value)}
      className={`w-full flex items-center justify-between gap-3 text-left transition-colors ${className}`}
    >
      {children}
      <ChevronDown size={14} className={`flex-shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
  )
}

// Height animates with the grid-rows trick, so no measuring is needed.
export function AccordionContent({ className = '', children }) {
  const { isOpen, triggerId, panelId } = useContext(ItemCtx)
  return (
    <div
      id={panelId} role="region" aria-labelledby={triggerId} aria-hidden={!isOpen} inert={!isOpen ? '' : undefined}
      className={`grid transition-[grid-template-rows] duration-200 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
    >
      <div className="overflow-hidden min-h-0"><div className={className}>{children}</div></div>
    </div>
  )
}
