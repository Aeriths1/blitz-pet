// Blitz makes one sound: Blitzcrank's Q, as the left button goes down to throw the hook
// (assets/sfx/blitzcrank/q-cast.ogg, see SOURCES.md there). Everything else is silent.

/** Someone to tell about every sound played (the recording log). */
let listener = null;
export const onSound = (fn) => (listener = fn);

const grab = new Audio(new URL("../assets/sfx/blitzcrank/q-cast.ogg", import.meta.url).href);
grab.preload = "auto";
grab.volume = 0.5;

export function playHookSound(kind) {
  if (kind !== "grab") return;
  listener?.(kind);
  grab.currentTime = 0;
  void grab.play();
}

/** The idle acts' sounds: all switched off. */
export function playActSound() {}
