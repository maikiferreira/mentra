import bcrypt from 'bcryptjs';
import { TRIAL_PROFILES, firstNameUsername, uniqueUsername } from '@mente-ativa/shared';
import { z } from 'zod';
import { ApiError, conflict, validationError } from '../../shared/kernel/errors.js';
import { LeadModel, UserModel } from '../../shared/infra/models.js';
import { createToken, type AuthUser } from '../../shared/presentation/http.js';

const credentialsSchema = z.object({ username: z.string(), password: z.string() });
const objectSchema = z.record(z.string(), z.unknown());
const stringSchema = z.string();

function publicUser(user: {
  username: string;
  name: string;
  role: 'admin' | 'professional';
}): AuthUser {
  return { username: user.username, name: user.name, role: user.role };
}

export class AuthService {
  async login(input: unknown) {
    const parsed = credentialsSchema.safeParse(input);
    const username = parsed.success ? parsed.data.username.trim().toLowerCase() : '';
    const password = parsed.success ? parsed.data.password : '';
    const user = await UserModel.findOne({ username }).select('+passwordHash').lean();
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Usuário ou senha incorretos.');
    }
    const view = publicUser(user);
    return { token: createToken(view), user: view };
  }

  async signup(input: unknown) {
    const parsed = objectSchema.safeParse(input);
    const data = parsed.success ? parsed.data : {};
    const stringField = (field: string) => {
      const value = stringSchema.safeParse(data[field]);
      return value.success ? value.data : '';
    };
    const name = stringField('name').trim();
    const username = stringField('username').trim().toLowerCase();
    const password = stringField('password');
    const passwordConfirmation = stringField('passwordConfirmation');
    if (!name) throw validationError('Informe seu nome.', 'name');
    if (!/^[a-z0-9._-]{3,}$/.test(username)) {
      throw validationError(
        'O usuário deve ter ao menos 3 caracteres, só letras, números, ponto, hífen ou sublinhado.',
        'username',
      );
    }
    if (await UserModel.exists({ username }))
      throw validationError('Este usuário já existe. Escolha outro.', 'username');
    if (password.length < 4)
      throw validationError('A senha deve ter ao menos 4 caracteres.', 'password');
    if (password !== passwordConfirmation)
      throw validationError('As senhas não conferem.', 'passwordConfirmation');
    try {
      const user = await UserModel.create({
        username,
        name,
        role: 'professional',
        passwordHash: await bcrypt.hash(password, 12),
        origin: 'signup',
      });
      const view = publicUser(user);
      return { token: createToken(view), user: view };
    } catch (error) {
      if (isDuplicateKey(error))
        throw validationError('Este usuário já existe. Escolha outro.', 'username');
      throw error;
    }
  }

  async trialAccess(input: unknown) {
    const parsed = objectSchema.safeParse(input);
    const data = parsed.success ? parsed.data : {};
    const getString = (field: string) => {
      const value = stringSchema.safeParse(data[field]);
      return value.success ? value.data : '';
    };
    const name = getString('name').trim();
    const phone = getString('phone').trim();
    const email = getString('email').trim();
    if (!name) throw validationError('Informe seu nome.', 'name');
    if (phone.replace(/\D/g, '').length < 8)
      throw validationError('Informe um telefone com DDD.', 'phone');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw validationError('Informe um e-mail válido.', 'email');
    if (data.consent !== true)
      throw validationError('Marque a autorização para receber o contato.', 'consent');
    const submittedProfile = data.profile === undefined ? TRIAL_PROFILES[0] : data.profile;
    if (
      typeof submittedProfile !== 'string' ||
      !TRIAL_PROFILES.includes(submittedProfile as (typeof TRIAL_PROFILES)[number])
    ) {
      throw validationError('Selecione uma forma de atuação válida.', 'profile');
    }
    const profile = submittedProfile;
    if (!profile) throw new Error('Perfil de teste não configurado');
    const usernames = await UserModel.find({}, { username: 1, _id: 0 }).lean();
    const username = uniqueUsername(
      firstNameUsername(name),
      usernames.map((item) => item.username),
    );
    const digits = phone.replace(/\D/g, '');
    const password = digits.slice(-4);
    const createdAt = new Date();
    try {
      const lead = await LeadModel.create({
        name,
        phone,
        email,
        profile,
        workplace: getString('workplace'),
        username,
        consentAt: createdAt,
        createdAt,
      });
      let user;
      try {
        user = await UserModel.create({
          username,
          name,
          role: 'professional',
          passwordHash: await bcrypt.hash(password, 12),
          origin: 'trial',
        });
      } catch (error) {
        await LeadModel.deleteOne({ _id: lead._id });
        throw error;
      }
      const view = publicUser(user);
      return { token: createToken(view), user: view, credentials: { username, password } };
    } catch (error) {
      if (isDuplicateKey(error))
        throw conflict('Não foi possível reservar o usuário gerado. Tente novamente.');
      throw error;
    }
  }

  async me(username: string) {
    const user = await UserModel.findOne({ username }).lean();
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
    return { user: publicUser(user) };
  }
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}
