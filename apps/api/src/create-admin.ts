import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from './modules/shared/infra/database.js';
import { UserModel } from './modules/shared/infra/models.js';

// Uso: ADMIN_PASSWORD='...' npm run create-admin -w @mente-ativa/api -- <usuario> <nome> [--update]
// A senha vem de variável de ambiente para não ficar no histórico do shell nem em `ps`.
const args = process.argv.slice(2);
const update = args.includes('--update');
const [username, ...nameParts] = args.filter((arg) => arg !== '--update');
const name = nameParts.join(' ').trim();
const password = process.env.ADMIN_PASSWORD ?? '';

if (!username || !name) {
  console.error(
    'Uso: ADMIN_PASSWORD=<senha> npm run create-admin -w @mente-ativa/api -- <usuario> <nome> [--update]',
  );
  process.exit(1);
}
if (password.length < 12) {
  console.error('ADMIN_PASSWORD precisa ter pelo menos 12 caracteres.');
  process.exit(1);
}

try {
  await connectDatabase();
  const normalized = username.trim().toLowerCase();
  const existing = await UserModel.findOne({ username: normalized });
  const passwordHash = await bcrypt.hash(password, 12);
  if (existing && !update) {
    console.error(
      `Usuário "${normalized}" já existe. Use --update para redefinir senha e papel de admin.`,
    );
    process.exitCode = 1;
  } else if (existing) {
    await UserModel.updateOne({ _id: existing._id }, { name, role: 'admin', passwordHash });
    console.info(`Admin "${normalized}" atualizado.`);
  } else {
    await UserModel.create({
      username: normalized,
      name,
      role: 'admin',
      origin: 'seed',
      passwordHash,
    });
    console.info(`Admin "${normalized}" criado.`);
  }
} finally {
  await disconnectDatabase();
}
