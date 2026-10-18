import {
  MEEM_DOMAINS,
  calculateDomainFlags,
  calculateTrend,
  generateSuggestions,
  totalScore,
  type MeemScores,
} from '@mentra/shared';
import { z } from 'zod';
import { notFound, validationError } from '../../shared/kernel/errors.js';
import { PatientModel } from '../../shared/infra/models.js';
import { PatientService } from '../../patients/application/patient-service.js';
import type { AuthUser } from '../../shared/presentation/http.js';

const suggestionChangeSchema = z
  .object({
    status: z.enum(['open', 'ok', 'no']).optional(),
    customText: z.string().optional(),
  })
  .refine((value) => (value.status !== undefined) !== (value.customText !== undefined));

export class EvolutionService {
  constructor(private readonly patients = new PatientService()) {}

  async get(user: AuthUser, code: string) {
    const patient = await this.patients.findVisible(user, code);
    const evaluations = patient.evaluations.map((entry) => ({
      date: entry.date,
      scores: entry.scores as MeemScores,
    }));
    const suggestions = generateSuggestions({ id: patient.code, evaluations });
    const stateByKey = new Map(patient.suggestionStates.map((state) => [state.key, state]));
    const suggestionDtos = suggestions.map((suggestion) => {
      const state = stateByKey.get(suggestion.key);
      return {
        key: suggestion.key,
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
    const routine = suggestionDtos
      .filter((suggestion) => suggestion.state.status === 'ok')
      .map((suggestion) => ({
        key: suggestion.key,
        title: suggestion.title,
        text: suggestion.state.customText ?? suggestion.defaultText,
        duration: suggestion.duration,
        frequency: suggestion.frequency,
      }));
    const response: Record<string, unknown> = {
      hasPending: Boolean(patient.pending),
      pendingDate: patient.pending?.date ?? null,
      suggestions: suggestionDtos,
      routine,
    };
    if (evaluations.length) {
      response.series = evaluations.map((evaluation) => ({
        date: evaluation.date,
        total: totalScore(evaluation.scores),
      }));
    }
    if (evaluations.length >= 2) {
      const previous = evaluations[evaluations.length - 2]!;
      const last = evaluations[evaluations.length - 1]!;
      response.delta = {
        previousDate: previous.date,
        lastDate: last.date,
        rows: MEEM_DOMAINS.map((domain) => {
          const before = previous.scores[domain.key]!;
          const after = last.scores[domain.key]!;
          const difference = after - before;
          return {
            domain: domain.key,
            name: domain.name,
            previous: before,
            last: after,
            max: domain.max,
            kind: difference > 0 ? 'up' : difference < 0 ? 'down' : 'same',
            label:
              difference > 0
                ? `▲ subiu ${difference}`
                : difference < 0
                  ? `▼ caiu ${Math.abs(difference)}`
                  : '● igual',
          };
        }),
      };
      response.flags = calculateDomainFlags(evaluations);
      response.trend = calculateTrend(evaluations);
    } else {
      response.trend = calculateTrend(evaluations);
    }
    return response;
  }

  async updateSuggestion(user: AuthUser, code: string, key: string, input: unknown) {
    const parsed = suggestionChangeSchema.safeParse(input);
    if (!parsed.success)
      throw validationError('Informe um status ou um texto personalizado.', 'status');
    const patient = await this.patients.findVisible(user, code);
    const suggestions = generateSuggestions({
      id: patient.code,
      evaluations: patient.evaluations.map((entry) => ({
        date: entry.date,
        scores: entry.scores as MeemScores,
      })),
    });
    if (!suggestions.some((suggestion) => suggestion.key === key)) throw notFound();
    const existing = patient.suggestionStates.find((state) => state.key === key);
    const current = existing?.toObject ? existing.toObject() : existing;
    const nextState = {
      key,
      status: parsed.data.status ?? current?.status ?? 'open',
      customText: parsed.data.customText ?? current?.customText ?? null,
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
