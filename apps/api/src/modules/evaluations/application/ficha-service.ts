import {
  evaluateInstrument,
  evaluationDateKey,
  getInstrument,
  uniqueDate,
  validateInstrumentScores,
} from '@mente-ativa/shared';
import { z } from 'zod';
import { conflict, validationError } from '../../shared/kernel/errors.js';
import { PatientModel } from '../../shared/infra/models.js';
import { PatientService } from '../../patients/application/patient-service.js';
import { contextOf, storedEvaluations } from '../domain/patient-evaluations.js';
import type { AuthUser } from '../../shared/presentation/http.js';

const fichaSchema = z.object({
  instrument: z.unknown().optional(),
  date: z.unknown().optional(),
  scores: z.record(z.string(), z.unknown()).optional(),
  observations: z.unknown().optional(),
});

const MAX_OBSERVATIONS = 2000;

/** Data de hoje em America/Sao_Paulo no formato aaaa-mm-dd. */
function todayISO(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** Valida `aaaa-mm-dd` (formato do campo de data do navegador) e devolve `dd/mm/aaaa`. */
function parseEvaluationDate(value: unknown, today: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw validationError('Informe a data da avaliação.', 'date');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const [, year, month, day] = match ?? [];
  const parsed = match ? new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))) : null;
  if (
    !parsed ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day)
  ) {
    throw validationError('Informe uma data de avaliação válida.', 'date');
  }
  if (value.trim() > today)
    throw validationError('A data da avaliação não pode ser no futuro.', 'date');
  return `${day}/${month}/${year}`;
}

export class FichaService {
  constructor(private readonly patients = new PatientService()) {}

  async list(user: AuthUser, code: string) {
    const patient = await this.patients.findVisible(user, code);
    const context = contextOf(patient);
    return {
      evaluations: storedEvaluations(patient)
        .reverse()
        .map((evaluation) => {
          const definition = getInstrument(evaluation.instrument ?? 'meem')!;
          const result = evaluateInstrument(definition, evaluation.scores, context);
          return {
            date: evaluation.date,
            instrument: definition.key,
            instrumentName: definition.shortName,
            total: result.total,
            max: result.max,
            level: result.level,
            interpretation: result.label,
            status: 'Registrada',
          };
        }),
    };
  }

  async create(user: AuthUser, code: string, input: unknown) {
    const patient = await this.patients.findVisible(user, code);
    const parsed = fichaSchema.safeParse(input);
    const body = parsed.success ? parsed.data : {};
    // Sem instrumento informado, mantém o comportamento original (MEEM).
    const definition = getInstrument(
      body.instrument === undefined ? 'meem' : String(body.instrument),
    );
    if (!definition) throw validationError('Selecione um teste válido.', 'instrument');
    const date = parseEvaluationDate(body.date, todayISO());
    const validated = validateInstrumentScores(definition, body.scores ?? {});
    if ('error' in validated) throw validationError(validated.error, 'scores');
    const { scores } = validated;
    const observations = typeof body.observations === 'string' ? body.observations.trim() : '';
    if (observations.length > MAX_OBSERVATIONS) {
      throw validationError(
        `As observações devem ter no máximo ${MAX_OBSERVATIONS} caracteres.`,
        'observations',
      );
    }

    // A evolução compara as fichas de cada teste na ordem em que foram gravadas.
    const sameInstrument = storedEvaluations(patient).filter(
      (entry) => entry.instrument === definition.key,
    );
    const last = sameInstrument.at(-1);
    const lastKey = last ? evaluationDateKey(last.date) : null;
    if (last && lastKey !== null && evaluationDateKey(date)! < lastKey) {
      throw validationError(
        `A data não pode ser anterior à última avaliação de ${definition.shortName} (${last.date.split(' ')[0]}).`,
        'date',
      );
    }
    const storedDate = uniqueDate(sameInstrument, date);
    // Atualização condicional pela versão: evita duas fichas simultâneas com a mesma data.
    const result = await PatientModel.updateOne(
      { _id: patient._id, __v: patient.__v },
      {
        $push: {
          evaluations: {
            date: storedDate,
            instrument: definition.key,
            scores,
            notes: observations || null,
            createdAt: new Date(),
          },
        },
        $inc: { __v: 1 },
      },
    );
    if (result.modifiedCount !== 1)
      throw conflict(
        'O paciente foi atualizado por outra solicitação. Recarregue e tente novamente.',
      );
    const evaluation = evaluateInstrument(definition, scores, contextOf(patient));
    return {
      evaluation: {
        date: storedDate,
        instrument: definition.key,
        total: evaluation.total,
        max: evaluation.max,
        level: evaluation.level,
        interpretation: evaluation.label,
      },
    };
  }
}
