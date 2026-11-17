// Les routes du serveur Python (`src/scriptorium/serveur.py`).

export interface ProgrammeResume {
  nom: string;
  titre: string;
}

export interface PieceProgramme {
  nom: string;
  role: string;
  titre: string;
  incipit: string;
  gabc: string | null;
  ton: string | null;
  mode: string | null;
  avant: string;
  apres: string;
}

export interface Programme {
  nom: string;
  titre: string;
  jour: string;
  pieces: PieceProgramme[];
  avertissements: string[];
}

export interface PieceBibliotheque {
  reference: string;
  role: string;
  incipit: string;
  mode: string | null;
  edition: string | null;
  livre: string | null;
  gabc?: string;
}

async function lire<T>(chemin: string): Promise<T> {
  const r = await fetch(chemin);
  if (!r.ok) {
    const detail = await r.json().then((d) => d.detail, () => r.statusText);
    throw new Error(String(detail));
  }
  return r.json();
}

export const api = {
  programmes: () => lire<ProgrammeResume[]>("/api/programmes"),
  programme: (nom: string) => lire<Programme>(`/api/programmes/${encodeURIComponent(nom)}`),
  chercher: (q: string) => lire<PieceBibliotheque[]>(`/api/bibliotheque?q=${encodeURIComponent(q)}`),
  // « do:Psalterium/Psalmi/Psalmi major.txt#Day4 Vespera:1 » : chaque morceau du chemin encodé.
  piece: (reference: string) =>
    lire<PieceBibliotheque>(`/api/pieces/${reference.split("/").map(encodeURIComponent).join("/")}`),
};
