// Un seul contexte audio pour le micro et le son. Le navigateur le crée suspendu tant que
// l'utilisateur n'a rien touché : `audio()` le reprend.

let contexte: AudioContext | null = null;

export async function audio(): Promise<AudioContext> {
  contexte ??= new AudioContext({ latencyHint: "interactive" });
  if (contexte.state !== "running") await contexte.resume();
  return contexte;
}
