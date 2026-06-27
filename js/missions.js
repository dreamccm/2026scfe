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
// 미션 3: 보안관제요원 — CCTV 이상상황 포착
// ---------------------------------------------------------------------
export function startMission3(onComplete) {
  const grid = document.getElementById("m3-grid");
  const timerBar = document.getElementById("m3-timerBar");
  const timeLabel = document.getElementById("m3-timeLabel");
  const roundLabel = document.getElementById("m3-roundLabel");

  const totalRounds = 3;
  const cellsPerRound = 9;
  const roundDuration = 8000;
  const anomalyEmojis = ["🎒", "🚪", "📦", "🧯"];

  let round = 0,
    correctRounds = 0,
    finished = false;
  const startAll = performance.now();

  function playRound() {
    round++;
    roundLabel.textContent = `ROUND ${round} / ${totalRounds}`;
    timerBar.classList.remove("danger");
    grid.innerHTML = "";

    const anomalyIdx = Math.floor(Math.random() * cellsPerRound);
    const anomalyEmoji = anomalyEmojis[Math.floor(Math.random() * anomalyEmojis.length)];
    let roundDone = false;
    const roundStart = performance.now();
    let raf;

    for (let i = 0; i < cellsPerRound; i++) {
      const cell = document.createElement("div");
      cell.className = "cctv-cell";
      cell.textContent = i === anomalyIdx ? anomalyEmoji : "🧍";
      cell.addEventListener("click", () => {
        if (roundDone || finished) return;
        roundDone = true;
        if (i === anomalyIdx) correctRounds++;
        nextStep();
      });
      grid.appendChild(cell);
    }

    function tick() {
      const elapsed = performance.now() - roundStart;
      const remain = Math.max(0, roundDuration - elapsed);
      timerBar.style.width = (remain / roundDuration) * 100 + "%";
      timeLabel.textContent = Math.ceil(remain / 1000) + "s";
      if (remain <= 3000) timerBar.classList.add("danger");
      if (remain <= 0) {
        roundDone = true;
        nextStep();
        return;
      }
      if (!roundDone) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    function nextStep() {
      cancelAnimationFrame(raf);
      if (finished) return;
      if (round >= totalRounds) end();
      else setTimeout(playRound, 400);
    }
  }

  playRound();

  function end() {
    if (finished) return;
    finished = true;
    const elapsed = performance.now() - startAll;
    const score = Math.round((correctRounds / totalRounds) * 100);
    onComplete({ score, timeMs: Math.round(elapsed) });
  }
}
