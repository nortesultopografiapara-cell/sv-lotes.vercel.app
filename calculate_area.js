const utmPts = [
  { easting: 622524.605, northing: 9316374.132 },
  { easting: 622494.491, northing: 9316351.048 },
  { easting: 622536.884, northing: 9316300.368 },
  { easting: 622566.834, northing: 9316323.649 }
];

function area(pts) {
  let sum = 0.0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    sum += p1.easting * p2.northing - p2.easting * p1.northing;
  }
  return Math.abs(sum) / 2.0;
}

console.log("Calculated UTM Area of Lote 2:", area(utmPts).toFixed(3), "square meters");
