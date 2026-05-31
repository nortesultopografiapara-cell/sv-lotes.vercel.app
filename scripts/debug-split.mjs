import fs from "fs";

const chunk = fs
  .readFileSync("scripts/fixtures/Q04-lote30-31-fixture.txt", "utf8")
  .split(/Name:\s*/i)[1];

const parts = chunk.split(/(?=Segment\s*#\s*\d+)/i);
console.log("parts", parts.length);
for (let i = 0; i < parts.length; i++) {
  const h = parts[i].match(/Segment\s*#\s*(\d+)/i);
  const isC =
    /\bType\s*:\s*Curve\b/i.test(parts[i]) ||
    /Segment\s*#\s*\d+\s*:\s*Curve\b/i.test(parts[i]);
  console.log(i, "num", h?.[1], "curve", isC, parts[i].slice(0, 50).replace(/\n/g, "|"));
}
