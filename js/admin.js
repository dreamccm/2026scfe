import { firebaseConfig } from "./firebase-config.js";

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
  updateDoc,
  getDocs,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let allRows = [];
let unsubscribe = null;

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
}

function renderAll() {
  const filter = document.getElementById("searchInput").value.trim().toLowerCase();
  const rows = filter
    ? allRows.filter(
        (r) =>
          (r.nickname || "").toLowerCase().includes(filter) ||
          (r.certCode || "").toLowerCase().includes(filter)
      )
    : allRows;
  const sorted = [...rows].sort(
    (a, b) => (b.totalScore || 0) - (a.totalScore || 0) || (a.totalTimeMs || 0) - (b.totalTimeMs || 0)
  );
  renderStats(allRows);
  renderTable(sorted);
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
document.getElementById("btnExportCsv").addEventListener("click", () => {
  const header = [
    "닉네임", "인증코드", "M1점수", "M1시간ms", "M2점수", "M2시간ms",
    "M3점수", "M3시간ms", "총점", "총시간ms", "완료시각", "기념품지급",
  ];
  const lines = [header.join(",")];
  allRows.forEach((r) => {
    const completedAt = r.completedAt && r.completedAt.toDate ? r.completedAt.toDate().toISOString() : "";
    const row = [
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
    lines.push(row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
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
  const url = document.getElementById("siteUrlInput").value.trim();
  if (!url) {
    alert("URL을 입력하세요");
    return;
  }
  const holder = document.getElementById("qrCanvasHolder");
  holder.innerHTML = "";
  // eslint-disable-next-line no-undef
  new QRCode(holder, { text: url, width: 120, height: 120 });
});

// ---------------------------------------------------------------------
// 전체 데이터 초기화
// ---------------------------------------------------------------------
document.getElementById("btnReset").addEventListener("click", async () => {
  if (!confirm("정말 모든 참가자 데이터를 삭제하시겠습니까?")) return;
  if (!confirm("다시 한 번 확인합니다. 삭제 후 복구할 수 없습니다. 진행하시겠습니까?")) return;

  const btn = document.getElementById("btnReset");
  btn.disabled = true;
  btn.textContent = "삭제 중...";
  try {
    const snap = await getDocs(collection(db, "participants"));
    const docs = snap.docs;
    const chunkSize = 400;
    for (let i = 0; i < docs.length; i += chunkSize) {
      const batch = writeBatch(db);
      docs.slice(i, i + chunkSize).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    alert("삭제가 완료되었습니다.");
  } catch (e) {
    console.error(e);
    alert("삭제 중 오류: " + e.message);
  }
  btn.disabled = false;
  btn.textContent = "전체 참가자 데이터 삭제";
});
