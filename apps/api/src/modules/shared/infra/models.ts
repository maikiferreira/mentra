import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import type { MeemScores, MeemDomainKey } from '@mentra/shared';

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

const scoresSchema = new Schema(
  {
    ori: { type: Number, required: true },
    reg: { type: Number, required: true },
    ate: { type: Number, required: true },
    evo: { type: Number, required: true },
    lin: { type: Number, required: true },
  },
  { _id: false },
);
const evaluationSchema = new Schema(
  {
    date: { type: String, required: true },
    scores: { type: scoresSchema, required: true },
    notes: { type: String, default: null },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);
const pendingSchema = new Schema(
  {
    date: { type: String, required: true },
    scores: { type: scoresSchema, required: true },
    writtenTotal: { type: Number, required: true },
    flag: { type: String, enum: ['ori', 'reg', 'ate', 'evo', 'lin', null], default: null },
    observations: { type: String, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);
const suggestionStateSchema = new Schema(
  {
    key: { type: String, required: true },
    status: { type: String, enum: ['open', 'ok', 'no'], required: true, default: 'open' },
    customText: { type: String, default: null },
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
    generationCursor: { type: Number, required: true, default: 0 },
    evaluations: { type: [evaluationSchema], default: [] },
    pending: { type: pendingSchema, default: null },
    suggestionStates: { type: [suggestionStateSchema], default: [] },
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
export type StoredScores = MeemScores;
export type StoredDomainKey = MeemDomainKey;
