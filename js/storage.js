(function (root) {
  const KEY = "themaru.v1";

  function emptyStore() {
    return { players: {} };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return emptyStore();
      const data = JSON.parse(raw);
      if (!data || typeof data.players !== "object" || !data.players) return emptyStore();
      return data;
    } catch (err) {
      return emptyStore();
    }
  }

  function persist(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      return false;
    }
  }

  function better(next, prev) {
    if (!prev) return true;
    if (next.percent !== prev.percent) return next.percent > prev.percent;
    return next.at > prev.at;
  }

  function trimPlayer(player) {
    if (player.records.length <= 80) return;
    const bestByShape = {};
    for (let i = 0; i < player.records.length; i++) {
      const record = player.records[i];
      if (better(record, bestByShape[record.shape])) bestByShape[record.shape] = record;
    }
    const keep = new Set();
    Object.keys(bestByShape).forEach(function (shape) {
      keep.add(bestByShape[shape].id);
    });
    const recent = player.records.slice(-60);
    for (let i = 0; i < recent.length; i++) keep.add(recent[i].id);
    player.records = player.records.filter(function (record) {
      return keep.has(record.id);
    });
  }

  function saveLocal(record) {
    const data = load();
    const name = record.name;
    if (!data.players[name]) {
      data.players[name] = { name: name, records: [] };
    }
    const player = data.players[name];
    player.records.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      shape: record.shape,
      percent: record.percent,
      rank: record.rank,
      comment: record.comment,
      at: new Date().toISOString()
    });
    player.updatedAt = new Date().toISOString();
    trimPlayer(player);
    if (!persist(data)) {
      return { ok: false, error: "この端末に保存できませんでした" };
    }
    return { ok: true, where: "local" };
  }

  // 公開ランキングは未公開。入口だけ残し、今は保存しない。
  function saveRecord(record, mode) {
    if (mode === "public") {
      return { ok: false, error: "未公開" };
    }
    return saveLocal(record);
  }

  function bestMap(records, shapeFilter) {
    const byShape = {};
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (shapeFilter && record.shape !== shapeFilter) continue;
      if (better(record, byShape[record.shape])) byShape[record.shape] = record;
    }
    return byShape;
  }

  function nameChoices() {
    const data = load();
    const list = [];
    Object.keys(data.players).forEach(function (key) {
      const player = data.players[key];
      const bests = bestMap(player.records || []);
      let best = null;
      Object.keys(bests).forEach(function (shape) {
        if (better(bests[shape], best)) best = bests[shape];
      });
      if (!best) return;
      list.push({
        name: player.name,
        shape: best.shape,
        percent: best.percent,
        rank: best.rank,
        updatedAt: player.updatedAt || best.at
      });
    });
    list.sort(function (a, b) {
      return a.updatedAt < b.updatedAt ? 1 : -1;
    });
    return list;
  }

  function bests(shapeFilter) {
    const data = load();
    const rows = [];
    Object.keys(data.players).forEach(function (key) {
      const player = data.players[key];
      const map = bestMap(player.records || [], shapeFilter || "");
      Object.keys(map).forEach(function (shape) {
        const record = map[shape];
        rows.push({
          name: player.name,
          shape: record.shape,
          percent: record.percent,
          rank: record.rank,
          at: record.at
        });
      });
    });
    rows.sort(function (a, b) {
      if (b.percent !== a.percent) return b.percent - a.percent;
      return a.at < b.at ? 1 : -1;
    });
    return rows;
  }

  function clearAll() {
    try {
      localStorage.removeItem(KEY);
    } catch (err) {
      // 端末が保存を拒否した場合は、画面側で空の一覧を出す。
    }
  }

  root.MaruStorage = {
    saveRecord: saveRecord,
    nameChoices: nameChoices,
    bests: bests,
    clearAll: clearAll
  };
})(typeof window !== "undefined" ? window : globalThis);
