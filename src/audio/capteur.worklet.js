// Le capteur du micro, dans le fil audio du navigateur : le son tel quel, en blocs de 256
// échantillons qui se suivent sans trou, chacun avec l'indice (dans l'horloge du contexte)
// de l'échantillon qui suit sa fin. En JS simple : chargé tel quel par `audioWorklet`.

class Capteur extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bloc = new Float32Array(256);
    this.n = 0;
  }

  process(entrees) {
    const canal = entrees[0] && entrees[0][0];
    if (!canal) return true;
    for (let i = 0; i < canal.length; i++) {
      this.bloc[this.n++] = canal[i];
      if (this.n === this.bloc.length) {
        this.port.postMessage({ bloc: this.bloc, fin: currentFrame + i + 1 }, [this.bloc.buffer]);
        this.bloc = new Float32Array(256);
        this.n = 0;
      }
    }
    return true;
  }
}

registerProcessor("capteur", Capteur);
