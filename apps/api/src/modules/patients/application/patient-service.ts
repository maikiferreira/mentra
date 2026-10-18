import {
  EMERGENCY_RELATIONSHIPS,
  LIMITATIONS,
  PATIENT_GROUPS,
  calculateTrend,
  nextPatientCode,
  totalScore,
  type MeemScores,
} from '@mentra/shared';
import { z } from 'zod';
import { notFound, validationError } from '../../shared/kernel/errors.js';
import { PatientModel, UserModel } from '../../shared/infra/models.js';
import { canAccessPatient } from '../domain/access-policy.js';
import type { AuthUser } from '../../shared/presentation/http.js';

const patientBodySchema = z.object({
  initials: z.unknown().optional(),
  age: z.unknown().optional(),
  educationYears: z.unknown().optional(),
  interests: z.unknown().optional(),
  phone: z.unknown().optional(),
  address: z.unknown().optional(),
  emergencyContact: z.unknown().optional(),
  vision: z.unknown().optional(),
  hearing: z.unknown().optional(),
  mobility: z.unknown().optional(),
  group: z.unknown().optional(),
  objective: z.unknown().optional(),
});
type PatientInput = {
  initials: string;
  age: number;
  educationYears: number | null;
  interests: string;
  phone: string;
  address: string;
  emergencyContact: { name: string; phone: string; relationship: string };
  vision: string;
  hearing: string;
  mobility: string;
  group: string;
  objective: string;
};

function asRecord(input: unknown): Record<string, unknown> {
  const result = patientBodySchema.safeParse(input);
  return result.success ? result.data : {};
}
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
function numeric(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return Number.NaN;
  return Number(value);
}
function validEnum(
  value: string,
  options: readonly string[],
  message: string,
  field: string,
  fallback: string,
) {
  if (!value) return fallback;
  if (!options.includes(value)) throw validationError(message, field);
  return value;
}
function validatePatient(input: unknown): PatientInput {
  const body = asRecord(input);
  const initials = text(body.initials);
  if (!initials || initials.length > 10)
    throw validationError('Informe as iniciais do paciente.', 'initials');
  const age = numeric(body.age);
  if (age === null || !Number.isInteger(age) || age < 40 || age > 110) {
    throw validationError('Informe a idade, entre 40 e 110 anos.', 'age');
  }
  const educationYears = numeric(body.educationYears);
  if (
    educationYears !== null &&
    (!Number.isInteger(educationYears) || educationYears < 0 || educationYears > 30)
  ) {
    throw validationError(
      'A escolaridade deve ficar entre 0 e 30 anos de estudo.',
      'educationYears',
    );
  }
  const emergency =
    body.emergencyContact && typeof body.emergencyContact === 'object'
      ? (body.emergencyContact as Record<string, unknown>)
      : {};
  const emergencyName = text(emergency.name);
  if (!emergencyName)
    throw validationError('Informe o nome do contato de emergência.', 'emergencyContact.name');
  const emergencyPhone = text(emergency.phone);
  if (emergencyPhone.replace(/\D/g, '').length < 8) {
    throw validationError(
      'Informe o telefone do contato de emergência, com DDD.',
      'emergencyContact.phone',
    );
  }
  const phone = text(body.phone);
  if (phone && phone.replace(/\D/g, '').length < 8)
    throw validationError('O telefone do paciente parece incompleto.', 'phone');
  const relationship = validEnum(
    text(emergency.relationship),
    EMERGENCY_RELATIONSHIPS,
    'Selecione um grau de parentesco válido.',
    'emergencyContact.relationship',
    'Filho(a)',
  );
  const limitation = (field: 'vision' | 'hearing' | 'mobility') =>
    validEnum(
      text(body[field]),
      LIMITATIONS,
      'Selecione uma opção funcional válida.',
      field,
      'Sem limitação',
    );
  return {
    initials,
    age,
    educationYears,
    interests: text(body.interests),
    phone,
    address: text(body.address),
    emergencyContact: { name: emergencyName, phone: emergencyPhone, relationship },
    vision: limitation('vision'),
    hearing: limitation('hearing'),
    mobility: limitation('mobility'),
    group: validEnum(
      text(body.group),
      PATIENT_GROUPS,
      'Selecione uma modalidade válida.',
      'group',
      'Individual',
    ),
    objective: text(body.objective),
  };
}

const total = (scores: MeemScores) => totalScore(scores);

export class PatientService {
  async list(user: AuthUser) {
    const query = user.role === 'admin' ? {} : { responsibleUsername: user.username };
    const patients = await PatientModel.find(query).sort({ _id: 1 }).lean();
    const usernames = [...new Set(patients.map((patient) => patient.responsibleUsername))];
    const users = await UserModel.find(
      { username: { $in: usernames } },
      { username: 1, name: 1 },
    ).lean();
    const names = new Map(users.map((entry) => [entry.username, entry.name]));
    return {
      items: patients.map((patient) => {
        const last = patient.evaluations.at(-1);
        const trend = calculateTrend(patient.evaluations);
        return {
          id: patient.code,
          initials: patient.initials,
          age: patient.age,
          group: patient.group,
          responsibleUsername: patient.responsibleUsername,
          ...(user.role === 'admin'
            ? {
                responsibleName:
                  names.get(patient.responsibleUsername) ?? patient.responsibleUsername,
              }
            : {}),
          lastEvaluationDate: last?.date ?? null,
          lastTotal: last ? total(last.scores as MeemScores) : null,
          trend,
          hasPending: Boolean(patient.pending),
        };
      }),
    };
  }

  async get(user: AuthUser, code: string) {
    const patient = await this.findVisible(user, code);
    const responsible = await UserModel.findOne(
      { username: patient.responsibleUsername },
      { name: 1 },
    ).lean();
    return {
      id: patient.code,
      initials: patient.initials,
      age: patient.age,
      educationYears: patient.educationYears,
      interests: patient.interests,
      phone: patient.phone,
      address: patient.address,
      emergencyContact: patient.emergencyContact,
      vision: patient.vision,
      hearing: patient.hearing,
      mobility: patient.mobility,
      group: patient.group,
      objective: patient.objective,
      responsibleUsername: patient.responsibleUsername,
      responsibleName: responsible?.name ?? patient.responsibleUsername,
      hasPending: Boolean(patient.pending),
      evaluationCount: patient.evaluations.length,
    };
  }

  async findVisible(user: AuthUser, code: string) {
    const patient = await PatientModel.findOne({ code }).lean();
    if (!patient || !canAccessPatient(user, patient.responsibleUsername)) throw notFound();
    return patient;
  }

  async create(user: AuthUser, input: unknown) {
    const fields = validatePatient(input);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const codes = await PatientModel.find({}, { code: 1, _id: 0 }).lean();
      const code = nextPatientCode(codes.map((patient) => patient.code));
      try {
        await PatientModel.create({
          ...fields,
          code,
          responsibleUsername: user.username,
          generationCursor: 0,
          evaluations: [],
          pending: null,
          suggestionStates: [],
        });
        return this.get(user, code);
      } catch (error) {
        if (!isDuplicateKey(error) || attempt === 4) throw error;
      }
    }
    throw new Error('Não foi possível gerar o código do paciente.');
  }

  async update(user: AuthUser, code: string, input: unknown) {
    const fields = validatePatient(input);
    const patient = await this.findVisible(user, code);
    await PatientModel.updateOne({ _id: patient._id }, { $set: fields });
    return this.get(user, code);
  }

  async delete(user: AuthUser, code: string) {
    const patient = await this.findVisible(user, code);
    await PatientModel.deleteOne({ _id: patient._id });
  }
}

export { validatePatient };

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}
