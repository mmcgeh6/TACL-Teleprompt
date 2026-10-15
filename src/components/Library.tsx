import { useEffect, useRef, useState } from 'react';
import { Copy, Download, FileUp, LogIn, LogOut, Pencil, Play, Plus, Search, Share, Trash2, X } from 'lucide-react';
import {
  localScriptCount,
  moveLocalToCloud,
  readTime,
  wordCount,
  type Script,
  type ScriptStore,
} from '../lib/storage';
import { navigate } from '../lib/nav';
import { useInstall } from '../lib/install';
import { AppHeader } from './AppHeader';

interface Account {
  email: string | null;
  signOut: (() => void) | null;
  signIn: (() => void) | null;
}

export function Library({ store, account }: { store: ScriptStore; account: Account }) {
  const [scripts, setScripts] = useState<Script[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [localCount, setLocalCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const pwa = useInstall();

  const load = async () => {
    try {
      setScripts(await store.list());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load scripts.');
      setScripts([]);
    }
    setLocalCount(store.kind === 'cloud' ? localScriptCount() : 0);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const remove = async (s: Script) => {
    if (!confirm(`Delete "${s.title}"? This can't be undone.`)) return;
    await store.remove(s.id);
    load();
  };

  const duplicate = async (s: Script) => {
    await store.create({ title: `${s.title} (copy)`, body: s.body });
    load();
  };

  const importFile = async (file: File) => {
    const body = await file.text();
    const title = file.name.replace(/\.[^.]+$/, '') || 'Imported script';
    const created = await store.create({ title, body });
    navigate(`/edit/${created.id}`);
  };

  const moveLocal = async () => {
    const n = await moveLocalToCloud(store);
    alert(`Moved ${n} script${n === 1 ? '' : 's'} to your account.`);
    load();
  };

  const q = query.trim().toLowerCase();
  const visible = (scripts ?? []).filter(
    (s) => !q || s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q),
  );

  return (
    <div className="page">
      <AppHeader>
        {pwa.canPrompt && (
          <button className="btn btn-primary btn-sm" onClick={pwa.install}>
            <Download size={16} strokeWidth={3} /> Install app
          </button>
        )}
        {account.signOut ? (
          <button className="icon-btn on-dark" onClick={account.signOut} aria-label="Sign out" title={account.email ?? ''}>
            <LogOut size={20} />
          </button>
        ) : account.signIn ? (
          <button className="icon-btn on-dark" onClick={account.signIn} aria-label="Sign in to sync">
            <LogIn size={20} />
          </button>
        ) : null}
      </AppHeader>

      <main className="container">
        <section className="library-head">
          <div>
            <span className="section-tag">
              <span className="sparkle" aria-hidden /> {store.kind === 'cloud' ? 'Synced to your account' : 'Saved on this device'}
            </span>
            <h1 className="page-title">Your scripts</h1>
          </div>
          <div className="library-actions">
            <button className="btn btn-primary" onClick={() => navigate('/new')}>
              <Plus size={18} strokeWidth={3} /> New script
            </button>
            <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
              <FileUp size={18} /> Import .txt
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
                e.target.value = '';
              }}
            />
          </div>
        </section>

        {pwa.showIOSHint && (
          <div className="notice card install-hint">
            <p>
              <strong>Install on this device.</strong> Tap <Share size={16} aria-label="Share" className="inline-icon" /> Share,
              then <strong>Add to Home Screen</strong>. It opens full screen and works offline.
            </p>
            <button className="icon-btn" onClick={pwa.dismissHint} aria-label="Dismiss install tip">
              <X size={18} />
            </button>
          </div>
        )}

        {localCount > 0 && (
          <div className="notice card">
            <p>
              You have {localCount} script{localCount === 1 ? '' : 's'} saved on this device from before you signed in.
            </p>
            <button className="btn btn-dark btn-sm" onClick={moveLocal}>
              Move to my account
            </button>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        {scripts && scripts.length > 3 && (
          <label className="search">
            <Search size={18} aria-hidden />
            <input
              type="search"
              placeholder="Search scripts"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search scripts"
            />
          </label>
        )}

        {scripts === null ? (
          <p className="muted">Loading…</p>
        ) : scripts.length === 0 ? (
          <div className="empty card">
            <img src="/icon-head.png" alt="" width={120} height={120} />
            <h2>Paste your first script</h2>
            <p className="muted">Write it here or paste it from anywhere. Then set your speed, flip it for your rig, and roll.</p>
            <button className="btn btn-primary" onClick={() => navigate('/new')}>
              <Plus size={18} strokeWidth={3} /> New script
            </button>
          </div>
        ) : (
          <ul className="script-list">
            {visible.map((s) => {
              const words = wordCount(s.body);
              return (
                <li key={s.id} className="script-card card">
                  <button className="script-main" onClick={() => navigate(`/edit/${s.id}`)}>
                    <h3>{s.title || 'Untitled script'}</h3>
                    <p className="script-preview">{s.body.slice(0, 140) || 'Empty script'}</p>
                    <p className="script-meta">
                      {words} words · ~{readTime(words)} · {new Date(s.updated_at).toLocaleDateString()}
                    </p>
                  </button>
                  <div className="script-actions">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => navigate(`/play/${s.id}`)}
                      disabled={!words}
                    >
                      <Play size={16} fill="currentColor" /> Prompt
                    </button>
                    <button className="icon-btn" onClick={() => navigate(`/edit/${s.id}`)} aria-label={`Edit ${s.title}`}>
                      <Pencil size={18} />
                    </button>
                    <button className="icon-btn" onClick={() => duplicate(s)} aria-label={`Duplicate ${s.title}`}>
                      <Copy size={18} />
                    </button>
                    <button className="icon-btn danger" onClick={() => remove(s)} aria-label={`Delete ${s.title}`}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                </li>
              );
            })}
            {visible.length === 0 && <p className="muted">No scripts match "{query}".</p>}
          </ul>
        )}
      </main>
    </div>
  );
}
