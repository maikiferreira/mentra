import { calculateDomainFlags, getInstrument, type MeemScores } from '@mente-ativa/shared';
import { PatientModel, UserModel } from '../../shared/infra/models.js';
import type { AuthUser } from '../../shared/presentation/http.js';
import {
  evaluationsOf,
  latestResults,
  patientSuggestions,
} from '../../evaluations/domain/patient-evaluations.js';

export class DashboardService {
  async summary(user: AuthUser) {
    const query = user.role === 'admin' ? {} : { responsibleUsername: user.username };
    const patients = await PatientModel.find(query).sort({ _id: 1 }).lean();
    const users =
      user.role === 'admin' ? await UserModel.countDocuments({ role: 'professional' }) : undefined;
    let recentDrops = 0;
    let routineActivities = 0;
    const todo: Array<Record<string, unknown>> = [];
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
      if (worsened.length) {
        recentDrops += 1;
        todo.push({
          patientId: patient.code,
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
    const kpis: Record<string, number> = {
      patients: patients.length,
      ...(users === undefined ? {} : { professionals: users }),
      recentDrops,
      routineActivities,
    };
    return { greetingName: user.name, kpis, todo };
  }
}
