import { supabase } from '../lib/supabase'
import type { AntimicrobialCatalogItem, DddConsumption, DddRecord, OmsDdd, ServiceIps, UUID } from '../types/domain'

export type DddConsumptionDraft = {
  id?: UUID
  antimicrobialId: UUID | ''
  antimicrobialName: string
  codigoAtc?: string | null
  via: string
  presentacion: string
  concentracion: string
  unidadConcentracion: 'g' | 'mg' | ''
  cantidadConsumida: string
  unidadConsumo: string
  gramosPreview: number | null
  omsDdd?: OmsDdd | null
}

export type DddRecordDraft = {
  camasDisponibles: string
  camasDiaOcupadas: string
  porcentajeOcupacion: string
}

export type DddSummaryRow = {
  record: DddRecord
  service: ServiceIps | null
  consumptionCount: number
  totalDdd: number
  hasOccupancy: boolean
  qualityAlerts: string[]
}

export function monthStart(value: string) {
  if (!value) return new Date().toISOString().slice(0, 7) + '-01'
  return `${value.slice(0, 7)}-01`
}

export function monthInputFromPeriod(value?: string | null) {
  return value ? value.slice(0, 7) : new Date().toISOString().slice(0, 7)
}

export function daysInMonth(period: string) {
  const [year, month] = period.split('-').map(Number)
  if (!year || !month) return 0
  return new Date(year, month, 0).getDate()
}

export function toNumber(value?: string | number | null) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function calculateGrams(concentration: string, unit: string, quantity: string) {
  const concentrationNumber = toNumber(concentration)
  const quantityNumber = toNumber(quantity)
  if (concentrationNumber === null || quantityNumber === null || concentrationNumber < 0 || quantityNumber < 0) return null
  if (unit === 'g') return concentrationNumber * quantityNumber
  if (unit === 'mg') return (concentrationNumber * quantityNumber) / 1000
  return null
}

export function calculateOccupancy(camasDisponibles: string, camasDiaOcupadas: string, period: string) {
  const beds = toNumber(camasDisponibles)
  const occupied = toNumber(camasDiaOcupadas)
  const days = daysInMonth(period)
  if (beds === null || occupied === null || beds <= 0 || days <= 0) return null
  return (occupied / (beds * days)) * 100
}

export function dddDataStatus(consumption: DddConsumption, record: DddRecord) {
  const grams = toNumber(consumption.gramos_consumidos)
  if (grams === null || grams < 0) return 'Revisión requerida'
  if (!consumption.ddd_oms) return 'Sin referencia OMS'
  const denominator = toNumber(record.camas_dia_ocupadas)
  if (!denominator) return 'Denominador pendiente'
  if (consumption.ddd_100_camas_dia === null || consumption.ddd_100_camas_dia === undefined) return 'Revisión requerida'
  return 'Completo'
}

export function emptyConsumptionDraft(): DddConsumptionDraft {
  return {
    antimicrobialId: '',
    antimicrobialName: '',
    codigoAtc: null,
    via: '',
    presentacion: '',
    concentracion: '',
    unidadConcentracion: '',
    cantidadConsumida: '',
    unidadConsumo: 'unidades',
    gramosPreview: null,
    omsDdd: null,
  }
}

export function consumptionDraftFromRow(row: DddConsumption, catalog: AntimicrobialCatalogItem[]): DddConsumptionDraft {
  const antimicrobial = catalog.find((item) => item.id === row.antimicrobiano_id)
  const concentration = row.concentracion === null || row.concentracion === undefined ? '' : String(row.concentracion)
  const quantity = row.cantidad_consumida === null || row.cantidad_consumida === undefined ? '' : String(row.cantidad_consumida)
  return {
    id: row.id,
    antimicrobialId: row.antimicrobiano_id,
    antimicrobialName: antimicrobial?.nombre ?? row.antimicrobiano_id,
    codigoAtc: antimicrobial?.codigo_atc ?? null,
    via: row.via ?? '',
    presentacion: row.presentacion ?? '',
    concentracion: concentration,
    unidadConcentracion: (row.unidad_concentracion as DddConsumptionDraft['unidadConcentracion']) ?? '',
    cantidadConsumida: quantity,
    unidadConsumo: row.unidad_consumo ?? 'unidades',
    gramosPreview: toNumber(row.gramos_consumidos),
    omsDdd: row.ddd_oms
      ? {
          id: '',
          antimicrobiano_id: row.antimicrobiano_id,
          via: row.via,
          ddd_oms: row.ddd_oms,
          unidad_ddd: null,
        }
      : null,
  }
}

export async function getDddRecords(ipsId: UUID, period?: string) {
  let query = supabase.from('ddd_registros').select('*').eq('ips_id', ipsId).order('periodo', { ascending: false })
  if (period) query = query.eq('periodo', period)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as DddRecord[]
}

export async function findDddRecord(ipsId: UUID, serviceId: UUID, period: string) {
  const { data, error } = await supabase
    .from('ddd_registros')
    .select('*')
    .eq('ips_id', ipsId)
    .eq('servicio_id', serviceId)
    .eq('periodo', period)
    .maybeSingle()
  if (error) throw error
  return data as DddRecord | null
}

export async function openDddRecord({
  ipsId,
  serviceId,
  period,
  userId,
}: {
  ipsId: UUID
  serviceId: UUID
  period: string
  userId: UUID
}) {
  const existing = await findDddRecord(ipsId, serviceId, period)
  if (existing) return existing

  const { data, error } = await supabase
    .from('ddd_registros')
    .insert({
      ips_id: ipsId,
      servicio_id: serviceId,
      periodo: period,
      usuario_registro: userId,
      estado: 'Borrador',
    })
    .select('*')
    .single()
  if (error) throw error
  return data as DddRecord
}

export async function updateDddRecord(recordId: UUID, draft: DddRecordDraft) {
  const { data, error } = await supabase
    .from('ddd_registros')
    .update({
      camas_disponibles: toNumber(draft.camasDisponibles),
      camas_dia_ocupadas: toNumber(draft.camasDiaOcupadas),
      porcentaje_ocupacion: toNumber(draft.porcentajeOcupacion),
    })
    .eq('id', recordId)
    .select('*')
    .single()
  if (error) throw error
  return data as DddRecord
}

export async function confirmDddRecord(recordId: UUID) {
  const { data, error } = await supabase
    .from('ddd_registros')
    .update({ estado: 'Confirmado', fecha_confirmacion: new Date().toISOString() })
    .eq('id', recordId)
    .select('*')
    .single()
  if (error) throw error
  return data as DddRecord
}

export async function annulDddRecord(recordId: UUID) {
  const { data, error } = await supabase
    .from('ddd_registros')
    .update({ estado: 'Anulado' })
    .eq('id', recordId)
    .select('*')
    .single()
  if (error) throw error
  return data as DddRecord
}

export async function getDddConsumptions(recordId: UUID) {
  const { data, error } = await supabase
    .from('ddd_consumos')
    .select('*')
    .eq('registro_id', recordId)
    .order('fecha_creacion', { ascending: true })
  if (error) throw error
  return (data ?? []) as DddConsumption[]
}

export async function getOmsDdd(antimicrobialId: UUID, via: string) {
  if (!antimicrobialId || !via.trim()) return null
  const { data, error } = await supabase
    .from('oms_ddd')
    .select('*')
    .eq('antimicrobiano_id', antimicrobialId)
    .ilike('via', via.trim())
    .maybeSingle()
  if (error) throw error
  return data as OmsDdd | null
}

export async function saveDddConsumption(recordId: UUID, draft: DddConsumptionDraft) {
  const grams = calculateGrams(draft.concentracion, draft.unidadConcentracion, draft.cantidadConsumida)
  const payload = {
    registro_id: recordId,
    antimicrobiano_id: draft.antimicrobialId,
    via: draft.via.trim(),
    presentacion: draft.presentacion.trim() || null,
    concentracion: toNumber(draft.concentracion),
    unidad_concentracion: draft.unidadConcentracion || null,
    cantidad_consumida: toNumber(draft.cantidadConsumida) ?? 0,
    unidad_consumo: draft.unidadConsumo.trim() || null,
    gramos_consumidos: grams,
  }

  if (draft.id) {
    const { data, error } = await supabase.from('ddd_consumos').update(payload).eq('id', draft.id).select('*').single()
    if (error) throw error
    return data as DddConsumption
  }

  const existing = await supabase
    .from('ddd_consumos')
    .select('id')
    .eq('registro_id', recordId)
    .eq('antimicrobiano_id', draft.antimicrobialId)
    .eq('via', draft.via.trim())
    .limit(1)
  if (existing.error) throw existing.error
  const existingId = existing.data?.[0]?.id as UUID | undefined
  if (existingId) {
    const { data, error } = await supabase.from('ddd_consumos').update(payload).eq('id', existingId).select('*').single()
    if (error) throw error
    return data as DddConsumption
  }

  const { data, error } = await supabase.from('ddd_consumos').insert(payload).select('*').single()
  if (error) throw error
  return data as DddConsumption
}

export async function getDddSummary(ipsId: UUID, services: ServiceIps[]) {
  const records = await getDddRecords(ipsId)
  if (!records.length) return []
  const consumptionsResult = await supabase
    .from('ddd_consumos')
    .select('*')
    .in('registro_id', records.map((record) => record.id))
  if (consumptionsResult.error) throw consumptionsResult.error
  const consumptions = (consumptionsResult.data ?? []) as DddConsumption[]

  return records.map((record) => {
    const rows = consumptions.filter((consumption) => consumption.registro_id === record.id)
    const totalDdd = rows.reduce((sum, item) => sum + (toNumber(item.ddd_calculadas) ?? 0), 0)
    const alerts = new Set<string>()
    if (!toNumber(record.camas_dia_ocupadas)) alerts.add('Denominador pendiente')
    rows.forEach((row) => {
      const status = dddDataStatus(row, record)
      if (status !== 'Completo') alerts.add(status)
    })
    return {
      record,
      service: services.find((service) => service.id === record.servicio_id) ?? null,
      consumptionCount: rows.length,
      totalDdd,
      hasOccupancy: Boolean(toNumber(record.camas_dia_ocupadas)),
      qualityAlerts: Array.from(alerts),
    }
  }) as DddSummaryRow[]
}
