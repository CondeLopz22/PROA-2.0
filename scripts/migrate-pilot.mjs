const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')

if (!dryRun) {
  console.error('migrate:pilot requiere --dry-run en Milestone 4. No se realizaron cambios.')
  process.exit(1)
}

const sampleRows = [
  {
    source: 'VALIDACION-M4-HIST-001',
    tipo_identificacion: 'CC',
    numero_identificacion: 'HIST-M4-001',
    fecha_ronda: '2026-01-15',
    diagnostico: 'J18.9',
    antimicrobiano: 'Meropenem',
    microbiologia: 'No',
    intervencion: 'No',
  },
  {
    source: 'VALIDACION-M4-HIST-002',
    tipo_identificacion: 'CC',
    numero_identificacion: 'HIST-M4-002',
    fecha_ronda: '2026-01-16',
    diagnostico: '',
    antimicrobiano: 'Piperacilina/tazobactam',
    microbiologia: 'Positivo',
    intervencion: 'Sí',
  },
]

function validate(row) {
  const errors = []
  const omitted = []
  if (!row.tipo_identificacion || !row.numero_identificacion) errors.push('Identificación incompleta')
  if (!row.fecha_ronda) errors.push('Fecha de ronda ausente')
  if (!row.diagnostico) omitted.push('Diagnóstico CIE-10 no disponible')
  if (!row.antimicrobiano) omitted.push('Tratamiento antimicrobiano no disponible')
  if (row.microbiologia === 'Positivo' && !row.microorganismo) omitted.push('Microorganismo no disponible')
  return { errors, omitted }
}

const preview = sampleRows.map((row) => {
  const result = validate(row)
  return {
    source: row.source,
    patientLookup: `${row.tipo_identificacion} ${row.numero_identificacion}`,
    patientsToCreate: result.errors.length ? 0 : 1,
    existingPatients: 0,
    casesToCreate: result.errors.length ? 0 : 1,
    roundsToCreate: result.errors.length ? 0 : 1,
    treatmentsToCreate: row.antimicrobiano ? 1 : 0,
    microbiologyToCreate: row.microbiologia === 'Positivo' && !result.omitted.includes('Microorganismo no disponible') ? 1 : 0,
    interventionsToCreate: row.intervencion === 'Sí' ? 1 : 0,
    errors: result.errors,
    omitted: result.omitted,
  }
})

console.log(JSON.stringify({
  mode: 'dry-run',
  writes: 0,
  summary: {
    rows: preview.length,
    patientsToCreate: preview.reduce((sum, row) => sum + row.patientsToCreate, 0),
    casesToCreate: preview.reduce((sum, row) => sum + row.casesToCreate, 0),
    roundsToCreate: preview.reduce((sum, row) => sum + row.roundsToCreate, 0),
    treatmentsToCreate: preview.reduce((sum, row) => sum + row.treatmentsToCreate, 0),
    microbiologyToCreate: preview.reduce((sum, row) => sum + row.microbiologyToCreate, 0),
    interventionsToCreate: preview.reduce((sum, row) => sum + row.interventionsToCreate, 0),
    rowsWithErrors: preview.filter((row) => row.errors.length).length,
    rowsWithOmissions: preview.filter((row) => row.omitted.length).length,
  },
  preview,
}, null, 2))
