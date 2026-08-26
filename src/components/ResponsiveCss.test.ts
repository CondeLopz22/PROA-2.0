import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')

describe('responsive CSS contract', () => {
  it('define breakpoint mobile final para matriz/cards y Kanban de una columna', () => {
    expect(css).toContain('@media (max-width: 900px)')
    expect(css).toContain('.desktop-table')
    expect(css).toContain('.mobile-card-list')
    expect(css).toContain('@media (max-width: 767px)')
    expect(css).toContain('.kanban-column.mobile-selected')
  })

  it('define action bar y resumen compacto para la ronda en mobile', () => {
    expect(css).toContain('@media (max-width: 600px)')
    expect(css).toContain('.round-sticky-header .button-row')
    expect(css).toContain('position: fixed')
    expect(css).toContain('.round-sticky-header > div:first-child span:first-of-type')
  })

  it('limita el Kanban tablet a carril de dos columnas visibles', () => {
    expect(css).toContain('@media (max-width: 1199px)')
    expect(css).toContain('grid-auto-columns: minmax(300px, calc((100% - 14px) / 2))')
  })
})
