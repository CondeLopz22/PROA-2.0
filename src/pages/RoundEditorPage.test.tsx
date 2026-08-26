import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { clinicalSectionForMessage } from '../services/clinicalErrorService'
import { AntimicrobialBlock } from './RoundEditorPage'

const duplicateMessage = 'Este antimicrobiano ya se encuentra activo en el caso.'

describe('RoundEditorPage contextual clinical errors', () => {
  it('muestra el error de duplicado dentro del bloque Antimicrobianos', () => {
    render(
      <AntimicrobialBlock
        activeTreatments={[]}
        newTreatments={[]}
        setNewTreatments={vi.fn()}
        treatmentActions={{}}
        setTreatmentActions={vi.fn()}
        readOnly={false}
        sectionError={duplicateMessage}
      />,
    )

    const block = screen.getByRole('heading', { name: 'Antimicrobianos' }).closest('article')
    expect(block).toBeTruthy()
    expect(within(block as HTMLElement).getByText(duplicateMessage)).toBeInTheDocument()
    expect(document.querySelector('.alert.error')).not.toBeInTheDocument()
  })

  it('clasifica errores conocidos por sección y deja fallback para inesperados', () => {
    expect(clinicalSectionForMessage(duplicateMessage)).toBe('treatment')
    expect(clinicalSectionForMessage('No se pudo guardar la microbiología.')).toBe('microbiology')
    expect(clinicalSectionForMessage('Falló una operación inesperada.')).toBeNull()
  })
})
