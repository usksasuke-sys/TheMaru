(function (root) {
  const TAU = Math.PI * 2;
  const TABLE_N = 720;

  const SHAPES = [
    { id: "circle", name: "まる", symmetry: 0 },
    { id: "triangle", name: "さんかく", symmetry: TAU / 3 },
    { id: "square", name: "しかく", symmetry: TAU / 4 },
    { id: "star", name: "ほし", symmetry: TAU / 5 },
    { id: "heart", name: "はーと", symmetry: TAU }
  ];

  function regularPoints(count, radius, startAngle) {
    const points = [];
    for (let i = 0; i < count; i++) {
      const angle = startAngle + (i * TAU) / count;
      points.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      });
    }
    return points;
  }

  function segmentsFromLoop(points) {
    const segments = [];
    for (let i = 0; i < points.length; i++) {
      segments.push([points[i], points[(i + 1) % points.length]]);
    }
    return segments;
  }

  function lineIntersect(a, b, c, d) {
    const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
    if (Math.abs(den) < 1e-12) return null;
    const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / den;
    return {
      x: a.x + t * (b.x - a.x),
      y: a.y + t * (b.y - a.y)
    };
  }

  function starOutline() {
    const tips = regularPoints(5, 1, -Math.PI / 2);
    const innerPoint = lineIntersect(tips[0], tips[2], tips[4], tips[1]);
    const innerR = Math.hypot(innerPoint.x, innerPoint.y);
    const outline = [];
    for (let i = 0; i < 5; i++) {
      const angle = -Math.PI / 2 + ((i + 0.5) * TAU) / 5;
      outline.push(tips[i]);
      outline.push({
        x: Math.cos(angle) * innerR,
        y: Math.sin(angle) * innerR
      });
    }
    return outline;
  }

  function heartPoint(t) {
    const s = Math.sin(t);
    const x = 16 * s * s * s;
    const yUp = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return { x: x, y: -yUp };
  }

  function heartLoop() {
    const raw = [];
    const count = 480;
    for (let i = 0; i < count; i++) {
      raw.push(heartPoint((i / count) * TAU));
    }
    return centerLoop(raw);
  }

  function centerLoop(points) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < points.length; i++) {
      minX = Math.min(minX, points[i].x);
      minY = Math.min(minY, points[i].y);
      maxX = Math.max(maxX, points[i].x);
      maxY = Math.max(maxY, points[i].y);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return points.map(function (point) {
      return { x: point.x - cx, y: point.y - cy };
    });
  }

  function rayHitRadius(angle, segments) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let best = 0;
    for (let i = 0; i < segments.length; i++) {
      const a = segments[i][0];
      const b = segments[i][1];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = (a.x * ey - a.y * ex) / den;
      const u = (a.x * dy - a.y * dx) / den;
      if (t > 1e-4 && u >= -1e-4 && u <= 1 + 1e-4 && t > best) best = t;
    }
    return best;
  }

  function missCount(points) {
    const segments = segmentsFromLoop(points);
    let misses = 0;
    const angles = 180;
    for (let i = 0; i < angles; i++) {
      if (!(rayHitRadius((i / angles) * TAU, segments) > 0)) misses += 1;
    }
    return misses;
  }

  function recenterUntilSolid(points) {
    if (missCount(points) === 0) return points;
    let maxAbs = 1;
    for (let i = 0; i < points.length; i++) {
      maxAbs = Math.max(maxAbs, Math.abs(points[i].x), Math.abs(points[i].y));
    }
    let best = { dx: 0, dy: 0, misses: missCount(points) };
    const step = maxAbs * 0.03;
    for (let y = -6; y <= 6; y++) {
      for (let x = -6; x <= 6; x++) {
        const dx = x * step;
        const dy = y * step;
        const shifted = points.map(function (point) {
          return { x: point.x - dx, y: point.y - dy };
        });
        const misses = missCount(shifted);
        if (misses < best.misses) best = { dx: dx, dy: dy, misses: misses };
      }
    }
    return points.map(function (point) {
      return { x: point.x - best.dx, y: point.y - best.dy };
    });
  }

  function buildLoops() {
    return {
      triangle: regularPoints(3, 1, -Math.PI / 2),
      square: regularPoints(4, 1, -Math.PI / 4),
      star: starOutline(),
      heart: recenterUntilSolid(heartLoop())
    };
  }

  function buildTable(id, loops) {
    const table = new Float64Array(TABLE_N);
    if (id === "circle") {
      table.fill(1);
      return table;
    }
    const segments = segmentsFromLoop(loops[id]);
    for (let i = 0; i < TABLE_N; i++) {
      table[i] = rayHitRadius((i / TABLE_N) * TAU, segments);
    }
    return table;
  }

  const loops = buildLoops();
  const tables = {};
  for (let i = 0; i < SHAPES.length; i++) {
    tables[SHAPES[i].id] = buildTable(SHAPES[i].id, loops);
  }

  function lookup(table, angle) {
    let wrapped = angle % TAU;
    if (wrapped < 0) wrapped += TAU;
    const f = (wrapped / TAU) * table.length;
    const i0 = Math.floor(f) % table.length;
    const i1 = (i0 + 1) % table.length;
    const t = f - Math.floor(f);
    const r0 = table[i0];
    const r1 = table[i1];
    if (!(r0 > 0) || !(r1 > 0)) return 0;
    return r0 * (1 - t) + r1 * t;
  }

  function get(id) {
    for (let i = 0; i < SHAPES.length; i++) {
      if (SHAPES[i].id === id) return SHAPES[i];
    }
    return SHAPES[0];
  }

  root.MaruShapes = {
    all: SHAPES,
    get: get,
    table: function (id) {
      return tables[id] || tables.circle;
    },
    lookup: lookup,
    loop: function (id) {
      return loops[id] || null;
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
