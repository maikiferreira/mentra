import type { DashboardDto } from '@mente-ativa/shared';
import { calculateDomainFlags, getInstrument, type MeemScores } from '@mente-ativa/shared';
import { PatientModel, UserModel } from '../../shared/infra/models.js';
import type { AuthUser } from '../../shared/presentation/http.js';
import {
  evaluationsOf,
  latestResults,
  overviewOf,
  patientSuggestions,
  toDateBR,
} from '../../evaluations/domain/patient-evaluations.js';

export class DashboardService {
  async summary(user: AuthUser): Promise<DashboardDto> {
    const query = user.role === 'admin' ? {} : { responsibleUsername: user.username };
    const patients = await PatientModel.find(query).sort({ _id: 1 }).lean();
    const users =
      user.role === 'admin' ? await UserModel.countDocuments({ role: 'professional' }) : undefined;
    let recentDrops = 0;
    let routineActivities = 0;
    const todo: DashboardDto['todo'] = [];
    for (const patient of patients) {
      const meem = evaluationsOf(patient, getInstrument('meem')!).map((entry) => ({
        date: entry.date,
        scores: entry.scores as MeemScores,
      }));
      const fellFlags = calculateDomainFlags(meem).filter((flag) => flag.fell);
      // MEEM: domínios que caíram; demais testes: total que piorou desde a ficha anterior.
      const worsened = [
        ...fellFlags.map((flag) => flag.domain.name),
        ...latestResults(patient)
          .filter((entry) => entry.definition.key !== 'meem' && entry.trend.tone === 'bad')
          .map((entry) => entry.definition.shortName),
      ];
      const suggestions = patientSuggestions(patient);
      const states = new Map(patient.suggestionStates.map((state) => [state.key, state.status]));
      routineActivities += suggestions.filter(
        (suggestion) => states.get(suggestion.key) === 'ok',
      ).length;
      if (!patient.evaluations.length) {
        todo.push({
          patientId: patient.code,
          name: patient.name ?? '',
          initials: patient.initials,
          age: patient.age,
          kind: 'first',
          text: 'Ainda sem avaliações. Registre a primeira ficha.',
          tag: 'Sem avaliações',
          tagStyle: 'neutral',
          button: 'Registrar ficha',
          targetTab: 'fichas',
        });
      }
      const overdue = overviewOf(patient)
        .categories.flatMap((category) => category.instruments)
        .filter((status) => status.overdue);
      if (overdue.length) {
        todo.push({
          patientId: patient.code,
          name: patient.name ?? '',
          initials: patient.initials,
          age: patient.age,
          kind: 'reassess',
          text: `Reavaliação atrasada: ${overdue
            .map(
              (status) =>
                `${status.shortName} (prevista para ${toDateBR(new Date(`${status.nextDue}T00:00:00Z`))})`,
            )
            .join(', ')}`,
          tag: 'Reavaliar',
          tagStyle: 'warn',
          button: 'Ver visão geral',
          targetTab: 'visao-geral',
        });
      }
      if (worsened.length) {
        recentDrops += 1;
        todo.push({
          patientId: patient.code,
          name: patient.name ?? '',
          initials: patient.initials,
          age: patient.age,
          kind: 'drop',
          text: `Queda desde a avaliação anterior em: ${worsened.join(', ')}`,
          tag: 'Atenção',
          tagStyle: 'down',
          button: 'Ver sugestões',
          targetTab: 'evolucao',
        });
      }
    }
    const kpis: DashboardDto['kpis'] = {
      patients: patients.length,
      ...(users === undefined ? {} : { professionals: users }),
      recentDrops,
      routineActivities,
    };
    return { greetingName: user.name, kpis, todo };
  }
}
