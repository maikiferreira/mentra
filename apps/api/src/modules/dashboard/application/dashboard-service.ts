import { calculateDomainFlags, generateSuggestions, type MeemScores } from '@mentra/shared';
import { PatientModel, UserModel } from '../../shared/infra/models.js';
import type { AuthUser } from '../../shared/presentation/http.js';

export class DashboardService {
  async summary(user: AuthUser) {
    const query = user.role === 'admin' ? {} : { responsibleUsername: user.username };
    const patients = await PatientModel.find(query).sort({ _id: 1 }).lean();
    const users =
      user.role === 'admin' ? await UserModel.countDocuments({ role: 'professional' }) : undefined;
    let pendingFichas = 0;
    let recentDrops = 0;
    let routineActivities = 0;
    const todo: Array<Record<string, unknown>> = [];
    for (const patient of patients) {
      const evaluations = patient.evaluations.map((entry) => ({
        date: entry.date,
        scores: entry.scores as MeemScores,
      }));
      const flags = calculateDomainFlags(evaluations);
      const fellFlags = flags.filter((flag) => flag.fell);
      const suggestions = generateSuggestions({ id: patient.code, evaluations });
      const states = new Map(patient.suggestionStates.map((state) => [state.key, state.status]));
      routineActivities += suggestions.filter(
        (suggestion) => states.get(suggestion.key) === 'ok',
      ).length;
      if (patient.pending) {
        pendingFichas += 1;
        todo.push({
          patientId: patient.code,
          initials: patient.initials,
          age: patient.age,
          kind: 'pending',
          text: `Ficha nova de ${patient.pending.date.split(' ')[0]} aguardando conferência`,
          tag: 'Ficha nova',
          tagStyle: 'warn',
          button: 'Conferir ficha',
          targetTab: 'fichas',
        });
      } else if (!evaluations.length) {
        todo.push({
          patientId: patient.code,
          initials: patient.initials,
          age: patient.age,
          kind: 'first',
          text: 'Ainda sem avaliações. Envie a primeira ficha.',
          tag: 'Sem avaliações',
          tagStyle: 'neutral',
          button: 'Enviar ficha',
          targetTab: 'fichas',
        });
      }
      if (!patient.pending && fellFlags.length) {
        recentDrops += 1;
        todo.push({
          patientId: patient.code,
          initials: patient.initials,
          age: patient.age,
          kind: 'drop',
          text: `Queda desde a avaliação anterior em: ${fellFlags.map((flag) => flag.domain.name).join(', ')}`,
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
      pendingFichas,
      recentDrops,
      routineActivities,
    };
    return { greetingName: user.name, kpis, todo };
  }
}
