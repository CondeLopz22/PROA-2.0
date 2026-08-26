import type { ReactNode } from 'react'

export type KanbanColumn<T> = {
  id: string
  title: string
  items: T[]
}

export function KanbanBoard<T>({
  columns,
  getKey,
  renderCard,
  emptyLabel = 'Sin casos.',
  selectedColumnId,
}: {
  columns: KanbanColumn<T>[]
  getKey: (item: T) => string
  renderCard: (item: T, columnId: string) => ReactNode
  emptyLabel?: string
  selectedColumnId?: string
}) {
  return (
    <div className="kanban-board">
      {columns.map((column) => (
        <section className={`kanban-column ${selectedColumnId === column.id ? 'mobile-selected' : ''}`} key={column.id}>
          <div className="kanban-column-header">
            <h3>{column.title}</h3>
            <span>{column.items.length}</span>
          </div>
          <div className="kanban-column-body">
            {column.items.length ? column.items.map((item) => (
              <div key={getKey(item)}>{renderCard(item, column.id)}</div>
            )) : <p className="muted">{emptyLabel}</p>}
          </div>
        </section>
      ))}
    </div>
  )
}
