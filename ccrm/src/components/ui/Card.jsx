import React from 'react'

export default function Card({ children, className = '', padding = true, ...rest }) {
  return (
    <div className={`card ${padding ? 'p-5' : ''} ${className}`} {...rest}>
      {children}
    </div>
  )
}

Card.Header = function CardHeader({ children, className = '' }) {
  return <div className={`flex items-center justify-between mb-4 ${className}`}>{children}</div>
}

Card.Title = function CardTitle({ children, className = '' }) {
  return <h2 className={`font-semibold text-gray-800 text-sm ${className}`}>{children}</h2>
}
