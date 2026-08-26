export function PlaceholderPage({ title }: { title: string }) {
  const isAdmin = title === 'Administración'
  return (
    <main className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Módulo preparado</p>
          <h1>{title}</h1>
          <p className="muted">
            {isAdmin
              ? 'Estructura preparada para usuarios, IPS, servicios y catálogos soportados por Supabase.'
              : 'Estructura visible para navegación. Implementación pendiente en próximos milestones.'}
          </p>
        </div>
      </section>
      {isAdmin ? (
        <section className="panel admin-preview">
          <div>
            <h2>Usuarios e IPS</h2>
            <p className="muted">Gestión operativa apoyada en `perfiles_usuario` y `usuario_ips`.</p>
          </div>
          <div>
            <h2>Servicios IPS</h2>
            <p className="muted">Catálogo institucional visible según IPS activa y RLS.</p>
          </div>
          <div>
            <h2>Catálogos clínicos</h2>
            <p className="muted">Antimicrobianos, microorganismos, muestras e intervenciones.</p>
          </div>
        </section>
      ) : null}
    </main>
  )
}
