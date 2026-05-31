function parseBrNumber(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim().replace(/\s*m\s*$/i, "");
  const normalized = /\d,\d/.test(s)
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function readField(block, labels) {
  for (const label of labels) {
    const re = new RegExp(
      `(?:^|\\n)\\s*${label}\\s*:\\s*([0-9+\\-.,]+)\\s*m?`,
      "im",
    );
    const m = block.match(re);
    if (m) {
      const v = parseBrNumber(m[1]);
      if (v != null) return v;
    }
  }
  return null;
}

function readAllCoordPairs(block) {
  const northMatches = [
    ...block.matchAll(
      /(?:^|\n)\s*(?<!End\s)(?<!RP\s)(?:Northing|North|Norte)\s*:\s*([0-9+\-.,]+)\s*m?/gim,
    ),
  ];
  const eastMatches = [
    ...block.matchAll(
      /(?:^|\n)\s*(?<!End\s)(?<!RP\s)(?:Easting|East|Este)\s*:\s*([0-9+\-.,]+)\s*m?/gim,
    ),
  ];
  console.log("north", northMatches.length, "east", eastMatches.length);
  return northMatches.length;
}

const curve = `Segment #1  :  Curve

Length: 25.000m     Radius: 50.000m
End North: 9316120.0000m     End East: 623920.0000m`;

const line = `Segment #2  :  Line

Course: 090° 00' 00.00"     Length: 50.000m
North: 9316120.0000m     East: 623970.0000m`;

console.log("curve endN", readField(curve, ["End North"]));
console.log("curve endE", readField(curve, ["End East"]));
console.log("line pairs", readAllCoordPairs(line));
