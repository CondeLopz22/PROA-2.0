import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CatalogAutocomplete } from './CatalogAutocomplete'

const antimicrobialOptions = [
  { id: 'a1', nombre: 'Meropenem', codigo_atc: 'J01DH02' },
  { id: 'a2', nombre: 'Aciclovir', codigo_atc: 'J05AB01' },
]

function label(item: { nombre: string }) {
  return item.nombre
}

describe('CatalogAutocomplete', () => {
  it('abre y selecciona un antimicrobiano con click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onSearchChange = vi.fn()

    render(
      <CatalogAutocomplete
        label="Antimicrobiano"
        onChange={onChange}
        onSearchChange={onSearchChange}
        optionDescription={(item) => item.codigo_atc}
        optionLabel={label}
        options={antimicrobialOptions}
        placeholder="Buscar"
        value=""
      />,
    )

    await user.click(screen.getByLabelText('Antimicrobiano'))
    expect(screen.getByText('Meropenem')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Antimicrobiano'), 'aci')
    await user.click(screen.getByText('Aciclovir'))

    expect(onChange).toHaveBeenCalledWith(antimicrobialOptions[1])
    expect(screen.getByLabelText('Antimicrobiano')).toHaveValue('Aciclovir')
  })

  it('permite seleccionar tipo de muestra con teclado', async () => {
    const user = userEvent.setup()
    const sample = { id: 'm1', nombre: 'Hemocultivo' }
    const onChange = vi.fn()

    render(
      <CatalogAutocomplete
        label="Tipo de muestra"
        onChange={onChange}
        onSearchChange={() => undefined}
        optionLabel={(item) => item.nombre}
        options={[sample]}
        placeholder="Buscar tipo de muestra"
        value=""
      />,
    )

    await user.click(screen.getByLabelText('Tipo de muestra'))
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledWith(sample)
    expect(screen.getByLabelText('Tipo de muestra')).toHaveValue('Hemocultivo')
  })

  it('selecciona microorganismo y conserva el valor visible', async () => {
    const user = userEvent.setup()
    const organism = { id: 'o1', nombre: 'Escherichia coli', tipo_germen: 'Bacilo Gram negativo' }
    const onChange = vi.fn()

    render(
      <CatalogAutocomplete
        label="Microorganismo"
        onChange={onChange}
        onSearchChange={() => undefined}
        optionDescription={(item) => item.tipo_germen}
        optionLabel={(item) => item.nombre}
        options={[organism]}
        placeholder="Buscar microorganismo"
        value=""
      />,
    )

    await user.click(screen.getByLabelText('Microorganismo'))
    await user.click(screen.getByText('Escherichia coli'))

    expect(onChange).toHaveBeenCalledWith(organism)
    expect(screen.getByLabelText('Microorganismo')).toHaveValue('Escherichia coli')
  })
})
