import { errorMessage } from '../lib/client';

export function ErrorNote({ error }: { error: unknown }) {
  return error ? (
    <div className="note warn" role="alert">
      {errorMessage(error)}
    </div>
  ) : null;
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <p className="muted" role="status">
      {label}
    </p>
  );
}
