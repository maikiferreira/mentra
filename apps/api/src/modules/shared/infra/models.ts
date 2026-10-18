import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ['admin', 'professional'], required: true },
    passwordHash: { type: String, required: true, select: false },
    origin: { type: String, enum: ['seed', 'signup', 'trial'], required: true },
  },
  { timestamps: true },
);

const evaluationSchema = new Schema(
  {
    id: { type: String, required: true },
    // Avaliações anteriores aos múltiplos testes não têm o campo: são MEEM.
    instrument: { type: String, default: 'meem' },
    // Dia da avaliação, à meia-noite UTC.
    performedOn: { type: Date, required: true },
    // Respostas por campo do teste (ver INSTRUMENTS em @mente-ativa/shared).
    scores: { type: Schema.Types.Mixed, required: true },
    notes: { type: String, default: null },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, default: null },
  },
  { _id: false },
);
const suggestionStateSchema = new Schema(
  {
    key: { type: String, required: true },
    status: { type: String, enum: ['open', 'ok', 'no'], required: true, default: 'open' },
    customText: { type: String, default: null },
    // Quando entrou na rotina; a adesão semanal conta a partir dessa semana.
    acceptedAt: { type: Date, default: null },
  },
  { _id: false },
);
const patientSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    initials: { type: String, required: true },
    age: { type: Number, required: true },
    educationYears: { type: Number, default: null },
    interests: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    emergencyContact: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      relationship: { type: String, required: true },
    },
    vision: { type: String, required: true },
    hearing: { type: String, required: true },
    mobility: { type: String, required: true },
    group: { type: String, required: true },
    objective: { type: String, default: '' },
    responsibleUsername: { type: String, required: true, index: true },
    evaluations: { type: [evaluationSchema], default: [] },
    suggestionStates: { type: [suggestionStateSchema], default: [] },
    // Semanas (segunda-feira, aaaa-mm-dd) em que cada atividade da rotina foi feita.
    routineLog: {
      type: [
        new Schema(
          {
            key: { type: String, required: true },
            week: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true, versionKey: '__v' },
);
const leadSchema = new Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true },
    profile: { type: String, required: true },
    workplace: { type: String, default: '' },
    username: { type: String, required: true },
    consentAt: { type: Date, required: true },
    createdAt: { type: Date, required: true, default: Date.now, index: -1 },
  },
  { versionKey: false },
);

export type UserRecord = InferSchemaType<typeof userSchema>;
export type PatientRecord = InferSchemaType<typeof patientSchema>;
export type LeadRecord = InferSchemaType<typeof leadSchema>;
export const UserModel =
  (mongoose.models.User as mongoose.Model<UserRecord> | undefined) ??
  mongoose.model<UserRecord>('User', userSchema);
export const PatientModel =
  (mongoose.models.Patient as mongoose.Model<PatientRecord> | undefined) ??
  mongoose.model<PatientRecord>('Patient', patientSchema);
export const LeadModel =
  (mongoose.models.Lead as mongoose.Model<LeadRecord> | undefined) ??
  mongoose.model<LeadRecord>('Lead', leadSchema);
