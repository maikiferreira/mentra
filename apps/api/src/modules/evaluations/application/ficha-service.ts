import {
  MEEM_DOMAINS,
  generateMagicOzFicha,
  totalScore,
  uniqueDate,
  type MeemScores,
  type PatientForPlanning,
  type PendingFicha,
} from '@mente-ativa/shared';
import { z } from 'zod';
import { conflict, notFound, validationError } from '../../shared/kernel/errors.js';
import { PatientModel } from '../../shared/infra/models.js';
import { PatientService } from '../../patients/application/patient-service.js';
import type { AuthUser } from '../../shared/presentation/http.js';

const confirmationSchema = z.object({
  scores: z.record(z.string(), z.unknown()),
  observations: z.string().optional(),
  flagConfirmed: z.boolean(),
});

function todayBR(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.day}/${values.month}/${values.year}`;
}
function scoresTotal(scores: MeemScores) {
  return totalScore(scores);
}
function sheetLines(code: string, ficha: PendingFicha) {
  const values = MEEM_DOMAINS.map((domain) => ({
    id: `l${MEEM_DOMAINS.indexOf(domain) + 3}`,
    left: domain.name,
    right: `${ficha.scores[domain.key]} /${domain.max}`,
  }));
  return [
    { id: 'l0', title: 'Ficha de avaliação' },
    { id: 'l1', left: `Data: ${ficha.date}`, right: `Pac. ${code}` },
    { id: 'l2', left: 'Instrumento: MEEM' },
    ...values,
    { id: 'l8', left: 'Total', right: `${ficha.writtenTotal} /30` },
    { id: 'l9', left: `Obs: ${ficha.observations}` },
  ];
}

export class FichaService {
  constructor(private readonly patients = new PatientService()) {}

  async list(user: AuthUser, code: string) {
    const patient = await this.patients.findVisible(user, code);
    return {
      evaluations: [...patient.evaluations].reverse().map((evaluation) => ({
        date: evaluation.date,
        instrument: 'MEEM',
        total: scoresTotal(evaluation.scores as MeemScores),
        status: 'Conferida',
      })),
      pending: patient.pending
        ? this.asPending(code, patient.pending as unknown as PendingFicha)
        : null,
    };
  }

  async getPending(user: AuthUser, code: string) {
    const patient = await this.patients.findVisible(user, code);
    if (!patient.pending) throw notFound();
    return { pending: this.asPending(code, patient.pending as unknown as PendingFicha) };
  }

  async upload(user: AuthUser, code: string) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const patient = await this.patients.findVisible(user, code);
      if (patient.pending) throw conflict('Já existe uma ficha aguardando conferência.');
      const date = uniqueDate(patient.evaluations, todayBR());
      const plannerPatient: PatientForPlanning = {
        id: patient.code,
        evaluations: patient.evaluations.map((evaluation) => ({
          date: evaluation.date,
          scores: evaluation.scores as MeemScores,
        })),
        generationCursor: patient.generationCursor,
      };
      const pending = generateMagicOzFicha(plannerPatient, date);
      const result = await PatientModel.updateOne(
        { _id: patient._id, __v: patient.__v, pending: null },
        { $set: { pending, generationCursor: plannerPatient.generationCursor }, $inc: { __v: 1 } },
      );
      if (result.modifiedCount === 1) return { pending: this.asPending(code, pending) };
    }
    throw conflict('Já existe uma ficha aguardando conferência.');
  }

  async confirm(user: AuthUser, code: string, input: unknown) {
    const parsed = confirmationSchema.safeParse(input);
    const body = parsed.success
      ? parsed.data
      : { scores: {}, flagConfirmed: false, observations: undefined };
    const patient = await this.patients.findVisible(user, code);
    const pending = patient.pending as unknown as PendingFicha | null;
    if (!pending) throw notFound();
    const edited: Partial<MeemScores> = {};
    for (const domain of MEEM_DOMAINS) {
      const score = body.scores[domain.key];
      if (
        typeof score !== 'number' ||
        !Number.isInteger(score) ||
        score < 0 ||
        score > domain.max
      ) {
        throw validationError(
          `A pontuação de ${domain.name} deve ser um número inteiro entre 0 e ${domain.max}.`,
          'scores',
        );
      }
      edited[domain.key] = score;
    }
    const scores = edited as MeemScores;
    const total = scoresTotal(scores);
    if (total !== pending.writtenTotal) {
      throw validationError(
        `A soma dos domínios (${total}) é diferente do total escrito na ficha (${pending.writtenTotal}/30). Revise os valores.`,
        'scores',
      );
    }
    if (body.flagConfirmed !== true) {
      throw validationError(
        'Confirme o campo sinalizado e a soma para liberar o botão.',
        'flagConfirmed',
      );
    }
    const date = pending.date;
    const result = await PatientModel.updateOne(
      { _id: patient._id, __v: patient.__v, 'pending.date': pending.date },
      {
        $push: {
          evaluations: {
            date,
            scores,
            notes: body.observations ?? pending.observations,
            createdAt: new Date(),
          },
        },
        $set: { pending: null },
        $inc: { __v: 1 },
      },
    );
    if (result.modifiedCount !== 1)
      throw conflict('A ficha foi atualizada por outra solicitação. Recarregue e tente novamente.');
    return { evaluation: { date, total }, justConfirmed: date };
  }

  private asPending(code: string, ficha: PendingFicha) {
    return { ...ficha, sheetLines: sheetLines(code, ficha) };
  }
}
