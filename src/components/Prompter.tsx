import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  FlipHorizontal2,
  FlipVertical2,
  Maximize,
  Mic,
  MicOff,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
} from 'lucide-react';
import type { Script, ScriptStore } from '../lib/storage';
import { navigate } from '../lib/nav';
import { pixelsPerSecond, usePrompterSettings, type PrompterSettings } from '../lib/settings';
import { locate, normalizeWord, speechSupported, useSpeech } from '../lib/voice';
import { fullscreenSupported, toggleFullscreen, useWakeLock } from '../lib/device';
import { SettingsSheet } from './SettingsSheet';

export function PrompterRoute({ store, id }: { store: ScriptStore; id: string }) {
  const [script, setScript] = useState<Script | null | undefined>(undefined);
  useEffect(() => {
    store.get(id).then(setScript).catch(() => setScript(null));
  }, [id, store]);

  if (script === undefined) return <div className="splash" aria-busy="true" />;
  if (script === null) {
    return (
      <main className="container">
        <p className="error">That script could not be found.</p>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>
          Back to scripts
        </button>
      </main>
    );
  }
  return <Prompter script={script} />;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Index of the last word whose top is at or above `y` (binary search over sorted tops). */
function wordAt(tops: number[], y: number) {
  let lo = 0;
  let hi = tops.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tops[mid] <= y) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

function fmtTime(secs: number) {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function Prompter({ script }: { script: Script }) {
  const { settings: s, update, reset } = usePrompterSettings();
  const [playing, setPlaying] = useState(false);
  const [count, setCount] = useState(0); // countdown seconds remaining
  const [controls, setControls] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [stats, setStats] = useState({ pct: 0, left: 0 });
  const [viewH, setViewH] = useState(() => window.innerHeight);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0); // exact scroll position (scrollTop rounds)
  const userUntil = useRef(0); // while the reader is touching/scrolling, don't fight them
  const targetRef = useRef<number | null>(null); // voice-follow destination
  const topsRef = useRef<number[]>([]);
  const cursorRef = useRef(-1); // last word read (voice follow)
  const settingsRef = useRef(s);
  settingsRef.current = s;
  const playingRef = useRef(false);
  playingRef.current = playing && count === 0;

  useWakeLock(true);

  /* ---------- Script → words ---------- */

  const parts = useMemo(() => script.body.split(/(\s+)/), [script.body]);
  const words = useMemo(() => parts.filter((p) => /\S/.test(p)).map(normalizeWord), [parts]);
  const rendered = useMemo(() => {
    let wi = 0;
    return parts.map((p, k) =>
      /\S/.test(p) ? (
        <span key={k} className="w" data-i={wi++}>
          {p}
        </span>
      ) : (
        p
      ),
    );
  }, [parts]);

  /* ---------- Geometry ---------- */

  const guideY = () => {
    const el = scrollerRef.current;
    return el ? (el.clientHeight * settingsRef.current.guidePos) / 100 : 0;
  };

  const endPos = () => {
    const tops = topsRef.current;
    const st = settingsRef.current;
    if (!tops.length) return 0;
    return tops[tops.length - 1] - guideY() + st.fontSize * st.lineHeight;
  };

  const measure = useCallback(() => {
    const content = contentRef.current;
    if (!content) return;
    const spans = content.querySelectorAll<HTMLElement>('.w');
    topsRef.current = Array.from(spans, (el) => el.offsetTop);
  }, []);

  // Re-measure when layout changes, keeping the same word on the reading line
  const anchorRef = useRef(-1);
  const captureAnchor = () => {
    anchorRef.current = wordAt(topsRef.current, posRef.current + guideY() + 1);
  };
  const restoreAnchor = () => {
    measure();
    const i = anchorRef.current;
    const tops = topsRef.current;
    posRef.current = i >= 0 && tops[i] !== undefined ? Math.max(0, tops[i] - guideY()) : posRef.current;
    targetRef.current = null;
    writeScroll();
  };

  const layoutKey = `${s.fontSize}|${s.lineHeight}|${s.margin}|${s.uppercase}|${s.align}|${s.guidePos}|${viewH}`;
  const prevLayoutKey = useRef(layoutKey);
  if (prevLayoutKey.current !== layoutKey) {
    // Runs during render, before the DOM updates: remember which word is on the line
    captureAnchor();
    prevLayoutKey.current = layoutKey;
  }
  useLayoutEffect(() => {
    restoreAnchor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.fonts?.ready.then(measure);
  }, [measure]);

  /* ---------- Scroll engine ---------- */

  const writeScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    posRef.current = clamp(posRef.current, 0, Math.max(0, el.scrollHeight - el.clientHeight));
    el.scrollTop = posRef.current;
  };

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastStats = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      const el = scrollerRef.current;
      const st = settingsRef.current;
      if (el) {
        const touching = now < userUntil.current;
        if (touching) {
          posRef.current = el.scrollTop;
        } else if (st.mode === 'auto' && playingRef.current) {
          posRef.current += pixelsPerSecond(st) * dt;
          if (posRef.current >= endPos()) {
            posRef.current = endPos();
            setPlaying(false);
          }
          writeScroll();
        } else if (st.mode === 'voice' && targetRef.current !== null) {
          const d = targetRef.current - posRef.current;
          if (Math.abs(d) < 0.5) targetRef.current = null;
          posRef.current += d * Math.min(1, dt * 4);
          writeScroll();
        }

        if (now - lastStats > 250) {
          lastStats = now;
          const end = endPos();
          const pct = end > 0 ? clamp(posRef.current / end, 0, 1) : 0;
          const left = st.mode === 'auto' ? (end - posRef.current) / pixelsPerSecond(st) : 0;
          setStats((prev) =>
            Math.round(prev.pct * 100) === Math.round(pct * 100) && Math.round(prev.left) === Math.round(left)
              ? prev
              : { pct, left },
          );
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reader takes over with touch, wheel, or drag; the engine picks up from where they leave it
  const markUser = () => {
    userUntil.current = performance.now() + 700;
    targetRef.current = null;
  };
  const onUserScrollEnd = () => {
    if (settingsRef.current.mode === 'voice') {
      setCursor(wordAt(topsRef.current, posRef.current + guideY() + 1) - 1);
    }
  };

  /* ---------- Voice follow ---------- */

  const setCursor = useCallback((next: number) => {
    const content = contentRef.current;
    const prev = cursorRef.current;
    cursorRef.current = next;
    if (!content || next === prev) return;
    const spans = content.querySelectorAll<HTMLElement>('.w');
    const [lo, hi] = next > prev ? [prev + 1, next] : [next + 1, prev];
    for (let i = Math.max(0, lo); i <= hi && i < spans.length; i++) spans[i].classList.toggle('read', next > prev);
    content.querySelector('.w.current')?.classList.remove('current');
    if (next >= 0 && spans[next]) spans[next].classList.add('current');
  }, []);

  const onTranscript = useCallback(
    (text: string) => {
      const next = locate(words, text, cursorRef.current);
      if (next === cursorRef.current) return;
      setCursor(next);
      const top = topsRef.current[next];
      if (top !== undefined && performance.now() >= userUntil.current) {
        targetRef.current = Math.max(0, top - guideY());
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [words, setCursor],
  );

  const speech = useSpeech(s.voiceLang, onTranscript);
  const listening = speech.status === 'listening';

  // Leaving voice mode clears the read-through highlighting
  useEffect(() => {
    if (s.mode !== 'voice') {
      speech.stop();
      contentRef.current?.querySelectorAll('.w.read, .w.current').forEach((el) => el.classList.remove('read', 'current'));
      cursorRef.current = -1;
    } else {
      setPlaying(false);
      setCount(0);
      setCursor(wordAt(topsRef.current, posRef.current + guideY() + 1) - 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.mode]);

  /* ---------- Transport ---------- */

  useEffect(() => {
    if (count <= 0) return;
    const t = window.setTimeout(() => setCount((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [count]);

  const togglePlay = useCallback(() => {
    const st = settingsRef.current;
    if (st.mode === 'voice') {
      if (listening) speech.stop();
      else speech.start();
      return;
    }
    if (playing) {
      setPlaying(false);
      setCount(0);
      return;
    }
    if (posRef.current >= endPos() - 1) posRef.current = 0;
    setCount(st.countdown);
    setPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, listening, speech]);

  const restart = () => {
    posRef.current = 0;
    targetRef.current = null;
    writeScroll();
    if (settingsRef.current.mode === 'voice') setCursor(-1);
  };

  const nudge = (lines: number) => {
    const st = settingsRef.current;
    posRef.current += lines * st.fontSize * st.lineHeight;
    targetRef.current = null;
    writeScroll();
    if (st.mode === 'voice') onUserScrollEnd();
  };

  const page = (dir: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    posRef.current += dir * el.clientHeight * 0.6;
    targetRef.current = null;
    writeScroll();
    if (settingsRef.current.mode === 'voice') onUserScrollEnd();
  };

  const bump = (patch: (st: PrompterSettings) => Partial<PrompterSettings>) => update(patch(settingsRef.current));
  const speedBy = (d: number) => bump((st) => ({ speed: clamp(Math.round((st.speed + d) * 2) / 2, 0.5, 30) }));
  const fontBy = (d: number) => bump((st) => ({ fontSize: clamp(st.fontSize + d, 16, 200) }));

  /* ---------- Controls visibility ---------- */

  const running = (playing && count === 0) || listening;
  useEffect(() => {
    if (!running || sheet) {
      setControls(true);
      return;
    }
    const t = window.setTimeout(() => setControls(false), 2500);
    return () => window.clearTimeout(t);
  }, [running, sheet, controls]);

  /* ---------- Keyboard & Bluetooth remotes ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      switch (e.key) {
        case ' ':
        case 'Enter':
        case 'k':
          togglePlay();
          break;
        case 'ArrowDown':
          nudge(1);
          break;
        case 'ArrowUp':
          nudge(-1);
          break;
        case 'PageDown':
          page(1);
          break;
        case 'PageUp':
          page(-1);
          break;
        case 'ArrowRight':
          speedBy(0.5);
          break;
        case 'ArrowLeft':
          speedBy(-0.5);
          break;
        case 'Home':
          restart();
          break;
        case '+':
        case '=':
          fontBy(4);
          break;
        case '-':
          fontBy(-4);
          break;
        case 'h':
          bump((st) => ({ mirrorX: !st.mirrorX }));
          break;
        case 'v':
          bump((st) => ({ mirrorY: !st.mirrorY }));
          break;
        case 'Escape':
          if (sheet) setSheet(false);
          else navigate(`/edit/${script.id}`);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ---------- Render ---------- */

  const flip = `scale(${s.mirrorX ? -1 : 1}, ${s.mirrorY ? -1 : 1})`;

  return (
    <div className="prompter" style={{ background: s.bgColor, color: s.textColor }}>
      <div className="stage" style={{ transform: flip }}>
        <div
          ref={scrollerRef}
          className="scroller"
          onClick={() => setControls((c) => !c)}
          onTouchStart={markUser}
          onTouchMove={markUser}
          onTouchEnd={() => {
            markUser();
            window.setTimeout(onUserScrollEnd, 750);
          }}
          onWheel={() => {
            markUser();
            window.setTimeout(onUserScrollEnd, 750);
          }}
        >
          <div
            ref={contentRef}
            className={`script-text${s.mode === 'voice' ? ' voice' : ''}`}
            style={{
              fontSize: s.fontSize,
              lineHeight: s.lineHeight,
              paddingLeft: `${s.margin}%`,
              paddingRight: `${s.margin}%`,
              paddingTop: (viewH * s.guidePos) / 100,
              paddingBottom: viewH,
              textAlign: s.align,
              textTransform: s.uppercase ? 'uppercase' : 'none',
            }}
          >
            {rendered}
          </div>
        </div>
        {s.guide && (
          <div className="guide" style={{ top: `${s.guidePos}%`, color: s.textColor }} aria-hidden>
            <span className="guide-arrow" />
          </div>
        )}
      </div>

      {count > 0 && (
        <div className="countdown" aria-live="assertive" onClick={() => setCount(0)}>
          <span style={{ transform: flip }}>{count}</span>
        </div>
      )}

      <div className={`hud${controls ? '' : ' hidden'}`}>
        <div className="hud-top">
          <button className="hud-btn" onClick={() => navigate(`/edit/${script.id}`)} aria-label="Back to editor">
            <ArrowLeft size={22} />
          </button>
          <div className="hud-title">
            <strong>{script.title}</strong>
            <span>
              {Math.round(stats.pct * 100)}%
              {s.mode === 'auto' ? ` · ${fmtTime(stats.left)} left` : listening ? ' · Listening' : ' · Voice follow'}
            </span>
          </div>
          {fullscreenSupported && (
            <button className="hud-btn" onClick={toggleFullscreen} aria-label="Full screen">
              <Maximize size={20} />
            </button>
          )}
          <button className="hud-btn" onClick={() => setSheet(true)} aria-label="Display settings">
            <Settings2 size={22} />
          </button>
        </div>
        <div className="progress" aria-hidden>
          <div style={{ width: `${stats.pct * 100}%` }} />
        </div>

        {speech.error && s.mode === 'voice' && <p className="hud-error">{speech.error}</p>}

        <div className="hud-bottom">
          <div className="hud-row quick">
            <button
              className={`chip${s.mirrorX ? ' on' : ''}`}
              onClick={() => update({ mirrorX: !s.mirrorX })}
              aria-pressed={s.mirrorX}
            >
              <FlipVertical2 size={18} /> Mirror
            </button>
            <button
              className={`chip${s.mirrorY ? ' on' : ''}`}
              onClick={() => update({ mirrorY: !s.mirrorY })}
              aria-pressed={s.mirrorY}
            >
              <FlipHorizontal2 size={18} /> Flip
            </button>
            <button className="chip" onClick={() => fontBy(-4)} aria-label="Smaller text">
              A−
            </button>
            <span className="chip-value">{s.fontSize}</span>
            <button className="chip" onClick={() => fontBy(4)} aria-label="Larger text">
              A+
            </button>
          </div>

          <div className="hud-row transport">
            <button className="hud-btn" onClick={restart} aria-label="Back to top">
              <RotateCcw size={22} />
            </button>

            {s.mode === 'auto' ? (
              <div className="speed">
                <button className="hud-btn" onClick={() => speedBy(-0.5)} aria-label="Slower">
                  <Minus size={22} />
                </button>
                <div className="speed-value">
                  <strong>{s.speed.toFixed(1)}</strong>
                  <span>speed</span>
                </div>
                <button className="hud-btn" onClick={() => speedBy(0.5)} aria-label="Faster">
                  <Plus size={22} />
                </button>
              </div>
            ) : (
              <div className="speed voice-status">
                <span className={`mic-dot${listening ? ' live' : ''}`} />
                <span>{listening ? 'Following your voice' : speechSupported ? 'Tap the mic to start' : 'Not supported here'}</span>
              </div>
            )}

            <button
              className="play-btn"
              onClick={togglePlay}
              aria-label={s.mode === 'voice' ? (listening ? 'Stop listening' : 'Start listening') : running ? 'Pause' : 'Play'}
              disabled={s.mode === 'voice' && !speechSupported}
            >
              {s.mode === 'voice' ? (
                listening ? <MicOff size={28} /> : <Mic size={28} />
              ) : playing ? (
                <Pause size={28} fill="currentColor" />
              ) : (
                <Play size={28} fill="currentColor" />
              )}
            </button>
          </div>

          <div className="segmented" role="radiogroup" aria-label="Scroll mode">
            <button role="radio" aria-checked={s.mode === 'auto'} className={s.mode === 'auto' ? 'on' : ''} onClick={() => update({ mode: 'auto' })}>
              Auto scroll
            </button>
            <button role="radio" aria-checked={s.mode === 'voice'} className={s.mode === 'voice' ? 'on' : ''} onClick={() => update({ mode: 'voice' })}>
              Voice follow
            </button>
          </div>
        </div>
      </div>

      {sheet && <SettingsSheet settings={s} update={update} reset={reset} onClose={() => setSheet(false)} />}
    </div>
  );
}
