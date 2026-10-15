import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ClipboardPaste, Play } from 'lucide-react';
import { readTime, wordCount, type ScriptStore } from '../lib/storage';
import { navigate } from '../lib/nav';
import { AppHeader } from './AppHeader';

type SaveState = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

export function Editor({ store, id: initialId }: { store: ScriptStore; id: string | null }) {
  const [id, setId] = useState(initialId);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loaded, setLoaded] = useState(initialId === null);
  const [notFound, setNotFound] = useState(false);
  const [save, setSave] = useState<SaveState>('idle');
  const textRef = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<number>();
  const latest = useRef({ id, title, body });
  latest.current = { id, title, body };
  const pending = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!initialId) return;
    store
      .get(initialId)
      .then((s) => {
        if (!s) setNotFound(true);
        else {
          setTitle(s.title);
          setBody(s.body);
        }
        setLoaded(true);
      })
      .catch(() => {
        setNotFound(true);
        setLoaded(true);
      });
  }, [initialId, store]);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (pending.current) await pending.current;
    const { id: curId, title: t, body: b } = latest.current;
    if (!curId && !t.trim() && !b.trim()) return;
    const draft = { title: t.trim() || 'Untitled script', body: b };
    setSave('saving');
    pending.current = (async () => {
      try {
        if (curId) await store.update(curId, draft);
        else {
          const created = await store.create(draft);
          setId(created.id);
          latest.current.id = created.id;
          // Swap the URL without remounting the editor mid-typing
          history.replaceState(null, '', `#/edit/${created.id}`);
        }
        setSave('saved');
      } catch {
        setSave('error');
      } finally {
        pending.current = null;
      }
    })();
    await pending.current;
  }, [store]);

  const schedule = () => {
    setSave('unsaved');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 700);
  };

  // Save on the way out (tab hidden, app switched)
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.clearTimeout(timer.current);
    };
  }, [flush]);

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const el = textRef.current;
      const start = el?.selectionStart ?? body.length;
      const end = el?.selectionEnd ?? body.length;
      setBody(body.slice(0, start) + text + body.slice(end));
      schedule();
    } catch {
      textRef.current?.focus();
      alert('Clipboard access was blocked. Long-press in the text box and choose Paste instead.');
    }
  };

  const goBack = async () => {
    await flush();
    navigate('/');
  };

  const startPrompting = async () => {
    await flush();
    if (latest.current.id) navigate(`/play/${latest.current.id}`);
  };

  const words = wordCount(body);
  const statusText: Record<SaveState, string> = {
    idle: '',
    unsaved: 'Unsaved',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Save failed',
  };

  if (notFound) {
    return (
      <div className="page">
        <AppHeader />
        <main className="container">
          <p className="error">That script could not be found.</p>
          <button className="btn btn-secondary" onClick={() => navigate('/')}>
            Back to scripts
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="page editor-page">
      <AppHeader
        left={
          <button className="icon-btn on-dark" onClick={goBack} aria-label="Back to scripts">
            <ArrowLeft size={22} />
          </button>
        }
      >
        <span className={`save-state ${save}`} aria-live="polite">
          {statusText[save]}
        </span>
      </AppHeader>

      <main className="container editor">
        <input
          className="title-input"
          value={title}
          placeholder="Script title"
          aria-label="Script title"
          disabled={!loaded}
          onChange={(e) => {
            setTitle(e.target.value);
            schedule();
          }}
        />
        <textarea
          ref={textRef}
          className="body-input"
          value={body}
          placeholder="Type or paste your script here…"
          aria-label="Script text"
          disabled={!loaded}
          onChange={(e) => {
            setBody(e.target.value);
            schedule();
          }}
        />
      </main>

      <footer className="editor-bar">
        <div className="editor-stats">
          <strong>{words}</strong> words
          <span className="dot" aria-hidden>
            ·
          </span>
          ~{readTime(words)}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={pasteFromClipboard}>
          <ClipboardPaste size={16} /> Paste
        </button>
        <button className="btn btn-primary" onClick={startPrompting} disabled={!words}>
          <Play size={18} fill="currentColor" /> Prompt
        </button>
      </footer>
    </div>
  );
}
