// Blitz's sounds: the hook going out, and the charge building while it is held. All of them are his
// own, layered from code-made sounds (see assets/sfx/SOURCES.md). Everything else is silent.

/** Someone to tell about every sound played (the recording log). */
let listener = null;
export const onSound = (fn) => (listener = fn);

const load = (name, volume) => {
  const a = new Audio(new URL(`../assets/sfx/${name}.ogg`, import.meta.url).href);
  a.preload = "auto";
  a.volume = volume;
  return a;
};
const SOUNDS = {
  hook: load("hook", 0.55), // a tap: the hook flies out
  "hook-charged": load("hook-charged", 0.6), // a charged hook: heavier, with a crackle of static
  charge: load("hook-charge", 0.45), // building up while the button is held
  full: load("hook-full", 0.4), // the ring is full
};

/** kind: "hook", "hook-charged", "charge" or "full"; "charge-stop" cuts the charge short. */
export function playHookSound(kind) {
  if (kind === "charge-stop") {
    SOUNDS.charge.pause();
    return;
  }
  const a = SOUNDS[kind];
  if (!a) return;
  listener?.(kind);
  a.currentTime = 0;
  void a.play();
}

/** The idle acts' sounds: all switched off. */
export function playActSound() {}
