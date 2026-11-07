(function (root) {
  const RANKS = [
    { min: 99, id: "god", name: "神", comment: "神。この形、祀っていい。" },
    { min: 96, id: "hermit", name: "仙人", comment: "仙人レベル。筆が浮いている。" },
    { min: 92, id: "master", name: "達人級", comment: "達人級。腕が鳴っている。" },
    { min: 86, id: "expert", name: "名人", comment: "名人。かなりの線だ。" },
    { min: 78, id: "pro", name: "玄人", comment: "玄人の匂いがする。" },
    { min: 68, id: "nice", name: "なかなか", comment: "なかなかやる。" },
    { min: 55, id: "normal", name: "普通の人", comment: "普通の人。今日はここまで。" },
    { min: 42, id: "novice", name: "見習い", comment: "見習い。まだ修行中。" },
    { min: 30, id: "out", name: "論外", comment: "論外。形が別の道を行った。" },
    { min: 18, id: "jerk", name: "くそ野郎", comment: "くそ野郎。その線、好き勝手に走った。" },
    { min: 0, id: "beyond", name: "論外の彼方", comment: "論外の彼方。戻る地図がない。" }
  ];

  function rankFor(percent) {
    const value = Number(percent);
    let found = RANKS[RANKS.length - 1];
    for (let i = 0; i < RANKS.length; i++) {
      if (value >= RANKS[i].min) {
        found = RANKS[i];
        break;
      }
    }
    return {
      id: found.id,
      name: found.name,
      comment: found.comment,
      min: found.min
    };
  }

  root.MaruRanks = { rankFor: rankFor };
})(typeof window !== "undefined" ? window : globalThis);
