import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { TRIAL_PROFILES } from '@mente-ativa/shared';
import { api, jsonBody, type Session } from '../api';
import { useUIStore } from '../ui-store';
import { Brand } from '../components/Brand';
import { errorMessage } from '../lib/client';

export function AuthPage({ mode }: { mode: 'login' | 'signup' | 'trial' }) {
  const session = useUIStore((state) => state.session);
  const setSession = useUIStore((state) => state.setSession);
  const setWelcome = useUIStore((state) => state.setWelcome);
  const [values, setValues] = useState<Record<string, string | boolean>>({
    profile: TRIAL_PROFILES[0],
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  if (session) return <Navigate to="/" replace />;
  const change = (field: string, value: string | boolean) => {
    setValues((current) => ({ ...current, [field]: value }));
    setError('');
  };
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      let result: Session & { credentials?: { username: string; password: string } };
      if (mode === 'login')
        result = await api('/auth/login', {
          method: 'POST',
          body: jsonBody({ username: values.username ?? '', password: values.password ?? '' }),
        });
      else if (mode === 'signup')
        result = await api('/auth/signup', {
          method: 'POST',
          body: jsonBody({
            name: values.name ?? '',
            email: values.email ?? '',
            username: values.username ?? '',
            password: values.password ?? '',
            passwordConfirmation: values.confirmation ?? '',
          }),
        });
      else
        result = await api('/auth/trial-access', {
          method: 'POST',
          body: jsonBody({
            name: values.name ?? '',
            phone: values.phone ?? '',
            email: values.email ?? '',
            profile: values.profile ?? TRIAL_PROFILES[0],
            workplace: values.workplace ?? '',
            consent: values.consent === true,
          }),
        });
      setSession({ token: result.token, user: result.user });
      if (result.credentials) setWelcome({ ...result.credentials, name: result.user.name });
      queryClient.clear();
      navigate('/', { replace: true });
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setBusy(false);
    }
  };
  const brand = <Brand />;
  const input = (
    key: string,
    label: string,
    type = 'text',
    autocomplete = key,
    placeholder?: string,
  ) => (
    <label htmlFor={`auth-${key}`} key={key}>
      {label}
      <input
        id={`auth-${key}`}
        type={type}
        autoComplete={autocomplete}
        placeholder={placeholder}
        value={String(values[key] ?? '')}
        onChange={(event) => change(key, event.target.value)}
      />
    </label>
  );
  if (mode === 'trial')
    return (
      <div className="auth">
        <div className="panel">
          {brand}
          <div>
            <h1>Quero testar o Mente Ativa</h1>
            <p className="muted">
              Acompanhe a evolução cognitiva dos seus pacientes e planeje a rotina de atividades.
              Deixe seu contato e liberamos um acesso de teste na hora, sem pacientes cadastrados.
            </p>
          </div>
          <form className="stack" style={{ gap: 14 }} onSubmit={handleSubmit}>
            {input('name', 'Nome', 'text', 'name')}
            {input('phone', 'Telefone (WhatsApp)', 'tel', 'tel', '(32) 90000-0000')}
            {input('email', 'E-mail', 'email', 'email', 'nome@exemplo.com')}
            <label htmlFor="auth-profile">
              Como você atua?
              <select
                id="auth-profile"
                value={String(values.profile)}
                onChange={(event) => change('profile', event.target.value)}
              >
                {TRIAL_PROFILES.map((profile) => (
                  <option key={profile}>{profile}</option>
                ))}
              </select>
            </label>
            {input(
              'workplace',
              'Onde você atua (opcional)',
              'text',
              'organization',
              'Ex.: clínica, ILPI, centro-dia',
            )}
            <label className="chk" htmlFor="auth-consent">
              <input
                id="auth-consent"
                type="checkbox"
                checked={values.consent === true}
                onChange={(event) => change('consent', event.target.checked)}
              />
              <span>
                Autorizo o contato sobre o teste do Mente Ativa. Uso estes dados só para isso.
              </span>
            </label>
            {error && (
              <div className="note warn" role="alert">
                {error}
              </div>
            )}
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Enviando…' : 'Quero testar'}
            </button>
          </form>
          <p className="srcnote">
            Seu acesso: usuário = seu primeiro nome. Senha = os 4 últimos dígitos do telefone.
          </p>
          <p className="muted">
            <Link className="link" to="/login">
              Voltar ao login
            </Link>
          </p>
        </div>
      </div>
    );
  const signup = mode === 'signup';
  return (
    <div className="auth">
      <div className="panel">
        {brand}
        <div>
          <h1>{signup ? 'Criar conta' : 'Entrar'}</h1>
          <p className="muted">
            {signup
              ? 'Cadastre-se para acompanhar seus pacientes.'
              : 'Acesse para acompanhar seus pacientes.'}
          </p>
        </div>
        <form className="stack" style={{ gap: 14 }} onSubmit={handleSubmit}>
          {signup && input('name', 'Nome', 'text', 'name')}
          {signup && input('email', 'E-mail', 'email', 'email', 'nome@exemplo.com')}
          {input('username', 'Usuário', 'text', 'username')}
          {input('password', 'Senha', 'password', signup ? 'new-password' : 'current-password')}
          {signup && input('confirmation', 'Confirmar senha', 'password', 'new-password')}
          {error && (
            <div className="note warn" role="alert">
              {error}
            </div>
          )}
          <button className="btn primary" type="submit">
            {signup ? 'Criar conta' : 'Entrar'}
          </button>
        </form>
        <p className="muted">
          {signup ? 'Já tem conta? ' : 'Ainda não tem conta? '}
          <Link className="link" to={signup ? '/login' : '/cadastro'}>
            {signup ? 'Entrar' : 'Criar conta'}
          </Link>
        </p>
        {!signup && (
          <>
            <div className="cta">
              <b>Quer testar o Mente Ativa?</b>
              <p className="muted">Deixe seu contato e avisamos quando houver vaga.</p>
              <Link className="btn" to="/quero-testar">
                Quero testar
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
