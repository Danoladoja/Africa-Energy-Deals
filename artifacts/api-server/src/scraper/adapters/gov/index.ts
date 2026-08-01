// ── gov/index.ts ──
// Exports all government adapters as a flat array for the runner.

import { govKenyaAdapter } from "./kenya.js";
import { govSouthAfricaAdapter } from "./south-africa.js";
import { govMoroccoAdapter } from "./morocco.js";
import { govNigeriaAdapter } from "./nigeria.js";
import { govEgyptAdapter } from "./egypt.js";
import { govUgandaAdapter } from "./uganda.js";
import { govGhanaAdapter } from "./ghana.js";
import { govTanzaniaAdapter } from "./tanzania.js";
import { govRwandaAdapter } from "./rwanda.js";
import { govEthiopiaAdapter } from "./ethiopia.js";
import { govRegionalAdapter } from "./regional.js";
import type { RegisteredAdapter } from "../types.js";

export const GOV_ADAPTERS: RegisteredAdapter[] = [
  govKenyaAdapter,
  govSouthAfricaAdapter,
  govMoroccoAdapter,
  govNigeriaAdapter,
  govEgyptAdapter,
  govUgandaAdapter,
  govGhanaAdapter,
  govTanzaniaAdapter,
  govRwandaAdapter,
  govEthiopiaAdapter,
  govRegionalAdapter,
];
