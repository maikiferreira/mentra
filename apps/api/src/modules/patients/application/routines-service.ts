import { generateSuggestions, type MeemScores } from '@mente-ativa/shared';
import { PatientModel } from '../../shared/infra/models.js';
import type { AuthUser } from '../../shared/presentation/http.js';

export class RoutinesService {
  async list(user: AuthUser) {
    const query = user.role === 'admin' ? {} : { responsibleUsername: user.username };
    const patients = await PatientModel.find(query).sort({ _id: 1 }).lean();
    const items = patients.flatMap((patient) => {
      const suggestions = generateSuggestions({
        id: patient.code,
        evaluations: patient.evaluations.map((entry) => ({
          date: entry.date,
          scores: entry.scores as MeemScores,
        })),
      });
      const states = new Map(patient.suggestionStates.map((state) => [state.key, state]));
      const activities = suggestions
        .filter((suggestion) => states.get(suggestion.key)?.status === 'ok')
        .map((suggestion) => {
          const state = states.get(suggestion.key);
          return {
            key: suggestion.key,
            title: suggestion.activity.title,
            text: state?.customText ?? suggestion.activity.text,
            duration: suggestion.activity.duration,
            frequency: suggestion.activity.frequency,
          };
        });
      return activities.length
        ? [{ patientId: patient.code, initials: patient.initials, age: patient.age, activities }]
        : [];
    });
    return { items };
  }
}
