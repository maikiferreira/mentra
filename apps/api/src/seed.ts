import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from './modules/shared/infra/database.js';
import { PatientModel, UserModel } from './modules/shared/infra/models.js';
import { SEED_PATIENTS, SEED_USERS, seedPatientDocument } from './seed-data.js';

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
        $setOnInsert: seedPatientDocument(patient),
      },
      { upsert: true },
    );
  }
}

const entry = process.argv[1]?.replaceAll('\\', '/');
if (entry?.endsWith('/seed.ts') || entry?.endsWith('/seed.js')) {
  // O seed cria usuários de demonstração com senhas triviais (admin/admin etc.).
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
    console.error(
      'Seed de demonstração bloqueado em produção. Use create-admin, ou defina ALLOW_PRODUCTION_SEED=true.',
    );
    process.exit(1);
  }
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
