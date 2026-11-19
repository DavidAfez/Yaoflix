/** The first recording format this browser supports, for voice notes. Empty: let the browser pick. */
export function pickMime() {
  const types = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
  return types.find((x) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(x)) ?? "";
}
