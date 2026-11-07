(function (root) {
  const TAU = Math.PI * 2;
  const MIN_RADIUS = 36;
  const BINS = 72;
  // 形のサンプル誤差を飲み、丁寧な手描きが95%前後、雑な形ははっきり低くする。
  const DEADZONE = 0.008;
  const RADIAL_TAU = 0.215;

  const TOO_SMALL = "もう少し大きく、形のまわりを描いてください";

  function median(values) {
    const copy = values.slice().sort(function (a, b) {
      return a - b;
    });
    const mid = Math.floor(copy.length / 2);
    if (copy.length % 2 === 1) return copy[mid];
    return (copy[mid - 1] + copy[mid]) / 2;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function fail() {
    return { ok: false, message: TOO_SMALL };
  }

  function roughRadius(strokes, center) {
    const radii = [];
    for (let s = 0; s < strokes.length; s++) {
      const stroke = strokes[s];
      for (let i = 0; i < stroke.length; i++) {
        const radius = Math.hypot(stroke[i].x - center.x, stroke[i].y - center.y);
        if (radius >= 4) radii.push(radius);
      }
    }
    if (radii.length < 8) return 0;
    return median(radii);
  }

  function resampleStroke(points, spacing) {
    if (points.length === 0) return [];
    const out = [points[0]];
    let anchor = points[0];
    let leftover = 0;
    for (let i = 1; i < points.length; i++) {
      let x = anchor.x;
      let y = anchor.y;
      const target = points[i];
      let dx = target.x - x;
      let dy = target.y - y;
      let dist = Math.hypot(dx, dy);
      if (dist === 0) continue;
      while (leftover + dist >= spacing) {
        const travel = (spacing - leftover) / dist;
        x += dx * travel;
        y += dy * travel;
        out.push({ x: x, y: y });
        dx = target.x - x;
        dy = target.y - y;
        dist = Math.hypot(dx, dy);
        leftover = 0;
      }
      leftover += dist;
      anchor = target;
    }
    return out;
  }

  function collectSamples(strokes, spacing) {
    const samples = [];
    for (let s = 0; s < strokes.length; s++) {
      const part = resampleStroke(strokes[s], spacing);
      for (let i = 0; i < part.length; i++) samples.push(part[i]);
    }
    return samples;
  }

  function toPercent(meanRel, coverage) {
    const adjusted = Math.max(0, meanRel - DEADZONE);
    const radial = Math.exp(-adjusted / RADIAL_TAU);
    const covered = coverage >= 0.972 ? 1 : coverage;
    return clamp(100 * radial * covered * covered, 0, 100);
  }

  function evaluateRotation(samples, center, table, rotation) {
    const ratios = [];
    const packed = [];
    for (let i = 0; i < samples.length; i++) {
      const dx = samples[i].x - center.x;
      const dy = samples[i].y - center.y;
      const rd = Math.hypot(dx, dy);
      if (rd < 4) continue;
      const angle = Math.atan2(dy, dx);
      const ri = root.MaruShapes.lookup(table, angle - rotation);
      if (!(ri > 0.02)) continue;
      ratios.push(rd / ri);
      packed.push({ angle: angle, rd: rd, ri: ri });
    }
    if (packed.length < 20) return null;
    const scale = median(ratios);
    if (!(scale > 0)) return null;

    let sum = 0;
    const filled = new Uint8Array(BINS);
    for (let i = 0; i < packed.length; i++) {
      const item = packed[i];
      sum += Math.abs(item.rd - scale * item.ri) / scale;
      let angle = item.angle;
      if (angle < 0) angle += TAU;
      const index = Math.min(BINS - 1, Math.floor((angle / TAU) * BINS));
      filled[index] = 1;
    }
    let covered = 0;
    for (let i = 0; i < BINS; i++) covered += filled[i];
    return {
      meanRel: sum / packed.length,
      coverage: covered / BINS,
      scale: scale,
      rotation: rotation
    };
  }

  function wrapRotation(rotation, symmetry) {
    if (!(symmetry > 0)) return 0;
    let wrapped = rotation % symmetry;
    if (wrapped < 0) wrapped += symmetry;
    return wrapped;
  }

  function decimate(points, maxCount) {
    if (points.length <= maxCount) return points;
    const step = Math.ceil(points.length / maxCount);
    const out = [];
    for (let i = 0; i < points.length; i += step) out.push(points[i]);
    return out;
  }

  const modelRadiusCache = {};

  function modelRadius(id, loop) {
    if (modelRadiusCache[id]) return modelRadiusCache[id];
    const radii = [];
    for (let i = 0; i < loop.length; i++) {
      radii.push(Math.hypot(loop[i].x, loop[i].y));
    }
    modelRadiusCache[id] = median(radii);
    return modelRadiusCache[id];
  }

  function coverageOf(samples, center) {
    const filled = new Uint8Array(BINS);
    for (let i = 0; i < samples.length; i++) {
      const dx = samples[i].x - center.x;
      const dy = samples[i].y - center.y;
      if (Math.hypot(dx, dy) < 4) continue;
      let angle = Math.atan2(dy, dx);
      if (angle < 0) angle += TAU;
      filled[Math.min(BINS - 1, Math.floor((angle / TAU) * BINS))] = 1;
    }
    let covered = 0;
    for (let i = 0; i < BINS; i++) covered += filled[i];
    return covered / BINS;
  }

  function meanDistance(samples, loop, rotation, scale, center) {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const count = loop.length;
    const placedX = new Array(count);
    const placedY = new Array(count);
    for (let i = 0; i < count; i++) {
      const x = loop[i].x * scale;
      const y = loop[i].y * scale;
      placedX[i] = center.x + x * cos - y * sin;
      placedY[i] = center.y + x * sin + y * cos;
    }
    let sum = 0;
    for (let p = 0; p < samples.length; p++) {
      const px = samples[p].x;
      const py = samples[p].y;
      let best = Infinity;
      for (let s = 0; s < count; s++) {
        const next = (s + 1) % count;
        const ax = placedX[s];
        const ay = placedY[s];
        const abx = placedX[next] - ax;
        const aby = placedY[next] - ay;
        const ab2 = abx * abx + aby * aby;
        let t = ab2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / ab2 : 0;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const dx = px - (ax + abx * t);
        const dy = py - (ay + aby * t);
        const dist = dx * dx + dy * dy;
        if (dist < best) best = dist;
      }
      sum += Math.sqrt(best);
    }
    return sum / samples.length;
  }

  function radialScale(samples, center, table, rotation) {
    const ratios = [];
    for (let i = 0; i < samples.length; i++) {
      const dx = samples[i].x - center.x;
      const dy = samples[i].y - center.y;
      const rd = Math.hypot(dx, dy);
      if (rd < 4) continue;
      const ri = root.MaruShapes.lookup(table, Math.atan2(dy, dx) - rotation);
      if (ri > 0.02) ratios.push(rd / ri);
    }
    if (ratios.length < 20) return 0;
    return median(ratios);
  }

  function fitOutline(samples, center, shape) {
    const loop = root.MaruShapes.loop(shape.id);
    const table = root.MaruShapes.table(shape.id);
    if (!loop || !table) return null;
    const base = modelRadius(shape.id, loop);
    const searchLoop = decimate(loop, 150);
    const searchSamples = decimate(samples, 150);
    const symmetry = shape.symmetry > 0 ? shape.symmetry : TAU;
    const coverage = coverageOf(samples, center);

    function evaluate(rotation, probeSamples, probeLoop) {
      const scale = radialScale(probeSamples, center, table, rotation);
      if (!(scale > 0)) return null;
      const distance = meanDistance(probeSamples, probeLoop, rotation, scale, center);
      return {
        meanRel: distance / (scale * base),
        scale: scale,
        rotation: rotation
      };
    }

    const steps = symmetry > Math.PI * 1.5 ? 90 : 48;
    const step = symmetry / steps;
    let best = null;
    for (let i = 0; i < steps; i++) {
      const trial = evaluate(i * step, searchSamples, searchLoop);
      if (trial && (!best || trial.meanRel < best.meanRel)) best = trial;
    }
    if (!best) return null;

    const fine = step / 10;
    const pivot = best.rotation;
    for (let rotation = pivot - step; rotation <= pivot + step; rotation += fine) {
      const trial = evaluate(rotation, searchSamples, searchLoop);
      if (trial && trial.meanRel < best.meanRel) best = trial;
    }

    const rotation = wrapRotation(best.rotation, symmetry);
    const scale = radialScale(samples, center, table, rotation);
    if (!(scale > 0)) return null;
    const distance = meanDistance(samples, loop, rotation, scale, center);
    return {
      meanRel: distance / (scale * base),
      coverage: coverage,
      scale: scale,
      rotation: rotation
    };
  }

  function score(shapeId, strokes, center) {
    const shape = root.MaruShapes.get(shapeId);
    const rough = roughRadius(strokes, center);
    if (rough < MIN_RADIUS) return fail();

    const spacing = clamp(rough * 0.015, 1.8, 7);
    const samples = collectSamples(strokes, spacing);
    if (samples.length < 20) return fail();

    const table = root.MaruShapes.table(shape.id);
    const fit = shape.id === "circle"
      ? evaluateRotation(samples, center, table, 0)
      : fitOutline(samples, center, shape);
    if (!fit) return fail();

    const percent = Math.round(toPercent(fit.meanRel, fit.coverage) * 10) / 10;
    return {
      ok: true,
      percent: percent,
      rank: root.MaruRanks.rankFor(percent),
      meanRel: fit.meanRel,
      coverage: fit.coverage,
      fit: { scale: fit.scale, rotation: fit.rotation }
    };
  }

  root.MaruScore = { score: score };
})(typeof window !== "undefined" ? window : globalThis);
