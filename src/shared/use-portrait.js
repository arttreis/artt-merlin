/* merlin · o retrato, do lado da tela
 *
 * as duas telas que perguntam ao Merlin (o início e o assistente) abrem aqui
 * as coleções que o retrato lê, ao desenhar: num aparelho novo, coleção que a
 * página não abriu não desce da nuvem. a pergunta chama a função devolvida,
 * que espera a primeira descida (no máximo 5s) e monta o retrato na hora —
 * ele nunca é guardado. a conta mora no portrait.js, que é puro e testado.
 */
import { cloud, readPrefs } from "./core.js";
import { useCollection } from "./ui.jsx";
import { normalize as normalizeTask } from "./tasks.js";
import { normalize as normalizeBlock } from "./routine.js";
import { normalizeCadence } from "./content-script.js";
import { normalize as normalizeHabit } from "./habits-data.js";
import { normalize as normalizeFinance } from "./finance-data.js";
import { portraitOf, portraitData, waitPortrait } from "./portrait.js";

export function usePortrait() {
  const cols = {
    tasks: useCollection("tasks", { normalize: normalizeTask }),
    routine: useCollection("routine", { normalize: normalizeBlock }),
    sessions: useCollection("sessions"),
    apps: useCollection("apps"),
    closes: useCollection("closes"),
    clients: useCollection("clients"),
    content: useCollection("content"),
    cadence: useCollection("cadence", { normalize: normalizeCadence }),
    habits: useCollection("habits", { normalize: normalizeHabit }),
    notes: useCollection("notes"),
    finance: useCollection("finance", { normalize: normalizeFinance }),
    profile: useCollection("profile")
  };
  return async () => {
    await waitPortrait(cols, cloud.signedIn);
    return portraitOf(portraitData(cols, { signedIn: cloud.signedIn, prefs: readPrefs() }), new Date()).text;
  };
}
