import { X } from 'lucide-react';
import { COLOR_PRESETS, type PrompterSettings } from '../lib/settings';
import { speechSupported } from '../lib/voice';

interface Props {
  settings: PrompterSettings;
  update: (patch: Partial<PrompterSettings>) => void;
  reset: () => void;
  onClose: () => void;
}

const LANGUAGES = [
  ['en-US', 'English (US)'],
  ['en-GB', 'English (UK)'],
  ['en-AU', 'English (Australia)'],
  ['es-ES', 'Español (España)'],
  ['es-MX', 'Español (México)'],
  ['fr-FR', 'Français'],
  ['de-DE', 'Deutsch'],
  ['it-IT', 'Italiano'],
  ['pt-BR', 'Português (Brasil)'],
  ['nl-NL', 'Nederlands'],
  ['ar-AE', 'العربية'],
  ['hi-IN', 'हिन्दी'],
  ['ja-JP', '日本語'],
  ['zh-CN', '中文 (简体)'],
];

function Slider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display?: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="slider">
      <span className="slider-head">
        <span>{label}</span>
        <output>{display ?? value}</output>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="setting">
      <span className="setting-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={String(v)} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsSheet({ settings: s, update, reset, onClose }: Props) {
  const langs = LANGUAGES.some(([code]) => code === s.voiceLang) ? LANGUAGES : [[s.voiceLang, s.voiceLang], ...LANGUAGES];

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet" role="dialog" aria-label="Display settings">
        <header className="sheet-head">
          <h2>Display</h2>
          <button className="hud-btn" onClick={onClose} aria-label="Close settings">
            <X size={22} />
          </button>
        </header>

        <div className="sheet-body">
          <h3 className="sheet-group">Orientation</h3>
          <Toggle
            label="Mirror (flip horizontally)"
            hint="For beam-splitter glass. Text reads correctly in the reflection."
            checked={s.mirrorX}
            onChange={(v) => update({ mirrorX: v })}
          />
          <Toggle
            label="Flip vertically"
            hint="For rigs where the screen faces up or is mounted upside down."
            checked={s.mirrorY}
            onChange={(v) => update({ mirrorY: v })}
          />

          <h3 className="sheet-group">Scrolling</h3>
          <Segmented
            label="Mode"
            value={s.mode}
            options={[
              ['auto', 'Auto scroll'],
              ['voice', 'Voice follow'],
            ]}
            onChange={(v) => update({ mode: v })}
          />
          {s.mode === 'voice' && !speechSupported && (
            <p className="hint warn">This browser has no speech recognition. Use Chrome (Android, desktop) or Safari (iPhone, iPad).</p>
          )}
          {s.mode === 'auto' ? (
            <>
              <Slider label="Speed" value={s.speed} display={s.speed.toFixed(1)} min={0.5} max={30} step={0.5} onChange={(v) => update({ speed: v })} />
              <Segmented
                label="Countdown"
                value={s.countdown}
                options={[
                  [0, 'Off'],
                  [3, '3s'],
                  [5, '5s'],
                  [10, '10s'],
                ]}
                onChange={(v) => update({ countdown: v })}
              />
            </>
          ) : (
            <label className="setting">
              <span className="setting-label">Spoken language</span>
              <select value={s.voiceLang} onChange={(e) => update({ voiceLang: e.target.value })}>
                {langs.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <h3 className="sheet-group">Text</h3>
          <Slider label="Size" value={s.fontSize} display={`${s.fontSize}px`} min={16} max={200} step={2} onChange={(v) => update({ fontSize: v })} />
          <Slider
            label="Line spacing"
            value={s.lineHeight}
            display={s.lineHeight.toFixed(2)}
            min={1}
            max={2.4}
            step={0.05}
            onChange={(v) => update({ lineHeight: v })}
          />
          <Slider label="Side margins" value={s.margin} display={`${s.margin}%`} min={0} max={30} step={1} onChange={(v) => update({ margin: v })} />
          <Segmented
            label="Alignment"
            value={s.align}
            options={[
              ['left', 'Left'],
              ['center', 'Center'],
            ]}
            onChange={(v) => update({ align: v })}
          />
          <Toggle label="All caps" checked={s.uppercase} onChange={(v) => update({ uppercase: v })} />

          <h3 className="sheet-group">Colors</h3>
          <div className="presets">
            {COLOR_PRESETS.map((p) => {
              const on = p.text.toLowerCase() === s.textColor.toLowerCase() && p.bg.toLowerCase() === s.bgColor.toLowerCase();
              return (
                <button
                  key={p.name}
                  className={`preset${on ? ' on' : ''}`}
                  style={{ background: p.bg, color: p.text }}
                  onClick={() => update({ textColor: p.text, bgColor: p.bg })}
                  aria-pressed={on}
                >
                  <span className="preset-sample">Aa</span>
                  <span className="preset-name">{p.name}</span>
                </button>
              );
            })}
          </div>
          <div className="color-row">
            <label className="color-field">
              <input type="color" value={s.textColor} onChange={(e) => update({ textColor: e.target.value })} />
              <span>Text</span>
            </label>
            <label className="color-field">
              <input type="color" value={s.bgColor} onChange={(e) => update({ bgColor: e.target.value })} />
              <span>Background</span>
            </label>
          </div>

          <h3 className="sheet-group">Reading line</h3>
          <Toggle label="Show reading line" hint="Marks where your eyes should rest." checked={s.guide} onChange={(v) => update({ guide: v })} />
          <Slider
            label="Position from top"
            value={s.guidePos}
            display={`${s.guidePos}%`}
            min={10}
            max={70}
            step={1}
            onChange={(v) => update({ guidePos: v })}
          />

          <button className="btn btn-ghost-dark btn-block" onClick={reset}>
            Reset to defaults
          </button>
          <p className="hint">
            Remote and keyboard: Space play or pause · ↑↓ nudge · PgUp/PgDn jump · ←→ speed · +/− size · H mirror · V flip · Home restart
          </p>
        </div>
      </section>
    </>
  );
}
