import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

export type CatalogAutocompleteOption = {
  id: string
}

export function CatalogAutocomplete<T extends CatalogAutocompleteOption>({
  label,
  placeholder,
  options,
  value,
  onChange,
  onSearchChange,
  optionLabel,
  optionDescription,
  loading = false,
  disabled = false,
  emptyState = 'Sin coincidencias',
  className = '',
}: {
  label: string
  placeholder: string
  options: T[]
  value: string
  onChange: (item: T) => void
  onSearchChange: (value: string) => void
  optionLabel: (item: T) => string
  optionDescription?: (item: T) => string | null | undefined
  loading?: boolean
  disabled?: boolean
  emptyState?: string
  className?: string
}) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    setActiveIndex(0)
  }, [options])

  const visibleOptions = useMemo(() => options.slice(0, 40), [options])

  function updateQuery(next: string) {
    setQuery(next)
    setOpen(true)
    onSearchChange(next)
  }

  function select(item: T) {
    const labelText = optionLabel(item)
    setQuery(labelText)
    setOpen(false)
    onSearchChange(labelText)
    onChange(item)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((index) => Math.min(index + 1, Math.max(visibleOptions.length - 1, 0)))
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((index) => Math.max(index - 1, 0))
    }
    if (event.key === 'Enter' && open && visibleOptions[activeIndex]) {
      event.preventDefault()
      select(visibleOptions[activeIndex])
    }
    if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className={`autocomplete ${className}`} ref={rootRef}>
      <label>
        {label}
        <input
          aria-autocomplete="list"
          aria-expanded={open}
          disabled={disabled}
          onBlur={(event) => {
            if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false)
          }}
          onChange={(event) => updateQuery(event.target.value)}
          onFocus={() => {
            setOpen(true)
            onSearchChange(query)
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          value={query}
        />
      </label>
      {open && !disabled ? (
        <div className="autocomplete-list" role="listbox">
          {loading ? <div className="autocomplete-empty">Cargando...</div> : null}
          {!loading && visibleOptions.length
            ? visibleOptions.map((item, index) => (
                <button
                  className={index === activeIndex ? 'active' : ''}
                  key={item.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => select(item)}
                  role="option"
                  type="button"
                >
                  <strong>{optionLabel(item)}</strong>
                  {optionDescription?.(item) ? <span>{optionDescription(item)}</span> : null}
                </button>
              ))
            : null}
          {!loading && !visibleOptions.length ? <div className="autocomplete-empty">{emptyState}</div> : null}
        </div>
      ) : null}
    </div>
  )
}
