import { PatientWorkflow } from '../features/patients/PatientWorkflow'

export function RoundsPage() {
  return (
    <main className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Rondas PROA</p>
          <h1>Nueva ronda</h1>
          <p className="muted">Selecciona o crea paciente, decide caso activo/nuevo y abre una ronda vacía.</p>
        </div>
      </section>
      <PatientWorkflow mode="round" />
    </main>
  )
}
