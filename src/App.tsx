import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { cloudEnabled, storeFor, supabase } from './lib/storage';
import { Library } from './components/Library';
import { Editor } from './components/Editor';
import { PrompterRoute } from './components/Prompter';
import { SignIn } from './components/SignIn';

type Route =
  | { name: 'library' }
  | { name: 'new' }
  | { name: 'edit'; id: string }
  | { name: 'play'; id: string };

function parseHash(): Route {
  const [, view, id] = window.location.hash.replace(/^#/, '').split('/');
  if (view === 'new') return { name: 'new' };
  if (view === 'edit' && id) return { name: 'edit', id };
  if (view === 'play' && id) return { name: 'play', id };
  return { name: 'library' };
}

const LOCAL_ONLY_KEY = 'tacl-teleprompt:local-only';

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [localOnly, setLocalOnly] = useState(() => localStorage.getItem(LOCAL_ONLY_KEY) === '1');

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const store = useMemo(() => storeFor(session), [session]);

  const chooseLocalOnly = (value: boolean) => {
    if (value) localStorage.setItem(LOCAL_ONLY_KEY, '1');
    else localStorage.removeItem(LOCAL_ONLY_KEY);
    setLocalOnly(value);
  };

  if (!authReady) return <div className="splash" aria-busy="true" />;

  if (cloudEnabled && !session && !localOnly) {
    return <SignIn onSkip={() => chooseLocalOnly(true)} />;
  }

  const account = {
    email: session?.user.email ?? null,
    signOut: session ? () => supabase?.auth.signOut() : null,
    signIn: cloudEnabled && !session ? () => chooseLocalOnly(false) : null,
  };

  switch (route.name) {
    case 'new':
      return <Editor store={store} id={null} />;
    case 'edit':
      return <Editor key={route.id} store={store} id={route.id} />;
    case 'play':
      return <PrompterRoute store={store} id={route.id} />;
    default:
      return <Library store={store} account={account} />;
  }
}
