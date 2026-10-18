import bcrypt from 'bcryptjs';
import { SEED_PATIENTS, SEED_USERS, seedPatientDocument } from '../../../seed-data.js';
import { LeadModel, PatientModel, UserModel } from '../../shared/infra/models.js';

export async function resetDemoDatabase() {
  await Promise.all([
    UserModel.deleteMany({}),
    PatientModel.deleteMany({}),
    LeadModel.deleteMany({}),
  ]);
  for (const user of SEED_USERS) {
    await UserModel.create({
      username: user.username,
      name: user.name,
      role: user.role,
      origin: 'seed',
      passwordHash: await bcrypt.hash(user.password, 12),
    });
  }
  await PatientModel.insertMany(SEED_PATIENTS.map(seedPatientDocument));
}
