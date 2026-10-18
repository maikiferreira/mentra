import { type ReactNode } from 'react';

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="shell out">
      <div className="content">
        <main>{children}</main>
        <p className="principle">
          <b>A tecnologia sugere. O profissional decide.</b> As sugestões não são diagnóstico nem
          prescrição.
        </p>
      </div>
    </div>
  );
}
