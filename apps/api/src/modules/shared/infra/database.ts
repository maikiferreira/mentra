import mongoose from 'mongoose';
import { LeadModel, PatientModel, UserModel } from './models.js';

export async function connectDatabase(
  uri = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/mentra',
) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  await Promise.all([UserModel.init(), PatientModel.init(), LeadModel.init()]);
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
