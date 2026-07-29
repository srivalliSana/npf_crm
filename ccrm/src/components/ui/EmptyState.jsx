import React from 'react'
import { Inbox } from 'lucide-react'

// Formalizes the "centered gray text in a full-width cell" convention that
// already existed ad hoc across every table page.
export default function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', description, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}>
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
        <Icon size={20} className="text-gray-400" />
      </div>
      <p className="text-sm font-semibold text-gray-600">{title}</p>
      {description && <p className="text-xs text-gray-400 mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// Drop-in replacement for the <tr><td colSpan={n}>...</td></tr> empty-row
// pattern used in every table across the app.
EmptyState.TableRow = function EmptyStateTableRow({ colSpan, ...rest }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <EmptyState {...rest} />
      </td>
    </tr>
  )
}
