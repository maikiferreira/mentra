import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { LeadsDto, UsersDto } from '@mente-ativa/shared';
import { useUIStore } from '../ui-store';
import { ErrorNote, Loading } from '../components/Feedback';
import { client } from '../lib/client';

function UsersPage() {
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => client<UsersDto>('/users'),
  });
  const leads = useQuery({
    queryKey: ['leads'],
    queryFn: () => client<LeadsDto>('/leads'),
  });
  if (users.isLoading || leads.isLoading) return <Loading />;
  if (users.error || leads.error) return <ErrorNote error={users.error || leads.error} />;
  return (
    <>
      <div className="head">
        <h1>Usuários</h1>
        <p className="muted">
          Quem tem acesso ao sistema e quantos pacientes cada um acompanha. Apenas administradores
          veem esta tela.
        </p>
      </div>
      <div className="panel">
        <div className="tblwrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Usuário</th>
                <th>Perfil</th>
                <th className="num">Pacientes</th>
              </tr>
            </thead>
            <tbody>
              {users.data!.items.map((user) => (
                <tr key={user.username}>
                  <td>{user.name}</td>
                  <td>{user.username}</td>
                  <td>{user.role === 'admin' ? 'Administrador' : 'Profissional'}</td>
                  <td className="num">{user.patientCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="head" style={{ marginTop: 28 }}>
        <h2>Pedidos de teste ("Quero testar")</h2>
        <p className="muted">
          Contatos deixados na tela de login. Só o dono da página vê esta lista.
        </p>
      </div>
      {leads.data!.items.length ? (
        <div className="panel">
          <div className="tblwrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>E-mail</th>
                  <th>Usuário</th>
                  <th>Atuação</th>
                  <th>Local</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {leads.data!.items.map((lead) => (
                  <tr key={`${lead.username}-${lead.createdAt}`}>
                    <td>{lead.name}</td>
                    <td>{lead.phone}</td>
                    <td>{lead.email}</td>
                    <td>{lead.username}</td>
                    <td>{lead.profile}</td>
                    <td>{lead.workplace}</td>
                    <td>{new Date(lead.createdAt).toLocaleDateString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="panel">
          <p className="muted">Nenhum pedido recebido ainda.</p>
        </div>
      )}
    </>
  );
}

/** Sem children, mostra a tela de usuários. */
export function AdminOnly({ children }: { children?: ReactNode }) {
  const session = useUIStore((state) => state.session)!;
  return session.user.role === 'admin' ? (
    <>{children ?? <UsersPage />}</>
  ) : (
    <Navigate to="/" replace />
  );
}
