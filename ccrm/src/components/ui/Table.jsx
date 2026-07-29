import React from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'

// Table shell (sticky header, hover rows, sortable headers) — stays
// data-agnostic; pages still own their own columns/rows/pagination, only
// the chrome that was previously hand-rolled per page moves in here.
export default function Table({ children, className = '' }) {
  return (
    <div className={`card overflow-hidden p-0 ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">{children}</table>
      </div>
    </div>
  )
}

Table.Head = function TableHead({ children }) {
  return <thead className="sticky top-0 z-10">{children}</thead>
}

Table.Body = function TableBody({ children }) {
  return <tbody>{children}</tbody>
}

Table.Row = function TableRow({ children, className = '', ...rest }) {
  return (
    <tr className={`hover:bg-gray-50/80 transition-colors ${className}`} {...rest}>
      {children}
    </tr>
  )
}

// sortKey/activeSort/onSort are optional — omit them for a plain header cell.
Table.HCell = function TableHCell({ children, className = '', sortKey, activeSort, onSort, ...rest }) {
  const isSortable = !!sortKey && !!onSort
  const isActive = isSortable && activeSort?.key === sortKey
  return (
    <th
      className={`table-th ${isSortable ? 'cursor-pointer select-none hover:text-gray-700' : ''} ${className}`}
      onClick={isSortable ? () => onSort(sortKey) : undefined}
      {...rest}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {isSortable && (
          isActive
            ? (activeSort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
            : <ChevronDown size={12} className="opacity-0 group-hover:opacity-30" />
        )}
      </span>
    </th>
  )
}

Table.Cell = function TableCell({ children, className = '', ...rest }) {
  return <td className={`table-td ${className}`} {...rest}>{children}</td>
}
