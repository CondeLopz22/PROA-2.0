import { PatientWorkflow } from '../features/patients/PatientWorkflow'

export function PatientsPage() {
  return (
    <main className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Pacientes / Registros</p>
          <h1>Buscar paciente</h1>
          <p className="muted">Consulta limitada a la IPS activa y a las filas autorizadas por RLS.</p>
        </div>
      </section>
      <PatientWorkflow mode="records" />
    </main>
  )
}
