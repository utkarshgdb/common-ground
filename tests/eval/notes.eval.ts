// P1-2 eval: 25 labelled notes (easy, ambiguous, out-of-scope, adversarial); target ≥ 90% exact match.
// Exact match = the set of non-info_only limits extracted equals the expected set (info_only items are ignored).
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { geminiParseNote } from "../../lib/ai";

const data = JSON.parse(readFileSync(new URL("./notes.json", import.meta.url), "utf8"));
const key = (x: [string, unknown]) => `${x[0]}=${JSON.stringify(x[1])}`;

test.skipIf(!process.env.GEMINI_API_KEY)("note parsing exact match ≥ 90%", async () => {
  let pass = 0;
  const rows: string[] = [];
  for (const c of data.cases) {
    const items = (await geminiParseNote(c.note, data.slots)) ?? [];
    const got = items.filter((i) => i.kind !== "info_only").map((i) => key([i.kind, i.value])).sort();
    const want = (c.expect as [string, unknown][]).map(key).sort();
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) pass++;
    rows.push(`${ok ? "PASS" : "FAIL"} [${c.type}] ${c.note}${ok ? "" : `  got=${got.join(",") || "∅"} want=${want.join(",") || "∅"}`}`);
  }
  const pct = Math.round((pass / data.cases.length) * 100);
  console.log(rows.join("\n") + `\nRESULT ${pass}/${data.cases.length} = ${pct}% (model ${process.env.GEMINI_MODEL || "gemini-3.8-flash"})`);
  expect(pct).toBeGreaterThanOrEqual(90);
});
