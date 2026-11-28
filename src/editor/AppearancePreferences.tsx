import { useId } from 'react';
import { Check } from 'lucide-react';
import { ACCENT_CHOICES, customAccentTokens, FIELD_SCHEME_CHOICES, THEME_CHOICES, type FieldScheme } from '../appearance';
import { fieldPalette, fieldPaletteFor } from '../components/fieldPalette';
import type { EditorController } from './useEditorController';

/** A few yards of each field look: stripes, lines, a number and three dots in Brass, Woodwind and Percussion colors. */
function FieldSwatch({ scheme }: { scheme: FieldScheme }) {
  const { football: f, dot } = fieldPalette(scheme);
  return <svg className="field-scheme-swatch" viewBox="0 0 64 30" aria-hidden="true">
    <rect width="64" height="30" fill={f.turf} />
    {f.stripeOpacity > 0 && [0, 24, 48].map(x => <rect key={x} x={x} width="12" height="30" fill={f.stripe} opacity={f.stripeOpacity} />)}
    <g stroke={f.line} opacity={f.lineOpacity} strokeWidth=".7">{[0, 12, 24, 36, 48, 60].map(x => <line key={x} x1={x + 2} x2={x + 2} y2="30" opacity={x % 24 ? .6 : 1} />)}</g>
    <text x="26" y="26" fill={f.number} opacity={f.numberOpacity} fontFamily="Arial, sans-serif" fontWeight="700" fontSize="7" textAnchor="middle">40</text>
    {([[12, 11, '#f0bf62'], [20, 9, '#7cc4f2'], [31, 12, '#ef7f7f']] as const).map(([x, y, color]) => <circle key={x} cx={x} cy={y} r="2.4" fill={color} stroke={dot.outline} strokeWidth=".6" />)}
  </svg>;
}

export function AppearancePreferences({ preferences }: Pick<EditorController, 'preferences'>) {
  const { value: p, update, theme } = preferences;
  const uid = useId();
  const custom = p.accent === 'custom';
  const preset = ACCENT_CHOICES.find(choice => choice.id === p.accent);
  const pickerAccent = preset ? preset.swatch.dark : p.accentColor;
  const applied = (customAccentTokens(p.accentColor, theme)['--accent'] ?? p.accentColor).toLowerCase();
  const well = fieldPaletteFor(p.fieldScheme, p.fieldWellColor).well;
  return <>
    <div className="form-row">
      <label className="form-label">Interface theme<select value={p.theme} onChange={e => update({ theme: e.target.value as typeof p.theme })}>{THEME_CHOICES.map(choice => <option key={choice.id} value={choice.id}>{choice.name}</option>)}</select></label>
      <label className="form-label">UI scale<select value={p.uiScale} onChange={e => update({ uiScale: Number(e.target.value) as typeof p.uiScale })}>{[1, 1.1, 1.25, 1.5].map(scale => <option key={scale} value={scale}>{Math.round(scale * 100)}%</option>)}</select></label>
    </div>
    <p className="microcopy">{p.theme === 'system' ? `Following the system: ${THEME_CHOICES.find(choice => choice.id === theme)!.name.toLowerCase()} now. High contrast applies when the system asks for more contrast. ` : ''}Theme and scale apply immediately on this device. Field coordinates and saved section colors stay the same.</p>
    <fieldset className="appearance-choices">
      <legend>Accent color</legend>
      <div className="accent-choices">{ACCENT_CHOICES.map(choice => <label key={choice.id} className={p.accent === choice.id ? 'selected' : undefined}>
        <input type="radio" name={uid + 'accent'} value={choice.id} checked={p.accent === choice.id} onChange={() => update({ accent: choice.id })} />
        <span className="accent-swatch" style={{ background: choice.swatch[theme] }} aria-hidden="true">{p.accent === choice.id && <Check size={10} strokeWidth={3} />}</span>{choice.name}
      </label>)}
        {/* The picker is always shown: it starts from the accent in use, and picking a color makes it the custom accent. */}
        <label className={`accent-custom${custom ? ' selected' : ''}`}>
          <input type="radio" name={uid + 'accent'} value="custom" checked={custom} onChange={() => update({ accent: 'custom' })} />Custom
          <input type="color" aria-label="Custom accent color" value={pickerAccent} onChange={e => update({ accent: 'custom', accentColor: e.target.value })} />
          <span className="accent-custom-value">{pickerAccent.toUpperCase()}</span>
        </label>
      </div>
      <p className="microcopy">Marks the primary action, the current set and tool, and keyboard focus. {custom && applied !== p.accentColor.toLowerCase() ? `In this theme your color shows as ${applied.toUpperCase()} so text and focus stay readable.` : 'Every accent, including a custom color, is adjusted where needed so text and focus stay readable in each theme.'}</p>
    </fieldset>
    <fieldset className="appearance-choices">
      <legend>Field appearance</legend>
      <div className="field-scheme-choices">{FIELD_SCHEME_CHOICES.map(choice => <label key={choice.id} className={p.fieldScheme === choice.id ? 'selected' : undefined}>
        <input type="radio" name={uid + 'field'} value={choice.id} checked={p.fieldScheme === choice.id} onChange={() => update({ fieldScheme: choice.id })} />
        <FieldSwatch scheme={choice.id} /><div><strong>{choice.name}</strong><span>{choice.description}</span></div>
        {p.fieldScheme === choice.id && <Check className="field-scheme-check" size={14} aria-hidden="true" />}
      </label>)}</div>
      <p className="microcopy">Paints the 2D field, its paths, previews and handles, and the set thumbnails. Printed drill books use Classic chart when it is chosen and the standard turf otherwise; SVG export, panel previews and the 3D view keep the standard turf.</p>
      <div className="field-well-row">
        <label className="form-label">Background behind the field<span className="display-color-control"><input type="color" aria-label="Background behind the field" value={well} onChange={e => update({ fieldWellColor: e.target.value })} /><span>{well.toUpperCase()}{p.fieldWellColor ? ' · Custom' : ` · ${FIELD_SCHEME_CHOICES.find(choice => choice.id === p.fieldScheme)!.name}`}</span></span></label>
        <button type="button" className="button subtle" disabled={!p.fieldWellColor} onClick={() => update({ fieldWellColor: null })}>Match field look</button>
      </div>
      <p className="microcopy">Fills the space around the field and behind set thumbnails. Captions and the status line switch to dark or light ink to stay readable on it.</p>
    </fieldset>
  </>;
}
