import mongoose from 'mongoose';
import {
  LeadModel,
  PatientModel,
  PaymentModel,
  ProcessedWebhookEventModel,
  UnmatchedBillingEventModel,
  SubscriptionModel,
  UserModel,
} from './models.js';
import { migrateEvaluations } from './migrations.js';

export const initModels = () =>
  Promise.all([
    UserModel.init(),
    PatientModel.init(),
    LeadModel.init(),
    SubscriptionModel.init(),
    PaymentModel.init(),
    ProcessedWebhookEventModel.init(),
    UnmatchedBillingEventModel.init(),
  ]);

export async function connectDatabase(
  uri = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/mente-ativa',
) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  await initModels();
  await migrateEvaluations();
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
