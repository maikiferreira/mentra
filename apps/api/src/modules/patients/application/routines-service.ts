import type { RoutineWeekDto, RoutinesDto } from '@mente-ativa/shared';
import { recentWeeks } from '@mente-ativa/shared';
import { z } from 'zod';
import { notFound, validationError } from '../../shared/kernel/errors.js';
import { PatientModel } from '../../shared/infra/models.js';
import { routineItems } from '../../care-planning/domain/routine.js';
import { todayISO } from '../../evaluations/domain/patient-evaluations.js';
import type { AuthUser } from '../../shared/presentation/http.js';
import { PatientService } from './patient-service.js';

const weekSchema = z.object({ done: z.boolean() });

export class RoutinesService {
  constructor(private readonly patients = new PatientService()) {}

  async list(user: AuthUser): Promise<RoutinesDto> {
    const query = user.role === 'admin' ? {} : { responsibleUsername: user.username };
    const patients = await PatientModel.find(query).sort({ _id: 1 }).lean();
    const items = patients.flatMap((patient) => {
      const activities = routineItems(patient);
      return activities.length
        ? [
            {
              patientId: patient.code,
              name: patient.name ?? '',
              initials: patient.initials,
              age: patient.age,
              activities,
            },
          ]
        : [];
    });
    return { items };
  }

  /** Marca (ou desmarca) uma atividade da rotina como feita em uma das últimas semanas. */
  async markWeek(
    user: AuthUser,
    code: string,
    key: string,
    week: string,
    input: unknown,
  ): Promise<RoutineWeekDto> {
    const parsed = weekSchema.safeParse(input);
    if (!parsed.success) throw validationError('Informe se a atividade foi feita.', 'done');
    const patient = await this.patients.findVisible(user, code);
    if (!routineItems(patient).some((item) => item.key === key)) throw notFound();
    if (!recentWeeks(todayISO()).includes(week))
      throw validationError('Só é possível marcar as últimas quatro semanas.', 'week');
    await PatientModel.updateOne(
      { _id: patient._id },
      parsed.data.done
        ? { $addToSet: { routineLog: { key, week } }, $inc: { __v: 1 } }
        : { $pull: { routineLog: { key, week } }, $inc: { __v: 1 } },
    );
    const item = routineItems({
      ...patient,
      routineLog: [
        ...(patient.routineLog ?? []).filter((entry) => entry.key !== key || entry.week !== week),
        ...(parsed.data.done ? [{ key, week }] : []),
      ],
    }).find((entry) => entry.key === key)!;
    return { key, weeks: item.weeks, adherence: item.adherence };
  }
}
