// Persistence: progress, settings and player-made levels in localStorage.
const KEY = 'runekeep.v1';
const blank = () => ({ progress: {}, custom: [], settings: { muted: false, touch: 'auto' } });
let data = blank();
try { data = { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* private mode etc. */ }
function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage unavailable */ } }

export const store = {
  get settings() { return data.settings; },
  setSetting(k, v) { data.settings[k] = v; save(); },
  progress(id) { return data.progress[id] || null; },
  /** Records a finished run; keeps the best time and remembers a full clear. */
  recordWin(id, frames, perfect) {
    const p = data.progress[id] || { best: Infinity, perfect: false };
    p.best = Math.min(p.best ?? Infinity, frames); p.perfect = p.perfect || perfect;
    data.progress[id] = p; save();
  },
  get custom() { return data.custom; },
  saveCustom(def) {
    const i = data.custom.findIndex((d) => d.id === def.id);
    if (i >= 0) data.custom[i] = def; else data.custom.push(def);
    save();
  },
  deleteCustom(id) { data.custom = data.custom.filter((d) => d.id !== id); delete data.progress[id]; save(); },
};

/** Levels travel as URL-safe base64 JSON so they can be shared as a link. */
export function encodeLevel(def) {
  const json = JSON.stringify({ name: def.name, theme: def.theme, time: def.time, map: def.map });
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeLevel(code) {
  const text = code.trim();
  const json = text.startsWith('{') ? text : decodeURIComponent(escape(atob(text.replace(/^.*#l=/, '').replace(/-/g, '+').replace(/_/g, '/'))));
  const d = JSON.parse(json);
  return { id: 'custom-' + Date.now().toString(36), name: String(d.name || 'Imported').slice(0, 40), theme: d.theme | 0, time: Math.min(600, Math.max(10, d.time | 0 || 120)), map: (d.map || []).map(String) };
}
