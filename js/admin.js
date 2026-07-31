import { firebaseConfig, setupAppCheck } from "./firebase-config.js";
import { EVENT_PARAM, LEGACY_EVENT_ID, LEGACY_EVENT_NAME, formatEventPeriod } from "./events.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
setupAppCheck(app);
const auth = getAuth(app);
const db = getFirestore(app);

let allRows = [];
let allEvents = [];
let selectedEventId = "all"; // "all" | 행사 문서 ID | LEGACY_EVENT_ID
let unsubscribe = null;
let unsubscribeEvents = null;

// ---------------------------------------------------------------------
// 인증 상태
// ---------------------------------------------------------------------
onAuthStateChanged(auth, (user) => {
  if (user) {
    document.getElementById("loginBox").style.display = "none";
    document.getElementById("adminApp").style.display = "block";
    startListener();
  } else {
    document.getElementById("loginBox").style.display = "block";
    document.getElementById("adminApp").style.display = "none";
    if (unsubscribe) unsubscribe();
    if (unsubscribeEvents) unsubscribeEvents();
  }
});

// 아이디 형태(@ 없음) 입력 시 가상 도메인을 붙여 Firebase 이메일 계정으로 매핑
const ADMIN_ID_DOMAIN = "@kac.astc";

document.getElementById("btnLogin").addEventListener("click", async () => {
  const idOrEmail = document.getElementById("loginEmail").value.trim();
  const email = idOrEmail.includes("@") ? idOrEmail : idOrEmail + ADMIN_ID_DOMAIN;
  const pw = document.getElementById("loginPw").value;
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";
  try {
    await signInWithEmailAndPassword(auth, email, pw);
  } catch (e) {
    errEl.textContent = "로그인 실패: 아이디(이메일)/비밀번호를 확인하세요.";
  }
});

document.getElementById("btnLogout").addEventListener("click", () => signOut(auth));

// ---------------------------------------------------------------------
// 실시간 참가자 목록
// ---------------------------------------------------------------------
function startListener() {
  const ref = collection(db, "participants");
  unsubscribe = onSnapshot(
    ref,
    (snap) => {
      allRows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAll();
    },
    (err) => {
      console.error("참가자 목록 구독 실패", err);
    }
  );
  unsubscribeEvents = onSnapshot(
    collection(db, "events"),
    (snap) => {
      allEvents = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      allEvents.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"));
      renderEventSelect();
      renderEventsTable();
      renderAll();
    },
    (err) => {
      console.error("행사 목록 구독 실패", err);
    }
  );
}

// 참가자 문서의 소속 행사 ID (없으면 레거시)
function rowEventId(r) {
  return r.eventId || LEGACY_EVENT_ID;
}

// 현재 "보기 대상"에 해당하는 참가자만 추리기
function rowsForSelectedEvent() {
  if (selectedEventId === "all") return allRows;
  return allRows.filter((r) => rowEventId(r) === selectedEventId);
}

function eventNameById(id) {
  if (id === LEGACY_EVENT_ID) return LEGACY_EVENT_NAME;
  const ev = allEvents.find((e) => e.id === id);
  return ev ? ev.name : id;
}

function renderAll() {
  const filter = document.getElementById("searchInput").value.trim().toLowerCase();
  const scoped = rowsForSelectedEvent();
  const rows = filter
    ? scoped.filter(
        (r) =>
          (r.nickname || "").toLowerCase().includes(filter) ||
          (r.certCode || "").toLowerCase().includes(filter)
      )
    : scoped;
  const sorted = [...rows].sort(
    (a, b) => (b.totalScore || 0) - (a.totalScore || 0) || (a.totalTimeMs || 0) - (b.totalTimeMs || 0)
  );
  renderStats(scoped);
  renderTable(sorted);
  updateQrTargetInfo();
  const meta = document.getElementById("eventFilterMeta");
  if (meta) {
    meta.textContent =
      selectedEventId === "all"
        ? `모든 행사 합계 ${allRows.length}명`
        : `${eventNameById(selectedEventId)} · ${scoped.length}명`;
  }
}

// ---------------------------------------------------------------------
// 행사(세션) 관리
// ---------------------------------------------------------------------
function hasLegacyRows() {
  return allRows.some((r) => !r.eventId);
}

function renderEventSelect() {
  const sel = document.getElementById("eventFilter");
  if (!sel) return;
  const opts = [{ id: "all", label: "전체 (모든 행사)" }];
  allEvents.forEach((e) => opts.push({ id: e.id, label: e.name || e.id }));
  if (hasLegacyRows()) opts.push({ id: LEGACY_EVENT_ID, label: LEGACY_EVENT_NAME });
  // 선택이 사라진 경우 전체로 되돌림
  if (!opts.some((o) => o.id === selectedEventId)) selectedEventId = "all";
  sel.innerHTML = opts
    .map((o) => `<option value="${escapeHtml(o.id)}"${o.id === selectedEventId ? " selected" : ""}>${escapeHtml(o.label)}</option>`)
    .join("");
}

function renderEventsTable() {
  const body = document.getElementById("eventsBody");
  if (!body) return;
  // 입력 중에는 다시 그리지 않음(타이핑 중 값이 날아가는 것 방지)
  if (body.contains(document.activeElement)) return;

  if (allEvents.length === 0) {
    body.innerHTML =
      '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">등록된 행사가 없습니다. 아래에서 추가하세요.<br/>행사를 만들기 전까지는 기존과 동일하게 동작합니다.</td></tr>';
    return;
  }
  body.innerHTML = allEvents
    .map((e) => {
      const count = allRows.filter((r) => rowEventId(r) === e.id).length;
      return `<tr data-id="${e.id}">
        <td><input type="text" class="ev-name" data-id="${e.id}" value="${escapeHtml(e.name || "")}" /></td>
        <td><input type="datetime-local" class="ev-start" data-id="${e.id}" value="${escapeHtml(e.startAt || "")}" /></td>
        <td><input type="datetime-local" class="ev-end" data-id="${e.id}" value="${escapeHtml(e.endAt || "")}" /></td>
        <td><button class="reward-toggle ev-active ${e.active ? "on" : ""}" data-id="${e.id}" title="QR 없이 접속했을 때 연결될 행사"></button></td>
        <td>${count}</td>
        <td>
          <button class="btn btn-secondary ev-save" data-id="${e.id}">저장</button>
          <button class="btn btn-danger ev-del" data-id="${e.id}">삭제</button>
        </td>
      </tr>`;
    })
    .join("");

  body.querySelectorAll(".ev-save").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const name = body.querySelector(`.ev-name[data-id="${id}"]`).value.trim();
      const startAt = body.querySelector(`.ev-start[data-id="${id}"]`).value;
      const endAt = body.querySelector(`.ev-end[data-id="${id}"]`).value;
      if (!name) return alert("행사명을 입력하세요.");
      if (startAt && endAt && new Date(startAt) > new Date(endAt)) {
        return alert("종료 일시가 시작 일시보다 빠릅니다.");
      }
      btn.disabled = true;
      try {
        await updateDoc(doc(db, "events", id), { name, startAt, endAt });
      } catch (err) {
        console.error(err);
        alert("저장 실패: " + err.message);
      }
      btn.disabled = false;
    })
  );

  body.querySelectorAll(".ev-active").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const turningOn = !btn.classList.contains("on");
      btn.disabled = true;
      try {
        // 활성 행사는 하나만 유지 (QR 없이 접속 시 연결될 행사)
        const batch = writeBatch(db);
        allEvents.forEach((e) => {
          const shouldBeActive = turningOn && e.id === id;
          if (!!e.active !== shouldBeActive) {
            batch.update(doc(db, "events", e.id), { active: shouldBeActive });
          }
        });
        await batch.commit();
      } catch (err) {
        console.error(err);
        alert("변경 실패: " + err.message);
      }
      btn.disabled = false;
    })
  );

  body.querySelectorAll(".ev-del").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const count = allRows.filter((r) => rowEventId(r) === id).length;
      if (count > 0) {
        return alert(
          `이 행사에는 참가자 기록이 ${count}건 있습니다.\n기록을 먼저 정리한 뒤 삭제하세요.`
        );
      }
      if (!confirm(`행사 "${eventNameById(id)}"를 삭제할까요?`)) return;
      btn.disabled = true;
      try {
        await deleteDoc(doc(db, "events", id));
      } catch (err) {
        console.error(err);
        alert("삭제 실패: " + err.message);
      }
      btn.disabled = false;
    })
  );
}

document.getElementById("eventFilter").addEventListener("change", (e) => {
  selectedEventId = e.target.value;
  renderEventsTable();
  renderAll();
});

document.getElementById("btnAddEvent").addEventListener("click", async () => {
  const nameEl = document.getElementById("newEventName");
  const startEl = document.getElementById("newEventStart");
  const endEl = document.getElementById("newEventEnd");
  const name = nameEl.value.trim();
  if (!name) return alert("행사명을 입력하세요.");
  if (startEl.value && endEl.value && new Date(startEl.value) > new Date(endEl.value)) {
    return alert("종료 일시가 시작 일시보다 빠릅니다.");
  }
  // QR URL을 짧게 유지하기 위해 짧은 ID 사용
  const id = "ev" + Math.random().toString(36).slice(2, 8);
  const btn = document.getElementById("btnAddEvent");
  btn.disabled = true;
  try {
    await setDoc(doc(db, "events", id), {
      name,
      startAt: startEl.value || "",
      endAt: endEl.value || "",
      active: allEvents.length === 0, // 첫 행사는 기본 활성
      createdAt: serverTimestamp(),
    });
    nameEl.value = "";
    startEl.value = "";
    endEl.value = "";
  } catch (err) {
    console.error(err);
    alert("행사 추가 실패: " + err.message);
  }
  btn.disabled = false;
});

// 선택한 행사 기준으로 QR 대상 URL 안내 갱신
function selectedEventUrl() {
  const base = document.getElementById("siteUrlInput").value.trim();
  if (!base) return "";
  if (selectedEventId === "all" || selectedEventId === LEGACY_EVENT_ID) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${EVENT_PARAM}=${selectedEventId}`;
}

function updateQrTargetInfo() {
  const info = document.getElementById("qrTargetInfo");
  if (!info) return;
  if (selectedEventId === "all" || selectedEventId === LEGACY_EVENT_ID) {
    info.textContent = "행사를 선택하면 해당 행사 전용 QR이 생성됩니다. (현재는 기본 URL)";
  } else {
    const url = selectedEventUrl();
    info.textContent = url ? `대상: ${eventNameById(selectedEventId)} → ${url}` : "";
  }
}

function renderStats(rows) {
  const total = rows.length;
  const completed = rows.filter((r) => r.completedAt).length;
  const reward = rows.filter((r) => r.rewardGiven).length;
  const rate = total ? Math.round((completed / total) * 100) : 0;
  document.getElementById("statTotal").textContent = total;
  document.getElementById("statCompleted").textContent = completed;
  document.getElementById("statReward").textContent = reward;
  document.getElementById("statRate").textContent = rate + "%";
}

function missionCell(m) {
  if (!m) return '<span class="done-no">-</span>';
  return `<span class="done-yes">${m.score}pt</span>`;
}

function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function renderTable(rows) {
  const body = document.getElementById("participantsBody");
  if (rows.length === 0) {
    body.innerHTML =
      '<tr><td colspan="10" style="text-align:center;color:var(--text-muted)">데이터가 없습니다</td></tr>';
    updateDeleteBtn();
    return;
  }
  body.innerHTML = rows
    .map((r) => {
      const completedAt =
        r.completedAt && r.completedAt.toDate ? r.completedAt.toDate().toLocaleString("ko-KR") : "-";
      return `<tr data-id="${r.id}">
        <td><input type="checkbox" class="row-check" data-id="${r.id}" /></td>
        <td>${escapeHtml(r.nickname || "-")}</td>
        <td>${escapeHtml(r.certCode || "-")}</td>
        <td>${missionCell(r.mission1)}</td>
        <td>${missionCell(r.mission2)}</td>
        <td>${missionCell(r.mission3)}</td>
        <td>${r.totalScore || 0}</td>
        <td>${((r.totalTimeMs || 0) / 1000).toFixed(1)}</td>
        <td>${completedAt}</td>
        <td><button class="reward-toggle ${r.rewardGiven ? "on" : ""}" data-id="${r.id}"></button></td>
      </tr>`;
    })
    .join("");

  body.querySelectorAll(".reward-toggle").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const current = btn.classList.contains("on");
      btn.disabled = true;
      try {
        await updateDoc(doc(db, "participants", id), { rewardGiven: !current });
      } catch (e) {
        console.error(e);
        alert("업데이트 실패: " + e.message);
      }
      btn.disabled = false;
    });
  });

  body.querySelectorAll(".row-check").forEach((cb) => {
    cb.addEventListener("change", updateDeleteBtn);
  });

  // 전체선택 체크박스 상태 동기화
  document.getElementById("checkAll").checked = false;
  updateDeleteBtn();
}

document.getElementById("searchInput").addEventListener("input", renderAll);

// 전체 선택 체크박스
document.getElementById("checkAll").addEventListener("change", (e) => {
  document.querySelectorAll(".row-check").forEach((cb) => {
    cb.checked = e.target.checked;
  });
  updateDeleteBtn();
});

// 선택삭제 버튼 표시 갱신
function updateDeleteBtn() {
  const checked = document.querySelectorAll(".row-check:checked");
  const btn = document.getElementById("btnDeleteSelected");
  const countEl = document.getElementById("selectedCount");
  countEl.textContent = checked.length;
  btn.style.display = checked.length > 0 ? "inline-flex" : "none";
}

// 선택 삭제 실행
document.getElementById("btnDeleteSelected").addEventListener("click", async () => {
  const checked = [...document.querySelectorAll(".row-check:checked")];
  if (checked.length === 0) return;
  const ids = checked.map((cb) => cb.dataset.id);
  const nicknames = ids.map((id) => {
    const row = allRows.find((r) => r.id === id);
    return row ? row.nickname : id;
  });
  if (!confirm(`선택한 ${ids.length}명의 기록을 삭제합니다:\n${nicknames.join(", ")}\n\n계속하시겠습니까?`)) return;

  const btn = document.getElementById("btnDeleteSelected");
  btn.disabled = true;
  btn.textContent = "삭제 중...";
  try {
    const batch = writeBatch(db);
    ids.forEach((id) => batch.delete(doc(db, "participants", id)));
    await batch.commit();
    document.getElementById("checkAll").checked = false;
  } catch (e) {
    console.error(e);
    alert("삭제 중 오류: " + e.message);
  }
  btn.disabled = false;
  updateDeleteBtn();
});

// ---------------------------------------------------------------------
// CSV 다운로드
// ---------------------------------------------------------------------
// CSV 셀 인코딩 + 수식 인젝션 방어:
// =, +, -, @, 탭, 캐리지리턴으로 시작하는 값은 엑셀에서 수식으로 해석될 수 있으므로
// 작은따옴표를 앞에 붙여 무력화한 뒤 따옴표로 감싼다.
function csvCell(v) {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

document.getElementById("btnExportCsv").addEventListener("click", () => {
  const header = [
    "행사", "닉네임", "인증코드", "M1점수", "M1시간ms", "M2점수", "M2시간ms",
    "M3점수", "M3시간ms", "총점", "총시간ms", "완료시각", "기념품지급",
  ];
  const lines = [header.join(",")];
  // 화면에서 선택한 행사 범위만 내보낸다
  rowsForSelectedEvent().forEach((r) => {
    const completedAt = r.completedAt && r.completedAt.toDate ? r.completedAt.toDate().toISOString() : "";
    const row = [
      eventNameById(rowEventId(r)),
      r.nickname || "",
      r.certCode || "",
      r.mission1 ? r.mission1.score : "",
      r.mission1 ? r.mission1.timeMs : "",
      r.mission2 ? r.mission2.score : "",
      r.mission2 ? r.mission2.timeMs : "",
      r.mission3 ? r.mission3.score : "",
      r.mission3 ? r.mission3.timeMs : "",
      r.totalScore || 0,
      r.totalTimeMs || 0,
      completedAt,
      r.rewardGiven ? "Y" : "N",
    ];
    lines.push(row.map(csvCell).join(","));
  });
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `avsec_participants_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// ---------------------------------------------------------------------
// QR 코드 생성 (참가자 접속 URL)
// ---------------------------------------------------------------------
document.getElementById("btnGenQr").addEventListener("click", () => {
  if (!document.getElementById("siteUrlInput").value.trim()) {
    alert("URL을 입력하세요");
    return;
  }
  // "보기 대상"으로 행사를 고르면 해당 행사 전용 QR(?event=<ID>)이 생성된다
  const url = selectedEventUrl();
  const holder = document.getElementById("qrCanvasHolder");
  holder.innerHTML = "";
  // eslint-disable-next-line no-undef
  new QRCode(holder, { text: url, width: 120, height: 120 });
  updateQrTargetInfo();
});

document.getElementById("siteUrlInput").addEventListener("input", updateQrTargetInfo);

// ---------------------------------------------------------------------
// 데이터 초기화 (현재 "보기 대상" 행사 범위)
// ---------------------------------------------------------------------
document.getElementById("btnReset").addEventListener("click", async () => {
  const targets = rowsForSelectedEvent();
  const scopeLabel =
    selectedEventId === "all" ? "모든 행사" : eventNameById(selectedEventId);
  if (targets.length === 0) return alert(`삭제할 참가자 기록이 없습니다. (${scopeLabel})`);
  if (!confirm(`"${scopeLabel}"의 참가자 기록 ${targets.length}건을 삭제하시겠습니까?`)) return;
  if (!confirm("다시 한 번 확인합니다. 삭제 후 복구할 수 없습니다. 진행하시겠습니까?")) return;

  const btn = document.getElementById("btnReset");
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "삭제 중...";
  try {
    const chunkSize = 400;
    for (let i = 0; i < targets.length; i += chunkSize) {
      const batch = writeBatch(db);
      targets.slice(i, i + chunkSize).forEach((r) => batch.delete(doc(db, "participants", r.id)));
      await batch.commit();
    }
    alert("삭제가 완료되었습니다.");
  } catch (e) {
    console.error(e);
    alert("삭제 중 오류: " + e.message);
  }
  btn.disabled = false;
  btn.textContent = label;
});
