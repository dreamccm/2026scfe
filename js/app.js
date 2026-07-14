import { firebaseConfig, setupAppCheck } from "./firebase-config.js";
import { startMission1, startMission2, startMission3 } from "./missions.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
setupAppCheck(app);
const db = getFirestore(app);

// ---------------------------------------------------------------------
// 화면 전환 유틸
// ---------------------------------------------------------------------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}

// ---------------------------------------------------------------------
// 세션(참가자) 상태
// ---------------------------------------------------------------------
const SESSION_KEY = "avsec_session_id";
const state = { ref: null, sessionId: null, data: null };
let leaderboardStarted = false;

function genCode() {
  return "AV-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

// 같은 닉네임을 쓰는 다른 참가자(문서)가 있는지 확인 (내 기존 세션은 제외)
async function checkNicknameTaken(nickname, excludeId) {
  const q = query(collection(db, "participants"), where("nickname", "==", nickname), limit(2));
  const snap = await getDocs(q);
  return snap.docs.some((d) => d.id !== excludeId);
}

async function getOrCreateSession(nickname) {
  let sessionId = localStorage.getItem(SESSION_KEY);

  if (sessionId) {
    const ref = doc(db, "participants", sessionId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return { ref, sessionId, data: snap.data() };
    }
  }

  sessionId =
    window.crypto && window.crypto.randomUUID
      ? window.crypto.randomUUID()
      : "p_" + Date.now() + "_" + Math.random().toString(36).slice(2);

  const ref = doc(db, "participants", sessionId);
  const data = {
    nickname,
    createdAt: serverTimestamp(),
    mission1: null,
    mission2: null,
    mission3: null,
    totalScore: 0,
    totalTimeMs: 0,
    completedAt: null,
    certCode: null,
    rewardGiven: false,
  };
  await setDoc(ref, data);
  localStorage.setItem(SESSION_KEY, sessionId);
  return { ref, sessionId, data };
}

// ---------------------------------------------------------------------
// 미션 메뉴 렌더링
// ---------------------------------------------------------------------
const MISSION_KEYS = ["mission1", "mission2", "mission3"];

function renderMenu() {
  MISSION_KEYS.forEach((key, idx) => {
    const n = idx + 1;
    const card = document.getElementById("card-" + n);
    const scoreEl = document.getElementById("score-" + n);
    const light = document.querySelector(`.runway-progress .light[data-m="${n}"]`);
    const m = state.data[key];
    if (m && m.completed) {
      card.classList.add("done");
      scoreEl.textContent = m.score;
      light.classList.add("on");
    } else {
      card.classList.remove("done");
      scoreEl.textContent = "-";
      light.classList.remove("on");
    }
  });
}

function allMissionsDone() {
  return MISSION_KEYS.every((k) => state.data[k] && state.data[k].completed);
}

// ---------------------------------------------------------------------
// 미션 완료 처리 → Firestore 저장 → 결과/인증서 화면
// ---------------------------------------------------------------------
async function handleMissionComplete(missionKey, result) {
  state.data[missionKey] = { completed: true, score: result.score, timeMs: result.timeMs };

  const totalScore = MISSION_KEYS.reduce(
    (sum, k) => sum + (state.data[k] ? state.data[k].score : 0),
    0
  );
  const totalTimeMs = MISSION_KEYS.reduce(
    (sum, k) => sum + (state.data[k] ? state.data[k].timeMs : 0),
    0
  );
  state.data.totalScore = totalScore;
  state.data.totalTimeMs = totalTimeMs;

  const payload = { [missionKey]: state.data[missionKey], totalScore, totalTimeMs };

  if (allMissionsDone()) {
    state.data.certCode = genCode();
    payload.completedAt = serverTimestamp();
    payload.certCode = state.data.certCode;
  }

  try {
    await updateDoc(state.ref, payload);
  } catch (e) {
    console.error("Firestore 업데이트 실패", e);
    toast("저장 중 오류가 발생했습니다. 네트워크를 확인하세요.");
  }

  if (allMissionsDone()) {
    showComplete();
  } else {
    document.getElementById("resultTitle").textContent = "미션 클리어!";
    document.getElementById("resultScore").textContent = result.score;
    document.getElementById("resultTime").textContent = (result.timeMs / 1000).toFixed(1) + "s";
    showScreen("screen-result");
  }
}

function showComplete() {
  document.getElementById("certNickname").textContent = state.data.nickname;
  document.getElementById("certCode").textContent = "CODE: " + state.data.certCode;
  document.getElementById("totalScoreDisplay").textContent = state.data.totalScore;
  document.getElementById("totalTimeDisplay").textContent =
    (state.data.totalTimeMs / 1000).toFixed(1) + "s";
  showScreen("screen-complete");
}

// ---------------------------------------------------------------------
// 실시간 리더보드
// ---------------------------------------------------------------------
function startLeaderboardListener() {
  if (leaderboardStarted) return;
  leaderboardStarted = true;
  const q = query(
    collection(db, "participants"),
    orderBy("totalScore", "desc"),
    orderBy("totalTimeMs", "asc"),
    limit(20)
  );
  onSnapshot(
    q,
    (snap) => renderLeaderboard(snap.docs.map((d) => d.data())),
    (err) => {
      console.error("리더보드 구독 실패", err);
      document.getElementById("leaderboardList").innerHTML =
        '<p style="color:var(--text-muted);font-size:13px;text-align:center">순위를 불러올 수 없습니다. (Firestore 색인 생성이 필요할 수 있습니다 — 브라우저 콘솔의 링크를 확인하세요)</p>';
    }
  );
}

function renderLeaderboard(rows) {
  const list = document.getElementById("leaderboardList");
  if (rows.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center">아직 참가자가 없습니다.</p>';
    return;
  }
  list.innerHTML = rows
    .map((r, i) => {
      const rank = i + 1;
      const cls = rank === 1 ? "top1" : rank === 2 ? "top2" : rank === 3 ? "top3" : "";
      return `<div class="leaderboard-row ${cls}">
        <div class="rank">${rank}</div>
        <div class="nick">${escapeHtml(r.nickname || "-")}</div>
        <div class="pts">${r.totalScore || 0}pt</div>
      </div>`;
    })
    .join("");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------------------------------------------------------------
// 카운트다운 유틸 (미션 1·2 공용, 3초)
// ---------------------------------------------------------------------
function runCountdown(onDone) {
  showScreen("screen-countdown");
  const numEl = document.getElementById("countdownNum");
  let count = 3;
  numEl.textContent = count;
  const iv = setInterval(() => {
    count--;
    if (count > 0) {
      numEl.textContent = count;
    } else {
      clearInterval(iv);
      onDone();
    }
  }, 1000);
}

// ---------------------------------------------------------------------
// 이벤트 바인딩
// ---------------------------------------------------------------------
// 미션 카드 → 사전 안내화면으로 이동
[1, 2, 3].forEach((n) => {
  document.getElementById("card-" + n).addEventListener("click", () => {
    const key = "mission" + n;
    if (!state.data) return;
    if (state.data[key] && state.data[key].completed) {
      toast("이미 완료한 미션입니다");
      return;
    }
    showScreen("screen-pre" + n);
  });
});

// 시작하기 버튼 → 카운트다운 → 게임
function launchMission(n) {
  const key = "mission" + n;
  const onComplete = (result) => handleMissionComplete(key, result);
  if (n === 1 || n === 2) {
    runCountdown(() => {
      showScreen("screen-m" + n);
      if (n === 1) startMission1(onComplete);
      if (n === 2) startMission2(onComplete);
    });
  } else {
    showScreen("screen-m" + n);
    startMission3(onComplete);
  }
}

document.getElementById("btnStartM1").addEventListener("click", () => launchMission(1));
document.getElementById("btnStartM2").addEventListener("click", () => launchMission(2));
document.getElementById("btnStartM3").addEventListener("click", () => launchMission(3));

document.getElementById("btnStart").addEventListener("click", async () => {
  const input = document.getElementById("nicknameInput");
  const nickname = input.value.trim();
  if (!nickname) {
    toast("닉네임을 입력하세요");
    return;
  }
  const btn = document.getElementById("btnStart");
  btn.disabled = true;
  btn.textContent = "연결 중...";
  try {
    const existingSessionId = localStorage.getItem(SESSION_KEY);
    const taken = await checkNicknameTaken(nickname, existingSessionId);
    if (taken) {
      toast("이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해주세요.");
      input.focus();
      input.select();
      return;
    }
    const session = await getOrCreateSession(nickname);
    state.ref = session.ref;
    state.sessionId = session.sessionId;
    state.data = session.data;
    renderMenu();
    startLeaderboardListener();
    showScreen("screen-menu");
  } catch (e) {
    console.error(e);
    toast("연결에 실패했습니다. firebase-config.js 설정을 확인하세요.");
  } finally {
    btn.disabled = false;
    btn.textContent = "미션 시작하기";
  }
});


document.getElementById("btnBackToMenu").addEventListener("click", () => {
  renderMenu();
  showScreen("screen-menu");
});

document.getElementById("btnGoLeaderboard").addEventListener("click", () => {
  startLeaderboardListener();
  showScreen("screen-leaderboard");
});
document.getElementById("btnGoLeaderboardFromStart").addEventListener("click", () => {
  startLeaderboardListener();
  showScreen("screen-leaderboard");
});
document.getElementById("btnGoLeaderboardFromComplete").addEventListener("click", () => {
  startLeaderboardListener();
  showScreen("screen-leaderboard");
});

// ---------------------------------------------------------------------
// 인증서 이미지 저장 / 공유 (html2canvas + Web Share)
// ---------------------------------------------------------------------
function certFilename() {
  const code = state.data && state.data.certCode ? state.data.certCode : "cert";
  return `avsec-hero-${code}.png`;
}

// 인증서 영역을 캡처해 PNG Blob으로 반환
async function buildCertBlob() {
  const target = document.getElementById("certCapture");
  const canvas = await window.html2canvas(target, {
    backgroundColor: "#0b1220",
    scale: Math.min(3, (window.devicePixelRatio || 1) * 2),
    useCORS: true,
  });
  return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

// 버튼 실행 중 상태 표시 헬퍼
async function withBtnBusy(btn, busyText, fn) {
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = busyText;
  try {
    await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

const btnSaveCert = document.getElementById("btnSaveCert");
if (btnSaveCert) {
  btnSaveCert.addEventListener("click", () =>
    withBtnBusy(btnSaveCert, "이미지 생성 중...", async () => {
      try {
        const blob = await buildCertBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = certFilename();
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (e) {
        console.error(e);
        toast("이미지 저장에 실패했어요. 화면을 직접 캡처해 주세요.");
      }
    })
  );
}

const btnShareCert = document.getElementById("btnShareCert");
if (btnShareCert) {
  // 파일 공유(Web Share Level 2)를 지원하지 않는 환경에서는 버튼 숨김
  if (!(navigator.share && navigator.canShare)) {
    btnShareCert.style.display = "none";
  } else {
    btnShareCert.addEventListener("click", () =>
      withBtnBusy(btnShareCert, "준비 중...", async () => {
        try {
          const blob = await buildCertBlob();
          const file = new File([blob], certFilename(), { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: "항공보안 히어로 인증서",
              text: "항공보안 히어로 미션을 완료했어요! 🛡️",
            });
          } else {
            toast("이 기기에서는 이미지 공유를 지원하지 않아요. '인증서 이미지 저장'을 이용해 주세요.");
          }
        } catch (e) {
          if (!e || e.name !== "AbortError") {
            console.error(e);
            toast("공유에 실패했어요.");
          }
        }
      })
    );
  }
}
document.getElementById("btnBackFromLeaderboard").addEventListener("click", () => {
  showScreen(state.data ? "screen-menu" : "screen-start");
});

// ---------------------------------------------------------------------
// 처음으로 (다음 참가자를 위해 세션 초기화 — 같은 기기를 여러 명이 순서대로 사용하는
// 부스 환경에서, 닉네임을 새로 입력해도 이전 참가자 기록을 이어받지 않도록 처리)
// ---------------------------------------------------------------------
function resetToStart() {
  localStorage.removeItem(SESSION_KEY);
  state.ref = null;
  state.sessionId = null;
  state.data = null;
  const input = document.getElementById("nicknameInput");
  if (input) input.value = "";
  showScreen("screen-start");
}

document.querySelectorAll(".go-home").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (state.data && !allMissionsDone()) {
      const ok = confirm("처음 화면으로 돌아가시겠습니까?\n진행 중인 미션은 이 화면으로는 다시 이어할 수 없습니다.");
      if (!ok) return;
    }
    resetToStart();
  });
});

// ---------------------------------------------------------------------
// 새로고침 등으로 재진입 시 자동 복원 시도
// ---------------------------------------------------------------------
(async function tryAutoResume() {
  const sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) return;
  try {
    const ref = doc(db, "participants", sessionId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      state.ref = ref;
      state.sessionId = sessionId;
      state.data = snap.data();
      renderMenu();
      startLeaderboardListener();
      if (allMissionsDone()) {
        showComplete();
      } else {
        showScreen("screen-menu");
      }
    }
  } catch (e) {
    console.warn("자동 복원 실패(최초 접속이면 정상):", e.message);
  }
})();
