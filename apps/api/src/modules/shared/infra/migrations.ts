import { randomUUID } from 'node:crypto';
import { PatientModel } from './models.js';

/** Converte as datas antigas (`dd/mm/aaaa`, com sufixo opcional ` #n`, ou `mm/aaaa`) em dia UTC. */
export function parseLegacyDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const full = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value);
  if (full) return new Date(Date.UTC(Number(full[3]), Number(full[2]) - 1, Number(full[1])));
  const monthOnly = /^(\d{2})\/(\d{4})$/.exec(value);
  if (monthOnly) return new Date(Date.UTC(Number(monthOnly[2]), Number(monthOnly[1]) - 1, 1));
  return null;
}

/**
 * Fichas gravadas antes do identificador e da data real recebem `id` e `performedOn`.
 * Idempotente: só altera pacientes com alguma ficha ainda sem `id`.
 */
export async function migrateEvaluations() {
  const patients = await PatientModel.collection
    .find({ evaluations: { $elemMatch: { id: { $exists: false } } } })
    .toArray();
  for (const patient of patients) {
    const evaluations = (patient.evaluations as Array<Record<string, unknown>>).map((entry) => {
      if (entry.id) return entry;
      const createdAt = entry.createdAt instanceof Date ? entry.createdAt : new Date();
      const { date, ...rest } = entry;
      return {
        ...rest,
        id: randomUUID(),
        instrument: entry.instrument ?? 'meem',
        performedOn: parseLegacyDate(date) ?? createdAt,
        notes: entry.notes ?? null,
        createdAt,
      };
    });
    await PatientModel.collection.updateOne({ _id: patient._id }, { $set: { evaluations } });
  }
  return patients.length;
}
