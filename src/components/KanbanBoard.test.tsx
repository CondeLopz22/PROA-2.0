import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { KanbanBoard } from './KanbanBoard'

describe('KanbanBoard', () => {
  it('renderiza columnas compactas con conteo y tarjetas', () => {
    render(
      <KanbanBoard
        columns={[
          { id: 'Por valorar', title: 'Por valorar', items: [{ id: '1', patient: 'Paciente A' }] },
          { id: 'Al día', title: 'Al día', items: [] },
        ]}
        getKey={(item) => item.id}
        renderCard={(item) => <article>{item.patient}</article>}
      />,
    )

    expect(screen.getByText('Por valorar')).toBeInTheDocument()
    expect(screen.getByText('Paciente A')).toBeInTheDocument()
    expect(screen.getByText('Sin casos.')).toBeInTheDocument()
  })
})
