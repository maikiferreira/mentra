import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ['admin', 'professional'], required: true },
    passwordHash: { type: String, required: true, select: false },
    origin: { type: String, enum: ['seed', 'signup', 'trial'], required: true },
    email: { type: String, lowercase: true, trim: true, index: true },
    trialEndsAt: { type: Date },
  },
  { timestamps: true },
);

const evaluationSchema = new Schema(
  {
    date: { type: String, required: true },
    // Avaliações anteriores aos múltiplos testes não têm o campo: são MEEM.
    instrument: { type: String, default: 'meem' },
    // Respostas por campo do teste (ver INSTRUMENTS em @mente-ativa/shared).
    scores: { type: Schema.Types.Mixed, required: true },
    notes: { type: String, default: null },
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
    evaluations: { type: [evaluationSchema], default: [] },
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

const planEnum = ['monthly', 'annual'];
const subscriptionSchema = new Schema(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, default: null },
    // Os índices sparse permitem vários documentos ainda sem cliente/assinatura no Stripe.
    stripeCustomerId: { type: String, unique: true, sparse: true },
    stripeSubscriptionId: { type: String, unique: true, sparse: true },
    plan: { type: String, enum: planEnum, default: null },
    status: {
      type: String,
      enum: ['trialing', 'incomplete', 'active', 'past_due', 'canceled'],
      default: 'incomplete',
    },
    startedAt: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    canceledAt: { type: Date, default: null },
    // Início da inadimplência, base da carência (RN-PAY-06).
    pastDueSince: { type: Date, default: null },
    // Marcadores que garantem um único e-mail de liberação/cancelamento (RN-PAY-08/10).
    activatedAt: { type: Date, default: null },
    cancelNoticeSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);
const paymentSchema = new Schema(
  {
    username: { type: String, required: true, index: true },
    stripeInvoiceId: { type: String, required: true, unique: true },
    amountCents: { type: Number, required: true },
    currency: { type: String, required: true },
    plan: { type: String, enum: planEnum, default: null },
    status: { type: String, enum: ['paid', 'failed', 'refunded'], required: true },
    paidAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);
const processedStripeEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    processedAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false },
);

export type UserRecord = InferSchemaType<typeof userSchema>;
export type PatientRecord = InferSchemaType<typeof patientSchema>;
export type LeadRecord = InferSchemaType<typeof leadSchema>;
export type SubscriptionRecord = InferSchemaType<typeof subscriptionSchema>;
export type PaymentRecord = InferSchemaType<typeof paymentSchema>;
export type ProcessedStripeEventRecord = InferSchemaType<typeof processedStripeEventSchema>;
export const UserModel =
  (mongoose.models.User as mongoose.Model<UserRecord> | undefined) ??
  mongoose.model<UserRecord>('User', userSchema);
export const PatientModel =
  (mongoose.models.Patient as mongoose.Model<PatientRecord> | undefined) ??
  mongoose.model<PatientRecord>('Patient', patientSchema);
export const LeadModel =
  (mongoose.models.Lead as mongoose.Model<LeadRecord> | undefined) ??
  mongoose.model<LeadRecord>('Lead', leadSchema);
export const SubscriptionModel =
  (mongoose.models.Subscription as mongoose.Model<SubscriptionRecord> | undefined) ??
  mongoose.model<SubscriptionRecord>('Subscription', subscriptionSchema);
export const PaymentModel =
  (mongoose.models.Payment as mongoose.Model<PaymentRecord> | undefined) ??
  mongoose.model<PaymentRecord>('Payment', paymentSchema);
export const ProcessedStripeEventModel =
  (mongoose.models.ProcessedStripeEvent as
    mongoose.Model<ProcessedStripeEventRecord> | undefined) ??
  mongoose.model<ProcessedStripeEventRecord>('ProcessedStripeEvent', processedStripeEventSchema);
