// =====================================================================
// 미션 게임 로직 — 순수 클라이언트 사이드 (서버 통신 없음)
// 각 startMissionX(onComplete) 는 게임 종료 시 onComplete({score, timeMs}) 호출
// score: 0~100, timeMs: 진행 시간(ms)
// =====================================================================

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------
// 미션 1: 보안검색요원 — 위험물 찾기
// ---------------------------------------------------------------------
const ITEM_POOL = [
  { e: "🔪", l: "칼", d: true },
  { e: "✂️", l: "가위", d: true },
  { e: "🔥", l: "라이터", d: true },
  { e: "🔨", l: "망치", d: true },
  { e: "🪚", l: "톱", d: true },
  { e: "💣", l: "폭발물(모형)", d: true },
  { e: "🧪", l: "인화성 액체", d: true },
  { e: "📱", l: "휴대폰", d: false },
  { e: "👛", l: "지갑", d: false },
  { e: "🧸", l: "인형", d: false },
  { e: "📖", l: "책", d: false },
  { e: "☂️", l: "우산", d: false },
  { e: "🎧", l: "헤드폰", d: false },
  { e: "🕶️", l: "안경", d: false },
  { e: "🧦", l: "양말", d: false },
];

export function startMission1(onComplete) {
  const grid = document.getElementById("m1-grid");
  const timerBar = document.getElementById("m1-timerBar");
  const timeLabel = document.getElementById("m1-timeLabel");
  timerBar.classList.remove("danger");
  grid.innerHTML = "";

  const dangerous = shuffle(ITEM_POOL.filter((i) => i.d)).slice(0, 6);
  const safe = shuffle(ITEM_POOL.filter((i) => !i.d)).slice(0, 6);
  const tiles = shuffle([...dangerous, ...safe]);

  const total = dangerous.length;
  const duration = 20000;
  const start = performance.now();
  let correct = 0,
    wrong = 0,
    found = 0,
    finished = false,
    raf;

  tiles.forEach((item) => {
    const tile = document.createElement("div");
    tile.className = "item-tile";
    tile.innerHTML = `<div>${item.e}</div><div class="label">${item.l}</div>`;
    tile.addEventListener("click", () => {
      if (finished || tile.classList.contains("disabled")) return;
      if (item.d) {
        tile.classList.add("correct", "disabled");
        correct++;
        found++;
        if (found >= total) endGame(true);
      } else {
        tile.classList.add("wrong");
        wrong++;
        setTimeout(() => tile.classList.remove("wrong"), 300);
      }
    });
    grid.appendChild(tile);
  });

  function tick() {
    const elapsed = performance.now() - start;
    const remain = Math.max(0, duration - elapsed);
    timerBar.style.width = (remain / duration) * 100 + "%";
    timeLabel.textContent = Math.ceil(remain / 1000) + "s";
    if (remain <= 5000) timerBar.classList.add("danger");
    if (remain <= 0) {
      endGame(false);
      return;
    }
    if (!finished) raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  function endGame(cleared) {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    const elapsed = performance.now() - start;
    let score = Math.max(0, correct * 15 - wrong * 8);
    if (cleared) score += Math.round((duration - elapsed) / 1000) * 3;
    score = Math.min(100, score);
    onComplete({ score, timeMs: Math.round(elapsed) });
  }
}

// ---------------------------------------------------------------------
// 미션 2: 폭발물처리요원 — 해체 시퀀스 (Simon Says)
// ---------------------------------------------------------------------
export async function startMission2(onComplete) {
  const colors = ["red", "yellow", "blue", "green"];
  const seqLen = 6;
  const sequence = Array.from(
    { length: seqLen },
    () => colors[Math.floor(Math.random() * colors.length)]
  );
  const status = document.getElementById("m2-status");
  const roundLabel = document.getElementById("m2-roundLabel");

  // 이전 라운드의 리스너 잔존 방지를 위해 버튼 노드를 새로 교체
  const pad = document.querySelector(".wire-pad");
  const freshPad = pad.cloneNode(true);
  pad.parentNode.replaceChild(freshPad, pad);
  const buttons = [...freshPad.querySelectorAll(".wire-btn")];

  let userIdx = 0,
    correctSteps = 0,
    finished = false;
  const start = performance.now();

  function setDisabled(d) {
    buttons.forEach((b) => (b.disabled = d));
  }

  setDisabled(true);
  roundLabel.textContent = "기억하기";
  status.textContent = "순서를 기억하세요...";

  for (const c of sequence) {
    const btn = buttons.find((b) => b.dataset.c === c);
    btn.classList.add("flash");
    await sleep(450);
    btn.classList.remove("flash");
    await sleep(180);
  }

  if (finished) return; // 화면 이탈 등 예외 가드
  status.textContent = "이제 순서대로 눌러보세요!";
  roundLabel.textContent = "입력하기";
  setDisabled(false);

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (finished) return;
      const expected = sequence[userIdx];
      if (btn.dataset.c === expected) {
        btn.classList.add("active");
        setTimeout(() => btn.classList.remove("active"), 200);
        correctSteps++;
        userIdx++;
        status.textContent = `${userIdx} / ${seqLen}`;
        if (userIdx >= seqLen) end();
      } else {
        btn.classList.add("flash");
        status.textContent = "해체 실패! 결과를 확인하세요.";
        setTimeout(() => btn.classList.remove("flash"), 300);
        end();
      }
    });
  });

  function end() {
    if (finished) return;
    finished = true;
    setDisabled(true);
    const elapsed = performance.now() - start;
    const score = Math.round((correctSteps / seqLen) * 100);
    onComplete({ score, timeMs: Math.round(elapsed) });
  }
}

// ---------------------------------------------------------------------
// 미션 3: 공항 직업 커넥트 — 직업 아이콘과 직무 설명 짝맞추기
// (출처: KAC "공항에서 찾아보는 다양한 직업들" 자료 기반)
// ---------------------------------------------------------------------
const JOB_PAIRS = [
  { id: "pilot",    emoji: "✈️", label: "조종사",          duty: "비행기를 조종하는 하늘 위의 리더" },
  { id: "atc",      emoji: "🗼", label: "관제사",          duty: "이륙·착륙 순서를 지정하고 안전한 길을 안내해요" },
  { id: "fire",     emoji: "🚒", label: "공항소방대",      duty: "공항 내 사고에 신속히 출동해 인명을 구조해요" },
  { id: "security", emoji: "🛂", label: "보안검색요원",    duty: "기내 반입 물품을 X-ray로 확인해요" },
  { id: "eod",      emoji: "💣", label: "폭발물처리요원",  duty: "특수 장비로 의심물의 형태·성분을 확인해요" },
  { id: "mech",     emoji: "🔧", label: "항공정비사",      duty: "항공기가 안전하게 날 수 있도록 이착륙 전후 점검하고 수리해요" },
];

export function startMission3(onComplete) {
  const grid = document.getElementById("m3-grid");
  const timerBar = document.getElementById("m3-timerBar");
  const timeLabel = document.getElementById("m3-timeLabel");
  const statusLabel = document.getElementById("m3-roundLabel");
  timerBar.classList.remove("danger");
  grid.innerHTML = "";

  const duration = 60000;
  const start = performance.now();
  let matched = 0,
    wrong = 0,
    finished = false,
    selected = null,
    raf;

  statusLabel.textContent = `남은 짝: ${JOB_PAIRS.length}`;

  const tiles = shuffle([
    ...JOB_PAIRS.map((j) => ({
      pairId: j.id,
      kind: "job",
      html: `<div class="mt-icon">${j.emoji}</div><div class="mt-text">${j.label}</div>`,
    })),
    ...JOB_PAIRS.map((j) => ({
      pairId: j.id,
      kind: "duty",
      html: `<div class="mt-text">${j.duty}</div>`,
    })),
  ]);

  tiles.forEach((t) => {
    const el = document.createElement("div");
    el.className = "match-tile";
    el.dataset.kind = t.kind;
    el.innerHTML = t.html;
    el.addEventListener("click", () => onTileClick(el, t));
    grid.appendChild(el);
  });

  function onTileClick(el, t) {
    if (finished || el.classList.contains("matched") || el.classList.contains("selected")) return;

    if (!selected) {
      selected = { el, t };
      el.classList.add("selected");
      return;
    }
    if (selected.t.kind === t.kind) {
      // 같은 종류(직업↔직업, 설명↔설명)를 다시 고르면 선택만 갈아탐
      selected.el.classList.remove("selected");
      selected = { el, t };
      el.classList.add("selected");
      return;
    }

    if (selected.t.pairId === t.pairId) {
      selected.el.classList.remove("selected");
      selected.el.classList.add("matched");
      el.classList.add("matched");
      matched++;
      statusLabel.textContent = `남은 짝: ${JOB_PAIRS.length - matched}`;
      selected = null;
      if (matched >= JOB_PAIRS.length) endGame(true);
    } else {
      wrong++;
      const prevEl = selected.el;
      el.classList.add("wrong");
      prevEl.classList.add("wrong");
      setTimeout(() => {
        el.classList.remove("wrong");
        prevEl.classList.remove("wrong", "selected");
      }, 350);
      selected = null;
    }
  }

  function tick() {
    const elapsed = performance.now() - start;
    const remain = Math.max(0, duration - elapsed);
    timerBar.style.width = (remain / duration) * 100 + "%";
    timeLabel.textContent = Math.ceil(remain / 1000) + "s";
    if (remain <= 10000) timerBar.classList.add("danger");
    if (remain <= 0) {
      endGame(false);
      return;
    }
    if (!finished) raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  function endGame(cleared) {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    const elapsed = performance.now() - start;
    let score = matched * 20 - wrong * 5;
    if (cleared) score += Math.round((duration - elapsed) / 1000) * 2;
    score = Math.max(0, Math.min(100, score));
    onComplete({ score, timeMs: Math.round(elapsed) });
  }
}
