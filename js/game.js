(function () {
  const HINT_IDLE = "点を中心に、指やマウスで形を描いてください。";
  const HINT_DRAWING = "描いています。離すと精度が出ます。";
  const HINT_NEXT = "線を足すと、次に離したときに精度が更新されます。";
  const WAITING = "離すと、精度とランクが出ます。";

  const startScreen = document.getElementById("screen-start");
  const playScreen = document.getElementById("screen-play");
  const historyScreen = document.getElementById("screen-history");
  const form = document.getElementById("start-form");
  const nameInput = document.getElementById("player-name");
  const nameError = document.getElementById("name-error");
  const nameCombo = document.getElementById("name-combo");
  const nameOpen = document.getElementById("name-open");
  const nameMenu = document.getElementById("name-menu");
  const shapeRow = document.querySelector(".shape-row");
  const openHistory = document.getElementById("open-history");
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const playShape = document.getElementById("play-shape");
  const playPlayer = document.getElementById("play-player");
  const playHint = document.getElementById("play-hint");
  const scorePanel = document.getElementById("score-panel");
  const percentEl = document.getElementById("percent");
  const rankEl = document.getElementById("rank-name");
  const commentEl = document.getElementById("rank-comment");
  const saveFlash = document.getElementById("save-flash");
  const saveBtn = document.getElementById("save-btn");
  const retryBtn = document.getElementById("retry-btn");
  const backBtn = document.getElementById("back-btn");
  const historyFilters = document.getElementById("history-filters");
  const historyList = document.getElementById("history-list");
  const historyBack = document.getElementById("history-back");
  const clearBtn = document.getElementById("clear-btn");

  const state = {
    shapeId: "circle",
    playerName: "",
    strokes: [],
    current: null,
    pointerId: null,
    ghost: null,
    result: null,
    saved: false,
    historyShape: "all",
    cssWidth: 0,
    cssHeight: 0
  };

  let selectedShape = "circle";

  function showScreen(name) {
    startScreen.hidden = name !== "start";
    playScreen.hidden = name !== "play";
    historyScreen.hidden = name !== "history";
    window.scrollTo(0, 0);
    if (name === "play") requestAnimationFrame(resizeBoard);
  }

  function shapeName(id) {
    return MaruShapes.get(id).name;
  }

  function center() {
    return { x: state.cssWidth / 2, y: state.cssHeight / 2 };
  }

  function renderNameMenu() {
    const choices = MaruStorage.nameChoices();
    nameMenu.replaceChildren();
    if (choices.length === 0) {
      const empty = document.createElement("li");
      empty.className = "name-empty";
      empty.textContent = "まだ記録がありません";
      nameMenu.appendChild(empty);
      return;
    }
    choices.forEach(function (choice) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "name-option";
      button.setAttribute("role", "option");
      const name = document.createElement("span");
      name.className = "name-option-name";
      name.textContent = choice.name;
      const meta = document.createElement("span");
      meta.className = "name-option-meta";
      meta.textContent = shapeName(choice.shape) + " " + choice.percent.toFixed(1) + "% " + choice.rank;
      button.append(name, meta);
      button.addEventListener("click", function () {
        nameInput.value = choice.name;
        nameError.hidden = true;
        closeNameMenu();
        nameInput.focus();
      });
      item.appendChild(button);
      nameMenu.appendChild(item);
    });
  }

  function openNameMenu() {
    renderNameMenu();
    nameMenu.hidden = false;
    nameOpen.setAttribute("aria-expanded", "true");
  }

  function closeNameMenu() {
    nameMenu.hidden = true;
    nameOpen.setAttribute("aria-expanded", "false");
  }

  function selectShape(id) {
    selectedShape = id;
    const buttons = shapeRow.querySelectorAll(".shape-btn");
    buttons.forEach(function (button) {
      const on = button.dataset.shape === id;
      button.classList.toggle("is-selected", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function setPercent(result) {
    percentEl.replaceChildren();
    if (!result || !result.ok) {
      percentEl.textContent = "—";
      return;
    }
    const number = document.createElement("span");
    number.textContent = result.percent.toFixed(1);
    const unit = document.createElement("span");
    unit.className = "percent-unit";
    unit.textContent = "%";
    percentEl.append(number, unit);
  }

  function showIdleScore() {
    state.result = null;
    state.saved = false;
    state.ghost = null;
    delete scorePanel.dataset.rank;
    setPercent(null);
    rankEl.textContent = "";
    delete rankEl.dataset.rank;
    commentEl.textContent = WAITING;
    saveFlash.hidden = true;
    saveBtn.disabled = true;
    playHint.textContent = HINT_IDLE;
  }

  function showPending() {
    setPercent(null);
    percentEl.textContent = "…";
    rankEl.textContent = "";
    delete rankEl.dataset.rank;
    delete scorePanel.dataset.rank;
    commentEl.textContent = HINT_DRAWING;
    saveFlash.hidden = true;
    saveBtn.disabled = true;
    playHint.textContent = HINT_DRAWING;
  }

  function showResult(result) {
    state.result = result;
    state.saved = false;
    saveFlash.hidden = true;
    if (!result.ok) {
      state.ghost = null;
      delete scorePanel.dataset.rank;
      setPercent(null);
      rankEl.textContent = "";
      delete rankEl.dataset.rank;
      commentEl.textContent = result.message;
      saveBtn.disabled = true;
      playHint.textContent = result.message;
      redraw();
      return;
    }
    state.ghost = {
      shapeId: state.shapeId,
      scale: result.fit.scale,
      rotation: result.fit.rotation
    };
    setPercent(result);
    rankEl.textContent = result.rank.name;
    rankEl.dataset.rank = result.rank.id;
    scorePanel.dataset.rank = result.rank.id;
    commentEl.textContent = result.rank.comment;
    saveBtn.disabled = false;
    playHint.textContent = HINT_NEXT;
    redraw();
  }

  function drawSmoothStroke(points) {
    if (points.length === 0) return;
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = "#241c16";
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i].x + points[i + 1].x) / 2;
      const midY = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.strokeStyle = "#241c16";
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  function drawGhost(ghost) {
    const origin = center();
    const table = MaruShapes.table(ghost.shapeId);
    ctx.beginPath();
    const steps = 360;
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const radius = ghost.scale * MaruShapes.lookup(table, angle - ghost.rotation);
      const x = origin.x + Math.cos(angle) * radius;
      const y = origin.y + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.save();
    ctx.strokeStyle = "rgba(214, 64, 44, 0.55)";
    ctx.lineWidth = 11;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
  }

  function drawCenterDot() {
    const origin = center();
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(214, 64, 44, 0.14)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = "#d6402c";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = "#fffaf3";
    ctx.fill();
  }

  function redraw() {
    if (!state.cssWidth || !state.cssHeight) return;
    ctx.clearRect(0, 0, state.cssWidth, state.cssHeight);
    ctx.fillStyle = "#fffaf3";
    ctx.fillRect(0, 0, state.cssWidth, state.cssHeight);
    if (state.ghost && !state.current) drawGhost(state.ghost);
    for (let i = 0; i < state.strokes.length; i++) drawSmoothStroke(state.strokes[i]);
    if (state.current) drawSmoothStroke(state.current);
    drawCenterDot();
  }

  function resizeBoard() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return;
    const prevW = state.cssWidth;
    const prevH = state.cssHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.cssWidth = rect.width;
    state.cssHeight = rect.height;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (prevW > 20 && prevH > 20 && (Math.abs(prevW - rect.width) > 1 || Math.abs(prevH - rect.height) > 1)) {
      const sx = rect.width / prevW;
      const sy = rect.height / prevH;
      const mapPoint = function (point) {
        return { x: point.x * sx, y: point.y * sy };
      };
      state.strokes = state.strokes.map(function (stroke) {
        return stroke.map(mapPoint);
      });
      if (state.current) state.current = state.current.map(mapPoint);
      if (state.ghost) state.ghost.scale *= (sx + sy) / 2;
    }
    redraw();
  }

  function eventPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * state.cssWidth,
      y: ((event.clientY - rect.top) / rect.height) * state.cssHeight
    };
  }

  function appendPoint(point) {
    const stroke = state.current;
    const last = stroke[stroke.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) < 1.15) return false;
    stroke.push(point);
    return true;
  }

  function onPointerDown(event) {
    if (state.pointerId !== null) return;
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    state.pointerId = event.pointerId;
    try { canvas.setPointerCapture(event.pointerId); } catch (err) { /* 合成イベントではポインタを捕まえられない */ }
    state.current = [eventPoint(event)];
    state.ghost = null;
    showPending();
    redraw();
  }

  function onPointerMove(event) {
    if (event.pointerId !== state.pointerId || !state.current) return;
    event.preventDefault();
    let events = [event];
    if (typeof event.getCoalescedEvents === "function") {
      try {
        const extra = event.getCoalescedEvents();
        if (extra && extra.length) events = extra;
      } catch (err) { /* 合成イベントにはまとまった点がない */ }
    }
    let changed = false;
    for (let i = 0; i < events.length; i++) {
      if (appendPoint(eventPoint(events[i]))) changed = true;
    }
    if (changed) redraw();
  }

  function finishStroke(event) {
    if (event.pointerId !== state.pointerId) return;
    state.pointerId = null;
    if (state.current && state.current.length > 0) state.strokes.push(state.current);
    state.current = null;
    redraw();
    showResult(MaruScore.score(state.shapeId, state.strokes, center()));
  }

  function resetDrawing() {
    state.strokes = [];
    state.current = null;
    state.pointerId = null;
    showIdleScore();
    redraw();
  }

  function startPlay(name) {
    state.playerName = name;
    state.shapeId = selectedShape;
    playShape.textContent = shapeName(selectedShape);
    playPlayer.textContent = name;
    resetDrawing();
    showScreen("play");
  }

  function saveCurrent() {
    if (!state.result || !state.result.ok || state.saved) return;
    const saved = MaruStorage.saveRecord({
      name: state.playerName,
      shape: state.shapeId,
      percent: state.result.percent,
      rank: state.result.rank.name,
      comment: state.result.rank.comment
    }, "local");
    if (!saved.ok) {
      commentEl.textContent = saved.error || "この端末に保存できませんでした";
      return;
    }
    state.saved = true;
    saveBtn.disabled = true;
    saveFlash.hidden = false;
  }

  function leavePlay() {
    if (state.result && state.result.ok && !state.saved) {
      const leave = window.confirm("記録していない結果があります。開始画面に戻りますか？");
      if (!leave) return;
    }
    showScreen("start");
    renderNameMenu();
  }

  function formatWhen(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("ja-JP", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function renderHistory() {
    const rows = MaruStorage.bests(state.historyShape === "all" ? "" : state.historyShape);
    historyList.replaceChildren();
    if (rows.length === 0) {
      const empty = document.createElement("li");
      empty.className = "history-empty";
      empty.textContent = "まだ記録がありません";
      historyList.appendChild(empty);
      return;
    }
    rows.forEach(function (row, index) {
      const item = document.createElement("li");
      item.className = "history-item";
      const place = document.createElement("span");
      place.className = "place";
      place.textContent = String(index + 1);
      const body = document.createElement("div");
      const name = document.createElement("p");
      name.className = "history-name";
      name.textContent = row.name;
      const meta = document.createElement("p");
      meta.className = "history-meta";
      meta.textContent = shapeName(row.shape) + "・" + row.rank + "・" + formatWhen(row.at);
      body.append(name, meta);
      const score = document.createElement("p");
      score.className = "history-score";
      score.textContent = row.percent.toFixed(1) + "%";
      item.append(place, body, score);
      historyList.appendChild(item);
    });
  }

  function buildFilters() {
    const filters = [{ id: "all", name: "すべて" }].concat(MaruShapes.all);
    filters.forEach(function (filter) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "filter-btn";
      button.dataset.shape = filter.id;
      button.textContent = filter.name;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", filter.id === state.historyShape ? "true" : "false");
      if (filter.id === state.historyShape) button.classList.add("is-selected");
      button.addEventListener("click", function () {
        state.historyShape = filter.id;
        const buttons = historyFilters.querySelectorAll(".filter-btn");
        buttons.forEach(function (item) {
          const on = item.dataset.shape === filter.id;
          item.classList.toggle("is-selected", on);
          item.setAttribute("aria-selected", on ? "true" : "false");
        });
        renderHistory();
      });
      historyFilters.appendChild(button);
    });
  }

  function openHistoryScreen() {
    closeNameMenu();
    renderHistory();
    showScreen("history");
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const name = nameInput.value.trim().slice(0, 16);
    if (!name) {
      nameError.hidden = false;
      nameInput.focus();
      return;
    }
    nameError.hidden = true;
    closeNameMenu();
    startPlay(name);
  });

  nameInput.addEventListener("input", function () {
    nameError.hidden = true;
  });

  nameOpen.addEventListener("click", function () {
    if (nameMenu.hidden) openNameMenu();
    else closeNameMenu();
  });

  nameInput.addEventListener("keydown", function (event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openNameMenu();
    } else if (event.key === "Escape") {
      closeNameMenu();
    }
  });

  document.addEventListener("pointerdown", function (event) {
    if (!nameMenu.hidden && !nameCombo.contains(event.target)) closeNameMenu();
  });

  shapeRow.addEventListener("click", function (event) {
    const button = event.target.closest(".shape-btn");
    if (!button) return;
    selectShape(button.dataset.shape);
  });

  openHistory.addEventListener("click", openHistoryScreen);
  historyBack.addEventListener("click", function () {
    showScreen("start");
  });
  clearBtn.addEventListener("click", function () {
    const erase = window.confirm("この端末に保存した記録をすべて消しますか？");
    if (!erase) return;
    MaruStorage.clearAll();
    renderHistory();
    renderNameMenu();
  });

  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
  canvas.addEventListener("pointermove", onPointerMove, { passive: false });
  canvas.addEventListener("pointerup", finishStroke);
  canvas.addEventListener("pointercancel", finishStroke);
  canvas.addEventListener("contextmenu", function (event) {
    event.preventDefault();
  });

  saveBtn.addEventListener("click", saveCurrent);
  retryBtn.addEventListener("click", resetDrawing);
  backBtn.addEventListener("click", leavePlay);
  window.addEventListener("resize", resizeBoard);
  if (window.ResizeObserver) {
    const observer = new ResizeObserver(resizeBoard);
    observer.observe(canvas.parentElement);
  }

  buildFilters();
  const remembered = MaruStorage.nameChoices();
  if (remembered.length > 0) nameInput.value = remembered[0].name;
  renderNameMenu();
})();
