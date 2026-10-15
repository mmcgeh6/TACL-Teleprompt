import type { ReactNode } from 'react';
import { navigate } from '../lib/nav';

export function AppHeader({ children, left }: { children?: ReactNode; left?: ReactNode }) {
  return (
    <header className="app-header">
      {left ?? (
        <button className="brand" onClick={() => navigate('/')} aria-label="All scripts">
          <img src="/icon-badge.png" alt="" width={36} height={36} />
          <span className="brand-word">
            Tele<span className="hl">prompt</span>
          </span>
        </button>
      )}
      <div className="header-actions">{children}</div>
    </header>
  );
}
