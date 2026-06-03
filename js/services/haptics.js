/**
 * Vibración — wrapper sobre navigator.vibrate.
 * No-op si el dispositivo no la soporta (iOS Safari, escritorio).
 */

export function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}
