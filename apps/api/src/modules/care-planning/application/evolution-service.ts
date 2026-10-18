import type { EvolutionDto, InstrumentEvolutionDto } from '@mente-ativa/shared';
import {
  sectionMax,
  sectionValue,
  type InstrumentDefinition,
  type StoredEvaluation,
} from '@mente-ativa/shared';
import { z } from 'zod';
import { notFound, validationError } from '../../shared/kernel/errors.js';
import { PatientModel } from '../../shared/infra/models.js';
import { PatientService } from '../../patients/application/patient-service.js';
import { routineItems } from '../domain/routine.js';
import {
  lastRegistered,
  latestResults,
  patientSuggestions,
  storedEvaluations,
} from '../../evaluations/domain/patient-evaluations.js';
import type { AuthUser } from '../../shared/presentation/http.js';

const suggestionChangeSchema = z
  .object({
    status: z.enum(['open', 'ok', 'no']).optional(),
    customText: z.string().optional(),
  })
  .refine((value) => (value.status !== undefined) !== (value.customText !== undefined));

export class EvolutionService {
  constructor(private readonly patients = new PatientService()) {}

  async get(user: AuthUser, code: string): Promise<EvolutionDto> {
    const patient = await this.patients.findVisible(user, code);
    const evaluations = storedEvaluations(patient);
    const stateByKey = new Map(patient.suggestionStates.map((state) => [state.key, state]));
    const suggestions = patientSuggestions(patient).map((suggestion) => {
      const state = stateByKey.get(suggestion.key);
      return {
        key: suggestion.key,
        instrument: suggestion.instrument,
        title: suggestion.activity.title,
        defaultText: suggestion.activity.text,
        duration: suggestion.activity.duration,
        frequency: suggestion.activity.frequency,
        why: suggestion.why,
        sources: suggestion.sources,
        fell: suggestion.fell,
        lastDate: suggestion.lastDate,
        interests: patient.interests || '',
        state: { status: state?.status ?? 'open', customText: state?.customText ?? null },
      };
    });
    const routine = routineItems(patient);
    const instruments = latestResults(patient).map(({ definition, date, result, trend }) => {
      const own = evaluations.filter((entry) => entry.instrument === definition.key);
      return {
        key: definition.key,
        name: definition.name,
        shortName: definition.shortName,
        category: definition.category,
        max: definition.max,
        higherIsBetter: definition.higherIsBetter,
        totalLabel: definition.totalLabel,
        series: own.map((entry) => ({ date: entry.date, total: definition.score(entry.scores) })),
        latest: { date, ...result },
        trend,
        ...(own.length >= 2 ? { delta: deltaRows(definition, own.at(-2)!, own.at(-1)!) } : {}),
      };
    });
    return {
      instruments,
      // Abre na aba do teste registrado por último.
      latestInstrument: lastRegistered(patient)?.instrument ?? null,
      suggestions,
      routine,
    };
  }

  async updateSuggestion(user: AuthUser, code: string, key: string, input: unknown) {
    const parsed = suggestionChangeSchema.safeParse(input);
    if (!parsed.success)
      throw validationError('Informe um status ou um texto personalizado.', 'status');
    const patient = await this.patients.findVisible(user, code);
    const suggestions = patientSuggestions(patient);
    if (!suggestions.some((suggestion) => suggestion.key === key)) throw notFound();
    const existing = patient.suggestionStates.find((state) => state.key === key);
    const current = existing?.toObject ? existing.toObject() : existing;
    const status = parsed.data.status ?? current?.status ?? 'open';
    const nextState = {
      key,
      status,
      customText: parsed.data.customText ?? current?.customText ?? null,
      // Guarda quando entrou na rotina; sair da rotina zera a contagem de adesão.
      acceptedAt: status === 'ok' ? (current?.acceptedAt ?? new Date()) : null,
    };
    const states = patient.suggestionStates.map((state) => (state.key === key ? nextState : state));
    if (!existing) states.push(nextState);
    const result = await PatientModel.updateOne(
      { _id: patient._id, __v: patient.__v },
      { $set: { suggestionStates: states }, $inc: { __v: 1 } },
    );
    if (result.modifiedCount !== 1)
      throw validationError(
        'A sugestão foi atualizada por outra solicitação. Recarregue a página.',
        'status',
      );
    return { key, status: nextState.status, customText: nextState.customText };
  }
}

function deltaRows(
  definition: InstrumentDefinition,
  previous: StoredEvaluation,
  last: StoredEvaluation,
): NonNullable<InstrumentEvolutionDto['delta']> {
  const format = (value: number) => String(value).replace('.', ',');
  return {
    previousDate: previous.date,
    lastDate: last.date,
    rows: definition.sections.map((section) => {
      const before = sectionValue(definition, section.key, previous.scores);
      const after = sectionValue(definition, section.key, last.scores);
      const difference = after - before;
      const improved = difference > 0 === definition.higherIsBetter;
      return {
        key: section.key,
        name: section.name,
        previous: before,
        last: after,
        max: sectionMax(definition, section.key),
        kind: difference > 0 ? 'up' : difference < 0 ? 'down' : 'same',
        tone: difference === 0 ? 'neutral' : improved ? 'good' : 'bad',
        label:
          difference > 0
            ? `▲ subiu ${format(difference)}`
            : difference < 0
              ? `▼ caiu ${format(Math.abs(difference))}`
              : '● igual',
      };
    }),
  };
}
