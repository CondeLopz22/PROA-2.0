export function PlaceholderPage({ title }: { title: string }) {
  return (
    <main className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Módulo preparado</p>
          <h1>{title}</h1>
          <p className="muted">Estructura visible para navegación. Implementación pendiente en próximos milestones.</p>
        </div>
      </section>
    </main>
  )
}
