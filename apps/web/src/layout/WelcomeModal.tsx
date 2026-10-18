import { useEffect } from 'react';
import { useUIStore } from '../ui-store';

export function WelcomeModal() {
  const welcome = useUIStore((state) => state.welcome);
  const setWelcome = useUIStore((state) => state.setWelcome);
  useEffect(() => {
    if (!welcome) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setWelcome(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [setWelcome, welcome]);
  if (!welcome) return null;
  return (
    <div className="modal-bg">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <h2 id="welcome-title">Bem-vindo(a), {welcome.name.trim().split(/\s+/)[0]}!</h2>
        <p>
          Seu acesso de teste ao Mente Ativa está liberado. Anote seus dados para entrar nas
          próximas vezes:
        </p>
        <dl className="cred">
          <dt>Usuário</dt>
          <dd>{welcome.username}</dd>
          <dt>Senha</dt>
          <dd>{welcome.password}</dd>
        </dl>
        <p className="muted">
          Você começa sem nenhum paciente cadastrado. Use "Novo paciente" para criar o primeiro.
        </p>
        <button className="btn primary" autoFocus onClick={() => setWelcome(null)}>
          Entendi
        </button>
      </div>
    </div>
  );
}
