import type {
  FichaDetailDto,
  FichaListDto,
  FichaSavedDto,
  PatientOverview,
} from '@mente-ativa/shared';
import { randomUUID } from 'node:crypto';
import {
  evaluateInstrument,
  getInstrument,
  validateInstrumentScores,
  type InstrumentDefinition,
} from '@mente-ativa/shared';
import { z } from 'zod';
import { notFound, validationError } from '../../shared/kernel/errors.js';
import { PatientModel } from '../../shared/infra/models.js';
import { PatientService } from '../../patients/application/patient-service.js';
import {
  contextOf,
  overviewOf,
  storedEvaluations,
  toDateBR,
  todayISO,
  type PatientEvaluation,
} from '../domain/patient-evaluations.js';
import type { AuthUser } from '../../shared/presentation/http.js';

const fichaSchema = z.object({
  instrument: z.unknown().optional(),
  date: z.unknown().optional(),
  scores: z.record(z.string(), z.unknown()).optional(),
  observations: z.unknown().optional(),
});
type FichaBody = z.infer<typeof fichaSchema>;

const MAX_OBSERVATIONS = 2000;

/** Valida `aaaa-mm-dd` (campo de data do navegador) e devolve o dia à meia-noite UTC. */
function parseEvaluationDate(value: unknown, today: string): Date {
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
  return parsed;
}

/** Valida data, respostas e observações de uma ficha do teste informado. */
function parseFicha(definition: InstrumentDefinition, input: unknown) {
  const parsed = fichaSchema.safeParse(input);
  const body: FichaBody = parsed.success ? parsed.data : {};
  const performedOn = parseEvaluationDate(body.date, todayISO());
  const validated = validateInstrumentScores(definition, body.scores ?? {});
  if ('error' in validated) throw validationError(validated.error, 'scores');
  const observations = typeof body.observations === 'string' ? body.observations.trim() : '';
  if (observations.length > MAX_OBSERVATIONS) {
    throw validationError(
      `As observações devem ter no máximo ${MAX_OBSERVATIONS} caracteres.`,
      'observations',
    );
  }
  return { performedOn, scores: validated.scores, notes: observations || null };
}

export class FichaService {
  constructor(private readonly patients = new PatientService()) {}

  async list(user: AuthUser, code: string): Promise<FichaListDto> {
    const patient = await this.patients.findVisible(user, code);
    const context = contextOf(patient);
    return {
      evaluations: storedEvaluations(patient)
        .reverse()
        .map((evaluation) => summary(evaluation, context)),
    };
  }

  async overview(user: AuthUser, code: string): Promise<PatientOverview> {
    return overviewOf(await this.patients.findVisible(user, code));
  }

  async get(user: AuthUser, code: string, evaluationId: string): Promise<FichaDetailDto> {
    const patient = await this.patients.findVisible(user, code);
    const evaluation = storedEvaluations(patient).find((entry) => entry.id === evaluationId);
    if (!evaluation) throw notFound();
    return {
      ...summary(evaluation, contextOf(patient)),
      scores: evaluation.scores,
      observations: evaluation.notes ?? '',
    };
  }

  async create(user: AuthUser, code: string, input: unknown): Promise<FichaSavedDto> {
    const patient = await this.patients.findVisible(user, code);
    const instrument = fichaSchema.safeParse(input).data?.instrument;
    // Sem instrumento informado, mantém o comportamento original (MEEM).
    const definition = getInstrument(instrument === undefined ? 'meem' : String(instrument));
    if (!definition) throw validationError('Selecione um teste válido.', 'instrument');
    const ficha = parseFicha(definition, input);
    const id = randomUUID();
    await PatientModel.updateOne(
      { _id: patient._id },
      {
        $push: {
          evaluations: { id, instrument: definition.key, ...ficha, createdAt: new Date() },
        },
        $inc: { __v: 1 },
      },
    );
    return { evaluation: result(id, definition, ficha, contextOf(patient)) };
  }

  async update(
    user: AuthUser,
    code: string,
    evaluationId: string,
    input: unknown,
  ): Promise<FichaSavedDto> {
    const patient = await this.patients.findVisible(user, code);
    const current = storedEvaluations(patient).find((entry) => entry.id === evaluationId);
    if (!current) throw notFound();
    // O teste de uma ficha não muda; para outro teste, registre uma nova ficha.
    const definition = getInstrument(current.instrument ?? 'meem')!;
    const ficha = parseFicha(definition, input);
    const updated = await PatientModel.updateOne(
      { _id: patient._id, 'evaluations.id': evaluationId },
      {
        $set: {
          'evaluations.$.performedOn': ficha.performedOn,
          'evaluations.$.scores': ficha.scores,
          'evaluations.$.notes': ficha.notes,
          'evaluations.$.updatedAt': new Date(),
        },
        $inc: { __v: 1 },
      },
    );
    if (updated.matchedCount !== 1) throw notFound();
    return { evaluation: result(evaluationId, definition, ficha, contextOf(patient)) };
  }

  async delete(user: AuthUser, code: string, evaluationId: string) {
    const patient = await this.patients.findVisible(user, code);
    const removed = await PatientModel.updateOne(
      { _id: patient._id, 'evaluations.id': evaluationId },
      { $pull: { evaluations: { id: evaluationId } }, $inc: { __v: 1 } },
    );
    if (removed.modifiedCount !== 1) throw notFound();
  }
}

function result(
  id: string,
  definition: InstrumentDefinition,
  ficha: ReturnType<typeof parseFicha>,
  context: { educationYears: number | null },
) {
  const evaluation = evaluateInstrument(definition, ficha.scores, context);
  return {
    id,
    date: toDateBR(ficha.performedOn),
    instrument: definition.key,
    total: evaluation.total,
    max: evaluation.max,
    level: evaluation.level,
    interpretation: evaluation.label,
  };
}

function summary(evaluation: PatientEvaluation, context: { educationYears: number | null }) {
  const definition = getInstrument(evaluation.instrument ?? 'meem')!;
  const evaluated = evaluateInstrument(definition, evaluation.scores, context);
  return {
    id: evaluation.id,
    date: evaluation.date,
    dateISO: evaluation.dateISO,
    instrument: definition.key,
    instrumentName: definition.shortName,
    total: evaluated.total,
    max: evaluated.max,
    level: evaluated.level,
    interpretation: evaluated.label,
    status: 'Registrada',
  };
}
