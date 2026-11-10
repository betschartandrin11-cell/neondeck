// Kleiner WebAudio-Helfer: prozedurale SFX, keine externen Assets, keine Lizenzrisiken.
// Alle Bleeps werden on-the-fly erzeugt (Oszillator), deshalb nichts zu laden.
type Ctx = AudioContext | null;
let ac: Ctx = null;
let sfxVol = 0.6;
let musicLvl = 0.25;

function ctx(): Ctx {
  if (ac) return ac;
  try {
    ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  } catch { ac = null; }
  return ac;
}

/** Muss nach einer Nutzergeste aufgerufen werden (Browser-Autoplay-Policy). */
export function unlockAudio() { ctx()?.resume().catch(() => undefined); }

export function setVolumes(sfx: number, music: number) {
  sfxVol = Math.min(1, Math.max(0, sfx));
  musicLvl = Math.min(1, Math.max(0, music));
}

/** Kurzer synthetischer Ton: freq in Hz, Dauer in s. */
export function blip(freq = 440, dur = 0.08, type: OscillatorType = 'square', vol = 1) {
  const a = ctx();
  if (!a || sfxVol <= 0) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol * sfxVol * 0.18, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + dur + 0.02);
}

export const sfx = {
  jump: () => blip(520, 0.07, 'square'),
  hit: () => blip(140, 0.16, 'sawtooth'),
  pickup: () => { blip(660, 0.06); setTimeout(() => blip(880, 0.08), 60); },
  win: () => { [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.12, 'triangle'), i * 120)); },
  lose: () => { [392, 311, 233].forEach((f, i) => setTimeout(() => blip(f, 0.15, 'sawtooth'), i * 140)); },
  click: () => blip(320, 0.04, 'triangle'),
};

export const musicLevel = { get: () => musicLvl, set: (v: number) => { musicLvl = v; } };
