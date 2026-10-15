import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

export interface Script {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export type ScriptDraft = Pick<Script, 'title' | 'body'>;

export interface ScriptStore {
  kind: 'local' | 'cloud';
  list(): Promise<Script[]>;
  get(id: string): Promise<Script | null>;
  create(draft: ScriptDraft): Promise<Script>;
  update(id: string, draft: Partial<ScriptDraft>): Promise<Script>;
  remove(id: string): Promise<void>;
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: true, detectSessionInUrl: true } }) : null;

export const cloudEnabled = supabase !== null;

/* ---------------- Local (this device) ---------------- */

const LOCAL_KEY = 'tacl-teleprompt:scripts';

function readLocal(): Script[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Script[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(scripts: Script[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(scripts));
}

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const byUpdated = (a: Script, b: Script) => b.updated_at.localeCompare(a.updated_at);

export const localStore: ScriptStore = {
  kind: 'local',
  async list() {
    return readLocal().sort(byUpdated);
  },
  async get(id) {
    return readLocal().find((s) => s.id === id) ?? null;
  },
  async create(draft) {
    const now = new Date().toISOString();
    const script: Script = { id: newId(), created_at: now, updated_at: now, ...draft };
    writeLocal([script, ...readLocal()]);
    return script;
  },
  async update(id, draft) {
    const scripts = readLocal();
    const i = scripts.findIndex((s) => s.id === id);
    if (i < 0) throw new Error('Script not found');
    scripts[i] = { ...scripts[i], ...draft, updated_at: new Date().toISOString() };
    writeLocal(scripts);
    return scripts[i];
  },
  async remove(id) {
    writeLocal(readLocal().filter((s) => s.id !== id));
  },
};

/** Scripts saved on this device before signing in, so they can be moved to the cloud. */
export function localScriptCount() {
  return readLocal().length;
}

/* ---------------- Cloud (Supabase) ---------------- */

const COLUMNS = 'id,title,body,created_at,updated_at';

function cloudStore(client: SupabaseClient): ScriptStore {
  return {
    kind: 'cloud',
    async list() {
      const { data, error } = await client.from('scripts').select(COLUMNS).order('updated_at', { ascending: false });
      if (error) throw error;
      return data as Script[];
    },
    async get(id) {
      const { data, error } = await client.from('scripts').select(COLUMNS).eq('id', id).maybeSingle();
      if (error) throw error;
      return data as Script | null;
    },
    async create(draft) {
      const { data, error } = await client.from('scripts').insert(draft).select(COLUMNS).single();
      if (error) throw error;
      return data as Script;
    },
    async update(id, draft) {
      const { data, error } = await client.from('scripts').update(draft).eq('id', id).select(COLUMNS).single();
      if (error) throw error;
      return data as Script;
    },
    async remove(id) {
      const { error } = await client.from('scripts').delete().eq('id', id);
      if (error) throw error;
    },
  };
}

export function storeFor(session: Session | null): ScriptStore {
  return supabase && session ? cloudStore(supabase) : localStore;
}

/** Copy every device-only script into the cloud, then clear them locally. */
export async function moveLocalToCloud(store: ScriptStore) {
  const scripts = readLocal();
  for (const s of scripts) await store.create({ title: s.title, body: s.body });
  writeLocal([]);
  return scripts.length;
}

/* ---------------- Helpers ---------------- */

export function wordCount(text: string) {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** Spoken-word estimate at ~150 words per minute. */
export function readTime(words: number) {
  const secs = Math.round((words / 150) * 60);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}
