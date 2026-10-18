import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from './modules/shared/infra/database.js';
import { PatientModel, UserModel } from './modules/shared/infra/models.js';
import { SEED_PATIENTS, SEED_USERS } from './seed-data.js';

export async function seedDatabase() {
  for (const user of SEED_USERS) {
    await UserModel.updateOne(
      { username: user.username },
      {
        $setOnInsert: {
          username: user.username,
          name: user.name,
          role: user.role,
          origin: 'seed',
          passwordHash: await bcrypt.hash(user.password, 12),
        },
      },
      { upsert: true },
    );
  }
  for (const patient of SEED_PATIENTS) {
    await PatientModel.updateOne(
      { code: patient.code },
      {
        $setOnInsert: {
          ...patient,
          generationCursor: 0,
          pending: null,
          suggestionStates: [],
        },
      },
      { upsert: true },
    );
  }
}

if (process.argv[1]?.endsWith('/seed.ts') || process.argv[1]?.endsWith('/seed.js')) {
  try {
    await connectDatabase();
    await seedDatabase();
    console.info(
      'Seed users and patients inserted where missing; existing records were preserved.',
    );
  } finally {
    await disconnectDatabase();
  }
}
