import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, addDoc, getDocs, query, where, orderBy, onSnapshot, documentId, limit,
  arrayUnion, deleteField, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDCFXc4vwrPX4lGGAVa5PSsKq6c_sbvh5c",
  authDomain: "vacation-check-91a6b.firebaseapp.com",
  projectId: "vacation-check-91a6b",
  storageBucket: "vacation-check-91a6b.firebasestorage.app",
  messagingSenderId: "760924992377",
  appId: "1:760924992377:web:5f22c6cdb410f0295ff5a8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// =====================================================
// 토스트 알림 함수 (전역 + 로컬 참조)
// =====================================================
function showNotification(message, type = 'info') {
  // Remove existing notifications
  document.querySelectorAll('.toast-notification').forEach(el => el.remove());

  const colors = {
    success: { bg: '#22c55e', icon: '✅' },
    warning: { bg: '#f59e0b', icon: '⚠️' },
    error: { bg: '#ef4444', icon: '❌' },
    info: { bg: '#667eea', icon: 'ℹ️' }
  };

  const { bg, icon } = colors[type] || colors.info;

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: ${bg};
    color: white;
    padding: 12px 24px;
    border-radius: 12px;
    font-weight: 600;
    font-size: 14px;
    z-index: 99999;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    gap: 8px;
    animation: toastSlideIn 0.3s ease;
  `;
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;

  // Add animation keyframes if not exists
  if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      @keyframes toastSlideIn {
        from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
      @keyframes toastSlideOut {
        from { opacity: 1; transform: translateX(-50%) translateY(0); }
        to { opacity: 0; transform: translateX(-50%) translateY(-20px); }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);

  // Auto remove after 3 seconds
  setTimeout(() => {
    toast.style.animation = 'toastSlideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
// 전역에서도 접근 가능하도록 등록
window.showNotification = showNotification;

// 카카오 SDK 초기화
if (window.Kakao && !window.Kakao.isInitialized()) {
  window.Kakao.init('81a7dfd46e80c803f2b0f7a4e47aedbe');
}

// HTML 엔티티 이스케이프 (XSS 방지)
function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

let me = null;
let myData = null;
let currentSubject = "모든 과목";
const subjects = new Set(["모든 과목", "국어", "영어", "수학", "과학", "사회"]);
// todayKey를 함수로 변경 - 자정 넘어도 올바른 날짜 반환
function getTodayKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}
let timerSeconds = 0;
let timerRunning = false;
let timerStartedAtMs = null;
let timerId = null;
let autoSaveTimerId = null; // 60초 자동 저장 interval
let adminTimerTickId = null;
let adminTimerStates = {};
let modalTimerId = null;
let modalTimerSeconds = 0;
let modalTimerRunning = false;
let modalTimerStartedAtMs = null;
let lastSave = 0;
let unsubTasks = null;
let unsubWarning = null;
let unsubRegistrations = null;
let unsubAllAcademies = null;
let allAcademiesRenderVersion = 0; // Race condition 방지용
let unsubAdminComments = null;
let unsubChatRooms = null;       // 채팅방 목록 리스너
let unsubChatMessages = null;    // 메시지 리스너
let currentChatRoomId = null;    // 현재 열린 채팅방
let chatNotificationEnabled = false; // 채팅 알림 활성화 여부
let currentScope = "today";
let studentTimerUnsubscribers = {}; // 학생 목록 타이머 실시간 구독 관리
let usageTrackingIntervalId = null; // 사용량 추적 인터벌 (로그아웃 시 정리용)

// 슈퍼 관리자 설정 (Firestore users 컬렉션의 isSuperAdmin 필드로 관리)
// 슈퍼관리자 지정: Firestore > users > {uid} 문서에 isSuperAdmin: true 추가
function isSuperAdmin() {
  return myData && myData.isSuperAdmin === true;
}
let currentStudentId = null;
let adminWeekOffset = 0; // 0 = 이번주, -1 = 전주, -2 = 전전주 ...
let currentManagementFilter = "all"; // "all" | "winter" | "external"

// 학생 분석 탭 상태
let analysisSelectedStudentId = null;
let analysisSelectedStudentData = null;
let analysisCurrentReportType = "daily";
let analysisTabsInitialized = false;

// 출석 관리 탭 상태
let attendanceSelectedStudentId = null;
let attendanceSelectedStudentData = null;
let attendanceTabsInitialized = false;

// Firebase 사용량 추적 (관리자 알림용)
let dailyReadCount = 0;
let dailyWriteCount = 0;
const USAGE_WARNING_THRESHOLD = { read: 40000, write: 16000 }; // 80% 기준
let usageWarningShown = false;

// 사용량 추적 함수
function trackRead(count = 1) {
  dailyReadCount += count;
  checkUsageWarning();
}
function trackWrite(count = 1) {
  dailyWriteCount += count;
  checkUsageWarning();
}

// 관리자에게 사용량 경고 표시
function checkUsageWarning() {
  if (usageWarningShown) return;
  if (!myData || myData.role !== "admin") return;

  if (dailyReadCount >= USAGE_WARNING_THRESHOLD.read || dailyWriteCount >= USAGE_WARNING_THRESHOLD.write) {
    usageWarningShown = true;
    showUsageWarningModal();
  }
}

function showUsageWarningModal() {
  const modal = document.createElement('div');
  modal.id = 'usageWarningModal';
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
  modal.innerHTML = `
    <div style="background:#fff;padding:24px;border-radius:16px;max-width:500px;width:100%;text-align:center;">
      <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
      <h3 style="color:#ff6b6b;margin:0 0 16px 0;">Firebase 사용량 경고</h3>
      <p style="color:#666;line-height:1.6;margin-bottom:20px;">
        오늘 사용량이 무료 한도의 <strong>80%</strong>에 도달했습니다.<br><br>
        <strong>읽기:</strong> ${dailyReadCount.toLocaleString()} / 50,000회<br>
        <strong>쓰기:</strong> ${dailyWriteCount.toLocaleString()} / 20,000회<br><br>
        학생 수가 많아지면 <strong>유료 플랜(Blaze)</strong> 전환을 권장합니다.<br>
        (200명 기준 월 약 5,000~20,000원)
      </p>
      <div style="display:flex;gap:8px;justify-content:center;">
        <a href="https://console.firebase.google.com" target="_blank"
           style="padding:12px 20px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border-radius:10px;text-decoration:none;font-weight:600;">
          Firebase 콘솔 열기
        </a>
        <button onclick="document.getElementById('usageWarningModal').remove()"
                style="padding:12px 20px;background:#f1f2f6;border:none;border-radius:10px;cursor:pointer;font-weight:600;">
          닫기
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

// 매일 자정에 카운터 리셋 (localStorage 사용)
function initUsageTracking() {
  const savedDate = localStorage.getItem('usageDate');
  const today = getTodayKey();

  if (savedDate !== today) {
    // 새 날짜 - 카운터 리셋
    dailyReadCount = 0;
    dailyWriteCount = 0;
    usageWarningShown = false;
    localStorage.setItem('usageDate', today);
    localStorage.setItem('dailyReadCount', '0');
    localStorage.setItem('dailyWriteCount', '0');
  } else {
    // 같은 날 - 저장된 값 복원
    dailyReadCount = parseInt(localStorage.getItem('dailyReadCount') || '0');
    dailyWriteCount = parseInt(localStorage.getItem('dailyWriteCount') || '0');
  }
}

// 주기적으로 localStorage에 저장 (로그아웃 시 정리됨)
usageTrackingIntervalId = setInterval(() => {
  localStorage.setItem('dailyReadCount', dailyReadCount.toString());
  localStorage.setItem('dailyWriteCount', dailyWriteCount.toString());
}, 30000); // 30초마다

function getTimestampMs(value) {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function getLiveSeconds(baseSeconds, startedAtMs, running) {
  const base = Math.max(0, Math.floor(Number(baseSeconds) || 0));
  if (!running || !startedAtMs) return base;
  const elapsed = Math.floor((Date.now() - startedAtMs) / 1000);
  return base + Math.max(0, elapsed);
}

function getLiveSecondsFromData(data) {
  const base = Number(data?.timerSeconds) || 0;
  const startedAtMs = getTimestampMs(data?.timerStartedAt);
  const running = !!data?.timerRunning;
  return getLiveSeconds(base, startedAtMs, running);
}

function getEffectiveTimerSecondsForKey(data, key) {
  const base = Number(data?.timerSeconds) || 0;
  if (!data) return base;
  if (key !== getTodayKey()) return base;
  if (!data.timerRunning) return base;
  const startedAtMs = getTimestampMs(data.timerStartedAt);
  if (!startedAtMs) return base;
  return getLiveSeconds(base, startedAtMs, true);
}

function formatTimer(secs) {
  const h = String(Math.floor(secs / 3600)).padStart(2, '0');
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function startLocalTimerTick() {
  if (timerId) return;
  timerId = setInterval(() => {
    renderTimer(getLiveSeconds(timerSeconds, timerStartedAtMs, timerRunning));
  }, 1000);
}

function stopLocalTimerTick() {
  if (!timerId) return;
  clearInterval(timerId);
  timerId = null;
}

// 60초마다 타이머 자동 저장 (브라우저 닫힘 시 데이터 손실 방지)
function startAutoSave() {
  if (autoSaveTimerId) return;
  autoSaveTimerId = setInterval(() => {
    if (!timerRunning || !me) return;
    const liveSeconds = getLiveSeconds(timerSeconds, timerStartedAtMs, true);
    setDoc(dailyRef(), {
      timerSeconds: liveSeconds,
      timerRunning: true,
      timerStartedAt: new Date(),
      lastAutoSave: new Date()
    }, { merge: true }).then(() => {
      timerSeconds = liveSeconds;
      timerStartedAtMs = Date.now();
      trackWrite();
    }).catch(err => {
    });
  }, 60000); // 60초
}

function stopAutoSave() {
  if (!autoSaveTimerId) return;
  clearInterval(autoSaveTimerId);
  autoSaveTimerId = null;
}

function startAdminTimerTick() {
  if (adminTimerTickId) return;
  adminTimerTickId = setInterval(() => {
    Object.entries(adminTimerStates).forEach(([uid, state]) => {
      if (!state.running) return;
      const secs = getLiveSeconds(state.baseSeconds, state.startedAtMs, true);
      const displayEl = document.getElementById(`timer-display-${uid}`);
      if (displayEl) displayEl.textContent = formatTimer(secs);
    });
  }, 1000);
}

function stopAdminTimerTick() {
  if (!adminTimerTickId) return;
  clearInterval(adminTimerTickId);
  adminTimerTickId = null;
}

function updateAdminTimerTickState() {
  const anyRunning = Object.values(adminTimerStates).some(state => state.running);
  if (anyRunning) {
    startAdminTimerTick();
  } else {
    stopAdminTimerTick();
  }
}

function startModalTimerTick() {
  if (modalTimerId) return;
  modalTimerId = setInterval(() => {
    const secs = getLiveSeconds(modalTimerSeconds, modalTimerStartedAtMs, modalTimerRunning);
    const modalTimerDisplay = document.getElementById("modalTimerDisplay");
    if (modalTimerDisplay) modalTimerDisplay.textContent = formatTimer(secs);
  }, 1000);
}

function stopModalTimerTick() {
  if (!modalTimerId) return;
  clearInterval(modalTimerId);
  modalTimerId = null;
}

function dailyRef(uid = me?.uid, key = null) {
  return doc(db, "users", uid, "daily", key || getTodayKey());
}
function dailiesCol(uid = me?.uid) {
  return collection(db, "users", uid, "daily");
}
function tasksCol(uid = me?.uid, key = null) {
  return collection(db, "users", uid, "daily", key || getTodayKey(), "tasks");
}
function testsCol(uid = me?.uid, key = null) {
  return collection(db, "users", uid, "daily", key || getTodayKey(), "testResults");
}
function evalsCol(uid) {
  return collection(db, "users", uid, "evaluations");
}
function counselCol(uid) {
  return collection(db, "users", uid, "counseling");
}
function adminCommentsCol() {
  return collection(db, "adminComments");
}
// 채팅 헬퍼 함수
function getChatRoomId(studentId, academyId) {
  return `${academyId}_${studentId}`;
}
function chatRoomsCol() {
  return collection(db, "chatRooms");
}
function chatMessagesCol(roomId) {
  return collection(db, "chatRooms", roomId, "messages");
}

// 이벤트 리스너
document.getElementById("loginBtn").onclick = login;
document.getElementById("showSignupLink").onclick = (e) => { e.preventDefault(); showSignup(); };
document.getElementById("showLoginLink").onclick = (e) => { e.preventDefault(); showLogin(); };
document.getElementById("suRole").onchange = toggleRole;
document.getElementById("signupBtn").onclick = signup;
document.getElementById("logoutBtn").onclick = logout;
document.getElementById("adminLogoutBtn").onclick = logout;
document.getElementById("startTimerBtn").onclick = startTimer;
document.getElementById("pauseTimerBtn").onclick = pauseTimer;
document.getElementById("resetTimerBtn").onclick = resetTimer;
document.getElementById("addTaskBtn").onclick = addTask;
document.getElementById("saveTestBtn").onclick = saveTest;
document.getElementById("seg-today").onclick = () => setScope("today");
document.getElementById("seg-daily").onclick = () => setScope("daily");
document.getElementById("seg-week").onclick = () => setScope("week");
document.getElementById("seg-month").onclick = () => setScope("month");
document.getElementById("seg-report").onclick = () => setScope("report");
document.getElementById("seg-ranking").onclick = () => setScope("ranking");
document.getElementById("closeModalBtn").onclick = closeModal;
document.getElementById("saveEvalBtn").onclick = saveEvaluation;
document.getElementById("addTaskToStudentBtn").onclick = addTaskToStudent;
document.getElementById("saveCounselBtn").onclick = saveCounseling;
document.getElementById("sendWarningBtn").onclick = sendWarningToStudent;
document.getElementById("closeWarningBtn").onclick = closeWarningModal;

// 관리자 전달사항 모달 이벤트
document.getElementById("addAdminCommentBtn").onclick = openAddCommentModal;
document.getElementById("saveCommentBtn").onclick = saveAdminComment;
document.getElementById("closeCommentModalBtn").onclick = closeAddCommentModal;

// 경고 메시지 직접 입력 토글
document.getElementById("warningMessageSelect").onchange = function() {
  const customWrap = document.getElementById("customWarningWrap");
  customWrap.style.display = this.value === "custom" ? "block" : "none";
};

// 관리자 탭 전환
document.querySelectorAll(".admin-tab").forEach(tab => {
  tab.onclick = () => switchAdminTab(tab.dataset.tab);
});

async function login() {
  const email = document.getElementById("loginEmail").value.trim();
  const pw = document.getElementById("loginPassword").value;
  const errDiv = document.getElementById("loginErr");
  errDiv.textContent = "";
  if (!email) { errDiv.textContent = "이메일을 입력하세요."; return; }
  if (!pw) { errDiv.textContent = "비밀번호를 입력하세요."; return; }
  try {
    await signInWithEmailAndPassword(auth, email, pw);
  } catch (error) {
    // 에러 코드에 따라 친절한 메시지 표시
    let msg = "알 수 없는 오류가 발생했습니다.";
    if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password" || error.code === "auth/user-not-found") {
      msg = "이메일 또는 비밀번호가 올바르지 않습니다.";
    } else if (error.code === "auth/invalid-email") {
      msg = "이메일 형식이 올바르지 않습니다.";
    } else if (error.code === "auth/too-many-requests") {
      msg = "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.";
    }
    errDiv.textContent = msg;
  }
}

function showSignup() {
  document.getElementById("loginView").style.display = "none";
  document.getElementById("signupView").style.display = "block";
}

function showLogin() {
  document.getElementById("loginView").style.display = "block";
  document.getElementById("signupView").style.display = "none";
}

function toggleRole() {
  const role = document.getElementById("suRole").value;
  document.getElementById("gradeWrap").style.display = (role === "admin" ? "none" : "block");
  document.getElementById("parentEmailWrap").style.display = (role === "admin" ? "none" : "block");
  // 학원 관련 필드 토글
  document.getElementById("academyNameWrap").style.display = (role === "admin" ? "block" : "none");
  document.getElementById("academyCodeWrap").style.display = (role === "admin" ? "none" : "block");
}

// 학원 코드 생성 함수 (6자리 영숫자)
function generateAcademyCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function signup() {
  const name = document.getElementById("suName").value.trim();
  const nickname = document.getElementById("suNickname").value.trim();
  const email = document.getElementById("suEmail").value.trim();
  const pw = document.getElementById("suPw").value;
  const pw2 = document.getElementById("suPw2").value;
  const role = document.getElementById("suRole").value;
  const grade = document.getElementById("suGrade").value;
  const parentEmail = document.getElementById("suParentEmail").value.trim();
  const academyName = document.getElementById("suAcademyName").value.trim();
  const academyCode = document.getElementById("suAcademyCode").value.trim().toUpperCase();
  const err = document.getElementById("suErr");
  const ok = document.getElementById("suOk");
  err.textContent = "";
  ok.textContent = "";

  if (!name || !email) { err.textContent = "이름/이메일을 입력하세요."; return; }
  if (role === "student" && !nickname) { err.textContent = "닉네임을 입력하세요."; return; }
  if (pw.length < 6) { err.textContent = "비밀번호는 6자 이상."; return; }
  if (pw !== pw2) { err.textContent = "비밀번호가 일치하지 않습니다."; return; }
  if (role === "student" && !grade) { err.textContent = "학년을 선택하세요."; return; }

  // 학원 관련 검증
  if (role === "admin" && !academyName) { err.textContent = "학원 이름을 입력하세요."; return; }
  if (role === "student" && !academyCode) { err.textContent = "학원 코드를 입력하세요."; return; }

  try {
    let userAcademyId = "";
    let userAcademyName = "";

    if (role === "admin") {
      // 관리자: 새 학원 생성 + 코드 발급
      let newCode = generateAcademyCode();
      // 코드 중복 체크
      let codeExists = true;
      while (codeExists) {
        const codeCheck = await getDocs(query(collection(db, "academies"), where("code", "==", newCode)));
        if (codeCheck.empty) {
          codeExists = false;
        } else {
          newCode = generateAcademyCode();
        }
      }

      // 학원 생성
      const academyRef = await addDoc(collection(db, "academies"), {
        name: academyName,
        code: newCode,
        createdAt: new Date()
      });
      userAcademyId = academyRef.id;
      userAcademyName = academyName;

      // 가입 완료 메시지에 코드 포함
      ok.textContent = `가입 완료! 학원 코드: ${newCode}`;
    } else {
      // 학생: 학원 코드 검증
      const academyQuery = await getDocs(query(collection(db, "academies"), where("code", "==", academyCode)));
      if (academyQuery.empty) {
        err.textContent = "유효하지 않은 학원 코드입니다.";
        return;
      }
      const academyDoc = academyQuery.docs[0];
      userAcademyId = academyDoc.id;
      userAcademyName = academyDoc.data().name;
    }

    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    await setDoc(doc(db, "users", cred.user.uid), {
      name,
      nickname: nickname || name,
      email,
      role,
      grade: (role === "admin" ? "" : grade),
      parentEmail: (role === "student" ? parentEmail : ""),
      academyId: userAcademyId,
      academyName: userAcademyName,
      createdAt: new Date()
    });

    if (role === "student") {
      ok.textContent = `가입 완료! (${userAcademyName}) 로그인해 주세요.`;
    }

    await signOut(auth);
    setTimeout(() => {
      showLogin();
      document.getElementById("suName").value = "";
      document.getElementById("suNickname").value = "";
      document.getElementById("suEmail").value = "";
      document.getElementById("suPw").value = "";
      document.getElementById("suPw2").value = "";
      document.getElementById("suGrade").value = "";
      document.getElementById("suParentEmail").value = "";
      document.getElementById("suAcademyName").value = "";
      document.getElementById("suAcademyCode").value = "";
    }, 3000);
  } catch (e) {
    err.textContent = "회원가입 오류: " + (e.message || e.code || "알 수 없는 오류");
  }
}

async function logout() {
  try {
    // 타이머 정지
    stopLocalTimerTick();
    stopAutoSave(); // 자동 저장 정지
    stopAdminTimerTick();
    stopModalTimerTick();
    adminTimerStates = {};
    // 사용량 추적 인터벌 정리
    if (usageTrackingIntervalId) { clearInterval(usageTrackingIntervalId); usageTrackingIntervalId = null; }
    // Firestore 리스너 해제
    if (unsubTasks) { unsubTasks(); unsubTasks = null; }
    if (unsubCheckRequests) { unsubCheckRequests(); unsubCheckRequests = null; }
    if (unsubDailyStatus) { unsubDailyStatus(); unsubDailyStatus = null; }
    if (unsubStudentTimer) { unsubStudentTimer(); unsubStudentTimer = null; }
    if (unsubWarning) { unsubWarning(); unsubWarning = null; }
    if (unsubAdminComments) { unsubAdminComments(); unsubAdminComments = null; }
    if (unsubStudentRequests) { unsubStudentRequests(); unsubStudentRequests = null; }
    if (unsubRegistrations) { unsubRegistrations(); unsubRegistrations = null; }
    if (unsubAllAcademies) { unsubAllAcademies(); unsubAllAcademies = null; }
    if (unsubChatRooms) { unsubChatRooms(); unsubChatRooms = null; }
    if (unsubChatMessages) { unsubChatMessages(); unsubChatMessages = null; }
    currentChatRoomId = null;
    // 채팅 팝업 닫기 및 버튼 숨기기
    document.getElementById("studentChatPopup").classList.remove("open");
    document.getElementById("adminChatPopup").classList.remove("open");
    document.getElementById("chatFloatingBtn").style.display = "none";
    await signOut(auth);
  } catch (err) {
    alert("로그아웃에 실패했습니다. 다시 시도해 주세요.");
  }
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    me = null;
    myData = null;
    document.getElementById("loginView").style.display = "block";
    document.getElementById("signupView").style.display = "none";
    document.getElementById("studentView").style.display = "none";
    document.getElementById("adminView").style.display = "none";
    return;
  }

  me = user;
  initUsageTracking(); // 사용량 추적 초기화
  
  try {
    const userRef = doc(db, "users", me.uid);
    const userDoc = await getDoc(userRef);
    trackRead();
    
    if (!userDoc.exists()) {
      await setDoc(userRef, { 
        name: me.email.split("@")[0], 
        nickname: me.email.split("@")[0],
        email: me.email,
        role: "student", 
        createdAt: new Date() 
      });
      const newDoc = await getDoc(userRef);
      myData = newDoc.data();
      await renderStudent();
    } else {
      myData = userDoc.data();
      if (myData.role === "admin") {
        await renderAdmin();
      } else {
        await renderStudent();
      }
    }
  } catch (error) {
    alert("사용자 정보를 불러오는데 실패했습니다: " + error.message);
    await signOut(auth);
  }
});

async function renderStudent() {
  try {
    document.getElementById("loginView").style.display = "none";
    document.getElementById("signupView").style.display = "none";
    document.getElementById("adminView").style.display = "none";
    document.getElementById("studentView").style.display = "block";
    const displayName = myData?.name || myData?.nickname || me?.email || "학생";
    const nameEl = document.getElementById("studentNameLabel");
    if (nameEl) nameEl.textContent = displayName;
    document.getElementById("todayLabel").textContent = getTodayKey();
    renderTabs();
    document.getElementById("taskTitle").textContent = `[${currentSubject}] 학습 항목`;
    await loadDailyStatus();
    loadTasks(currentSubject);
    await renderTestList();
    await renderScoreChart();
    setScope(currentScope);

    // 경고 알림 리스너 설정
    setupWarningListener();

    // 요청 버튼 이벤트 설정
    setupStudentRequestButtons();

    // 채팅 기능 초기화
    document.getElementById("chatFloatingBtn").style.display = "flex";
    setupStudentChatRoomListener();
    maybeRequestChatNotificationPermission();
  } catch (err) {
    alert("화면 로드에 실패했습니다. 새로고침 후 다시 시도해 주세요.");
  }
}

function renderTabs() {
  const tabWrap = document.getElementById("tabWrap");
  tabWrap.innerHTML = "";
  subjects.forEach(subject => {
    const btn = document.createElement("button");
    btn.className = "tab" + (subject === currentSubject ? " active" : "");
    btn.textContent = subject;
    btn.onclick = () => {
      currentSubject = subject;
      renderTabs();
      document.getElementById("taskTitle").textContent = `[${subject}] 학습 항목`;
      loadTasks(subject);
    };
    tabWrap.appendChild(btn);
  });
  const addBtn = document.createElement("button");
  addBtn.className = "tab";
  addBtn.textContent = "+ 과목 추가";
  addBtn.onclick = () => {
    const n = prompt("추가할 과목명을 입력하세요:");
    if (!n) return;
    subjects.add(n);
    currentSubject = n;
    renderTabs();
    loadTasks(n);
  };
  tabWrap.appendChild(addBtn);
}

let unsubDailyStatus = null;

// 원격 제어 알림 표시
function showRemoteControlAlert(message) {
  const alert = document.createElement('div');
  alert.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#667eea;color:#fff;padding:12px 24px;border-radius:10px;font-weight:600;z-index:9999;animation:fadeInOut 3s forwards;';
  alert.textContent = message;
  document.body.appendChild(alert);
  setTimeout(() => alert.remove(), 3000);
}

async function loadDailyStatus() {
  try {
    const snap = await getDoc(dailyRef());
    let progress = 0, seconds = 0;
    if (snap.exists()) {
      const d = snap.data();
      progress = Number(d.progress) || 0;
      seconds = Number(d.timerSeconds) || 0;
      timerRunning = !!d.timerRunning;
      timerStartedAtMs = getTimestampMs(d.timerStartedAt);
    } else {
      await setDoc(dailyRef(), { progress: 0, timerSeconds: 0, timerRunning: false }, { merge: true });
      timerRunning = false;
      timerStartedAtMs = null;
    }
    renderProgress(progress);
    timerSeconds = seconds;
    if (timerRunning) {
      startLocalTimerTick();
    } else {
      stopLocalTimerTick();
    }

    // 관리자 원격 제어 감지를 위한 실시간 리스너
    if (unsubDailyStatus) unsubDailyStatus();
    unsubDailyStatus = onSnapshot(dailyRef(), (docSnap) => {
      if (!docSnap.exists()) return;
      const data = docSnap.data();
      const prevRunning = timerRunning;
      const prevSeconds = timerSeconds;

      // 관리자가 원격으로 제어한 경우
      if (data.timerControlledBy && data.timerControlledBy !== me.uid) {
        // 타이머 시작 명령
        if (data.timerRunning && !prevRunning) {
          startTimer({ remote: true, startedAt: data.timerStartedAt });
          showRemoteControlAlert("관리자가 타이머를 시작했습니다.");
        }
        // 타이머 정지 명령
        if (!data.timerRunning && prevRunning) {
          pauseTimer({ remote: true });
          showRemoteControlAlert("관리자가 타이머를 정지했습니다.");
        }
        // 타이머 초기화
        if (Number(data.timerSeconds) === 0 && prevSeconds > 0) {
          timerSeconds = 0;
          timerRunning = false;
          timerStartedAtMs = null;
          stopLocalTimerTick();
          renderTimer(timerSeconds);
          showRemoteControlAlert("관리자가 타이머를 초기화했습니다.");
        }
      }

      timerSeconds = Number(data.timerSeconds) || 0;
      timerRunning = !!data.timerRunning;
      timerStartedAtMs = getTimestampMs(data.timerStartedAt);
      if (timerRunning && !timerStartedAtMs) {
        timerStartedAtMs = Date.now();
      }
      if (timerRunning) {
        startLocalTimerTick();
      } else {
        stopLocalTimerTick();
      }
      renderTimer(getLiveSeconds(timerSeconds, timerStartedAtMs, timerRunning));
    });
    renderTimer(getLiveSeconds(timerSeconds, timerStartedAtMs, timerRunning));
  } catch (err) {
    alert("데이터 로드 실패. 다시 시도해 주세요.");
  }
}

function renderProgress(pct) {
  pct = Math.max(0, Math.min(100, Number(pct) || 0));
  const fill = document.getElementById("progressFill");
  fill.style.width = pct + "%";
  fill.textContent = pct + "%";
}

async function recalcProgressAndSave(uid = me.uid, key = null) {
  try {
    key = key || getTodayKey();
    const q = await getDocs(tasksCol(uid, key));
    trackRead(q.size || 1);
    let total = 0, done = 0;
    q.forEach(docu => {
      const t = docu.data();
      if (t.__deleted) return;
      total++;
      if (t.completed) done++;
    });
    const pct = (total > 0 ? Math.round(done / total * 100) : 0);
    if (uid === me.uid && key === getTodayKey()) renderProgress(pct);
    await setDoc(dailyRef(uid, key), {
      progress: pct,
      totalTasks: total,
      completedTasks: done,
      lastUpdated: new Date()
    }, { merge: true });
    trackWrite();
  } catch (err) {
    alert("진행률 저장에 실패했습니다.");
  }
}

function startTimer(options = {}) {
  const { remote = false, startedAt = null } = options;
  if (timerRunning) return;
  timerRunning = true;
  timerStartedAtMs = getTimestampMs(startedAt) || Date.now();
  startLocalTimerTick();
  startAutoSave(); // 60초 자동 저장 시작
  renderTimer(getLiveSeconds(timerSeconds, timerStartedAtMs, timerRunning));

  if (!remote) {
    setDoc(dailyRef(), {
      timerRunning: true,
      timerStartedAt: new Date(),
      timerSeconds,
      timerControlledBy: me.uid
    }, { merge: true }).then(() => {
      trackWrite();
    }).catch(err => {
    });
  }
}

function pauseTimer(options = {}) {
  const { remote = false } = options;
  if (!timerRunning) return;
  const liveSeconds = getLiveSeconds(timerSeconds, timerStartedAtMs, true);
  timerSeconds = liveSeconds;
  timerRunning = false;
  timerStartedAtMs = null;
  stopLocalTimerTick();
  stopAutoSave(); // 자동 저장 정지
  renderTimer(timerSeconds);
  const payload = remote
    ? { timerSeconds, timerRunning: false, timerStartedAt: null }
    : { timerSeconds, timerRunning: false, timerStartedAt: null, timerPausedAt: new Date(), timerControlledBy: me.uid };
  setDoc(dailyRef(), payload, { merge: true }).then(() => {
    trackWrite();
  }).catch(err => {
  });
}

function resetTimer(options = {}) {
  const { remote = false } = options;
  if (!confirm("오늘 타이머를 0으로 초기화할까요?")) return;
  stopLocalTimerTick();
  stopAutoSave(); // 자동 저장 정지
  timerSeconds = 0;
  timerRunning = false;
  timerStartedAtMs = null;
  renderTimer(timerSeconds);
  const payload = remote
    ? { timerSeconds: 0, timerRunning: false, timerStartedAt: null }
    : { timerSeconds: 0, timerRunning: false, timerStartedAt: null, timerResetAt: new Date(), timerControlledBy: me.uid };
  setDoc(dailyRef(), payload, { merge: true }).then(() => {
    trackWrite();
  }).catch(err => {
  });
}

function renderTimer(seconds = timerSeconds) {
  const timerLabel = document.getElementById("timerLabel");
  if (timerLabel) timerLabel.textContent = formatTimer(Math.floor(seconds));
}

async function addTask() {
  let subj = currentSubject;
  if (subj === "모든 과목") {
    subj = prompt("어느 과목에 추가할까요?");
    if (!subj) return;
    subjects.add(subj);
    renderTabs();
  }
  const title = prompt(`${subj}에서 추가할 항목명:`);
  if (!title) return;
  try {
    await setDoc(dailyRef(), {}, { merge: true });
    await addDoc(tasksCol(), { subject: subj, title, completed: false, createdAt: new Date() });
    await recalcProgressAndSave();
  } catch (err) {
    alert("과제 추가에 실패했습니다. 인터넷 연결을 확인해주세요.");
  }
}

function loadTasks(subj) {
  const list = document.getElementById("taskList");
  list.innerHTML = "";
  if (unsubTasks) { unsubTasks(); unsubTasks = null; }
  const q = (subj === "모든 과목")
    ? query(tasksCol(), orderBy("createdAt", "asc"))
    : query(tasksCol(), where("subject", "==", subj), orderBy("createdAt", "asc"));
  unsubTasks = onSnapshot(q, async snap => {
    list.innerHTML = "";
    if (snap.empty) {
      list.innerHTML = `<div class="ghost">아직 항목이 없습니다. "+ 항목 추가"를 눌러주세요.</div>`;
      await recalcProgressAndSave();
      return;
    }
    snap.forEach(docu => {
      const t = docu.data();
      if (t.__deleted) return;
      const row = document.createElement("div");
      row.className = "task-row";

      // 점검 상태에 따른 버튼/상태 표시
      const checkStatus = t.checkStatus || "none";
      let checkBtnHtml = "";

      if (t.completed) {
        if (checkStatus === "none") {
          checkBtnHtml = `<button class="btn btn-check-request">점검 요청</button>`;
        } else if (checkStatus === "requested") {
          checkBtnHtml = `<span class="check-status requested">점검 대기중</span>`;
        } else if (checkStatus === "testAssigned") {
          checkBtnHtml = `<span class="check-status testing">테스트 응시중</span>`;
        } else if (checkStatus === "completed") {
          checkBtnHtml = `<span class="check-status completed">점검완료 (${t.testScore}점)</span>`;
        }
      }

      row.innerHTML = `
        <div class="task-left">
          <input type="checkbox" ${t.completed ? "checked" : ""}>
          ${subj === "모든 과목" ? `<span class="badge">${t.subject}</span>` : ""}
          <span class="task-title">${t.title}</span>
          ${checkBtnHtml}
        </div>
        <button class="btn btn-outline btn-delete">삭제</button>`;

      row.querySelector("input").onchange = async () => {
        await updateDoc(doc(tasksCol(), docu.id), { completed: row.querySelector("input").checked });
        await recalcProgressAndSave();
      };
      row.querySelector(".btn-delete").onclick = async () => {
        if (!confirm("이 항목을 삭제하시겠습니까?")) return;
        await deleteDoc(doc(tasksCol(), docu.id));
        await recalcProgressAndSave();
      };

      // 점검 요청 버튼 이벤트
      const checkRequestBtn = row.querySelector(".btn-check-request");
      if (checkRequestBtn) {
        checkRequestBtn.onclick = async () => {
          await updateDoc(doc(tasksCol(), docu.id), {
            checkStatus: "requested",
            requestedAt: new Date()
          });
        };
      }

      list.appendChild(row);
    });
  });
}

async function saveTest() {
  try {
    const subj = document.getElementById("testSubject").value;
    const total = Number(document.getElementById("testTotal").value);
    const correct = Number(document.getElementById("testCorrect").value);
    if (!Number.isInteger(total) || total < 1) {
      alert("총 문제 수는 1 이상의 정수로 입력하세요.");
      return;
    }
    if (!Number.isInteger(correct) || correct < 0) {
      alert("맞은 개수는 0 이상의 정수로 입력하세요.");
      return;
    }
    if (correct > total) {
      alert("맞은 개수는 총 문제 수보다 클 수 없습니다.");
      return;
    }
    const score = Math.round((correct / total) * 100);
    const wrong = total - correct;
    await setDoc(dailyRef(), {}, { merge: true });
    await addDoc(testsCol(), {
      subject: subj,
      score,
      wrongCount: wrong,
      totalCount: total,
      correctCount: correct,
      createdAt: new Date()
    });
    document.getElementById("testTotal").value = "";
    document.getElementById("testCorrect").value = "";
    await renderTestList();
    await renderScoreChart();
  } catch (err) {
    alert("시험 결과 저장에 실패했습니다. 다시 시도해 주세요.");
  }
}

async function renderTestList() {
  try {
    const list = document.getElementById("testList");
    list.innerHTML = "";
    const q = query(testsCol(), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    if (snap.empty) {
      list.textContent = "오늘 저장된 시험 결과가 없습니다.";
      list.classList.add("ghost");
      return;
    }
    list.classList.remove("ghost");
    snap.forEach(docu => {
      const r = docu.data();
      const date = new Date(r.createdAt?.seconds ? r.createdAt.seconds * 1000 : r.createdAt);
      const row = document.createElement("div");
      row.className = "task-row";
      // 새 형식 (totalCount 있음): "8/10 (80점)", 기존 형식: "80점 / 오답: 2개"
      const scoreText = r.totalCount
        ? `${r.correctCount}/${r.totalCount} (${r.score}점)`
        : `${r.score}점 / 오답: ${r.wrongCount}개`;
      row.innerHTML = `
        <div><strong>[${r.subject}]</strong> ${scoreText}</div>
        <div class="kicker">${date.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })}</div>
      `;
      list.appendChild(row);
    });
  } catch (err) {
    alert("시험 결과 로드에 실패했습니다.");
  }
}

let scoreChart;
async function renderScoreChart() {
  try {
    const q = query(testsCol(), orderBy("createdAt", "asc"));
    const snap = await getDocs(q);
    const bySubj = {};
    snap.forEach(docu => {
      const r = docu.data();
      (bySubj[r.subject] ??= []).push(r.score);
    });
    const labels = Object.keys(bySubj);
    const data = labels.map(s => {
      const arr = bySubj[s];
      return (arr && arr.length ? arr[arr.length - 1] : 0);
    });
    const ctx = document.getElementById("scoreChart").getContext("2d");
    if (scoreChart) scoreChart.destroy();
    scoreChart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label:"과목별 최근 점수", data, backgroundColor: '#667eea' }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, max: 100 } }
      }
    });
  } catch (err) {
    alert("점수 차트 로드에 실패했습니다.");
  }
}

async function setScope(scope) {
  currentScope = scope;
  document.getElementById("seg-today").classList.remove("active");
  document.getElementById("seg-daily").classList.remove("active");
  document.getElementById("seg-week").classList.remove("active");
  document.getElementById("seg-month").classList.remove("active");
  document.getElementById("seg-report").classList.remove("active");
  document.getElementById("seg-ranking").classList.remove("active");
  document.getElementById("seg-" + scope).classList.add("active");

  document.getElementById("todayWrap").style.display = "none";
  document.getElementById("aggWrap").style.display = "none";
  document.getElementById("reportWrap").style.display = "none";
  document.getElementById("rankingWrap").style.display = "none";

  if (scope === "today") {
    document.getElementById("todayWrap").style.display = "block";
    return;
  }
  if (scope === "daily") {
    document.getElementById("reportWrap").style.display = "block";
    await renderDailyReport();
    return;
  }
  if (scope === "report") {
    document.getElementById("reportWrap").style.display = "block";
    await renderWeeklyReport();
    return;
  }
  if (scope === "month") {
    document.getElementById("reportWrap").style.display = "block";
    await renderMonthlyReport();
    return;
  }
  if (scope === "ranking") {
    document.getElementById("rankingWrap").style.display = "block";
    await renderRanking();
    return;
  }
  // week scope - 주간 통계만 표시
  document.getElementById("aggWrap").style.display = "block";
  await renderAggregate(7);
}

async function renderAggregate(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days + 1);
  const keys = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    keys.push(d.toLocaleDateString('en-CA', { timeZone:'Asia/Seoul' }));
  }
  const qs = query(
    dailiesCol(),
    where(documentId(), ">=", keys[0]),
    where(documentId(), "<=", keys[keys.length - 1]),
    orderBy(documentId(), "asc")
  );
  const snap = await getDocs(qs);
  const map = new Map();
  snap.forEach(docu => map.set(docu.id, docu.data()));
  let sumProg = 0, count = 0;
  let sumSec = 0;
  let totalTasks = 0, doneTasks = 0;
  const progressArr = [];
  const timeArr = [];
  const labels = [];
  keys.forEach(key => {
    const d = map.get(key) || {};
    const p = Number(d.progress) || 0;
    const sec = getEffectiveTimerSecondsForKey(d, key);
    const tot = Number(d.totalTasks) || 0;
    const com = Number(d.completedTasks) || 0;
    sumProg += p;
    count++;
    sumSec += sec;
    totalTasks += tot;
    doneTasks += com;
    progressArr.push(p);
    timeArr.push(Math.round(sec / 3600 * 100) / 100);
    labels.push(key.slice(5));
  });
  document.getElementById("aggTime").textContent = `${Math.floor(sumSec / 3600)}시간 ${Math.floor((sumSec % 3600)/60)}분`;
  document.getElementById("aggTasks").textContent = `${doneTasks} / ${totalTasks}`;
  document.getElementById("aggProgress").textContent = (count ? Math.round(sumProg / count) : 0) + "%";
  const ctx1 = document.getElementById("aggChartProgress").getContext("2d");
  if (window.chartAgg1) window.chartAgg1.destroy();
  window.chartAgg1 = new Chart(ctx1, {
    type: 'line',
    data: { labels, datasets: [{ label:"진행률(%)", data: progressArr, tension:0.3, borderColor: '#667eea', backgroundColor: 'rgba(102, 126, 234, 0.1)' }] },
    options: { responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,max:100}} }
  });
  const ctx2 = document.getElementById("aggChartTime").getContext("2d");
  if (window.chartAgg2) window.chartAgg2.destroy();
  window.chartAgg2 = new Chart(ctx2, {
    type: 'bar',
    data: { labels, datasets: [{ label:"공부시간(시간)", data: timeArr, backgroundColor: '#764ba2' }] },
    options: { responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }
  });
}

// 랭킹 시스템
let currentRankingType = "academy"; // "academy" 또는 "national"

// 랭킹 탭 이벤트 리스너 설정
function setupRankingTabs() {
  document.querySelectorAll(".ranking-tab").forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll(".ranking-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentRankingType = tab.dataset.ranking;
      renderRanking();
    };
  });
}

async function renderRanking() {
  if (!myData) {
    document.getElementById("rankingList").innerHTML = '<div class="ghost">사용자 정보가 없습니다.</div>';
    return;
  }

  // 학년 라벨 숨기기 (전체 학년 통합 랭킹)
  const gradeLabel = document.getElementById("myGradeLabel");
  if (gradeLabel) gradeLabel.textContent = "전체";

  // 랭킹 탭 설정
  setupRankingTabs();

  // 주간 데이터 수집
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const weekKeys = [];
  for (let d = new Date(monday); d <= sunday; d.setDate(d.getDate() + 1)) {
    weekKeys.push(d.toLocaleDateString('en-CA', { timeZone:'Asia/Seoul' }));
  }

  // 학생 쿼리: 학원 랭킹 vs 전국 랭킹 (전체 학년 통합)
  let usersSnap;
  if (currentRankingType === "academy") {
    // 우리 학원 전체 학생
    usersSnap = await getDocs(query(
      collection(db, "users"),
      where("role", "==", "student"),
      where("academyId", "==", myData.academyId || "")
    ));
    document.getElementById("rankingSubtitle").textContent = `${myData.academyName || "우리 학원"} | 점수 = 공부시간(분) + 진행률 × 10`;
  } else {
    // 전국 전체 학생
    usersSnap = await getDocs(query(
      collection(db, "users"),
      where("role", "==", "student")
    ));
    document.getElementById("rankingSubtitle").textContent = "전국 | 점수 = 공부시간(분) + 진행률 × 10";
  }

  const rankings = [];

  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data();

    let totalTime = 0;
    let totalProgress = 0;
    let count = 0;
    let studyDays = 0;

    for (const key of weekKeys) {
      const dailySnap = await getDoc(dailyRef(userDoc.id, key));
      if (dailySnap.exists()) {
        const d = dailySnap.data();
        const sec = getEffectiveTimerSecondsForKey(d, key);
        const prog = Number(d.progress) || 0;

        if (sec > 0) studyDays++;
        totalTime += sec;
        totalProgress += prog;
        count++;
      }
    }

    const avgProgress = count > 0 ? Math.round(totalProgress / count) : 0;
    const minutes = Math.floor(totalTime / 60);
    const score = minutes + (avgProgress * 10);

    // 배지 계산
    const badges = [];
    if (studyDays >= 7) badges.push("🔥 7일 연속");
    if (totalTime >= 36000) badges.push("⏰ 10시간 달성");
    if (avgProgress >= 95) badges.push("💯 완벽 완수");

    rankings.push({
      uid: userDoc.id,
      name: userData.nickname || userData.name,
      academyName: userData.academyName || "",
      score,
      avgProgress,
      totalTime,
      studyDays,
      badges
    });
  }

  rankings.sort((a, b) => b.score - a.score);

  // 1등에게 챔피언 배지 추가
  const championBadge = currentRankingType === "academy" ? "👑 학원 챔피언" : "👑 전국 챔피언";
  if (rankings.length > 0 && !rankings[0].badges.includes(championBadge)) {
    rankings[0].badges.push(championBadge);
  }

  // 내 순위 찾기
  const myRank = rankings.findIndex(r => r.uid === me.uid) + 1;
  const myInfo = rankings.find(r => r.uid === me.uid);

  document.getElementById("myRank").textContent = myRank > 0 ? `${myRank}위` : "-";

  const myBadgesDiv = document.getElementById("myBadges");
  myBadgesDiv.innerHTML = "";
  if (myInfo && myInfo.badges.length > 0) {
    myInfo.badges.forEach(badge => {
      const span = document.createElement("span");
      span.className = "mini-badge";
      span.textContent = badge;
      myBadgesDiv.appendChild(span);
    });
  } else {
    myBadgesDiv.innerHTML = '<span class="ghost">아직 획득한 배지가 없습니다</span>';
  }

  // 랭킹 리스트 렌더링
  const list = document.getElementById("rankingList");
  list.innerHTML = "";

  if (rankings.length === 0) {
    const msg = currentRankingType === "academy"
      ? "우리 학원에 학생이 없습니다."
      : "학생이 없습니다.";
    list.innerHTML = `<div class="ghost">${msg}</div>`;
    return;
  }

  rankings.forEach((rank, index) => {
    const item = document.createElement("div");
    item.className = "rank-item" + (index === 0 ? " mvp" : "");

    const hours = Math.floor(rank.totalTime / 3600);
    const mins = Math.floor((rank.totalTime % 3600) / 60);

    // 전국 랭킹에서는 학원명 표시
    const academyLabel = currentRankingType === "national" && rank.academyName
      ? `<span class="badge" style="margin-left:6px; font-size:10px;">${rank.academyName}</span>`
      : "";

    item.innerHTML = `
      <div class="rank-num">${index + 1}</div>
      <div class="rank-info">
        <div class="rank-name">${rank.name} ${rank.uid === me.uid ? "(나)" : ""} ${academyLabel}</div>
        <div class="kicker">
          공부시간: ${hours}시간 ${mins}분 |
          평균 진행률: ${rank.avgProgress}% |
          학습일수: ${rank.studyDays}일
        </div>
        <div class="rank-badges">
          ${rank.badges.map(b => `<span class="mini-badge">${b}</span>`).join('')}
        </div>
      </div>
      <div class="rank-score">${rank.score}점</div>
    `;

    list.appendChild(item);
  });
}

// ========== 관리자용 랭킹 시스템 ==========
let adminRankingScope = "academy"; // "academy" | "national"
let adminRankingPeriod = "weekly"; // "weekly" | "total"
let adminRankingEventsInitialized = false;

function setupAdminRankingEvents() {
  if (adminRankingEventsInitialized) return;

  // 범위 선택 (우리 학원 / 전국)
  document.getElementById("adminRankingScopeAcademy").addEventListener("click", () => {
    adminRankingScope = "academy";
    document.getElementById("adminRankingScopeAcademy").classList.remove("btn-outline");
    document.getElementById("adminRankingScopeAcademy").style.background = "#667eea";
    document.getElementById("adminRankingScopeNational").classList.add("btn-outline");
    document.getElementById("adminRankingScopeNational").style.background = "";
    renderAdminRanking();
  });

  document.getElementById("adminRankingScopeNational").addEventListener("click", () => {
    adminRankingScope = "national";
    document.getElementById("adminRankingScopeNational").classList.remove("btn-outline");
    document.getElementById("adminRankingScopeNational").style.background = "#667eea";
    document.getElementById("adminRankingScopeAcademy").classList.add("btn-outline");
    document.getElementById("adminRankingScopeAcademy").style.background = "";
    renderAdminRanking();
  });

  // 기간 선택 (주간 / 전체 기간)
  document.getElementById("adminRankingPeriodWeekly").addEventListener("click", () => {
    adminRankingPeriod = "weekly";
    document.getElementById("adminRankingPeriodWeekly").classList.remove("btn-outline");
    document.getElementById("adminRankingPeriodWeekly").style.background = "#22a06b";
    document.getElementById("adminRankingPeriodTotal").classList.add("btn-outline");
    document.getElementById("adminRankingPeriodTotal").style.background = "";
    renderAdminRanking();
  });

  document.getElementById("adminRankingPeriodTotal").addEventListener("click", () => {
    adminRankingPeriod = "total";
    document.getElementById("adminRankingPeriodTotal").classList.remove("btn-outline");
    document.getElementById("adminRankingPeriodTotal").style.background = "#22a06b";
    document.getElementById("adminRankingPeriodWeekly").classList.add("btn-outline");
    document.getElementById("adminRankingPeriodWeekly").style.background = "";
    renderAdminRanking();
  });

  adminRankingEventsInitialized = true;
}

async function renderAdminRanking() {
  const listEl = document.getElementById("adminRankingList");
  listEl.innerHTML = '<div class="ghost">랭킹을 불러오는 중...</div>';

  // 타이틀 업데이트
  const scopeText = adminRankingScope === "academy" ? "우리 학원" : "전국";
  const periodText = adminRankingPeriod === "weekly" ? "주간" : "전체 기간";
  document.getElementById("adminRankingTitle").textContent = `🏆 ${scopeText} ${periodText} 랭킹`;

  try {
    // 학생 쿼리
    let q;
    if (adminRankingScope === "academy") {
      q = query(collection(db, "users"), where("role", "==", "student"), where("academyId", "==", myData.academyId));
    } else {
      q = query(collection(db, "users"), where("role", "==", "student"));
    }

    const snap = await getDocs(q);
    trackRead(snap.size || 1);

    // 날짜 범위 계산
    const today = new Date();
    let dateKeys = [];

    if (adminRankingPeriod === "weekly") {
      // 이번 주 (월요일 ~ 일요일)
      const dayOfWeek = today.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + mondayOffset + i);
        dateKeys.push(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }));
      }
    }
    // total인 경우 dateKeys는 빈 배열 -> 모든 daily 문서 조회

    const rankings = [];

    for (const userDoc of snap.docs) {
      const userData = userDoc.data();
      const uid = userDoc.id;

      let totalSeconds = 0;
      let totalProgress = 0;
      let progressCount = 0;

      if (adminRankingPeriod === "weekly") {
        // 주간 데이터
        for (const dateKey of dateKeys) {
          const dailySnap = await getDoc(doc(db, "users", uid, "daily", dateKey));
          if (dailySnap.exists()) {
            const d = dailySnap.data();
            totalSeconds += d.timerSeconds || 0;
            if (d.progress !== undefined) {
              totalProgress += d.progress;
              progressCount++;
            }
          }
        }
        trackRead(dateKeys.length);
      } else {
        // 전체 기간 데이터
        const dailiesSnap = await getDocs(collection(db, "users", uid, "daily"));
        trackRead(dailiesSnap.size || 1);
        dailiesSnap.forEach(d => {
          const data = d.data();
          totalSeconds += data.timerSeconds || 0;
          if (data.progress !== undefined) {
            totalProgress += data.progress;
            progressCount++;
          }
        });
      }

      const avgProgress = progressCount > 0 ? Math.round(totalProgress / progressCount) : 0;
      const studyMinutes = Math.round(totalSeconds / 60);
      const score = studyMinutes + (avgProgress * 10);

      if (totalSeconds > 0 || progressCount > 0) {
        rankings.push({
          uid,
          name: userData.name,
          grade: userData.grade || "",
          academyName: userData.academyName || "",
          studyMinutes,
          avgProgress,
          score,
          totalSeconds
        });
      }
    }

    // 정렬
    rankings.sort((a, b) => b.score - a.score);

    // 통계 업데이트
    const totalStudents = rankings.length;
    const avgTime = totalStudents > 0 ? Math.round(rankings.reduce((sum, r) => sum + r.studyMinutes, 0) / totalStudents) : 0;
    const avgProgress = totalStudents > 0 ? Math.round(rankings.reduce((sum, r) => sum + r.avgProgress, 0) / totalStudents) : 0;
    const topScore = rankings.length > 0 ? rankings[0].score : 0;

    document.getElementById("adminRankingTotalStudents").textContent = totalStudents;
    document.getElementById("adminRankingAvgTime").textContent = `${avgTime}분`;
    document.getElementById("adminRankingAvgProgress").textContent = `${avgProgress}%`;
    document.getElementById("adminRankingTopScore").textContent = topScore;

    // 랭킹 리스트 렌더링
    if (rankings.length === 0) {
      listEl.innerHTML = '<div class="ghost">랭킹 데이터가 없습니다.</div>';
      return;
    }

    listEl.innerHTML = "";
    rankings.forEach((r, idx) => {
      const rank = idx + 1;
      let medal = "";
      if (rank === 1) medal = "🥇";
      else if (rank === 2) medal = "🥈";
      else if (rank === 3) medal = "🥉";

      const item = document.createElement("div");
      item.className = "rank-item";
      item.style.cssText = "display:flex; align-items:center; gap:16px; padding:16px; background:#fff; border-radius:12px; margin-bottom:8px;";

      // 전국 랭킹일 때 학원명 표시
      const academyInfo = adminRankingScope === "national" ? `<span style="color:#888; font-size:12px; margin-left:8px;">${r.academyName}</span>` : "";

      item.innerHTML = `
        <div style="width:40px; text-align:center; font-size:20px; font-weight:700; color:${rank <= 3 ? '#f59e0b' : '#666'};">
          ${medal || rank}
        </div>
        <div style="flex:1;">
          <div style="font-weight:600;">${r.name} <span style="color:#667eea; font-size:13px;">${r.grade}</span>${academyInfo}</div>
          <div style="font-size:13px; color:#666; margin-top:4px;">
            학습 ${formatTimer(r.totalSeconds)} · 진행률 ${r.avgProgress}%
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:20px; font-weight:700; color:#667eea;">${r.score}</div>
          <div style="font-size:11px; color:#888;">점수</div>
        </div>
      `;
      listEl.appendChild(item);
    });

  } catch (err) {
    listEl.innerHTML = '<div class="ghost" style="color:#ef4444;">랭킹을 불러오는데 실패했습니다.</div>';
  }
}

// 관리자 대시보드
async function renderAdmin() {
  document.getElementById("loginView").style.display = "none";
  document.getElementById("signupView").style.display = "none";
  document.getElementById("studentView").style.display = "none";
  document.getElementById("adminView").style.display = "block";

  // 학원 정보 표시
  document.getElementById("adminAcademyName").textContent = myData.academyName || "학원명 없음";

  // 학원 코드 가져오기
  if (myData.academyId) {
    const academyDoc = await getDoc(doc(db, "academies", myData.academyId));
    if (academyDoc.exists()) {
      document.getElementById("adminAcademyCode").textContent = academyDoc.data().code;
    }
  }

  // 학생 요청 실시간 리스너 설정
  setupStudentRequestsListener();

  // 관리자 전달사항 실시간 리스너 설정
  setupAdminCommentsListener();

  // 채팅 기능 초기화
  document.getElementById("chatFloatingBtn").style.display = "flex";
  setupAdminChatNotificationListener();
  maybeRequestChatNotificationPermission();

  // 관리 유형 필터 이벤트 설정
  setupManagementFilterEvents();

  await switchAdminTab("students");
}

async function switchAdminTab(tabName) {
  document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
  document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");

  document.getElementById("adminTabStudents").style.display = "none";
  document.getElementById("adminTabAdminComments").style.display = "none";
  document.getElementById("adminTabStats").style.display = "none";
  document.getElementById("adminTabRegistrations").style.display = "none";
  document.getElementById("adminTabHistory").style.display = "none";
  document.getElementById("adminTabAnalysis").style.display = "none";
  document.getElementById("adminTabAttendance").style.display = "none";
  document.getElementById("adminTabWrongAnswer").style.display = "none";

  // 가입 현황 탭에서 벗어날 때 리스너 해제
  if (tabName !== "registrations") {
    if (unsubRegistrations) {
      unsubRegistrations();
      unsubRegistrations = null;
    }
    if (unsubAllAcademies) {
      unsubAllAcademies();
      unsubAllAcademies = null;
    }
  }

  if (tabName === "students") {
    document.getElementById("adminTabStudents").style.display = "block";
    await renderStudentList();
  } else if (tabName === "adminComments") {
    document.getElementById("adminTabAdminComments").style.display = "block";
    // 전달사항 리스너는 renderAdmin에서 이미 설정됨
  } else if (tabName === "history") {
    document.getElementById("adminTabHistory").style.display = "block";
    setupHistoryTabEvents();
    await renderHistoryStudentList();
  } else if (tabName === "stats") {
    document.getElementById("adminTabStats").style.display = "block";
    setupStatsSubTabs();
    // 기본: 랭킹 탭 로드
    await switchStatsSubTab("ranking");
  } else if (tabName === "registrations") {
    document.getElementById("adminTabRegistrations").style.display = "block";
    loadStudentRegistrations();
  } else if (tabName === "analysis") {
    document.getElementById("adminTabAnalysis").style.display = "block";
    setupAnalysisTabEvents();
    await renderAnalysisStudentList();
  } else if (tabName === "attendance") {
    document.getElementById("adminTabAttendance").style.display = "block";
    setupAttendanceTabEvents();
    await renderAttendanceStudentList();
  } else if (tabName === "wrongAnswer") {
    document.getElementById("adminTabWrongAnswer").style.display = "block";
    setupWrongAnswerTabEvents();
    await loadProblemSets();
    // Initialize with empty problem set if none exists
    if (problemSetProblems.length === 0) {
      createNewProblemSet();
    }
  }
}

// 통계분석 서브탭 설정
function setupStatsSubTabs() {
  const subTabs = document.querySelectorAll("#statsSubTabs .sub-tab");
  subTabs.forEach(tab => {
    tab.onclick = async () => {
      // 탭 활성화
      subTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      // 서브탭 전환
      const subTabName = tab.dataset.subtab;
      await switchStatsSubTab(subTabName);
    };
  });
}

// 통계분석 서브탭 전환
async function switchStatsSubTab(subTabName) {
  // 모든 서브탭 컨텐츠 숨기기
  document.getElementById("statsRankingContent").style.display = "none";
  document.getElementById("statsCompareContent").style.display = "none";
  document.getElementById("statsWarningContent").style.display = "none";

  if (subTabName === "ranking") {
    document.getElementById("statsRankingContent").style.display = "block";
    setupAdminRankingEvents();
    await renderAdminRanking();
  } else if (subTabName === "compare") {
    document.getElementById("statsCompareContent").style.display = "block";
    await renderCompareView();
  } else if (subTabName === "warning") {
    document.getElementById("statsWarningContent").style.display = "block";
    await renderWarningView();
  }
}

// 가입 현황 실시간 로드
function loadStudentRegistrations() {
  // 슈퍼 관리자일 경우 전체 학원 탭 표시
  if (isSuperAdmin()) {
    document.getElementById("allAcademiesSubTab").style.display = "block";
  } else {
    document.getElementById("allAcademiesSubTab").style.display = "none";
  }

  // 서브탭 이벤트 설정
  setupRegistrationSubTabs();

  // 우리 학원 학생 로드
  loadMyAcademyStudents();
}

// 서브탭 전환 설정
function setupRegistrationSubTabs() {
  const subTabs = document.querySelectorAll("#registrationSubTabs .sub-tab");
  subTabs.forEach(tab => {
    tab.onclick = () => {
      // 탭 활성화
      subTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      const subtab = tab.dataset.subtab;
      document.getElementById("myAcademyContent").style.display = "none";
      document.getElementById("allAcademiesContent").style.display = "none";

      if (subtab === "myAcademy") {
        document.getElementById("myAcademyContent").style.display = "block";
        loadMyAcademyStudents();
      } else if (subtab === "allAcademies") {
        document.getElementById("allAcademiesContent").style.display = "block";
        loadAllAcademiesRegistrations();
      }
    };
  });
}

// 우리 학원 학생 로드
function loadMyAcademyStudents() {
  // 이미 리스너가 있으면 해제
  if (unsubRegistrations) {
    unsubRegistrations();
  }

  const tbody = document.getElementById("registrationTableBody");
  const countEl = document.getElementById("totalStudentCount");

  // 실시간 리스너 설정
  const q = query(
    collection(db, "users"),
    where("role", "==", "student"),
    where("academyId", "==", myData.academyId || "")
  );

  unsubRegistrations = onSnapshot(q, (snapshot) => {
    trackRead(snapshot.size || 1);

    if (snapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-msg">아직 가입한 학생이 없습니다.</td></tr>';
      countEl.textContent = "0";
      return;
    }

    // 가입일시 기준 정렬 (최신순)
    const students = [];
    snapshot.forEach(doc => {
      students.push({ id: doc.id, ...doc.data() });
    });
    students.sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      return dateB - dateA; // 최신순
    });

    countEl.textContent = students.length;

    // 테이블 렌더링
    tbody.innerHTML = students.map(student => {
      const createdAt = student.createdAt?.toDate ? student.createdAt.toDate() : new Date(student.createdAt || 0);
      const formattedDate = createdAt.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Seoul'
      });

      return `
        <tr>
          <td><strong>${student.name || '-'}</strong></td>
          <td><span class="grade-badge">${student.grade || '-'}</span></td>
          <td>${student.email || '-'}</td>
          <td>${formattedDate}</td>
          <td><button class="btn-delete-student" data-uid="${student.id}" data-name="${student.name || ''}">🗑️ 삭제</button></td>
        </tr>
      `;
    }).join('');

    // 삭제 버튼 이벤트 바인딩
    tbody.querySelectorAll('.btn-delete-student').forEach(btn => {
      btn.onclick = () => {
        const uid = btn.dataset.uid;
        const name = btn.dataset.name;
        deleteStudent(uid, name);
      };
    });
  }, (error) => {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-msg">데이터를 불러오는 중 오류가 발생했습니다.</td></tr>';
  });
}

// 전체 학원 가입 현황 로드 (슈퍼 관리자 전용)
function loadAllAcademiesRegistrations() {
  if (!isSuperAdmin()) return;

  // 이미 리스너가 있으면 해제
  if (unsubAllAcademies) {
    unsubAllAcademies();
  }

  const listEl = document.getElementById("allAcademiesList");
  const academyCountEl = document.getElementById("totalAcademyCount");
  const studentCountEl = document.getElementById("totalAllStudentCount");

  // 학원 목록 실시간 리스너
  unsubAllAcademies = onSnapshot(collection(db, "academies"), async (academySnap) => {
    // Race condition 방지: 현재 렌더 버전 캡처
    const currentVersion = ++allAcademiesRenderVersion;
    trackRead(academySnap.size || 1);

    if (academySnap.empty) {
      listEl.innerHTML = '<div class="ghost">등록된 학원이 없습니다.</div>';
      academyCountEl.textContent = "0";
      studentCountEl.textContent = "0";
      return;
    }

    // 학원 데이터 수집
    const academies = [];
    academySnap.forEach(doc => {
      academies.push({ id: doc.id, ...doc.data() });
    });

    // 각 학원별 학생 수 조회
    let totalStudents = 0;
    const academyDataPromises = academies.map(async (academy) => {
      const studentsSnap = await getDocs(query(
        collection(db, "users"),
        where("role", "==", "student"),
        where("academyId", "==", academy.id)
      ));
      trackRead(studentsSnap.size || 1);

      const students = [];
      studentsSnap.forEach(doc => {
        students.push({ id: doc.id, ...doc.data() });
      });

      // 가입일시 기준 정렬 (최신순)
      students.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dateB - dateA;
      });

      totalStudents += students.length;

      return {
        ...academy,
        students,
        studentCount: students.length
      };
    });

    const academyData = await Promise.all(academyDataPromises);

    // Race condition 방지: 새 렌더가 시작됐으면 이 렌더는 무시
    if (currentVersion !== allAcademiesRenderVersion) {
      return;
    }

    // 학생 수 기준 정렬 (많은 순)
    academyData.sort((a, b) => b.studentCount - a.studentCount);

    academyCountEl.textContent = academyData.length;
    studentCountEl.textContent = totalStudents;

    // 아코디언 렌더링
    listEl.innerHTML = academyData.map((academy, index) => {
      const createdAt = academy.createdAt?.toDate ? academy.createdAt.toDate() : new Date(academy.createdAt || 0);
      const formattedDate = createdAt.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Asia/Seoul'
      });

      const studentsHtml = academy.students.length > 0
        ? `<table class="registration-table accordion-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>학년</th>
                <th>이메일</th>
                <th>가입일시</th>
              </tr>
            </thead>
            <tbody>
              ${academy.students.map(student => {
                const studentCreatedAt = student.createdAt?.toDate ? student.createdAt.toDate() : new Date(student.createdAt || 0);
                const studentDate = studentCreatedAt.toLocaleString('ko-KR', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Asia/Seoul'
                });
                return `
                  <tr>
                    <td><strong>${student.name || '-'}</strong></td>
                    <td><span class="grade-badge">${student.grade || '-'}</span></td>
                    <td>${student.email || '-'}</td>
                    <td>${studentDate}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>`
        : '<div class="ghost" style="padding:16px;">아직 가입한 학생이 없습니다.</div>';

      return `
        <div class="academy-accordion">
          <div class="accordion-header" onclick="toggleAccordion(${index})">
            <div class="accordion-title">
              <span class="accordion-icon" id="accordionIcon${index}">▶</span>
              <strong>${academy.name || '이름 없음'}</strong>
              <span class="academy-code-tag">${academy.code || '-'}</span>
            </div>
            <div class="accordion-meta">
              <span class="student-count-badge">${academy.studentCount}명</span>
              <span class="academy-created">생성: ${formattedDate}</span>
            </div>
          </div>
          <div class="accordion-content" id="accordionContent${index}" style="display:none;">
            ${studentsHtml}
          </div>
        </div>
      `;
    }).join('');
  }, (error) => {
    listEl.innerHTML = '<div class="ghost">데이터를 불러오는 중 오류가 발생했습니다.</div>';
  });
}

// 아코디언 토글
function toggleAccordion(index) {
  const content = document.getElementById(`accordionContent${index}`);
  const icon = document.getElementById(`accordionIcon${index}`);

  if (content.style.display === "none") {
    content.style.display = "block";
    icon.textContent = "▼";
  } else {
    content.style.display = "none";
    icon.textContent = "▶";
  }
}

// 학생 삭제 함수
async function deleteStudent(uid, studentName) {
  if (!confirm(`"${studentName}" 학생을 정말 삭제하시겠습니까?\n\n⚠️ 모든 데이터(타이머 기록, 과제, 시험 결과, 평가, 상담 기록)가 영구적으로 삭제됩니다.`)) {
    return;
  }

  try {
    // 1. daily 컬렉션의 모든 문서 삭제 (하위 tasks, testResults 포함)
    const dailySnap = await getDocs(collection(db, "users", uid, "daily"));
    for (const dailyDoc of dailySnap.docs) {
      // tasks 하위 컬렉션 삭제
      const tasksSnap = await getDocs(collection(db, "users", uid, "daily", dailyDoc.id, "tasks"));
      for (const taskDoc of tasksSnap.docs) {
        await deleteDoc(doc(db, "users", uid, "daily", dailyDoc.id, "tasks", taskDoc.id));
      }
      // testResults 하위 컬렉션 삭제
      const testsSnap = await getDocs(collection(db, "users", uid, "daily", dailyDoc.id, "testResults"));
      for (const testDoc of testsSnap.docs) {
        await deleteDoc(doc(db, "users", uid, "daily", dailyDoc.id, "testResults", testDoc.id));
      }
      // daily 문서 삭제
      await deleteDoc(doc(db, "users", uid, "daily", dailyDoc.id));
    }

    // 2. evaluations 컬렉션 삭제
    const evalsSnap = await getDocs(collection(db, "users", uid, "evaluations"));
    for (const evalDoc of evalsSnap.docs) {
      await deleteDoc(doc(db, "users", uid, "evaluations", evalDoc.id));
    }

    // 3. counseling 컬렉션 삭제
    const counselSnap = await getDocs(collection(db, "users", uid, "counseling"));
    for (const counselDoc of counselSnap.docs) {
      await deleteDoc(doc(db, "users", uid, "counseling", counselDoc.id));
    }

    // 4. 사용자 문서 삭제
    await deleteDoc(doc(db, "users", uid));

    alert(`"${studentName}" 학생의 모든 데이터가 삭제되었습니다.`);

    // 5. 목록 새로고침
    await renderStudentList();
  } catch (err) {
    alert("학생 삭제 중 오류가 발생했습니다: " + err.message);
  }
}

// 학생 목록 타이머 구독 해제
function unsubscribeAllStudentTimers() {
  Object.values(studentTimerUnsubscribers).forEach(unsub => {
    if (typeof unsub === 'function') unsub();
  });
  studentTimerUnsubscribers = {};
}

async function renderStudentList() {
  try {
    const list = document.getElementById("adminList");
    list.innerHTML = "";

    // 기존 타이머 구독 해제
    unsubscribeAllStudentTimers();
    stopAdminTimerTick();
    adminTimerStates = {};

    // 점검 요청 목록 로드
    await loadCheckRequests();

    // 자기 학원 학생만 표시
    const usersSnap = await getDocs(query(
      collection(db, "users"),
      where("role", "==", "student"),
      where("academyId", "==", myData.academyId || "")
    ));
    trackRead(usersSnap.size || 1);

    if (usersSnap.empty) {
      list.innerHTML = '<div class="ghost">등록된 학생이 없습니다.</div>';
      return;
    }

    let displayedCount = 0;
  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data();
    const uid = userDoc.id;

    // 관리 유형 필터링 (기본값: winter)
    const managementType = userData.managementType || "winter";
    if (currentManagementFilter !== "all" && managementType !== currentManagementFilter) {
      continue;
    }

    const dailySnap = await getDoc(dailyRef(uid, getTodayKey()));
    const dailyData = dailySnap.exists() ? dailySnap.data() : {};

    const progress = Number(dailyData.progress) || 0;
    const seconds = getEffectiveTimerSecondsForKey(dailyData, getTodayKey());
    const isRunning = dailyData.timerRunning || false;

    let startedAtMs = getTimestampMs(dailyData.timerStartedAt);
    if (isRunning && !startedAtMs) startedAtMs = Date.now();
    const liveSeconds = getLiveSeconds(
      seconds,
      startedAtMs,
      isRunning
    );

    // 관리 유형 뱃지
    const typeBadge = managementType === "external"
      ? '<span class="badge" style="margin-left:6px; background:#f59e0b; color:#fff;">🏠 외부</span>'
      : '<span class="badge" style="margin-left:6px; background:#3b82f6; color:#fff;">🏫 윈터</span>';

    const card = document.createElement("div");
    card.className = "student-card";
    card.id = `student-card-${uid}`;
    card.innerHTML = `
      <div class="row" style="justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div class="student-info">
          <strong>${escapeHtml(userData.name)}</strong>
          <span class="badge" style="margin-left:8px;">${escapeHtml(userData.grade || "-")}</span>
          ${typeBadge}
          <div class="kicker" style="margin-top:4px;">
            오늘 진행률: ${progress}%
          </div>
        </div>
        <div class="student-controls">
          <div class="timer-inline">
            <span class="timer-display" id="timer-display-${uid}">${formatTimer(liveSeconds)}</span>
            <span class="timer-status" id="timer-status-${uid}">${isRunning ? '🟢' : '⏸️'}</span>
          </div>
          <div class="btn-group">
            <button class="btn-timer start" title="시작" data-action="start">▶</button>
            <button class="btn-timer pause" title="정지" data-action="pause">⏸</button>
            <button class="btn-timer reset" title="초기화" data-action="reset">↺</button>
            <button class="btn btn-outline btn-detail">상세보기</button>
          </div>
        </div>
      </div>
    `;
    displayedCount++;

    // 상세보기 버튼
    card.querySelector(".btn-detail").onclick = (e) => {
      e.stopPropagation();
      openStudentModal(uid, userData);
    };

    // 타이머 버튼들
    card.querySelector('[data-action="start"]').onclick = (e) => {
      e.stopPropagation();
      remoteTimerStart(uid);
    };
    card.querySelector('[data-action="pause"]').onclick = (e) => {
      e.stopPropagation();
      remoteTimerPause(uid);
    };
    card.querySelector('[data-action="reset"]').onclick = (e) => {
      e.stopPropagation();
      remoteTimerReset(uid);
    };

    list.appendChild(card);

    // 실시간 타이머 구독
    studentTimerUnsubscribers[uid] = onSnapshot(dailyRef(uid, getTodayKey()), (snap) => {
      const data = snap.exists() ? snap.data() : {};
      const baseSecs = Number(data.timerSeconds) || 0;
      const running = !!data.timerRunning;
      let startedAtMs = getTimestampMs(data.timerStartedAt);
      if (running && !startedAtMs) startedAtMs = Date.now();
      const liveSecs = getLiveSeconds(baseSecs, startedAtMs, running);

      const displayEl = document.getElementById(`timer-display-${uid}`);
      const statusEl = document.getElementById(`timer-status-${uid}`);

      adminTimerStates[uid] = { baseSeconds: baseSecs, startedAtMs, running };
      if (displayEl) displayEl.textContent = formatTimer(liveSecs);
      if (statusEl) statusEl.textContent = running ? '🟢' : '⏸️';
      updateAdminTimerTickState();
    });
    }

    // 필터 결과가 없는 경우
    if (displayedCount === 0) {
      const filterName = currentManagementFilter === "winter" ? "윈터관리" : currentManagementFilter === "external" ? "외부관리" : "";
      list.innerHTML = `<div class="ghost">${filterName} 학생이 없습니다.</div>`;
    }
  } catch (err) {
    alert("학생 목록 로드에 실패했습니다.");
  }
}

// 관리 유형 필터 설정
function setupManagementFilterEvents() {
  const filterBtns = document.querySelectorAll('.management-filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // 활성 상태 변경
      filterBtns.forEach(b => {
        b.classList.remove('active');
        b.classList.add('btn-outline');
      });
      btn.classList.add('active');
      btn.classList.remove('btn-outline');

      // 필터 변경 및 목록 새로고침
      currentManagementFilter = btn.dataset.filter;
      renderStudentList();
    });
  });
}

// 모달 내 관리 유형 뱃지 업데이트
function updateModalManagementType(type) {
  const badge = document.getElementById("modalManagementTypeBadge");
  const typeBtns = document.querySelectorAll('.management-type-btn');

  if (type === "external") {
    badge.textContent = "🏠 외부관리";
    badge.style.background = "#f59e0b";
    badge.style.color = "#fff";
  } else {
    badge.textContent = "🏫 윈터관리";
    badge.style.background = "#3b82f6";
    badge.style.color = "#fff";
  }

  // 버튼 상태 업데이트
  typeBtns.forEach(btn => {
    if (btn.dataset.type === type) {
      btn.classList.add('active');
      btn.classList.remove('btn-outline');
    } else {
      btn.classList.remove('active');
      btn.classList.add('btn-outline');
    }
  });
}

// 모달 내 관리 유형 변경 이벤트 설정
function setupModalManagementTypeEvents(uid) {
  const typeBtns = document.querySelectorAll('.management-type-btn');
  typeBtns.forEach(btn => {
    btn.onclick = async () => {
      const newType = btn.dataset.type;
      await updateStudentManagementType(uid, newType);
      updateModalManagementType(newType);

      // 학생 목록도 새로고침 (뱃지 업데이트)
      await renderStudentList();
    };
  });
}

// 학생 관리 유형 변경 저장
async function updateStudentManagementType(uid, type) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, { managementType: type });
    trackWrite();

    // currentStudentData도 업데이트
    if (currentStudentData) {
      currentStudentData.managementType = type;
    }

  } catch (error) {
    alert("관리 유형 변경에 실패했습니다.");
  }
}

async function renderCompareView() {
  try {
    // 자기 학원 학생만 표시
    const usersSnap = await getDocs(query(
      collection(db, "users"),
      where("role", "==", "student"),
      where("academyId", "==", myData.academyId || "")
    ));

    if (usersSnap.empty) {
      document.getElementById("compareStats").innerHTML = '<div class="ghost">학생 데이터가 없습니다.</div>';
      return;
    }

    const students = [];
    let totalProgress = 0, totalTime = 0;
  
  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data();
    const dailySnap = await getDoc(dailyRef(userDoc.id, getTodayKey()));
    const dailyData = dailySnap.exists() ? dailySnap.data() : {};
    
    const progress = Number(dailyData.progress) || 0;
    const seconds = getEffectiveTimerSecondsForKey(dailyData, getTodayKey());
    
    totalProgress += progress;
    totalTime += seconds;
    
    students.push({
      name: userData.nickname || userData.name,
      progress,
      time: seconds / 3600
    });
  }
  
  const avgProgress = students.length > 0 ? Math.round(totalProgress / students.length) : 0;
  const avgTime = students.length > 0 ? Math.round(totalTime / students.length / 60) : 0;
  
  document.getElementById("compareStats").innerHTML = `
    <div class="stat-card">
      <div class="kicker">전체 학생 수</div>
      <div class="num">${students.length}명</div>
    </div>
    <div class="stat-card">
      <div class="kicker">평균 진행률</div>
      <div class="num">${avgProgress}%</div>
    </div>
    <div class="stat-card">
      <div class="kicker">평균 공부시간</div>
      <div class="num">${avgTime}분</div>
    </div>
  `;
  
  // 진행률 차트
  const ctx1 = document.getElementById("compareChartProgress").getContext("2d");
  if (window.chartCompare1) window.chartCompare1.destroy();
  window.chartCompare1 = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: students.map(s => s.name),
      datasets: [{
        label: "진행률(%)",
        data: students.map(s => s.progress),
        backgroundColor: '#667eea'
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, max: 100 } }
    }
  });
  
  // 공부시간 차트
  const ctx2 = document.getElementById("compareChartTime").getContext("2d");
  if (window.chartCompare2) window.chartCompare2.destroy();
  window.chartCompare2 = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels: students.map(s => s.name),
      datasets: [{
        label: "공부시간(시간)",
        data: students.map(s => s.time),
        backgroundColor: '#764ba2'
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
    });
  } catch (err) {
    alert("학생 비교 데이터 로드에 실패했습니다.");
  }
}

async function renderWarningView() {
  const list = document.getElementById("warningList");
  list.innerHTML = "";

  // 자기 학원 학생만 표시
  const usersSnap = await getDocs(query(
    collection(db, "users"),
    where("role", "==", "student"),
    where("academyId", "==", myData.academyId || "")
  ));

  if (usersSnap.empty) {
    list.innerHTML = '<div class="ghost">학생 데이터가 없습니다.</div>';
    return;
  }

  const warnings = [];
  
  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data();
    
    // 최근 3일 데이터 확인
    const recentKeys = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      recentKeys.push(d.toLocaleDateString('en-CA', { timeZone:'Asia/Seoul' }));
    }
    
    let hasStudied = false;
    let avgProgress = 0;
    let count = 0;
    
    for (const key of recentKeys) {
      const dailySnap = await getDoc(dailyRef(userDoc.id, key));
      if (dailySnap.exists()) {
        const d = dailySnap.data();
        const sec = getEffectiveTimerSecondsForKey(d, key);
        const prog = Number(d.progress) || 0;
        
        if (sec > 0) hasStudied = true;
        avgProgress += prog;
        count++;
      }
    }
    
    avgProgress = count > 0 ? Math.round(avgProgress / count) : 0;
    
    const reasons = [];
    if (!hasStudied) reasons.push("3일 이상 미학습");
    if (avgProgress < 40) reasons.push(`평균 진행률 ${avgProgress}%`);
    
    if (reasons.length > 0) {
      warnings.push({
        uid: userDoc.id,
        userData,
        reasons,
        avgProgress
      });
    }
  }
  
  if (warnings.length === 0) {
    list.innerHTML = '<div class="ghost">위험군 학생이 없습니다. 👍</div>';
    return;
  }
  
  warnings.forEach(w => {
    const card = document.createElement("div");
    card.className = "warning-card";
    card.innerHTML = `
      <div class="warning-badge">⚠️ 주의</div>
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div>
          <strong>${w.userData.name}</strong>
          <span class="badge" style="margin-left:8px;">${w.userData.grade || "-"}</span>
          <div class="kicker" style="margin-top:4px; color:#ff6b6b;">
            ${w.reasons.join(" | ")}
          </div>
        </div>
        <button class="btn btn-outline">상세보기</button>
      </div>
    `;
    
    card.querySelector("button").onclick = () => openStudentModal(w.uid, w.userData);
    list.appendChild(card);
  });
}

let currentStudentData = null;

// 학생의 오늘 과제 목록 로드 (관리자 모달용)
async function loadStudentTasks(uid) {
  const list = document.getElementById("modalTaskList");
  if (!list) return;

  try {
    const tasksSnap = await getDocs(query(tasksCol(uid, getTodayKey()), orderBy("createdAt", "asc")));
    trackRead(tasksSnap.size || 1);

    if (tasksSnap.empty) {
      list.innerHTML = '<div class="ghost">오늘 계획된 과제가 없습니다.</div>';
      return;
    }

    let html = '<div style="display:flex; flex-direction:column; gap:8px;">';
    let completed = 0, total = 0;

    tasksSnap.forEach(doc => {
      const task = doc.data();
      total++;
      if (task.completed) completed++;

      const statusIcon = task.completed ? '✅' : '⬜';
      const textStyle = task.completed ? 'text-decoration:line-through; color:#999;' : '';
      const assignedBadge = task.assignedBy ? '<span style="background:#fef3c7;color:#92400e;font-size:10px;padding:2px 6px;border-radius:4px;margin-left:6px;">지시</span>' : '';

      html += `
        <div class="task-row" style="padding:10px; background:#fff;">
          <span class="badge">${task.subject || '기타'}</span>
          <span style="margin-left:10px; ${textStyle}">${task.title}</span>
          ${assignedBadge}
          <span style="margin-left:auto;">${statusIcon}</span>
        </div>
      `;
    });

    html += '</div>';
    const percent = total > 0 ? Math.round(completed / total * 100) : 0;
    html += `<div class="kicker" style="margin-top:10px;">완료: ${completed}/${total} (${percent}%)</div>`;

    list.innerHTML = html;
  } catch (err) {
    list.innerHTML = '<div class="ghost">과제를 불러오는 중 오류가 발생했습니다.</div>';
  }
}

// 영단어 시험 저장
async function saveEngVocabTest() {
  const totalEl = document.getElementById("modalEngVocabTotal");
  const correctEl = document.getElementById("modalEngVocabCorrect");
  if (!totalEl || !correctEl) return;

  const total = Number(totalEl.value);
  const correct = Number(correctEl.value);

  if (!Number.isInteger(total) || total <= 0) {
    alert("총 문항 수는 1 이상의 정수로 입력하세요.");
    return;
  }
  if (!Number.isInteger(correct) || correct < 0 || correct > total) {
    alert("맞은 개수는 0 이상이며 총 문항 수 이하로 입력하세요.");
    return;
  }

  const uid = currentStudentId;
  if (!uid) { alert("학생 정보가 없습니다."); return; }

  const score = Math.round((correct / total) * 100);
  const wrong = total - correct;

  try {
    await setDoc(dailyRef(uid, getTodayKey()), {}, { merge: true });
    await addDoc(testsCol(uid, getTodayKey()), {
      subject: "영단어",
      score,
      wrongCount: wrong,
      totalCount: total,
      correctCount: correct,
      createdAt: new Date(),
      gradedBy: me.uid,
      gradedByName: myData.name || '관리자'
    });
    trackWrite();

    const modalEngVocabTotal = document.getElementById("modalEngVocabTotal");
    const modalEngVocabCorrect = document.getElementById("modalEngVocabCorrect");
    const modalEngVocabScore = document.getElementById("modalEngVocabScore");
    if (modalEngVocabTotal) modalEngVocabTotal.value = "";
    if (modalEngVocabCorrect) modalEngVocabCorrect.value = "";
    if (modalEngVocabScore) modalEngVocabScore.value = "";

    const successEl = document.getElementById("modalTestSuccess");
    if (successEl) {
      successEl.textContent = "영단어 시험 결과가 저장되었습니다!";
      setTimeout(() => { if (successEl) successEl.textContent = ""; }, 3000);
    }

    // 시험 결과 목록 새로고침
    await loadStudentTestResults(uid);
  } catch (err) {
    alert("저장 중 오류가 발생했습니다.");
  }
}

// 국어 어휘시험 저장
async function saveKorVocabTest() {
  const totalEl = document.getElementById("modalKorVocabTotal");
  const correctEl = document.getElementById("modalKorVocabCorrect");
  if (!totalEl || !correctEl) return;

  const total = Number(totalEl.value);
  const correct = Number(correctEl.value);

  if (!Number.isInteger(total) || total <= 0) {
    alert("총 문항 수는 1 이상의 정수로 입력하세요.");
    return;
  }
  if (!Number.isInteger(correct) || correct < 0 || correct > total) {
    alert("맞은 개수는 0 이상이며 총 문항 수 이하로 입력하세요.");
    return;
  }

  const uid = currentStudentId;
  if (!uid) { alert("학생 정보가 없습니다."); return; }

  const score = Math.round((correct / total) * 100);
  const wrong = total - correct;

  try {
    await setDoc(dailyRef(uid, getTodayKey()), {}, { merge: true });
    await addDoc(testsCol(uid, getTodayKey()), {
      subject: "국어어휘",
      score,
      wrongCount: wrong,
      totalCount: total,
      correctCount: correct,
      createdAt: new Date(),
      gradedBy: me.uid,
      gradedByName: myData.name || '관리자'
    });
    trackWrite();

    const modalKorVocabTotal = document.getElementById("modalKorVocabTotal");
    const modalKorVocabCorrect = document.getElementById("modalKorVocabCorrect");
    const modalKorVocabScore = document.getElementById("modalKorVocabScore");
    if (modalKorVocabTotal) modalKorVocabTotal.value = "";
    if (modalKorVocabCorrect) modalKorVocabCorrect.value = "";
    if (modalKorVocabScore) modalKorVocabScore.value = "";

    const successEl = document.getElementById("modalTestSuccess");
    if (successEl) {
      successEl.textContent = "국어 어휘시험 결과가 저장되었습니다!";
      setTimeout(() => { if (successEl) successEl.textContent = ""; }, 3000);
    }

    // 시험 결과 목록 새로고침
    await loadStudentTestResults(uid);
  } catch (err) {
    alert("저장 중 오류가 발생했습니다.");
  }
}

function updateVocabScore(totalId, correctId, scoreId) {
  const total = Number(document.getElementById(totalId).value);
  const correct = Number(document.getElementById(correctId).value);
  const scoreEl = document.getElementById(scoreId);

  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(correct) || correct < 0) {
    scoreEl.value = "";
    return;
  }

  const boundedCorrect = Math.min(correct, total);
  const score = Math.round((boundedCorrect / total) * 100);
  scoreEl.value = Number.isFinite(score) ? String(score) : "";
}

function getLatestVocabRanges(keys, dailyDataMap) {
  let engRange = "";
  let korRange = "";

  for (let i = keys.length - 1; i >= 0; i--) {
    const d = dailyDataMap.get(keys[i]) || {};
    if (!engRange && d.engVocabRange) engRange = d.engVocabRange;
    if (!korRange && d.korVocabRange) korRange = d.korVocabRange;
    if (engRange && korRange) break;
  }

  return { engRange, korRange };
}

function buildVocabRangeHtml(title, engRange, korRange) {
  if (!engRange && !korRange) return "";

  let html = `<div style="margin-top:12px; padding-top:12px; border-top:1px solid #eee;"><strong>🧾 ${title}</strong></div>`;
  if (engRange) {
    html += `<div class="report-item"><strong>영단어 시험 범위</strong>: ${engRange}</div>`;
  }
  if (korRange) {
    html += `<div class="report-item"><strong>국어 어휘 시험 범위</strong>: ${korRange}</div>`;
  }
  return html;
}

async function saveVocabRanges() {
  const uid = currentStudentId;
  if (!uid) { alert("학생 정보가 없습니다."); return; }

  const engRangeEl = document.getElementById("modalEngVocabRange");
  const korRangeEl = document.getElementById("modalKorVocabRange");
  if (!engRangeEl || !korRangeEl) return;

  const engRange = engRangeEl.value.trim();
  const korRange = korRangeEl.value.trim();

  if (!engRange && !korRange) {
    alert("최소 하나의 범위를 입력하세요.");
    return;
  }

  try {
    await setDoc(dailyRef(uid, getTodayKey()), {
      engVocabRange: engRange,
      korVocabRange: korRange
    }, { merge: true });
    trackWrite();

    const successEl = document.getElementById("modalTestSuccess");
    if (successEl) {
      successEl.textContent = "시험 범위가 저장되었습니다!";
      setTimeout(() => { if (successEl) successEl.textContent = ""; }, 3000);
    }
  } catch (err) {
    alert("저장 중 오류가 발생했습니다.");
  }
}

async function loadVocabRanges(uid) {
  const rangeData = await getDoc(dailyRef(uid, getTodayKey()));
  const data = rangeData.exists() ? rangeData.data() : {};
  const modalEngVocabRange = document.getElementById("modalEngVocabRange");
  const modalKorVocabRange = document.getElementById("modalKorVocabRange");
  if (modalEngVocabRange) modalEngVocabRange.value = data.engVocabRange || "";
  if (modalKorVocabRange) modalKorVocabRange.value = data.korVocabRange || "";
}

// 관리자가 시험 결과 입력 (기타 과목)
async function saveModalTest() {
  const subjEl = document.getElementById("modalTestSubject");
  const totalEl = document.getElementById("modalTestTotal");
  const correctEl = document.getElementById("modalTestCorrect");
  if (!subjEl || !totalEl || !correctEl) return;

  const subj = subjEl.value;
  const total = Number(totalEl.value);
  const correct = Number(correctEl.value);

  if (!Number.isInteger(total) || total <= 0) {
    alert("총 문항 수는 1 이상의 정수로 입력하세요.");
    return;
  }
  if (!Number.isInteger(correct) || correct < 0 || correct > total) {
    alert(`맞은 개수는 0 이상 ${total} 이하로 입력하세요.`);
    return;
  }

  const uid = currentStudentId;
  if (!uid) {
    alert("학생 정보가 없습니다.");
    return;
  }

  const score = Math.round((correct / total) * 100);
  const wrong = total - correct;

  try {
    // daily 문서 생성 (없으면)
    await setDoc(dailyRef(uid, getTodayKey()), {}, { merge: true });

    // testResults에 저장
    await addDoc(testsCol(uid, getTodayKey()), {
      subject: subj,
      score,
      wrongCount: wrong,
      totalCount: total,
      correctCount: correct,
      createdAt: new Date(),
      gradedBy: me.uid,
      gradedByName: myData.name || '관리자'
    });
    trackWrite();

    // 입력 초기화
    const modalTestTotal = document.getElementById("modalTestTotal");
    const modalTestCorrect = document.getElementById("modalTestCorrect");
    const modalTestScore = document.getElementById("modalTestScore");
    if (modalTestTotal) modalTestTotal.value = "";
    if (modalTestCorrect) modalTestCorrect.value = "";
    if (modalTestScore) modalTestScore.value = "";

    // 성공 메시지
    const successEl = document.getElementById("modalTestSuccess");
    if (successEl) {
      successEl.textContent = `${subj}: ${correct}/${total} (${score}%) 저장됨!`;
      setTimeout(() => { if (successEl) successEl.textContent = ""; }, 3000);
    }

    // 시험 결과 목록 새로고침
    await loadStudentTestResults(uid);
  } catch (err) {
    alert("시험 결과 저장 중 오류가 발생했습니다.");
  }
}

// 학생의 오늘 시험 결과 로드 (재시험용)
async function loadStudentTestResults(uid) {
  const studentListEl = document.getElementById("modalStudentTestList");
  const adminListEl = document.getElementById("modalAdminTestList");
  if (!studentListEl || !adminListEl) return;

  try {
    const q = query(testsCol(uid, getTodayKey()), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    trackRead(snap.size || 1);

    // 학생/관리자 기록 분리
    const studentTests = [];
    const adminTests = [];
    snap.forEach(docu => {
      const data = { ...docu.data(), id: docu.id };
      if (data.gradedBy) {
        adminTests.push(data);
      } else {
        studentTests.push(data);
      }
    });

    // 학생이 기록한 시험 렌더링
    if (studentTests.length === 0) {
      studentListEl.innerHTML = '<p class="ghost">학생이 기록한 시험이 없습니다.</p>';
    } else {
      studentListEl.innerHTML = "";
      studentTests.forEach(data => {
        const testId = data.id;
        const time = data.createdAt?.toDate?.()
          ? data.createdAt.toDate().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
          : '';

        const scoreText = data.totalCount
          ? `${data.correctCount}/${data.totalCount} (${data.score}점)`
          : `${data.score}점 / 오답: ${data.wrongCount}개`;

        const row = document.createElement("div");
        row.className = "task-row";
        row.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:10px; background:#f0fdf4; border-radius:8px; margin-bottom:8px; border:1px solid #bbf7d0;";
        row.innerHTML = `
          <div style="flex:1;">
            <strong style="color:#16a34a;">[${data.subject}]</strong>
            ${scoreText}
            <span class="ghost" style="margin-left:8px;">${time}</span>
          </div>
          <button class="btn" style="padding:6px 12px; font-size:12px; background:#ef4444;"
                  onclick="deleteTestResult('${uid}', '${testId}', '${data.subject}')">
            삭제
          </button>
        `;
        studentListEl.appendChild(row);
      });
    }

    // 관리자가 기록한 시험 렌더링
    if (adminTests.length === 0) {
      adminListEl.innerHTML = '<p class="ghost">관리자가 기록한 시험이 없습니다.</p>';
    } else {
      adminListEl.innerHTML = "";
      adminTests.forEach(data => {
        const testId = data.id;
        const time = data.createdAt?.toDate?.()
          ? data.createdAt.toDate().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
          : '';

        // 재시험 결과 표시
        let retestHtml = "";
        if (data.retests && data.retests.length > 0) {
          const retestItems = data.retests.map((r, idx) => {
            const displayText = r.totalCount
              ? `${r.correctCount}/${r.totalCount}(${r.score}%)`
              : `${r.score}점`;
            return `${displayText}<button onclick="deleteRetestResult('${uid}', '${testId}', ${idx}, '${data.subject}')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:11px;padding:0 2px;">✕</button>`;
          }).join(" → ");
          retestHtml = `<span style="color:#22a06b; margin-left:8px;">재시험: ${retestItems}</span>`;
        }

        const scoreText = data.totalCount
          ? `${data.correctCount}/${data.totalCount} (${data.score}%)`
          : `${data.score}점 (오답 ${data.wrongCount}개)`;

        const row = document.createElement("div");
        row.className = "task-row";
        row.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:10px; background:#f8f9fb; border-radius:8px; margin-bottom:8px;";
        row.innerHTML = `
          <div style="flex:1;">
            <strong style="color:#667eea;">[${data.subject}]</strong>
            ${scoreText}
            ${retestHtml}
            <span class="ghost" style="margin-left:8px;">${time}</span>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn" style="padding:6px 12px; font-size:12px; background:#f59e0b;"
                    onclick="openRetestInput('${uid}', '${testId}', '${data.subject}', ${data.score})">
              재시험
            </button>
            <button class="btn" style="padding:6px 12px; font-size:12px; background:#ef4444;"
                    onclick="deleteTestResult('${uid}', '${testId}', '${data.subject}')">
              삭제
            </button>
          </div>
        `;
        adminListEl.appendChild(row);
      });
    }
  } catch (err) {
    studentListEl.innerHTML = '<p class="ghost">시험 결과를 불러오는데 실패했습니다.</p>';
    adminListEl.innerHTML = '<p class="ghost">시험 결과를 불러오는데 실패했습니다.</p>';
  }
}

// 재시험 입력 (prompt 방식) - window에 노출하여 인라인 onclick에서 호출 가능
window.openRetestInput = function(uid, testId, subject, originalScore) {
  const totalStr = prompt(`[${subject}] 재시험 - 총 문항 수를 입력하세요:\n(기존 점수: ${originalScore}점)`);
  if (totalStr === null) return;

  const total = Number(totalStr);
  if (!Number.isInteger(total) || total <= 0) {
    alert("총 문항 수는 1 이상의 정수로 입력하세요.");
    return;
  }

  const correctStr = prompt(`[${subject}] 재시험 - 맞은 개수를 입력하세요 (총 ${total}문항):`);
  if (correctStr === null) return;

  const correct = Number(correctStr);
  if (!Number.isInteger(correct) || correct < 0 || correct > total) {
    alert(`맞은 개수는 0 이상 ${total} 이하로 입력하세요.`);
    return;
  }

  const score = Math.round((correct / total) * 100);
  const wrongCount = total - correct;

  saveRetestScore(uid, testId, score, wrongCount, subject, total, correct);
}

// 재시험 결과 저장
async function saveRetestScore(uid, testId, score, wrongCount, subject, totalCount, correctCount) {
  try {
    const testRef = doc(db, "users", uid, "daily", getTodayKey(), "testResults", testId);
    await updateDoc(testRef, {
      retests: arrayUnion({
        score,
        wrongCount,
        totalCount,
        correctCount,
        testedAt: new Date(),
        gradedBy: me.uid,
        gradedByName: myData.name || '관리자'
      })
    });
    trackWrite();

    alert(`[${subject}] 재시험: ${correctCount}/${totalCount} (${score}%)`);

    // 목록 새로고침
    await loadStudentTestResults(uid);
  } catch (err) {
    alert("재시험 저장 중 오류가 발생했습니다.");
  }
}

// 시험 결과 전체 삭제
window.deleteTestResult = async function(uid, testId, subject) {
  if (!confirm(`[${subject}] 시험 결과를 삭제하시겠습니까?\n(재시험 결과도 함께 삭제됩니다)`)) return;

  try {
    const testRef = doc(db, "users", uid, "daily", getTodayKey(), "testResults", testId);
    await deleteDoc(testRef);
    trackWrite();
    await loadStudentTestResults(uid);
  } catch (err) {
    alert("삭제 중 오류가 발생했습니다.");
  }
};

// 재시험 결과 개별 삭제
window.deleteRetestResult = async function(uid, testId, retestIndex, subject) {
  if (!confirm(`[${subject}] ${retestIndex + 1}번째 재시험 결과를 삭제하시겠습니까?`)) return;

  try {
    const testRef = doc(db, "users", uid, "daily", getTodayKey(), "testResults", testId);
    const testSnap = await getDoc(testRef);
    trackRead();

    if (!testSnap.exists()) {
      alert("시험 결과를 찾을 수 없습니다.");
      return;
    }

    const data = testSnap.data();
    const newRetests = (data.retests || []).filter((_, i) => i !== retestIndex);
    await updateDoc(testRef, { retests: newRetests });
    trackWrite();
    await loadStudentTestResults(uid);
  } catch (err) {
    alert("삭제 중 오류가 발생했습니다.");
  }
};

// ========== 학습 현황 조회 (별도 탭) ==========

let historySelectedStudentId = null;
let historySelectedStudentData = null;

// 학습 현황 탭의 학생 목록 렌더링
async function renderHistoryStudentList() {
  const listEl = document.getElementById("historyStudentList");
  if (!listEl) return;

  listEl.innerHTML = '<div class="ghost">학생 목록을 불러오는 중...</div>';

  try {
    const students = [];
    const q = query(collection(db, "users"), where("role", "==", "student"), where("academyId", "==", myData.academyId));
    const snap = await getDocs(q);
    trackRead(snap.size || 1);

    snap.forEach(d => {
      students.push({ uid: d.id, ...d.data() });
    });

    if (students.length === 0) {
      listEl.innerHTML = '<div class="ghost">등록된 학생이 없습니다.</div>';
      return;
    }

    // 학년별 정렬
    students.sort((a, b) => (a.grade || "").localeCompare(b.grade || "") || (a.name || "").localeCompare(b.name || ""));

    listEl.innerHTML = "";
    students.forEach(s => {
      const item = document.createElement("div");
      item.className = "student-history-item";
      item.style.cssText = "padding:12px; background:#fff; border-radius:8px; margin-bottom:8px; cursor:pointer; border:2px solid transparent; transition:all 0.2s;";
      item.innerHTML = `
        <div style="font-weight:600;">${escapeHtml(s.name)}</div>
        <div style="font-size:12px; color:#666;">${escapeHtml(s.grade || '')}</div>
      `;
      item.onclick = (e) => selectHistoryStudent(s.uid, s, e.currentTarget);

      // 선택된 학생 강조
      if (historySelectedStudentId === s.uid) {
        item.style.borderColor = "#eab308";
        item.style.background = "#fef9c3";
      }

      listEl.appendChild(item);
    });
  } catch (err) {
    listEl.innerHTML = '<div class="ghost" style="color:#ef4444;">목록을 불러오지 못했습니다.</div>';
  }
}

// 학생 선택
function selectHistoryStudent(uid, userData, clickedElement) {
  historySelectedStudentId = uid;
  historySelectedStudentData = userData;

  // 선택 표시 갱신
  document.querySelectorAll(".student-history-item").forEach(el => {
    el.style.borderColor = "transparent";
    el.style.background = "#fff";
  });
  clickedElement.style.borderColor = "#eab308";
  clickedElement.style.background = "#fef9c3";

  // 선택된 학생 표시
  document.getElementById("historySelectedStudent").innerHTML = `
    <div style="background:#fff; padding:16px; border-radius:12px; border:2px solid #eab308;">
      <h3 class="title" style="margin:0;">${escapeHtml(userData.name)} <span style="font-weight:400; font-size:14px; color:#666;">(${escapeHtml(userData.grade || '')})</span></h3>
    </div>
  `;

  // 탭 버튼 및 날짜별 섹션 표시
  document.getElementById("historyTabButtons").style.display = "block";
  document.getElementById("historyDailySection").style.display = "block";
  document.getElementById("historyCumulativeSection").style.display = "none";

  // 날짜별 탭 활성화
  const dailyBtn = document.getElementById("historyTabDailyBtn");
  const cumulativeBtn = document.getElementById("historyTabCumulativeBtn");
  dailyBtn.classList.remove("btn-outline");
  dailyBtn.style.background = "#eab308";
  cumulativeBtn.classList.add("btn-outline");
  cumulativeBtn.style.background = "";

  // 오늘 날짜로 설정
  const datePicker = document.getElementById("historyDatePickerTab");
  if (datePicker) {
    datePicker.value = getTodayKey();
  }

  // 오늘 데이터 로드
  loadStudentLearningHistoryTab(uid, getTodayKey());
}

// 날짜별 학습 현황 로드 (탭용)
async function loadStudentLearningHistoryTab(uid, dateKey) {
  const container = document.getElementById("historyDailyDataTab");
  if (!container) return;

  container.innerHTML = '<p class="ghost">데이터를 불러오는 중...</p>';

  if (!uid || !dateKey) {
    container.innerHTML = '<p class="ghost">학생 정보가 없습니다.</p>';
    return;
  }

  try {
    // 해당 날짜의 daily 문서 가져오기
    const dailyDocRef = doc(db, "users", uid, "daily", dateKey);
    const dailySnap = await getDoc(dailyDocRef);
    trackRead();

    // 해당 날짜의 시험 결과 가져오기
    const testsColRef = collection(db, "users", uid, "daily", dateKey, "testResults");
    const testsSnap = await getDocs(testsColRef);
    trackRead(testsSnap.size || 1);

    // 해당 날짜의 과제 가져오기
    const tasksColRef = collection(db, "users", uid, "daily", dateKey, "tasks");
    const tasksSnap = await getDocs(tasksColRef);
    trackRead(tasksSnap.size || 1);

    if (!dailySnap.exists() && testsSnap.empty && tasksSnap.empty) {
      container.innerHTML = '<p class="ghost">해당 날짜의 학습 기록이 없습니다.</p>';
      return;
    }

    const dailyData = dailySnap.exists() ? dailySnap.data() : {};
    const timerSeconds = dailyData.timerSeconds || 0;
    const progress = dailyData.progress || 0;
    const totalTasks = dailyData.totalTasks || tasksSnap.size || 0;
    const completedTasks = dailyData.completedTasks || 0;

    // 시험 결과 정리
    let testResults = [];
    testsSnap.forEach(d => {
      const data = d.data();
      testResults.push({
        subject: data.subject,
        score: data.score,
        totalCount: data.totalCount,
        correctCount: data.correctCount,
        wrongCount: data.wrongCount,
        retests: data.retests || []
      });
    });

    // 과제 목록 정리
    let tasks = [];
    tasksSnap.forEach(d => {
      const data = d.data();
      tasks.push({
        subject: data.subject,
        title: data.title,
        completed: data.completed
      });
    });

    // HTML 렌더링
    let html = `
      <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:12px; margin-bottom:16px;">
        <div style="background:#fff; padding:12px; border-radius:8px; text-align:center;">
          <div style="font-size:24px; font-weight:700; color:#667eea;">${formatTimer(timerSeconds)}</div>
          <div class="ghost">학습 시간</div>
        </div>
        <div style="background:#fff; padding:12px; border-radius:8px; text-align:center;">
          <div style="font-size:24px; font-weight:700; color:#22a06b;">${progress}%</div>
          <div class="ghost">진행률</div>
        </div>
        <div style="background:#fff; padding:12px; border-radius:8px; text-align:center;">
          <div style="font-size:24px; font-weight:700; color:#f59e0b;">${completedTasks}/${totalTasks}</div>
          <div class="ghost">과제 완료</div>
        </div>
        <div style="background:#fff; padding:12px; border-radius:8px; text-align:center;">
          <div style="font-size:24px; font-weight:700; color:#ef4444;">${testResults.length}</div>
          <div class="ghost">시험 응시</div>
        </div>
      </div>
    `;

    // 시험 결과 상세
    if (testResults.length > 0) {
      html += '<div style="background:#fff; padding:12px; border-radius:8px; margin-bottom:12px;"><strong>📋 시험 결과</strong><ul style="margin:8px 0 0 0; padding-left:20px;">';
      testResults.forEach(t => {
        const scoreText = t.totalCount ? `${t.correctCount}/${t.totalCount} (${t.score}%)` : `${t.score}점`;
        let retestText = '';
        if (t.retests.length > 0) {
          const retestScores = t.retests.map(r => r.totalCount ? `${r.score}%` : `${r.score}점`).join(' → ');
          retestText = ` <span style="color:#22a06b;">재시험: ${retestScores}</span>`;
        }
        html += `<li style="margin:4px 0;"><strong>[${t.subject}]</strong> ${scoreText}${retestText}</li>`;
      });
      html += '</ul></div>';
    }

    // 과제 목록
    if (tasks.length > 0) {
      html += '<div style="background:#fff; padding:12px; border-radius:8px;"><strong>📝 과제 목록</strong><ul style="margin:8px 0 0 0; padding-left:20px;">';
      tasks.forEach(t => {
        const status = t.completed ? '✅' : '⬜';
        html += `<li style="margin:4px 0;">${status} <strong>[${t.subject}]</strong> ${t.title}</li>`;
      });
      html += '</ul></div>';
    }

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = '<p class="ghost" style="color:#ef4444;">데이터를 불러오는데 실패했습니다.</p>';
  }
}

// 누적 학습 현황 로드 (탭용)
async function loadStudentCumulativeStatsTab(uid) {
  const container = document.getElementById("historyCumulativeDataTab");
  if (!container) return;

  container.innerHTML = '<p class="ghost">누적 데이터를 계산하는 중...</p>';

  if (!uid) {
    container.innerHTML = '<p class="ghost">학생 정보가 없습니다.</p>';
    return;
  }

  try {
    // 모든 daily 문서 가져오기
    const dailiesColRef = collection(db, "users", uid, "daily");
    const dailiesSnap = await getDocs(dailiesColRef);
    trackRead(dailiesSnap.size || 1);

    if (dailiesSnap.empty) {
      container.innerHTML = '<p class="ghost">학습 기록이 없습니다.</p>';
      return;
    }

    let totalSeconds = 0;
    let totalProgress = 0;
    let totalCompletedTasks = 0;
    let totalAllTasks = 0;
    let studyDays = 0;
    let testCount = 0;
    let testScoreSum = 0;

    // 각 날짜별 데이터 수집
    for (const dailyDoc of dailiesSnap.docs) {
      const data = dailyDoc.data();
      const dateKey = dailyDoc.id;

      if (data.timerSeconds && data.timerSeconds > 0) {
        totalSeconds += data.timerSeconds;
        studyDays++;
      }
      totalProgress += data.progress || 0;
      totalCompletedTasks += data.completedTasks || 0;
      totalAllTasks += data.totalTasks || 0;

      // 해당 날짜의 시험 결과
      const testsColRef = collection(db, "users", uid, "daily", dateKey, "testResults");
      const testsSnap = await getDocs(testsColRef);
      trackRead(testsSnap.size || 1);
      testsSnap.forEach(t => {
        const td = t.data();
        testCount++;
        testScoreSum += td.score || 0;
      });
    }

    const avgProgress = dailiesSnap.size > 0 ? Math.round(totalProgress / dailiesSnap.size) : 0;
    const avgTestScore = testCount > 0 ? Math.round(testScoreSum / testCount) : 0;

    // HTML 렌더링
    const html = `
      <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:12px;">
        <div style="background:#fff; padding:16px; border-radius:8px; text-align:center;">
          <div style="font-size:28px; font-weight:700; color:#667eea;">${formatTimer(totalSeconds)}</div>
          <div class="ghost">총 학습 시간</div>
        </div>
        <div style="background:#fff; padding:16px; border-radius:8px; text-align:center;">
          <div style="font-size:28px; font-weight:700; color:#22a06b;">${studyDays}일</div>
          <div class="ghost">출석 일수</div>
        </div>
        <div style="background:#fff; padding:16px; border-radius:8px; text-align:center;">
          <div style="font-size:28px; font-weight:700; color:#f59e0b;">${avgProgress}%</div>
          <div class="ghost">평균 진행률</div>
        </div>
        <div style="background:#fff; padding:16px; border-radius:8px; text-align:center;">
          <div style="font-size:28px; font-weight:700; color:#8b5cf6;">${totalCompletedTasks}/${totalAllTasks}</div>
          <div class="ghost">총 과제 완료</div>
        </div>
        <div style="background:#fff; padding:16px; border-radius:8px; text-align:center;">
          <div style="font-size:28px; font-weight:700; color:#ef4444;">${testCount}회</div>
          <div class="ghost">총 시험 응시</div>
        </div>
        <div style="background:#fff; padding:16px; border-radius:8px; text-align:center;">
          <div style="font-size:28px; font-weight:700; color:#06b6d4;">${avgTestScore}점</div>
          <div class="ghost">평균 시험 점수</div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = '<p class="ghost" style="color:#ef4444;">데이터를 불러오는데 실패했습니다.</p>';
  }
}

// 학습 현황 탭 설정 (중복 방지 플래그)
let historyTabsInitialized = false;

function setupHistoryTabEvents() {
  if (historyTabsInitialized) return;

  const dailyBtn = document.getElementById("historyTabDailyBtn");
  const cumulativeBtn = document.getElementById("historyTabCumulativeBtn");
  const dailySection = document.getElementById("historyDailySection");
  const cumulativeSection = document.getElementById("historyCumulativeSection");
  const datePicker = document.getElementById("historyDatePickerTab");

  if (!dailyBtn || !cumulativeBtn) return;

  // 날짜 선택 이벤트
  if (datePicker) {
    datePicker.addEventListener("change", () => {
      if (historySelectedStudentId && datePicker.value) {
        loadStudentLearningHistoryTab(historySelectedStudentId, datePicker.value);
      }
    });
  }

  dailyBtn.addEventListener("click", () => {
    dailyBtn.classList.remove("btn-outline");
    dailyBtn.style.background = "#eab308";
    cumulativeBtn.classList.add("btn-outline");
    cumulativeBtn.style.background = "";
    dailySection.style.display = "block";
    cumulativeSection.style.display = "none";
  });

  cumulativeBtn.addEventListener("click", () => {
    cumulativeBtn.classList.remove("btn-outline");
    cumulativeBtn.style.background = "#eab308";
    dailyBtn.classList.add("btn-outline");
    dailyBtn.style.background = "";
    cumulativeSection.style.display = "block";
    dailySection.style.display = "none";

    // 누적 데이터 로드
    if (historySelectedStudentId) {
      loadStudentCumulativeStatsTab(historySelectedStudentId);
    }
  });

  historyTabsInitialized = true;
}

async function fetchStudentData(uid) {
  const userSnap = await getDoc(doc(db, "users", uid));
  trackRead();
  return userSnap.exists() ? userSnap.data() : null;
}

async function openStudentModal(uid, userData) {
  currentStudentId = uid;
  currentStudentData = userData;
  const studentModal = document.getElementById("studentModal");
  if (studentModal) studentModal.style.display = "block";

  const modalStudentName = document.getElementById("modalStudentName");
  const modalTodayDate = document.getElementById("modalTodayDate");
  if (modalStudentName) modalStudentName.textContent = userData.name;
  if (modalTodayDate) modalTodayDate.textContent = getTodayKey();

  // 학부모 이메일 최신 정보 갱신
  const freshData = await fetchStudentData(uid);
  if (freshData) {
    currentStudentData = freshData;
  }
  const displayData = currentStudentData || userData;

  // 학부모 이메일 표시
  const modalParentEmail = document.getElementById("modalParentEmail");
  if (modalParentEmail) modalParentEmail.textContent = displayData.parentEmail || "(등록되지 않음)";

  // 관리 유형 표시 및 이벤트 설정
  updateModalManagementType(displayData.managementType || "winter");
  setupModalManagementTypeEvents(uid);

  // 주간 리포트 초기화 (이번주로 시작)
  adminWeekOffset = 0;
  updateAdminWeekUI();
  loadAdminWeeklyReport(uid);

  // 주간 탐색 버튼 이벤트
  document.getElementById("prevWeekBtn").onclick = () => changeAdminReportWeek(-1);
  document.getElementById("nextWeekBtn").onclick = () => changeAdminReportWeek(1);

  // 오늘 요약 버튼
  document.getElementById("sendTodayEmailBtn").onclick = () => sendParentEmail(uid, displayData);
  // 주간 리포트 버튼
  document.getElementById("sendWeeklyEmailBtn").onclick = () => sendWeeklyReport(uid, displayData);

  // 오늘 평가 불러오기
  const evalQ = query(evalsCol(uid), where("date", "==", getTodayKey()), limit(1));
  const evalSnap = await getDocs(evalQ);

  if (!evalSnap.empty) {
    const evalData = evalSnap.docs[0].data();
    document.getElementById("evalFocus").value = evalData.focus || "";
    document.getElementById("evalHomework").value = evalData.homework || "";
    document.getElementById("evalAttitude").value = evalData.attitude || "";
    document.getElementById("evalUnderstanding").value = evalData.understanding || "";
    document.getElementById("evalMemo").value = evalData.memo || "";
  } else {
    document.getElementById("evalFocus").value = "";
    document.getElementById("evalHomework").value = "";
    document.getElementById("evalAttitude").value = "";
    document.getElementById("evalUnderstanding").value = "";
    document.getElementById("evalMemo").value = "";
  }

  // 상담 메모 불러오기
  await loadCounselingHistory(uid);

  document.getElementById("evalSuccess").textContent = "";

  // 타이머 원격 제어 설정
  await loadStudentTimer(uid);

  // 오늘의 과제 목록 불러오기
  await loadStudentTasks(uid);

  // 시험 범위 불러오기
  await loadVocabRanges(uid);

  // 오늘의 시험 결과 불러오기 (재시험용)
  await loadStudentTestResults(uid);

  // 시험 결과 저장 버튼 이벤트
  document.getElementById("saveVocabRangeBtn").onclick = saveVocabRanges;
  document.getElementById("saveEngVocabBtn").onclick = saveEngVocabTest;
  document.getElementById("saveKorVocabBtn").onclick = saveKorVocabTest;
  document.getElementById("saveModalTestBtn").onclick = saveModalTest;

  // 점수 자동 계산
  document.getElementById("modalEngVocabTotal").oninput = () => {
    updateVocabScore("modalEngVocabTotal", "modalEngVocabCorrect", "modalEngVocabScore");
  };
  document.getElementById("modalEngVocabCorrect").oninput = () => {
    updateVocabScore("modalEngVocabTotal", "modalEngVocabCorrect", "modalEngVocabScore");
  };
  document.getElementById("modalKorVocabTotal").oninput = () => {
    updateVocabScore("modalKorVocabTotal", "modalKorVocabCorrect", "modalKorVocabScore");
  };
  document.getElementById("modalKorVocabCorrect").oninput = () => {
    updateVocabScore("modalKorVocabTotal", "modalKorVocabCorrect", "modalKorVocabScore");
  };

  // 기타 시험 점수 자동 계산
  document.getElementById("modalTestTotal").oninput = () => {
    updateVocabScore("modalTestTotal", "modalTestCorrect", "modalTestScore");
  };
  document.getElementById("modalTestCorrect").oninput = () => {
    updateVocabScore("modalTestTotal", "modalTestCorrect", "modalTestScore");
  };
}

function closeModal() {
  document.getElementById("studentModal").style.display = "none";
  currentStudentId = null;
  stopModalTimerTick();
  // 타이머 실시간 리스너 해제
  if (unsubStudentTimer) {
    unsubStudentTimer();
    unsubStudentTimer = null;
  }
}

// 학생 타이머 원격 제어
let unsubStudentTimer = null;

async function loadStudentTimer(uid) {
  // 기존 리스너 해제
  if (unsubStudentTimer) {
    unsubStudentTimer();
    unsubStudentTimer = null;
  }

  // 실시간 타이머 상태 감시
  unsubStudentTimer = onSnapshot(dailyRef(uid, getTodayKey()), (snap) => {
    const data = snap.exists() ? snap.data() : {};
    modalTimerSeconds = Number(data.timerSeconds) || 0;
    modalTimerRunning = !!data.timerRunning;
    modalTimerStartedAtMs = getTimestampMs(data.timerStartedAt);
    if (modalTimerRunning && !modalTimerStartedAtMs) {
      modalTimerStartedAtMs = Date.now();
    }

    const liveSeconds = getLiveSeconds(modalTimerSeconds, modalTimerStartedAtMs, modalTimerRunning);
    const modalTimerDisplay = document.getElementById("modalTimerDisplay");
    if (modalTimerDisplay) modalTimerDisplay.textContent = formatTimer(liveSeconds);

    const modalTimerStatus = document.getElementById("modalTimerStatus");
    if (modalTimerStatus) {
      modalTimerStatus.textContent = modalTimerRunning ? "🟢 실행 중" : "⏸️ 정지됨";
      modalTimerStatus.style.color = modalTimerRunning ? "#22a06b" : "#666";
    }

    if (modalTimerRunning) {
      startModalTimerTick();
    } else {
      stopModalTimerTick();
    }
  });

  // 버튼 이벤트 연결
  const modalTimerStartBtn = document.getElementById("modalTimerStartBtn");
  const modalTimerPauseBtn = document.getElementById("modalTimerPauseBtn");
  const modalTimerResetBtn = document.getElementById("modalTimerResetBtn");
  if (modalTimerStartBtn) modalTimerStartBtn.onclick = () => remoteTimerStart(uid);
  if (modalTimerPauseBtn) modalTimerPauseBtn.onclick = () => remoteTimerPause(uid);
  if (modalTimerResetBtn) modalTimerResetBtn.onclick = () => remoteTimerReset(uid);
}

async function remoteTimerStart(uid) {
  try {
    const snap = await getDoc(dailyRef(uid, getTodayKey()));
    const data = snap.exists() ? snap.data() : {};
    if (data.timerRunning) return;
    const baseSeconds = Number(data.timerSeconds) || 0;
    await setDoc(dailyRef(uid, getTodayKey()), {
      timerRunning: true,
      timerStartedAt: new Date(),
      timerSeconds: baseSeconds,
      timerControlledBy: me.uid
    }, { merge: true });
    trackWrite();
  } catch (err) {
    alert("타이머 시작 실패: " + err.message);
  }
}

async function remoteTimerPause(uid) {
  try {
    const snap = await getDoc(dailyRef(uid, getTodayKey()));
    const data = snap.exists() ? snap.data() : {};
    const liveSeconds = getLiveSecondsFromData(data);
    await setDoc(dailyRef(uid, getTodayKey()), {
      timerSeconds: liveSeconds,
      timerRunning: false,
      timerStartedAt: null,
      timerPausedAt: new Date(),
      timerControlledBy: me.uid
    }, { merge: true });
    trackWrite();
  } catch (err) {
    alert("타이머 정지 실패: " + err.message);
  }
}

async function remoteTimerReset(uid) {
  if (!confirm("이 학생의 오늘 타이머를 0으로 초기화할까요?")) return;
  try {
    await setDoc(dailyRef(uid, getTodayKey()), {
      timerSeconds: 0,
      timerRunning: false,
      timerStartedAt: null,
      timerResetAt: new Date(),
      timerControlledBy: me.uid
    }, { merge: true });
    trackWrite();
  } catch (err) {
    alert("타이머 초기화 실패: " + err.message);
  }
}

async function saveEvaluation() {
  if (!currentStudentId) return;
  
  const focus = document.getElementById("evalFocus").value;
  const homework = document.getElementById("evalHomework").value;
  const attitude = document.getElementById("evalAttitude").value;
  const understanding = document.getElementById("evalUnderstanding").value;
  const memo = document.getElementById("evalMemo").value;
  
  if (!focus && !homework && !attitude && !understanding && !memo) {
    alert("최소 하나 이상의 항목을 선택하거나 메모를 입력하세요.");
    return;
  }
  
  const evalData = {
    date: getTodayKey(),
    focus,
    homework,
    attitude,
    understanding,
    memo,
    evaluatedBy: me.uid,
    evaluatedAt: new Date()
  };
  
  await addDoc(evalsCol(currentStudentId), evalData);
  
  document.getElementById("evalSuccess").textContent = "✓ 평가가 저장되었습니다!";
  setTimeout(() => {
    document.getElementById("evalSuccess").textContent = "";
  }, 2000);
}

async function addTaskToStudent() {
  if (!currentStudentId) {
    alert("학생이 선택되지 않았습니다.");
    return;
  }

  const subject = document.getElementById("taskSubject").value.trim();
  const title = document.getElementById("adminTaskTitle").value.trim();

  if (!subject || !title) {
    alert("과목과 항목 내용을 모두 입력하세요.");
    return;
  }

  try {
    await setDoc(dailyRef(currentStudentId, getTodayKey()), {}, { merge: true });
    await addDoc(tasksCol(currentStudentId, getTodayKey()), {
      subject,
      title,
      completed: false,
      createdAt: new Date(),
      assignedBy: me.uid
    });
    trackWrite(2);

    await recalcProgressAndSave(currentStudentId, getTodayKey());

    document.getElementById("taskSubject").value = "";
    document.getElementById("adminTaskTitle").value = "";

    alert("학습 지시가 추가되었습니다!");
  } catch (err) {
    alert("학습 지시 추가 실패: " + err.message);
  }
}

async function saveCounseling() {
  if (!currentStudentId) return;

  const memo = document.getElementById("counselMemo").value.trim();
  if (!memo) {
    alert("메모를 입력하세요.");
    return;
  }

  await addDoc(counselCol(currentStudentId), {
    memo,
    counseledBy: me.uid,
    counseledByName: myData.name || "관리자",
    counseledAt: new Date(),
    date: getTodayKey()
  });
  trackWrite();

  document.getElementById("counselMemo").value = "";
  await loadCounselingHistory(currentStudentId);

  alert("상담 메모가 저장되었습니다!");
}

async function renderDailyReport() {
  const today = getTodayKey();
  // 오늘의 데이터 가져오기
  const dailySnap = await getDoc(dailyRef(me.uid, today));
  const dailyData = dailySnap.exists() ? dailySnap.data() : {};

  // 제목 업데이트
  document.querySelector("#reportWrap h3.title").textContent = "📊 오늘의 AI 학습 리포트";
  document.getElementById("reportWeekRange").textContent = today;

  // 오늘의 평가 데이터 수집
  let todayEval = null;
  try {
    const evalQ = query(
      evalsCol(me.uid),
      where("date", "==", today)
    );
    const evalSnap = await getDocs(evalQ);
    if (!evalSnap.empty) {
      // 가장 최근 평가 선택 (클라이언트에서 정렬)
      const evals = evalSnap.docs.map(d => d.data());
      evals.sort((a, b) => {
        const timeA = a.evaluatedAt?.toDate?.() || new Date(0);
        const timeB = b.evaluatedAt?.toDate?.() || new Date(0);
        return timeB - timeA;
      });
      todayEval = evals[0];
    }
  } catch (evalErr) {
  }

  // 오늘의 시험 결과 수집
  const testQ = query(testsCol(me.uid, today));
  const testSnap = await getDocs(testQ);
  const testScores = {};
  testSnap.forEach(docu => {
    const t = docu.data();
    if (!testScores[t.subject]) testScores[t.subject] = [];
    testScores[t.subject].push({ score: t.score, wrong: t.wrongCount });
  });

  // 오늘의 과목별 학습 항목 수집
  const tasksQ = query(tasksCol(me.uid, today));
  const tasksSnap = await getDocs(tasksQ);
  const subjectTasks = {};
  tasksSnap.forEach(docu => {
    const task = docu.data();
    const subj = task.subject || "기타";
    if (!subjectTasks[subj]) subjectTasks[subj] = { total: 0, completed: 0 };
    subjectTasks[subj].total++;
    if (task.completed) subjectTasks[subj].completed++;
  });

  // 통계 계산
  const timerSec = getEffectiveTimerSecondsForKey(dailyData, today);
  const progress = Number(dailyData.progress) || 0;
  const totalTasks = Number(dailyData.totalTasks) || 0;
  const completedTasks = Number(dailyData.completedTasks) || 0;

  const hours = Math.floor(timerSec / 3600);
  const mins = Math.floor((timerSec % 3600) / 60);

  // 📈 오늘의 학습 통계
  document.getElementById("reportStats").innerHTML = `
    <div class="stat-card">
      <div class="kicker">오늘 공부시간</div>
      <div class="num">${hours}시간 ${mins}분</div>
    </div>
    <div class="stat-card">
      <div class="kicker">진행률</div>
      <div class="num">${progress}%</div>
    </div>
    <div class="stat-card">
      <div class="kicker">완료/전체 과제</div>
      <div class="num">${completedTasks} / ${totalTasks}</div>
    </div>
    <div class="stat-card">
      <div class="kicker">시험 응시</div>
      <div class="num">${testSnap.size}회</div>
    </div>
  `;

  // ✨ AI 종합 평가
  let summary = "";
  if (progress >= 90 && timerSec >= 3600) {
    summary = "🎉 <strong>완벽한 하루!</strong> 오늘은 정말 열심히 공부했어요. 이런 날이 쌓이면 큰 발전이 됩니다!";
  } else if (progress >= 80) {
    summary = "👍 <strong>훌륭해요!</strong> 오늘 목표를 잘 달성했습니다. 내일도 이대로 화이팅!";
  } else if (progress >= 60) {
    summary = "😊 <strong>괜찮아요!</strong> 오늘도 학습을 위해 노력했네요. 조금만 더 집중하면 더 좋을 거예요.";
  } else if (timerSec > 0) {
    summary = "💪 <strong>시작이 반!</strong> 오늘 공부를 시작했다는 것이 중요합니다. 내일은 더 완성도 있게 해봐요.";
  } else {
    summary = "📚 <strong>내일은 파이팅!</strong> 오늘은 쉬는 날이었나요? 내일은 작은 목표부터 시작해봐요!";
  }
  document.getElementById("reportSummary").innerHTML = `<div style="font-size:16px; line-height:1.6;">${summary}</div>`;

  // 🎯 오늘의 개선점
  const weaknesses = [];

  Object.keys(testScores).forEach(subj => {
    const scores = testScores[subj];
    const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
    const totalWrong = scores.reduce((sum, s) => sum + s.wrongCount, 0);

    if (avgScore < 70) {
      weaknesses.push(`<div class="report-item"><strong>${subj}</strong>: 평균 ${Math.round(avgScore)}점 - 개념 이해가 부족해 보입니다. 기본부터 다시 점검하세요.</div>`);
    }

    if (totalWrong > 5) {
      weaknesses.push(`<div class="report-item"><strong>${subj}</strong>: 오답 ${totalWrong}개 - 틀린 문제를 다시 풀어보세요.</div>`);
    }
  });

  if (progress < 70 && totalTasks > 0) {
    weaknesses.push(`<div class="report-item"><strong>과제 완성도</strong>: ${progress}% - 계획한 과제를 더 많이 완료해보세요.</div>`);
  }

  if (timerSec < 1800) {
    weaknesses.push(`<div class="report-item"><strong>학습 시간</strong>: ${mins}분 - 최소 30분 이상 집중해서 공부하는 시간을 확보하세요.</div>`);
  }

  document.getElementById("reportWeakness").innerHTML =
    weaknesses.length > 0 ? weaknesses.join('') : '<div class="ghost">오늘은 특별한 개선점이 없습니다! 👍</div>';

  // 📚 과목별 학습 현황
  let subjectsHtml = '';
  if (Object.keys(subjectTasks).length > 0) {
    Object.keys(subjectTasks).forEach(subj => {
      const info = subjectTasks[subj];
      const rate = info.total > 0 ? Math.round((info.completed / info.total) * 100) : 0;
      const icon = rate >= 80 ? "✅" : rate >= 50 ? "🔶" : "❌";

      subjectsHtml += `
        <div class="report-item">
          ${icon} <strong>${subj}</strong>: ${info.completed}/${info.total} 완료 (${rate}%)
        </div>
      `;
    });

    // 시험 결과도 추가
    if (Object.keys(testScores).length > 0) {
      subjectsHtml += '<div style="margin-top:12px; padding-top:12px; border-top:1px solid #eee;"><strong>📝 오늘의 시험 결과</strong></div>';
      Object.keys(testScores).forEach(subj => {
        const scores = testScores[subj];
        const avgScore = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);
        const icon = avgScore >= 90 ? "🌟" : avgScore >= 80 ? "😊" : avgScore >= 70 ? "😐" : "😢";

        subjectsHtml += `
          <div class="report-item">
            ${icon} <strong>${subj}</strong>: 평균 ${avgScore}점 (${scores.length}회)
          </div>
        `;
      });
    }

    subjectsHtml += buildVocabRangeHtml(
      "오늘의 시험 범위",
      dailyData.engVocabRange || "",
      dailyData.korVocabRange || ""
    );
  } else {
    subjectsHtml = '<div class="ghost">오늘 학습 항목이 없습니다.</div>';
    subjectsHtml += buildVocabRangeHtml(
      "오늘의 시험 범위",
      dailyData.engVocabRange || "",
      dailyData.korVocabRange || ""
    );
  }
  document.getElementById("reportSubjects").innerHTML = subjectsHtml;

  // ⏰ 오늘의 학습 패턴
  let routineHtml = '';
  if (timerSec > 0) {
    routineHtml = `
      <div class="report-item">
        ⏱️ <strong>총 학습 시간</strong>: ${hours}시간 ${mins}분
      </div>
      <div class="report-item">
        📊 <strong>과제 달성률</strong>: ${progress}%
      </div>
      <div class="report-item">
        ✍️ <strong>학습한 과목</strong>: ${Object.keys(subjectTasks).join(", ") || "없음"}
      </div>
    `;
  } else {
    routineHtml = '<div class="ghost">오늘은 학습 기록이 없습니다.</div>';
  }
  document.getElementById("reportRoutine").innerHTML = routineHtml;

  // 🤖 AI 종합 학습 평가
  const tardinessData = dailyData.tardiness || {};
  const aiEval = generateAIEvaluation({
    studyMinutes: Math.floor(timerSec / 60),
    studyDays: 1,
    progress,
    completedTasks,
    totalTasks,
    testScores,
    tardinessCount: tardinessData.lateMinutes ? 1 : 0,
    tardinessMinutes: tardinessData.lateMinutes || 0,
    evaluations: todayEval ? [todayEval] : [],
    type: "daily"
  });
  document.getElementById("reportTeacherEval").innerHTML = aiEval.html;

  // 📝 내일의 학습 계획
  const plans = [];

  if (timerSec < 3600) {
    plans.push(`<div class="report-item">⏰ <strong>학습 시간 늘리기</strong>: 내일은 최소 1시간 이상 집중해서 공부해보세요.</div>`);
  }

  if (progress < 80 && totalTasks > 0) {
    plans.push(`<div class="report-item">✅ <strong>완성도 높이기</strong>: 계획한 과제를 최대한 많이 완료하는 것을 목표로 하세요.</div>`);
  }

  Object.keys(testScores).forEach(subj => {
    const scores = testScores[subj];
    const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;

    if (avgScore < 70) {
      plans.push(`<div class="report-item">📖 <strong>${subj} 복습</strong>: 틀린 문제를 다시 풀고 개념을 정리하세요.</div>`);
    }
  });

  if (Object.keys(subjectTasks).length < 2) {
    plans.push(`<div class="report-item">📚 <strong>과목 다양화</strong>: 여러 과목을 골고루 공부하면 더 좋습니다.</div>`);
  }

  if (plans.length === 0) {
    plans.push(`<div class="report-item">🎯 <strong>오늘처럼!</strong> 오늘과 같은 패턴으로 내일도 열심히 해봐요!</div>`);
  }

  document.getElementById("reportPlan").innerHTML = plans.join('');
  document.querySelector("#reportPlan").parentElement.querySelector("h4").textContent = "📝 내일의 학습 계획";

  // 💡 개선 제안
  const suggestions = [];

  if (todayEval) {
    const gradeToNum = { "상": 3, "중": 2, "하": 1 };
    const lowItems = [];

    if (todayEval.focus && gradeToNum[todayEval.focus] < 2) lowItems.push("집중력");
    if (todayEval.homework && gradeToNum[todayEval.homework] < 2) lowItems.push("숙제 완성도");
    if (todayEval.attitude && gradeToNum[todayEval.attitude] < 2) lowItems.push("학습 태도");
    if (todayEval.understanding && gradeToNum[todayEval.understanding] < 2) lowItems.push("이해도");

    if (lowItems.length > 0) {
      suggestions.push(`<div class="report-item">선생님 평가에서 <strong>${lowItems.join(", ")}</strong> 부분이 낮았어요. 특별히 신경 써보세요.</div>`);
    }
  }

  if (progress < 50 && totalTasks > 3) {
    suggestions.push(`<div class="report-item">과제를 너무 많이 계획한 것 같아요. 현실적인 양으로 조정해보세요.</div>`);
  }

  if (timerSec === 0 && totalTasks > 0) {
    suggestions.push(`<div class="report-item">타이머를 사용하지 않았네요. 타이머를 켜고 공부하면 집중도가 높아집니다!</div>`);
  }

  if (suggestions.length === 0) {
    suggestions.push(`<div class="report-item">오늘 학습 패턴이 좋습니다! 계속 유지하세요. 👍</div>`);
  }

  document.getElementById("reportSuggestions").innerHTML = suggestions.join('');

  // 🌟 오늘의 칭찬
  const strengths = [];

  if (progress >= 90) {
    strengths.push(`<div class="report-item">✨ <strong>완벽한 달성!</strong> 오늘 목표를 거의 다 이뤘어요. 정말 대단합니다!</div>`);
  }

  if (timerSec >= 7200) {
    strengths.push(`<div class="report-item">💪 <strong>엄청난 노력!</strong> 2시간 이상 집중해서 공부했어요. 훌륭합니다!</div>`);
  }

  if (completedTasks >= 5) {
    strengths.push(`<div class="report-item">🎯 <strong>과제 킬러!</strong> ${completedTasks}개의 과제를 완료했어요. 실행력이 뛰어나네요!</div>`);
  }

  Object.keys(testScores).forEach(subj => {
    const scores = testScores[subj];
    const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;

    if (avgScore >= 90) {
      strengths.push(`<div class="report-item">🌟 <strong>${subj} 우수!</strong> 평균 ${Math.round(avgScore)}점으로 훌륭한 성적을 냈어요!</div>`);
    }
  });

  if (Object.keys(subjectTasks).length >= 3) {
    strengths.push(`<div class="report-item">📚 <strong>균형잡힌 학습!</strong> ${Object.keys(subjectTasks).length}개 과목을 골고루 공부했어요.</div>`);
  }

  if (strengths.length === 0) {
    strengths.push(`<div class="report-item">💫 <strong>노력하는 모습!</strong> 오늘도 학습을 위해 시간을 투자했어요. 이런 작은 노력이 쌓여 큰 발전을 만듭니다!</div>`);
  }

  document.getElementById("reportStrengths").innerHTML = strengths.join('');
}

async function renderWeeklyReport() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const weekKeys = [];
  for (let d = new Date(monday); d <= sunday; d.setDate(d.getDate() + 1)) {
    weekKeys.push(d.toLocaleDateString('en-CA', { timeZone:'Asia/Seoul' }));
  }

  // 제목 업데이트
  document.querySelector("#reportWrap h3.title").textContent = "📊 이번 주 AI 학습 리포트";
  document.getElementById("reportWeekRange").textContent = `${weekKeys[0]} ~ ${weekKeys[6]}`;
  
  // 일별 데이터 수집
  const dailyDataMap = new Map();
  for (const key of weekKeys) {
    const dailySnap = await getDoc(dailyRef(me.uid, key));
    if (dailySnap.exists()) {
      dailyDataMap.set(key, dailySnap.data());
    }
  }
  const weekRanges = getLatestVocabRanges(weekKeys, dailyDataMap);
  
  // 평가 데이터 수집
  let evals = [];
  try {
    const evalQ = query(evalsCol(me.uid));
    const evalSnap = await getDocs(evalQ);
    evalSnap.forEach(docu => {
      const data = docu.data();
      if (data.date >= weekKeys[0] && data.date <= weekKeys[6]) {
        evals.push(data);
      }
    });
    evals.sort((a, b) => a.date.localeCompare(b.date));
  } catch (evalErr) {
  }
  
  // 시험 데이터 수집
  const testScores = {};
  for (const key of weekKeys) {
    const testQ = query(testsCol(me.uid, key));
    const testSnap = await getDocs(testQ);
    testSnap.forEach(docu => {
      const t = docu.data();
      if (!testScores[t.subject]) testScores[t.subject] = [];
      testScores[t.subject].push({ score: t.score, wrong: t.wrongCount, date: key });
    });
  }
  
  // 통계 계산
  let totalTime = 0, totalProgress = 0, count = 0;
  let totalTasks = 0, completedTasks = 0;
  let studyDays = 0;
  
  weekKeys.forEach(key => {
    const d = dailyDataMap.get(key) || {};
    const sec = getEffectiveTimerSecondsForKey(d, key);
    const prog = Number(d.progress) || 0;
    const tot = Number(d.totalTasks) || 0;
    const com = Number(d.completedTasks) || 0;
    
    if (sec > 0) studyDays++;
    totalTime += sec;
    totalProgress += prog;
    count++;
    totalTasks += tot;
    completedTasks += com;
  });

  // 지각 통계 계산
  let tardinessCount = 0;
  let tardinessMinutes = 0;
  weekKeys.forEach(key => {
    const d = dailyDataMap.get(key);
    if (d && d.tardiness && d.tardiness.lateMinutes) {
      tardinessCount++;
      tardinessMinutes += d.tardiness.lateMinutes;
    }
  });

  const avgProgress = count > 0 ? Math.round(totalProgress / count) : 0;
  const hours = Math.floor(totalTime / 3600);
  const mins = Math.floor((totalTime % 3600) / 60);
  const avgTimePerDay = count > 0 ? Math.round(totalTime / count / 60) : 0;
  
  // 📈 학습 통계
  document.getElementById("reportStats").innerHTML = `
    <div class="stat-card">
      <div class="kicker">총 공부시간</div>
      <div class="num">${hours}시간 ${mins}분</div>
    </div>
    <div class="stat-card">
      <div class="kicker">공부한 날</div>
      <div class="num">${studyDays}일</div>
    </div>
    <div class="stat-card">
      <div class="kicker">평균 진행률</div>
      <div class="num">${avgProgress}%</div>
    </div>
    <div class="stat-card">
      <div class="kicker">완료/전체 과제</div>
      <div class="num">${completedTasks} / ${totalTasks}</div>
    </div>
    <div class="stat-card">
      <div class="kicker">하루 평균 공부</div>
      <div class="num">${avgTimePerDay}분</div>
    </div>
    <div class="stat-card" style="${tardinessCount > 0 ? 'background:#fff5f5; border-color:#ff6b6b;' : 'background:#f0fff4; border-color:#22a06b;'}">
      <div class="kicker">지각 현황</div>
      <div class="num" style="color:${tardinessCount > 0 ? '#ff6b6b' : '#22a06b'};">${tardinessCount > 0 ? tardinessCount + '회 (' + tardinessMinutes + '분)' : '없음 ✓'}</div>
    </div>
  `;
  
  // ✨ AI 종합 평가
  let summary = "";
  if (avgProgress >= 80 && studyDays >= 6) {
    summary = "🎉 <strong>최고예요!</strong> 이번 주는 완벽한 한 주였습니다. 계획적이고 성실한 학습 태도가 돋보입니다.";
  } else if (avgProgress >= 80) {
    summary = "🎉 <strong>훌륭해요!</strong> 목표 달성률이 매우 높습니다. 조금 더 자주 공부한다면 완벽합니다!";
  } else if (avgProgress >= 60) {
    summary = "👍 <strong>잘했어요!</strong> 꾸준히 학습하고 있습니다. 조금만 더 집중하면 더 좋은 결과를 얻을 수 있어요.";
  } else if (avgProgress >= 40) {
    summary = "💪 <strong>노력이 필요해요.</strong> 목표 달성을 위해 좀 더 집중이 필요합니다. 계획을 세분화해보세요.";
  } else {
    summary = "⚠️ <strong>분발이 필요해요.</strong> 이번 주는 학습량이 부족했습니다. 작은 목표부터 차근차근 시작해봐요!";
  }
  document.getElementById("reportSummary").innerHTML = `<div style="font-size:16px; line-height:1.6;">${summary}</div>`;
  
  // 🎯 AI 약점 분석
  const weaknesses = [];
  
  Object.keys(testScores).forEach(subj => {
    const scores = testScores[subj];
    const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
    const totalWrong = scores.reduce((sum, s) => sum + s.wrongCount, 0);
    
    if (avgScore < 70) {
      weaknesses.push(`<div class="report-item"><strong>${subj}</strong>: 평균 ${Math.round(avgScore)}점 - 기본 개념 복습이 시급합니다. 교과서를 다시 정독하고 기본 문제부터 풀어보세요.</div>`);
    } else if (avgScore < 85) {
      weaknesses.push(`<div class="report-item"><strong>${subj}</strong>: 평균 ${Math.round(avgScore)}점 - 기본은 잘 잡혔으나 심화 학습이 필요합니다. 난이도 높은 문제를 도전해보세요.</div>`);
    }
    
    if (totalWrong > 10) {
      weaknesses.push(`<div class="report-item"><strong>${subj}</strong>: 오답 ${totalWrong}개 누적 - 오답 노트를 만들어 틀린 문제를 다시 풀어보세요.</div>`);
    }
  });
  
  if (avgProgress < 70) {
    weaknesses.push(`<div class="report-item"><strong>학습 완성도</strong>: 평균 ${avgProgress}% - 계획한 과제를 끝까지 완료하는 습관이 필요합니다.</div>`);
  }
  
  if (studyDays < 5) {
    weaknesses.push(`<div class="report-item"><strong>학습 빈도</strong>: 주 ${studyDays}일 - 매일 조금씩 공부하는 것이 집중해서 한꺼번에 하는 것보다 효과적입니다.</div>`);
  }
  
  if (avgTimePerDay < 60) {
    weaknesses.push(`<div class="report-item"><strong>학습 시간</strong>: 하루 평균 ${avgTimePerDay}분 - 최소 1시간 이상 집중해서 공부하는 시간을 확보하세요.</div>`);
  }

  if (tardinessCount >= 2) {
    weaknesses.push(`<div class="report-item" style="background:#fff5f5;"><strong>⏰ 지각</strong>: 주 ${tardinessCount}회 (총 ${tardinessMinutes}분) - 정해진 시간에 학습을 시작하는 습관이 필요합니다.</div>`);
  }

  document.getElementById("reportWeakness").innerHTML =
    weaknesses.length > 0 ? weaknesses.join('') : '<div class="ghost">특별한 약점이 발견되지 않았습니다! 👍</div>';
  
  // 📚 과목별 성취도
  let subjectsHtml = '';
  if (Object.keys(testScores).length > 0) {
    Object.keys(testScores).forEach(subj => {
      const scores = testScores[subj];
      const avgScore = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);
      const trend = scores.length > 1 ? (scores[scores.length - 1].score - scores[0].score) : 0;
      const trendIcon = trend > 0 ? "📈" : trend < 0 ? "📉" : "➡️";
      const trendText = trend > 0 ? `+${trend}점 상승` : trend < 0 ? `${trend}점 하락` : "변동 없음";
      
      subjectsHtml += `
        <div class="report-item">
          <strong>${subj}</strong>: 평균 ${avgScore}점 ${trendIcon} ${trendText}
          <div class="kicker" style="margin-top:4px;">시험 횟수: ${scores.length}회</div>
        </div>
      `;
    });
  } else {
    subjectsHtml = '<div class="ghost">이번 주 시험 결과가 없습니다.</div>';
  }
  subjectsHtml += buildVocabRangeHtml("이번 주 시험 범위 (최근 입력)", weekRanges.engRange, weekRanges.korRange);
  document.getElementById("reportSubjects").innerHTML = subjectsHtml;

  // ⚖️ 과목별 학습 밸런스
  const subjectTaskCounts = {};
  let totalTasksAcrossSubjects = 0;

  // 주간 모든 과제를 과목별로 수집
  for (const key of weekKeys) {
    const tasksQ = query(tasksCol(me.uid, key));
    const tasksSnap = await getDocs(tasksQ);
    tasksSnap.forEach(docu => {
      const task = docu.data();
      const subj = task.subject || "기타";
      if (subj !== "모든 과목") {
        if (!subjectTaskCounts[subj]) {
          subjectTaskCounts[subj] = { total: 0, completed: 0 };
        }
        subjectTaskCounts[subj].total++;
        totalTasksAcrossSubjects++;
        if (task.completed) {
          subjectTaskCounts[subj].completed++;
        }
      }
    });
  }

  let balanceHtml = '';
  if (Object.keys(subjectTaskCounts).length > 0) {
    // 각 과목의 비율 계산 및 표시
    const sortedSubjects = Object.keys(subjectTaskCounts).sort((a, b) =>
      subjectTaskCounts[b].total - subjectTaskCounts[a].total
    );

    sortedSubjects.forEach(subj => {
      const info = subjectTaskCounts[subj];
      const percentage = totalTasksAcrossSubjects > 0
        ? Math.round((info.total / totalTasksAcrossSubjects) * 100)
        : 0;
      const completionRate = info.total > 0
        ? Math.round((info.completed / info.total) * 100)
        : 0;

      // 밸런스 평가
      let balanceIcon = "⚪";
      let balanceNote = "";

      if (percentage >= 40) {
        balanceIcon = "🔴";
        balanceNote = " (과집중)";
      } else if (percentage >= 25) {
        balanceIcon = "🟡";
        balanceNote = " (높은 비중)";
      } else if (percentage >= 15) {
        balanceIcon = "🟢";
        balanceNote = " (적정)";
      } else if (percentage >= 5) {
        balanceIcon = "🔵";
        balanceNote = " (낮은 비중)";
      } else {
        balanceIcon = "⚪";
        balanceNote = " (미미한 비중)";
      }

      balanceHtml += `
        <div class="report-item">
          ${balanceIcon} <strong>${subj}</strong>: ${info.completed}/${info.total}개 (전체의 ${percentage}%${balanceNote})
          <div class="kicker" style="margin-top:4px;">완료율: ${completionRate}%</div>
        </div>
      `;
    });

    // 밸런스 분석 및 제안
    balanceHtml += '<div style="margin-top:16px; padding-top:16px; border-top:1px solid #eee;"><strong>📊 밸런스 분석</strong></div>';

    const numSubjects = sortedSubjects.length;
    const idealPercentage = numSubjects > 0 ? Math.round(100 / numSubjects) : 0;
    const maxSubject = sortedSubjects[0];
    const maxPercentage = totalTasksAcrossSubjects > 0
      ? Math.round((subjectTaskCounts[maxSubject].total / totalTasksAcrossSubjects) * 100)
      : 0;

    if (numSubjects === 1) {
      balanceHtml += `<div class="report-item">이번 주는 <strong>${maxSubject}</strong>만 집중적으로 학습했습니다. 다른 과목도 골고루 학습하는 것을 권장합니다.</div>`;
    } else if (maxPercentage >= 40) {
      balanceHtml += `<div class="report-item">⚠️ <strong>${maxSubject}</strong>에 과도하게 집중했습니다 (${maxPercentage}%). 다른 과목에도 시간을 배분하세요.</div>`;
    } else if (numSubjects >= 4) {
      balanceHtml += `<div class="report-item">✅ ${numSubjects}개 과목을 골고루 학습했습니다. 균형잡힌 학습 패턴입니다!</div>`;
    } else if (numSubjects >= 2) {
      const neglectedSubjects = ["국어", "영어", "수학", "과학", "사회"].filter(
        s => !subjectTaskCounts[s]
      );
      if (neglectedSubjects.length > 0) {
        balanceHtml += `<div class="report-item">💡 <strong>${neglectedSubjects.join(", ")}</strong> 과목이 소홀했습니다. 다음 주에는 이 과목들도 포함해보세요.</div>`;
      }
    }

    // 완료율이 낮은 과목 경고
    sortedSubjects.forEach(subj => {
      const info = subjectTaskCounts[subj];
      const completionRate = info.total > 0 ? Math.round((info.completed / info.total) * 100) : 0;
      const percentage = totalTasksAcrossSubjects > 0
        ? Math.round((info.total / totalTasksAcrossSubjects) * 100)
        : 0;

      if (completionRate < 50 && percentage >= 15) {
        balanceHtml += `<div class="report-item">⚠️ <strong>${subj}</strong> 완료율이 ${completionRate}%로 낮습니다. 계획을 재조정하거나 더 집중하세요.</div>`;
      }
    });

  } else {
    balanceHtml = '<div class="ghost">이번 주 과목별 학습 항목이 없습니다.</div>';
  }
  document.getElementById("reportBalance").innerHTML = balanceHtml;

  // ⏰ 학습 루틴 분석
  let routineHtml = '';
  const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
  weekKeys.forEach((key, idx) => {
    const d = dailyDataMap.get(key) || {};
    const sec = getEffectiveTimerSecondsForKey(d, key);
    const prog = Number(d.progress) || 0;
    const hours = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    
    const icon = sec > 0 ? "✅" : "❌";
    routineHtml += `
      <div class="report-item">
        ${icon} <strong>${key} (${dayLabels[idx]})</strong>: 
        ${hours}시간 ${mins}분 / 진행률 ${prog}%
      </div>
    `;
  });
  document.getElementById("reportRoutine").innerHTML = routineHtml;
  
  // 👨‍🏫 선생님 평가
  if (evals.length === 0) {
    document.getElementById("reportTeacherEval").innerHTML = '<div class="ghost">선생님 평가가 아직 없습니다.</div>';
  } else {
    const gradeToNum = { "상": 3, "중": 2, "하": 1 };
    const numToGrade = (avg) => avg >= 2.5 ? "상" : avg >= 1.5 ? "중" : "하";
    
    let focusSum = 0, homeworkSum = 0, attitudeSum = 0, understandingSum = 0;
    let counts = { focus: 0, homework: 0, attitude: 0, understanding: 0 };
    
    evals.forEach(e => {
      if (e.focus) { focusSum += gradeToNum[e.focus]; counts.focus++; }
      if (e.homework) { homeworkSum += gradeToNum[e.homework]; counts.homework++; }
      if (e.attitude) { attitudeSum += gradeToNum[e.attitude]; counts.attitude++; }
      if (e.understanding) { understandingSum += gradeToNum[e.understanding]; counts.understanding++; }
    });
    
    const focusGrade = counts.focus > 0 ? numToGrade(focusSum / counts.focus) : "-";
    const homeworkGrade = counts.homework > 0 ? numToGrade(homeworkSum / counts.homework) : "-";
    const attitudeGrade = counts.attitude > 0 ? numToGrade(attitudeSum / counts.attitude) : "-";
    const understandingGrade = counts.understanding > 0 ? numToGrade(understandingSum / counts.understanding) : "-";
    
    let teacherHtml = `
      <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:12px; margin-bottom:12px;">
        <div class="report-item">집중력: <strong>${focusGrade}</strong></div>
        <div class="report-item">숙제 완성도: <strong>${homeworkGrade}</strong></div>
        <div class="report-item">학습 태도: <strong>${attitudeGrade}</strong></div>
        <div class="report-item">이해도: <strong>${understandingGrade}</strong></div>
      </div>
      <div class="kicker">평가 횟수: ${evals.length}회</div>
    `;
    
    const memos = evals.filter(e => e.memo).map(e => e.memo);
    if (memos.length > 0) {
      teacherHtml += '<div style="margin-top:12px;"><strong>선생님 코멘트:</strong></div>';
      memos.forEach(m => {
        teacherHtml += `<div class="report-item" style="margin-top:8px;">"${m}"</div>`;
      });
    }
    
    document.getElementById("reportTeacherEval").innerHTML = teacherHtml;
  }
  
  // 📝 다음 주 AI 맞춤 학습 계획
  const plans = [];
  
  if (studyDays < 5) {
    plans.push(`<div class="report-item">📅 <strong>매일 학습 루틴</strong>: 주중 5일 이상 공부하기를 목표로 하세요. 하루 30분이라도 꾸준히!</div>`);
  }
  
  if (avgTimePerDay < 60) {
    plans.push(`<div class="report-item">⏰ <strong>학습 시간 늘리기</strong>: 하루 최소 1시간 이상 집중 학습 시간을 확보하세요.</div>`);
  }
  
  Object.keys(testScores).forEach(subj => {
    const scores = testScores[subj];
    const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
    
    if (avgScore < 70) {
      plans.push(`<div class="report-item">📖 <strong>${subj} 기본 개념</strong>: 교과서 정독 및 기본 문제 30개 풀기</div>`);
    } else if (avgScore < 85) {
      plans.push(`<div class="report-item">🎯 <strong>${subj} 심화 학습</strong>: 고난도 문제 20개 도전하기</div>`);
    }
  });
  
  if (avgProgress < 70) {
    plans.push(`<div class="report-item">✅ <strong>완성도 높이기</strong>: 매일 계획한 과제를 100% 완료하기에 도전하세요.</div>`);
  }
  
  if (plans.length === 0) {
    plans.push(`<div class="report-item">🎯 <strong>현재 수준 유지</strong>: 지금처럼만 계속하면 됩니다! 꾸준함을 유지하세요.</div>`);
  }

  document.getElementById("reportPlan").innerHTML = plans.join('');
  document.querySelector("#reportPlan").parentElement.querySelector("h4").textContent = "📝 다음 주 AI 맞춤 학습 계획";
  
  // 💡 AI 보완 제안
  const suggestions = [];
  
  if (studyDays < 5) {
    suggestions.push(`<div class="report-item">이번 주는 ${studyDays}일만 공부했어요. 주말을 포함해 매일 조금씩 공부하는 습관을 만들어보세요.</div>`);
  }
  
  if (evals.length > 0) {
    const gradeToNum = { "상": 3, "중": 2, "하": 1 };
    let lowItems = [];
    let focusSum = 0, homeworkSum = 0, attitudeSum = 0, understandingSum = 0;
    let counts = { focus: 0, homework: 0, attitude: 0, understanding: 0 };
    
    evals.forEach(e => {
      if (e.focus) { focusSum += gradeToNum[e.focus]; counts.focus++; }
      if (e.homework) { homeworkSum += gradeToNum[e.homework]; counts.homework++; }
      if (e.attitude) { attitudeSum += gradeToNum[e.attitude]; counts.attitude++; }
      if (e.understanding) { understandingSum += gradeToNum[e.understanding]; counts.understanding++; }
    });
    
    if (counts.focus > 0 && focusSum / counts.focus < 2) lowItems.push("집중력");
    if (counts.homework > 0 && homeworkSum / counts.homework < 2) lowItems.push("숙제 완성도");
    if (counts.attitude > 0 && attitudeSum / counts.attitude < 2) lowItems.push("학습 태도");
    if (counts.understanding > 0 && understandingSum / counts.understanding < 2) lowItems.push("이해도");
    
    if (lowItems.length > 0) {
      suggestions.push(`<div class="report-item">선생님 평가에서 <strong>${lowItems.join(", ")}</strong> 부분이 낮게 나왔어요. 특별히 신경 써서 개선해보세요.</div>`);
    }
  }
  
  if (totalTasks > 0 && completedTasks / totalTasks < 0.7) {
    suggestions.push(`<div class="report-item">과제 완성률이 ${Math.round(completedTasks / totalTasks * 100)}%입니다. 계획을 좀 더 현실적으로 세우거나, 완성도를 높여보세요.</div>`);
  }
  
  if (suggestions.length === 0) {
    suggestions.push(`<div class="report-item">특별히 보완할 점이 없습니다! 현재 학습 패턴을 유지하세요. 👍</div>`);
  }
  
  document.getElementById("reportSuggestions").innerHTML = suggestions.join('');
  
  // 🌟 AI가 칭찬하는 점
  const strengths = [];
  
  if (studyDays >= 6) {
    strengths.push(`<div class="report-item">🌟 <strong>완벽한 출석!</strong> 거의 매일 공부했어요. 이런 꾸준함이 실력 향상의 비결입니다.</div>`);
  }
  
  if (avgProgress >= 80) {
    strengths.push(`<div class="report-item">✨ <strong>목표 달성 우수!</strong> 평균 ${avgProgress}%의 높은 달성률을 보였습니다. 계획 실행 능력이 훌륭해요!</div>`);
  }
  
  if (hours >= 10) {
    strengths.push(`<div class="report-item">💪 <strong>열정적인 학습!</strong> 이번 주 총 ${hours}시간 이상 공부했어요. 대단합니다!</div>`);
  }
  
  if (totalTasks > 0 && completedTasks / totalTasks >= 0.8) {
    strengths.push(`<div class="report-item">🎯 <strong>높은 완성도!</strong> 주어진 과제의 ${Math.round(completedTasks / totalTasks * 100)}%를 완료했어요. 책임감이 훌륭해요!</div>`);
  }
  
  Object.keys(testScores).forEach(subj => {
    const scores = testScores[subj];
    if (scores.length > 1) {
      const trend = scores[scores.length - 1].score - scores[0].score;
      if (trend >= 10) {
        strengths.push(`<div class="report-item">📈 <strong>${subj} 급상승!</strong> ${trend}점이나 올랐어요. 노력의 결과가 보이네요!</div>`);
      }
    }
  });
  
  if (strengths.length === 0) {
    strengths.push(`<div class="report-item">💫 <strong>꾸준한 노력!</strong> 이번 주도 학습을 위해 시간을 투자했어요. 이런 노력이 쌓이면 큰 발전이 됩니다!</div>`);
  }
  
  document.getElementById("reportStrengths").innerHTML = strengths.join('');
}

async function renderMonthlyReport() {
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setDate(today.getDate() - 29);

  const monthKeys = [];
  for (let d = new Date(monthAgo); d <= today; d.setDate(d.getDate() + 1)) {
    monthKeys.push(d.toLocaleDateString('en-CA', { timeZone:'Asia/Seoul' }));
  }

  // 제목 업데이트
  document.querySelector("#reportWrap h3.title").textContent = "📊 이번 달 AI 학습 리포트";
  document.getElementById("reportWeekRange").textContent = `${monthKeys[0]} ~ ${monthKeys[monthKeys.length - 1]}`;

  // 일별 데이터 수집
  const dailyDataMap = new Map();
  for (const key of monthKeys) {
    const dailySnap = await getDoc(dailyRef(me.uid, key));
    if (dailySnap.exists()) {
      dailyDataMap.set(key, dailySnap.data());
    }
  }
  const monthRanges = getLatestVocabRanges(monthKeys, dailyDataMap);

  // 평가 데이터 수집
  let evals = [];
  try {
    const evalQ = query(evalsCol(me.uid));
    const evalSnap = await getDocs(evalQ);
    evalSnap.forEach(docu => {
      const data = docu.data();
      if (data.date >= monthKeys[0] && data.date <= monthKeys[monthKeys.length - 1]) {
        evals.push(data);
      }
    });
    evals.sort((a, b) => a.date.localeCompare(b.date));
  } catch (evalErr) {
  }

  // 시험 데이터 수집
  const testScores = {};
  for (const key of monthKeys) {
    const testQ = query(testsCol(me.uid, key));
    const testSnap = await getDocs(testQ);
    testSnap.forEach(docu => {
      const t = docu.data();
      if (!testScores[t.subject]) testScores[t.subject] = [];
      testScores[t.subject].push({ score: t.score, wrong: t.wrongCount, date: key });
    });
  }

  // 통계 계산
  let totalTime = 0, totalProgress = 0, count = 0;
  let totalTasks = 0, completedTasks = 0;
  let studyDays = 0;

  monthKeys.forEach(key => {
    const d = dailyDataMap.get(key) || {};
    const sec = getEffectiveTimerSecondsForKey(d, key);
    const prog = Number(d.progress) || 0;
    const tot = Number(d.totalTasks) || 0;
    const com = Number(d.completedTasks) || 0;

    if (sec > 0) studyDays++;
    totalTime += sec;
    totalProgress += prog;
    count++;
    totalTasks += tot;
    completedTasks += com;
  });

  // 지각 통계 계산
  let tardinessCount = 0;
  let tardinessMinutes = 0;
  monthKeys.forEach(key => {
    const d = dailyDataMap.get(key);
    if (d && d.tardiness && d.tardiness.lateMinutes) {
      tardinessCount++;
      tardinessMinutes += d.tardiness.lateMinutes;
    }
  });

  const avgProgress = count > 0 ? Math.round(totalProgress / count) : 0;
  const hours = Math.floor(totalTime / 3600);
  const mins = Math.floor((totalTime % 3600) / 60);
  const avgTimePerDay = count > 0 ? Math.round(totalTime / count / 60) : 0;

  // 주차별 분석 (4주)
  const weeklyData = [];
  for (let w = 0; w < 4; w++) {
    const weekStart = w * 7;
    const weekEnd = Math.min(weekStart + 7, monthKeys.length);
    const weekKeys = monthKeys.slice(weekStart, weekEnd);

    let weekTime = 0, weekProgress = 0, weekCount = 0, weekStudyDays = 0;
    weekKeys.forEach(key => {
      const d = dailyDataMap.get(key) || {};
      const sec = getEffectiveTimerSecondsForKey(d, key);
      const prog = Number(d.progress) || 0;
      if (sec > 0) weekStudyDays++;
      weekTime += sec;
      weekProgress += prog;
      weekCount++;
    });

    weeklyData.push({
      week: w + 1,
      time: weekTime,
      avgProgress: weekCount > 0 ? Math.round(weekProgress / weekCount) : 0,
      studyDays: weekStudyDays
    });
  }

  // 📈 월간 학습 통계
  document.getElementById("reportStats").innerHTML = `
    <div class="stat-card">
      <div class="kicker">총 공부시간</div>
      <div class="num">${hours}시간 ${mins}분</div>
    </div>
    <div class="stat-card">
      <div class="kicker">공부한 날</div>
      <div class="num">${studyDays} / 30일</div>
    </div>
    <div class="stat-card">
      <div class="kicker">평균 진행률</div>
      <div class="num">${avgProgress}%</div>
    </div>
    <div class="stat-card">
      <div class="kicker">완료/전체 과제</div>
      <div class="num">${completedTasks} / ${totalTasks}</div>
    </div>
    <div class="stat-card">
      <div class="kicker">하루 평균 공부</div>
      <div class="num">${avgTimePerDay}분</div>
    </div>
    <div class="stat-card">
      <div class="kicker">출석률</div>
      <div class="num">${Math.round(studyDays / 30 * 100)}%</div>
    </div>
    <div class="stat-card" style="${tardinessCount > 0 ? 'background:#fff5f5; border-color:#ff6b6b;' : 'background:#f0fff4; border-color:#22a06b;'}">
      <div class="kicker">지각 현황</div>
      <div class="num" style="color:${tardinessCount > 0 ? '#ff6b6b' : '#22a06b'};">${tardinessCount > 0 ? tardinessCount + '회 (' + tardinessMinutes + '분)' : '없음 ✓'}</div>
    </div>
  `;

  // ✨ AI 월간 종합 평가
  let summary = "";
  const attendance = studyDays / 30;

  if (avgProgress >= 85 && attendance >= 0.9 && hours >= 30) {
    summary = "🏆 <strong>완벽한 달!</strong> 이번 달은 정말 훌륭했습니다! 높은 출석률, 우수한 진행률, 충분한 학습 시간까지 모든 면에서 최고의 성과를 거두었어요. 이런 패턴을 계속 유지하면 목표를 반드시 달성할 수 있습니다!";
  } else if (avgProgress >= 80 && attendance >= 0.8) {
    summary = "🎉 <strong>대단해요!</strong> 이번 달 학습 성과가 매우 우수합니다. 꾸준한 출석과 높은 목표 달성률을 보였어요. 조금만 더 노력하면 완벽한 달을 만들 수 있습니다!";
  } else if (avgProgress >= 70 && attendance >= 0.7) {
    summary = "👍 <strong>좋아요!</strong> 이번 달 전반적으로 양호한 학습 패턴을 보였습니다. 약간의 보완이 필요하지만, 기본적인 학습 습관은 잘 형성되어 있어요.";
  } else if (avgProgress >= 60 && attendance >= 0.6) {
    summary = "💪 <strong>개선이 필요해요.</strong> 이번 달은 학습량이 다소 부족했습니다. 다음 달에는 출석률과 과제 완성도를 높이는 데 집중해보세요.";
  } else if (avgProgress >= 50) {
    summary = "⚠️ <strong>분발이 필요해요.</strong> 이번 달 학습 패턴이 불규칙했습니다. 작은 목표부터 시작해서 매일 조금씩 공부하는 습관을 만들어보세요.";
  } else {
    summary = "🚨 <strong>긴급 개선 필요!</strong> 이번 달 학습량이 매우 부족했습니다. 선생님과 상담을 통해 학습 계획을 다시 세우고, 하루 최소 30분이라도 꾸준히 공부하는 습관을 만들어보세요.";
  }

  document.getElementById("reportSummary").innerHTML = `<div style="font-size:16px; line-height:1.6;">${summary}</div>`;

  // 🎯 AI 장기 약점 분석
  const weaknesses = [];

  Object.keys(testScores).forEach(subj => {
    const scores = testScores[subj];
    const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
    const totalWrong = scores.reduce((sum, s) => sum + s.wrongCount, 0);

    // 한 달 내내 낮은 점수 유지
    const lowScores = scores.filter(s => s.score < 70).length;
    if (lowScores >= scores.length * 0.7) {
      weaknesses.push(`<div class="report-item"><strong>${subj} - 지속적 약점</strong>: 한 달 동안 계속 낮은 점수(평균 ${Math.round(avgScore)}점)를 받았습니다. 기초부터 다시 시작하는 집중 학습이 필요합니다. 선생님께 개별 지도를 요청하세요.</div>`);
    } else if (avgScore < 75) {
      weaknesses.push(`<div class="report-item"><strong>${subj}</strong>: 월간 평균 ${Math.round(avgScore)}점 - 개념 이해가 부족합니다. 기본 개념을 확실히 다지고, 반복 학습이 필요합니다.</div>`);
    } else if (avgScore < 85) {
      weaknesses.push(`<div class="report-item"><strong>${subj}</strong>: 월간 평균 ${Math.round(avgScore)}점 - 기본은 탄탄하나 응용력이 부족합니다. 다양한 유형의 문제를 풀어보세요.</div>`);
    }

    if (totalWrong > 30) {
      weaknesses.push(`<div class="report-item"><strong>${subj} 오답</strong>: 한 달 간 ${totalWrong}개 누적 - 반드시 오답 노트를 만들고, 틀린 문제를 3회 이상 반복하세요.</div>`);
    }
  });

  if (avgProgress < 70) {
    weaknesses.push(`<div class="report-item"><strong>과제 완성도 부족</strong>: 월간 평균 ${avgProgress}% - 계획 수립 능력 또는 실행력에 문제가 있습니다. 목표를 더 작고 구체적으로 나눠보세요.</div>`);
  }

  if (attendance < 0.7) {
    weaknesses.push(`<div class="report-item"><strong>출석률 저조</strong>: ${Math.round(attendance * 100)}% (${studyDays}/30일) - 학습 습관이 형성되지 않았습니다. 알람을 설정하고 매일 같은 시간에 공부하세요.</div>`);
  }

  if (avgTimePerDay < 60) {
    weaknesses.push(`<div class="report-item"><strong>학습 시간 부족</strong>: 하루 평균 ${avgTimePerDay}분 - 최소 1시간 이상 집중 학습이 필요합니다. 스마트폰을 멀리하고 집중할 수 있는 환경을 만드세요.</div>`);
  }

  // 주차별 하락 트렌드 감지
  if (weeklyData.length >= 4) {
    const trend = weeklyData[3].avgProgress - weeklyData[0].avgProgress;
    if (trend < -15) {
      weaknesses.push(`<div class="report-item"><strong>학습 의욕 저하</strong>: 월 초와 비교해 진행률이 ${Math.abs(trend)}% 떨어졌습니다. 번아웃 신호일 수 있으니, 학습 방법을 바꾸거나 휴식이 필요합니다.</div>`);
    }
  }

  // 지각 패턴 분석
  if (tardinessCount >= 5) {
    weaknesses.push(`<div class="report-item" style="background:#fff5f5;"><strong>⏰ 지각 습관</strong>: 월 ${tardinessCount}회 (총 ${tardinessMinutes}분) - 시간 관리가 필요합니다. 10분 일찍 준비하는 습관을 들여보세요.</div>`);
  } else if (tardinessCount >= 3) {
    weaknesses.push(`<div class="report-item" style="background:#fff5f5;"><strong>⏰ 지각 주의</strong>: 월 ${tardinessCount}회 (총 ${tardinessMinutes}분) - 정해진 시간에 학습을 시작하는 습관이 필요합니다.</div>`);
  }

  document.getElementById("reportWeakness").innerHTML =
    weaknesses.length > 0 ? weaknesses.join('') : '<div class="ghost">한 달 동안 특별한 약점이 발견되지 않았습니다! 훌륭해요! 👍</div>';

  // 📚 과목별 성취도
  let subjectsHtml = '';
  if (Object.keys(testScores).length > 0) {
    Object.keys(testScores).forEach(subj => {
      const scores = testScores[subj];
      const avgScore = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);

      // 월간 트렌드 (첫 주 vs 마지막 주)
      const firstWeekScores = scores.filter(s => monthKeys.indexOf(s.date) < 7);
      const lastWeekScores = scores.filter(s => monthKeys.indexOf(s.date) >= 23);

      let trendIcon = "➡️";
      let trendText = "변동 없음";

      if (firstWeekScores.length > 0 && lastWeekScores.length > 0) {
        const firstAvg = firstWeekScores.reduce((sum, s) => sum + s.score, 0) / firstWeekScores.length;
        const lastAvg = lastWeekScores.reduce((sum, s) => sum + s.score, 0) / lastWeekScores.length;
        const diff = Math.round(lastAvg - firstAvg);

        if (diff > 5) {
          trendIcon = "📈";
          trendText = `+${diff}점 상승세`;
        } else if (diff < -5) {
          trendIcon = "📉";
          trendText = `${diff}점 하락세`;
        }
      }

      subjectsHtml += `
        <div class="report-item">
          <strong>${subj}</strong>: 월간 평균 ${avgScore}점 ${trendIcon} ${trendText}
          <div class="kicker" style="margin-top:4px;">시험 횟수: ${scores.length}회</div>
        </div>
      `;
    });
  } else {
    subjectsHtml = '<div class="ghost">이번 달 시험 결과가 없습니다.</div>';
  }
  subjectsHtml += buildVocabRangeHtml("이번 달 시험 범위 (최근 입력)", monthRanges.engRange, monthRanges.korRange);
  document.getElementById("reportSubjects").innerHTML = subjectsHtml;

  // ⏰ 주차별 학습 루틴 분석
  let routineHtml = '<div style="margin-bottom:12px;"><strong>주차별 학습 패턴</strong></div>';
  weeklyData.forEach(w => {
    const weekHours = Math.floor(w.time / 3600);
    const weekMins = Math.floor((w.time % 3600) / 60);
    const icon = w.studyDays >= 5 ? "✅" : w.studyDays >= 3 ? "⚠️" : "❌";

    routineHtml += `
      <div class="report-item">
        ${icon} <strong>${w.week}주차</strong>:
        ${weekHours}시간 ${weekMins}분 / 진행률 ${w.avgProgress}% / 출석 ${w.studyDays}일
      </div>
    `;
  });
  document.getElementById("reportRoutine").innerHTML = routineHtml;

  // 👨‍🏫 선생님 월간 종합 평가
  if (evals.length === 0) {
    document.getElementById("reportTeacherEval").innerHTML = '<div class="ghost">이번 달 선생님 평가가 없습니다.</div>';
  } else {
    const gradeToNum = { "상": 3, "중": 2, "하": 1 };
    const numToGrade = (avg) => avg >= 2.5 ? "상" : avg >= 1.5 ? "중" : "하";

    let focusSum = 0, homeworkSum = 0, attitudeSum = 0, understandingSum = 0;
    let counts = { focus: 0, homework: 0, attitude: 0, understanding: 0 };

    evals.forEach(e => {
      if (e.focus) { focusSum += gradeToNum[e.focus]; counts.focus++; }
      if (e.homework) { homeworkSum += gradeToNum[e.homework]; counts.homework++; }
      if (e.attitude) { attitudeSum += gradeToNum[e.attitude]; counts.attitude++; }
      if (e.understanding) { understandingSum += gradeToNum[e.understanding]; counts.understanding++; }
    });

    const focusGrade = counts.focus > 0 ? numToGrade(focusSum / counts.focus) : "-";
    const homeworkGrade = counts.homework > 0 ? numToGrade(homeworkSum / counts.homework) : "-";
    const attitudeGrade = counts.attitude > 0 ? numToGrade(attitudeSum / counts.attitude) : "-";
    const understandingGrade = counts.understanding > 0 ? numToGrade(understandingSum / counts.understanding) : "-";

    let teacherHtml = `
      <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:12px; margin-bottom:12px;">
        <div class="report-item">집중력: <strong>${focusGrade}</strong></div>
        <div class="report-item">숙제 완성도: <strong>${homeworkGrade}</strong></div>
        <div class="report-item">학습 태도: <strong>${attitudeGrade}</strong></div>
        <div class="report-item">이해도: <strong>${understandingGrade}</strong></div>
      </div>
      <div class="kicker">평가 횟수: ${evals.length}회</div>
    `;

    const memos = evals.filter(e => e.memo).map(e => e.memo);
    if (memos.length > 0) {
      teacherHtml += '<div style="margin-top:12px;"><strong>선생님 주요 코멘트:</strong></div>';
      // 최근 3개만 표시
      memos.slice(-3).forEach(m => {
        teacherHtml += `<div class="report-item" style="margin-top:8px;">"${m}"</div>`;
      });
    }

    document.getElementById("reportTeacherEval").innerHTML = teacherHtml;
  }

  // 📝 다음 달 AI 맞춤 학습 계획
  const plans = [];

  if (attendance < 0.8) {
    plans.push(`<div class="report-item">📅 <strong>출석률 향상</strong>: 다음 달 목표 출석률 90% (27일/30일). 매일 아침 8시 알람 설정하고 학습 시작!</div>`);
  }

  if (avgTimePerDay < 90) {
    plans.push(`<div class="report-item">⏰ <strong>학습 시간 확대</strong>: 하루 평균 ${avgTimePerDay + 30}분 목표. 점진적으로 늘려가세요.</div>`);
  }

  Object.keys(testScores).forEach(subj => {
    const scores = testScores[subj];
    const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;

    if (avgScore < 70) {
      plans.push(`<div class="report-item">📖 <strong>${subj} 집중 학습</strong>: 주 3회 이상, 회당 1시간씩 기본 개념 복습 및 문제 풀이</div>`);
    } else if (avgScore < 85) {
      plans.push(`<div class="report-item">🎯 <strong>${subj} 심화</strong>: 주 2회 이상 고난도 문제 풀이 및 오답 정리</div>`);
    } else if (avgScore >= 90) {
      plans.push(`<div class="report-item">🏆 <strong>${subj} 완성</strong>: 현재 수준 유지 + 심화 응용 문제 도전</div>`);
    }
  });

  if (avgProgress < 75) {
    plans.push(`<div class="report-item">✅ <strong>완성도 개선</strong>: 매일 계획한 과제를 100% 완료하기. 계획을 현실적으로 수정하세요.</div>`);
  }

  // 주차별 하락 트렌드가 있으면
  if (weeklyData.length >= 4 && weeklyData[3].avgProgress < weeklyData[0].avgProgress - 15) {
    plans.push(`<div class="report-item">🔄 <strong>학습 방법 전환</strong>: 번아웃 방지를 위해 학습 방법을 바꿔보세요. 그룹 스터디, 온라인 강의 등 새로운 방식을 시도하세요.</div>`);
  }

  if (plans.length === 0) {
    plans.push(`<div class="report-item">🎯 <strong>현재 수준 유지</strong>: 이번 달 패턴이 훌륭했습니다. 같은 방식으로 다음 달도 화이팅!</div>`);
  }

  document.getElementById("reportPlan").innerHTML = plans.join('');
  document.querySelector("#reportPlan").parentElement.querySelector("h4").textContent = "📝 다음 달 AI 맞춤 학습 계획";

  // 💡 AI 보완 제안
  const suggestions = [];

  if (attendance < 0.7) {
    suggestions.push(`<div class="report-item">한 달 중 ${30 - studyDays}일이나 공부하지 않았어요. 매일 조금씩이라도 공부하는 습관이 가장 중요합니다.</div>`);
  }

  if (evals.length > 0) {
    const gradeToNum = { "상": 3, "중": 2, "하": 1 };
    let lowItems = [];
    let focusSum = 0, homeworkSum = 0, attitudeSum = 0, understandingSum = 0;
    let counts = { focus: 0, homework: 0, attitude: 0, understanding: 0 };

    evals.forEach(e => {
      if (e.focus) { focusSum += gradeToNum[e.focus]; counts.focus++; }
      if (e.homework) { homeworkSum += gradeToNum[e.homework]; counts.homework++; }
      if (e.attitude) { attitudeSum += gradeToNum[e.attitude]; counts.attitude++; }
      if (e.understanding) { understandingSum += gradeToNum[e.understanding]; counts.understanding++; }
    });

    if (counts.focus > 0 && focusSum / counts.focus < 2) lowItems.push("집중력");
    if (counts.homework > 0 && homeworkSum / counts.homework < 2) lowItems.push("숙제 완성도");
    if (counts.attitude > 0 && attitudeSum / counts.attitude < 2) lowItems.push("학습 태도");
    if (counts.understanding > 0 && understandingSum / counts.understanding < 2) lowItems.push("이해도");

    if (lowItems.length > 0) {
      suggestions.push(`<div class="report-item">한 달 간 선생님 평가에서 <strong>${lowItems.join(", ")}</strong>가 지속적으로 낮았습니다. 이 부분을 최우선으로 개선하세요.</div>`);
    }
  }

  if (totalTasks > 0 && completedTasks / totalTasks < 0.7) {
    suggestions.push(`<div class="report-item">과제 완성률이 ${Math.round(completedTasks / totalTasks * 100)}%입니다. 목표를 더 현실적으로 세우거나, 시간 관리를 개선하세요.</div>`);
  }

  // 주차별 불규칙성 감지
  const weekProgressDiffs = [];
  for (let i = 1; i < weeklyData.length; i++) {
    weekProgressDiffs.push(Math.abs(weeklyData[i].avgProgress - weeklyData[i-1].avgProgress));
  }
  const avgDiff = weekProgressDiffs.length > 0 ? weekProgressDiffs.reduce((a, b) => a + b, 0) / weekProgressDiffs.length : 0;
  if (avgDiff > 20) {
    suggestions.push(`<div class="report-item">주차별 진행률이 불규칙합니다(평균 편차 ${Math.round(avgDiff)}%). 일정한 학습 리듬을 만드는 것이 중요합니다.</div>`);
  }

  if (suggestions.length === 0) {
    suggestions.push(`<div class="report-item">한 달 간 특별히 보완할 점이 없습니다! 현재 패턴을 유지하세요. 👍</div>`);
  }

  document.getElementById("reportSuggestions").innerHTML = suggestions.join('');

  // 🌟 이달의 성취 및 배지
  const strengths = [];

  // 월간 배지
  if (attendance >= 0.95) {
    strengths.push(`<div class="report-item">🏅 <strong>개근상!</strong> 30일 중 ${studyDays}일 출석! 완벽한 성실함을 보였어요!</div>`);
  } else if (attendance >= 0.85) {
    strengths.push(`<div class="report-item">🌟 <strong>우수 출석!</strong> 한 달 동안 ${studyDays}일 출석! 꾸준함이 돋보입니다!</div>`);
  }

  if (avgProgress >= 85) {
    strengths.push(`<div class="report-item">✨ <strong>목표 달성 마스터!</strong> 월간 평균 ${avgProgress}%의 탁월한 실행력을 보였습니다!</div>`);
  }

  if (hours >= 40) {
    strengths.push(`<div class="report-item">💪 <strong>학습 열정왕!</strong> 한 달 동안 총 ${hours}시간 이상 공부했어요. 정말 대단합니다!</div>`);
  } else if (hours >= 30) {
    strengths.push(`<div class="report-item">💪 <strong>노력파!</strong> 한 달 간 ${hours}시간 투자! 성실한 자세가 훌륭해요!</div>`);
  }

  if (totalTasks > 0 && completedTasks / totalTasks >= 0.85) {
    strengths.push(`<div class="report-item">🎯 <strong>완성도 최고!</strong> 과제의 ${Math.round(completedTasks / totalTasks * 100)}%를 완료! 책임감이 뛰어나요!</div>`);
  }

  // 과목별 급상승
  Object.keys(testScores).forEach(subj => {
    const scores = testScores[subj];
    if (scores.length >= 3) {
      const firstWeekScores = scores.filter(s => monthKeys.indexOf(s.date) < 7);
      const lastWeekScores = scores.filter(s => monthKeys.indexOf(s.date) >= 23);

      if (firstWeekScores.length > 0 && lastWeekScores.length > 0) {
        const firstAvg = firstWeekScores.reduce((sum, s) => sum + s.score, 0) / firstWeekScores.length;
        const lastAvg = lastWeekScores.reduce((sum, s) => sum + s.score, 0) / lastWeekScores.length;
        const improvement = Math.round(lastAvg - firstAvg);

        if (improvement >= 15) {
          strengths.push(`<div class="report-item">📈 <strong>${subj} 급성장!</strong> 월 초와 비교해 ${improvement}점 상승! 노력의 결실이 보입니다!</div>`);
        }
      }
    }
  });

  // 주차별 상승 트렌드
  if (weeklyData.length >= 4) {
    const trend = weeklyData[3].avgProgress - weeklyData[0].avgProgress;
    if (trend >= 15) {
      strengths.push(`<div class="report-item">📊 <strong>우상향 그래프!</strong> 월 초 대비 진행률이 ${trend}% 상승! 점점 발전하는 모습이 멋져요!</div>`);
    }
  }

  if (strengths.length === 0) {
    strengths.push(`<div class="report-item">💫 <strong>꾸준한 노력!</strong> 이번 달도 학습을 위해 시간을 투자했어요. 작은 노력들이 모여 큰 성과를 만듭니다!</div>`);
  }

  document.getElementById("reportStrengths").innerHTML = strengths.join('');
}

async function loadCounselingHistory(uid) {
  const historyDiv = document.getElementById("counselHistory");
  historyDiv.innerHTML = "";

  const q = query(counselCol(uid), orderBy("counseledAt", "desc"), limit(10));
  const snap = await getDocs(q);

  if (snap.empty) {
    historyDiv.innerHTML = '<div class="ghost">상담 기록이 없습니다.</div>';
    return;
  }

  snap.forEach(docu => {
    const data = docu.data();
    const date = new Date(data.counseledAt?.seconds ? data.counseledAt.seconds * 1000 : data.counseledAt);
    const escapedMemo = (data.memo || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, "\\n");
    const authorName = data.counseledByName || '';

    const item = document.createElement("div");
    item.className = "memo-item";
    item.dataset.counselId = docu.id;
    item.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div class="kicker">${date.toLocaleString('ko-KR')}${authorName ? ` - ${escapeHtml(authorName)}` : ''}</div>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-outline" style="padding:4px 10px; font-size:12px;" onclick="editCounselMemo('${docu.id}', '${escapedMemo}')">수정</button>
          <button class="btn btn-outline" style="padding:4px 10px; font-size:12px; color:#ff6b6b; border-color:#ff6b6b;" onclick="deleteCounselMemo('${docu.id}')">삭제</button>
        </div>
      </div>
      <div id="counselMemoContent-${docu.id}" style="margin-top:4px;">${escapeHtml(data.memo)}</div>
      ${data.editedAt ? '<div class="kicker" style="font-size:11px; color:#999;">(수정됨)</div>' : ''}
    `;
    historyDiv.appendChild(item);
  });
}

// 상담 메모 수정 - 인라인 편집
window.editCounselMemo = function(docId, currentMemo) {
  const contentDiv = document.getElementById(`counselMemoContent-${docId}`);
  if (!contentDiv) return;

  const decodedMemo = currentMemo.replace(/\\n/g, "\n").replace(/\\'/g, "'").replace(/\\\\/g, "\\");

  contentDiv.innerHTML = `
    <textarea id="editCounselInput-${docId}" class="input" rows="3" style="width:100%;">${decodedMemo}</textarea>
    <div style="display:flex; gap:8px; margin-top:8px;">
      <button class="btn" style="flex:1;" onclick="saveCounselEdit('${docId}')">저장</button>
      <button class="btn btn-outline" style="flex:1;" onclick="loadCounselingHistory('${currentStudentId}')">취소</button>
    </div>
  `;
  document.getElementById(`editCounselInput-${docId}`).focus();
};

// 상담 메모 수정 저장
window.saveCounselEdit = async function(docId) {
  const inputEl = document.getElementById(`editCounselInput-${docId}`);
  if (!inputEl) return;

  const newMemo = inputEl.value.trim();
  if (!newMemo) {
    alert("메모를 입력하세요.");
    return;
  }

  try {
    const counselRef = doc(db, "users", currentStudentId, "counseling", docId);
    await updateDoc(counselRef, {
      memo: newMemo,
      editedAt: new Date(),
      editedBy: me.uid,
      editedByName: myData.name || "관리자"
    });
    trackWrite();
    await loadCounselingHistory(currentStudentId);
  } catch (err) {
    alert("메모 수정 중 오류가 발생했습니다.");
  }
};

// 상담 메모 삭제
window.deleteCounselMemo = async function(docId) {
  if (!confirm("이 상담 메모를 삭제하시겠습니까?")) return;

  try {
    const counselRef = doc(db, "users", currentStudentId, "counseling", docId);
    await deleteDoc(counselRef);
    trackWrite();
    await loadCounselingHistory(currentStudentId);
  } catch (err) {
    alert("메모 삭제 중 오류가 발생했습니다.");
  }
};

// 점검 요청 관련 함수들
let unsubCheckRequests = null;

async function loadCheckRequests() {
  const listDiv = document.getElementById("checkRequestList");
  const countSpan = document.getElementById("checkRequestCount");
  const alertSpan = document.getElementById("checkRequestAlert");

  if (unsubCheckRequests) {
    unsubCheckRequests();
    unsubCheckRequests = null;
  }

  // 자기 학원 학생의 점검 요청만 가져오기
  const usersSnap = await getDocs(query(
    collection(db, "users"),
    where("role", "==", "student"),
    where("academyId", "==", myData.academyId || "")
  ));

  const allRequests = [];

  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data();
    const tasksQ = query(tasksCol(userDoc.id, getTodayKey()));
    const tasksSnap = await getDocs(tasksQ);

    tasksSnap.forEach(taskDoc => {
      const task = taskDoc.data();
      if (task.checkStatus === "requested" || task.checkStatus === "testAssigned") {
        allRequests.push({
          studentId: userDoc.id,
          studentName: userData.name,
          studentGrade: userData.grade,
          taskId: taskDoc.id,
          task: task
        });
      }
    });
  }

  // 점검 요청 개수 업데이트
  const requestedCount = allRequests.filter(r => r.task.checkStatus === "requested").length;
  countSpan.textContent = requestedCount;

  // 점검 요청이 있으면 깜빡임 효과 추가
  if (requestedCount > 0) {
    alertSpan.classList.add("blinking");
  } else {
    alertSpan.classList.remove("blinking");
  }

  // 목록 렌더링
  listDiv.innerHTML = "";

  if (allRequests.length === 0) {
    listDiv.innerHTML = '<div class="ghost">점검 요청이 없습니다.</div>';
    return;
  }

  allRequests.forEach(req => {
    const card = document.createElement("div");
    card.className = "check-request-card";

    const statusText = req.task.checkStatus === "requested" ? "점검 대기" : "테스트 응시중";
    const statusClass = req.task.checkStatus === "requested" ? "waiting" : "testing";

    let actionBtnHtml = "";
    if (req.task.checkStatus === "requested") {
      actionBtnHtml = `<button class="btn btn-assign-test">테스트 배부</button>`;
    } else if (req.task.checkStatus === "testAssigned") {
      actionBtnHtml = `<button class="btn btn-grade-test">점수 기입</button>`;
    }

    card.innerHTML = `
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div>
          <strong>${req.studentName}</strong>
          <span class="badge" style="margin-left:8px;">${req.studentGrade || "-"}</span>
          <span class="check-status-badge ${statusClass}">${statusText}</span>
          <div class="kicker" style="margin-top:6px;">
            <span class="badge">${req.task.subject}</span> ${req.task.title}
          </div>
        </div>
        <div class="row" style="gap:8px;">
          ${actionBtnHtml}
        </div>
      </div>
    `;

    // 테스트 배부 버튼
    const assignBtn = card.querySelector(".btn-assign-test");
    if (assignBtn) {
      assignBtn.onclick = async () => {
        if (!confirm(`${req.studentName}에게 "${req.task.title}" 테스트를 배부하시겠습니까?`)) return;
        await updateDoc(doc(tasksCol(req.studentId, getTodayKey()), req.taskId), {
          checkStatus: "testAssigned",
          testAssignedAt: new Date(),
          testAssignedBy: me.uid
        });
        await loadCheckRequests();
      };
    }

    // 점수 기입 버튼
    const gradeBtn = card.querySelector(".btn-grade-test");
    if (gradeBtn) {
      gradeBtn.onclick = () => {
        openGradeModal(req);
      };
    }

    listDiv.appendChild(card);
  });
}

// 점수 기입 모달
function openGradeModal(req) {
  const score = prompt(`"${req.task.title}" 테스트 점수를 입력하세요 (0~100):`);
  if (score === null) return;

  const scoreNum = Number(score);
  if (!Number.isFinite(scoreNum) || scoreNum < 0 || scoreNum > 100) {
    alert("점수는 0~100 사이의 숫자를 입력하세요.");
    return;
  }

  const wrongCount = prompt("오답 개수를 입력하세요:");
  if (wrongCount === null) return;

  const wrongNum = Number(wrongCount);
  if (!Number.isInteger(wrongNum) || wrongNum < 0) {
    alert("오답 개수는 0 이상의 정수를 입력하세요.");
    return;
  }

  // 점수 저장
  saveTestScore(req, scoreNum, wrongNum);
}

async function saveTestScore(req, score, wrongCount) {
  const today = getTodayKey();
  // 과제 상태 업데이트
  await updateDoc(doc(tasksCol(req.studentId, today), req.taskId), {
    checkStatus: "completed",
    testScore: score,
    testWrongCount: wrongCount,
    testCompletedAt: new Date(),
    testGradedBy: me.uid
  });

  // 시험 결과도 저장
  await addDoc(testsCol(req.studentId, today), {
    subject: req.task.subject,
    score: score,
    wrongCount: wrongCount,
    createdAt: new Date(),
    fromCheckRequest: true,
    taskTitle: req.task.title
  });

  alert(`${req.studentName}의 "${req.task.title}" 점수가 저장되었습니다!`);
  await loadCheckRequests();
}

// ============ AI 종합 학습 평가 ============

/**
 * AI 종합 학습 평가 생성
 * @param {Object} params - 평가에 필요한 데이터
 * @param {number} params.studyMinutes - 공부 시간 (분)
 * @param {number} params.studyDays - 공부한 날 수 (주간용)
 * @param {number} params.progress - 평균 진행률 (%)
 * @param {number} params.completedTasks - 완료한 과제 수
 * @param {number} params.totalTasks - 전체 과제 수
 * @param {Object} params.testScores - 과목별 시험 점수 { subject: [{ score, wrong }] }
 * @param {number} params.tardinessCount - 지각 횟수
 * @param {number} params.tardinessMinutes - 총 지각 시간 (분)
 * @param {Array} params.evaluations - 선생님 평가 배열 [{ focus, homework, attitude, understanding, memo }]
 * @param {string} params.type - "daily" | "weekly"
 * @returns {Object} { html: string, text: string } - HTML과 텍스트 형식의 평가
 */
function generateAIEvaluation(params) {
  const {
    studyMinutes = 0,
    studyDays = 1,
    progress = 0,
    completedTasks = 0,
    totalTasks = 0,
    testScores = {},
    tardinessCount = 0,
    tardinessMinutes = 0,
    evaluations = [],
    type = "daily"
  } = params;

  // 1. 학습 습관 분석 (공부시간 + 출석)
  let studyHabitScore = 0;
  let studyHabitText = "";
  const avgMinutesPerDay = type === "weekly" ? (studyDays > 0 ? studyMinutes / studyDays : 0) : studyMinutes;

  if (avgMinutesPerDay >= 180) {
    studyHabitScore = 5;
    studyHabitText = "매우 우수 - 충분한 학습 시간을 확보하고 있습니다";
  } else if (avgMinutesPerDay >= 120) {
    studyHabitScore = 4;
    studyHabitText = "우수 - 꾸준히 학습하고 있습니다";
  } else if (avgMinutesPerDay >= 60) {
    studyHabitScore = 3;
    studyHabitText = "보통 - 조금 더 학습 시간을 늘려보세요";
  } else if (avgMinutesPerDay >= 30) {
    studyHabitScore = 2;
    studyHabitText = "부족 - 최소 1시간 이상 공부가 필요합니다";
  } else {
    studyHabitScore = 1;
    studyHabitText = "매우 부족 - 학습 시간 확보가 시급합니다";
  }

  // 지각 페널티
  if (tardinessCount >= 3) {
    studyHabitScore = Math.max(1, studyHabitScore - 2);
    studyHabitText += " (잦은 지각 주의)";
  } else if (tardinessCount >= 1) {
    studyHabitScore = Math.max(1, studyHabitScore - 1);
    studyHabitText += " (지각 있음)";
  }

  // 2. 과제 수행 분석
  let taskScore = 0;
  let taskText = "";
  const taskRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  if (progress >= 90 || taskRate >= 90) {
    taskScore = 5;
    taskText = "매우 우수 - 과제를 성실히 완수하고 있습니다";
  } else if (progress >= 70 || taskRate >= 70) {
    taskScore = 4;
    taskText = "우수 - 대부분의 과제를 완료했습니다";
  } else if (progress >= 50 || taskRate >= 50) {
    taskScore = 3;
    taskText = "보통 - 과제 완료율을 높여주세요";
  } else if (progress >= 30 || taskRate >= 30) {
    taskScore = 2;
    taskText = "부족 - 과제 완료에 더 집중이 필요합니다";
  } else {
    taskScore = 1;
    taskText = "매우 부족 - 과제 수행 습관 개선이 필요합니다";
  }

  // 3. 학업 성취 분석 (시험 점수)
  let achievementScore = 3; // 기본값
  let achievementText = "시험 기록 없음";
  const subjects = Object.keys(testScores);

  if (subjects.length > 0) {
    let totalScore = 0;
    let testCount = 0;
    subjects.forEach(subj => {
      testScores[subj].forEach(t => {
        totalScore += t.score;
        testCount++;
      });
    });
    const avgScore = testCount > 0 ? totalScore / testCount : 0;

    if (avgScore >= 90) {
      achievementScore = 5;
      achievementText = `매우 우수 - 평균 ${Math.round(avgScore)}점으로 뛰어난 성적입니다`;
    } else if (avgScore >= 80) {
      achievementScore = 4;
      achievementText = `우수 - 평균 ${Math.round(avgScore)}점으로 좋은 성적입니다`;
    } else if (avgScore >= 70) {
      achievementScore = 3;
      achievementText = `보통 - 평균 ${Math.round(avgScore)}점으로 개선의 여지가 있습니다`;
    } else if (avgScore >= 60) {
      achievementScore = 2;
      achievementText = `부족 - 평균 ${Math.round(avgScore)}점으로 보강이 필요합니다`;
    } else {
      achievementScore = 1;
      achievementText = `매우 부족 - 평균 ${Math.round(avgScore)}점으로 기초 학습이 필요합니다`;
    }
  }

  // 4. 종합 학습 태도 분석 (선생님 평가 + AI 추론)
  let attitudeScore = 3; // 기본값
  let attitudeText = "";
  let hasTeacherEval = false;

  if (evaluations.length > 0) {
    hasTeacherEval = true;
    const gradeToNum = { "상": 3, "중": 2, "하": 1 };
    let focusSum = 0, homeworkSum = 0, attSum = 0, underSum = 0;
    let evalCount = 0;
    let memos = [];

    evaluations.forEach(ev => {
      if (ev.focus) focusSum += gradeToNum[ev.focus] || 2;
      if (ev.homework) homeworkSum += gradeToNum[ev.homework] || 2;
      if (ev.attitude) attSum += gradeToNum[ev.attitude] || 2;
      if (ev.understanding) underSum += gradeToNum[ev.understanding] || 2;
      if (ev.memo) memos.push(ev.memo);
      evalCount++;
    });

    if (evalCount > 0) {
      const avgFocus = focusSum / evalCount;
      const avgHomework = homeworkSum / evalCount;
      const avgAtt = attSum / evalCount;
      const avgUnder = underSum / evalCount;
      const overallAvg = (avgFocus + avgHomework + avgAtt + avgUnder) / 4;

      const numToGrade = (n) => n >= 2.5 ? "상" : n >= 1.5 ? "중" : "하";

      if (overallAvg >= 2.7) {
        attitudeScore = 5;
        attitudeText = `매우 우수 - 집중력(${numToGrade(avgFocus)}) 숙제(${numToGrade(avgHomework)}) 태도(${numToGrade(avgAtt)}) 이해도(${numToGrade(avgUnder)})`;
      } else if (overallAvg >= 2.3) {
        attitudeScore = 4;
        attitudeText = `우수 - 집중력(${numToGrade(avgFocus)}) 숙제(${numToGrade(avgHomework)}) 태도(${numToGrade(avgAtt)}) 이해도(${numToGrade(avgUnder)})`;
      } else if (overallAvg >= 1.8) {
        attitudeScore = 3;
        attitudeText = `보통 - 집중력(${numToGrade(avgFocus)}) 숙제(${numToGrade(avgHomework)}) 태도(${numToGrade(avgAtt)}) 이해도(${numToGrade(avgUnder)})`;
      } else if (overallAvg >= 1.3) {
        attitudeScore = 2;
        attitudeText = `부족 - 집중력(${numToGrade(avgFocus)}) 숙제(${numToGrade(avgHomework)}) 태도(${numToGrade(avgAtt)}) 이해도(${numToGrade(avgUnder)})`;
      } else {
        attitudeScore = 1;
        attitudeText = `매우 부족 - 집중력(${numToGrade(avgFocus)}) 숙제(${numToGrade(avgHomework)}) 태도(${numToGrade(avgAtt)}) 이해도(${numToGrade(avgUnder)})`;
      }

      if (memos.length > 0) {
        attitudeText += ` / 코멘트: "${memos[memos.length - 1]}"`;
      }
    }
  }

  // 선생님 평가가 없으면 AI가 데이터 기반으로 추론
  if (!hasTeacherEval) {
    // 학습 습관, 과제 수행, 성취도를 종합하여 태도 추론
    const inferredScore = (studyHabitScore + taskScore + achievementScore) / 3;

    // 지각 횟수 반영
    let tardinessPenalty = 0;
    if (tardinessCount >= 3) tardinessPenalty = 1.5;
    else if (tardinessCount >= 2) tardinessPenalty = 1;
    else if (tardinessCount >= 1) tardinessPenalty = 0.5;

    attitudeScore = Math.max(1, Math.min(5, Math.round(inferredScore - tardinessPenalty)));

    // 태도 텍스트 생성
    const factors = [];
    if (studyHabitScore >= 4) factors.push("꾸준한 학습");
    else if (studyHabitScore <= 2) factors.push("학습량 부족");

    if (taskScore >= 4) factors.push("높은 과제 완성도");
    else if (taskScore <= 2) factors.push("과제 완성 필요");

    if (achievementScore >= 4) factors.push("우수한 성적");
    else if (achievementScore <= 2) factors.push("성적 향상 필요");

    if (tardinessCount > 0) factors.push(`지각 ${tardinessCount}회`);

    const factorText = factors.length > 0 ? factors.join(", ") : "기본 평가";

    if (attitudeScore >= 5) {
      attitudeText = `매우 우수 - ${factorText} (AI 분석)`;
    } else if (attitudeScore >= 4) {
      attitudeText = `우수 - ${factorText} (AI 분석)`;
    } else if (attitudeScore >= 3) {
      attitudeText = `보통 - ${factorText} (AI 분석)`;
    } else if (attitudeScore >= 2) {
      attitudeText = `부족 - ${factorText} (AI 분석)`;
    } else {
      attitudeText = `매우 부족 - ${factorText} (AI 분석)`;
    }
  }

  // 5. 종합 점수 및 코멘트
  const totalScore = (studyHabitScore + taskScore + achievementScore + attitudeScore) / 4;
  let overallComment = "";
  let overallEmoji = "";
  let overallColor = "#667eea";

  if (totalScore >= 4.5) {
    overallEmoji = "🏆";
    overallComment = "최우수 학생입니다! 현재 학습 방법을 유지하세요.";
    overallColor = "#22a06b";
  } else if (totalScore >= 3.5) {
    overallEmoji = "⭐";
    overallComment = "우수한 학습 태도입니다. 조금만 더 노력하면 최고가 될 수 있어요!";
    overallColor = "#22a06b";
  } else if (totalScore >= 2.5) {
    overallEmoji = "👍";
    overallComment = "기본기는 잘 갖추고 있습니다. 부족한 부분을 보완해주세요.";
    overallColor = "#f59e0b";
  } else if (totalScore >= 1.5) {
    overallEmoji = "💪";
    overallComment = "노력이 더 필요합니다. 학습 습관 개선에 집중해주세요.";
    overallColor = "#f59e0b";
  } else {
    overallEmoji = "⚠️";
    overallComment = "학습 태도 전반적인 개선이 필요합니다. 선생님과 상담하세요.";
    overallColor = "#ff6b6b";
  }

  // 점수를 별표로 변환
  const scoreToStars = (score) => "★".repeat(Math.round(score)) + "☆".repeat(5 - Math.round(score));

  // HTML 형식
  const html = `
    <div style="background:#f8f9fb; padding:14px; border-radius:10px; border-left:4px solid ${overallColor};">
      <div style="font-weight:700; color:${overallColor}; font-size:15px; margin-bottom:12px;">
        ${overallEmoji} AI 종합 평가: ${overallComment}
      </div>
      <div style="display:grid; gap:8px; font-size:13px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>📚 학습 습관</span>
          <span style="color:#666;">${scoreToStars(studyHabitScore)} ${studyHabitText.split(' - ')[0]}</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>✅ 과제 수행</span>
          <span style="color:#666;">${scoreToStars(taskScore)} ${taskText.split(' - ')[0]}</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>📝 학업 성취</span>
          <span style="color:#666;">${scoreToStars(achievementScore)} ${achievementText.split(' - ')[0]}</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>🎯 종합 태도</span>
          <span style="color:#666;">${scoreToStars(attitudeScore)} ${attitudeText.split(' - ')[0]}</span>
        </div>
      </div>
    </div>
  `;

  // 텍스트 형식 (공유용)
  const text = `🤖 AI 종합 학습 평가\n\n` +
    `${overallEmoji} 종합: ${overallComment}\n\n` +
    `📚 학습 습관: ${studyHabitText}\n` +
    `✅ 과제 수행: ${taskText}\n` +
    `📝 학업 성취: ${achievementText}\n` +
    `🎯 종합 태도: ${attitudeText}\n`;

  return { html, text, overallScore: totalScore, overallColor, overallComment, overallEmoji };
}

// ============ 관리자용 주간 리포트 탐색 ============

// 주간 범위 계산 (offset: 0=이번주, -1=전주, -2=전전주...)
function getWeekRangeForOffset(offset = 0) {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset + (offset * 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const weekKeys = [];
  for (let d = new Date(monday); d <= sunday; d.setDate(d.getDate() + 1)) {
    weekKeys.push(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }));
  }

  return {
    monday,
    sunday,
    weekKeys,
    label: offset === 0 ? "이번주" : offset === -1 ? "전주" : `${Math.abs(offset)}주 전`,
    dateRange: `${weekKeys[0]} ~ ${weekKeys[6]}`
  };
}

// 주간 탐색 버튼 이벤트 (이전주/다음주)
function changeAdminReportWeek(direction) {
  adminWeekOffset += direction;
  // 미래 주는 볼 수 없음
  if (adminWeekOffset > 0) adminWeekOffset = 0;

  updateAdminWeekUI();
  if (currentStudentId) {
    loadAdminWeeklyReport(currentStudentId);
  }
}

// 주간 UI 업데이트
function updateAdminWeekUI() {
  const weekInfo = getWeekRangeForOffset(adminWeekOffset);
  document.getElementById("adminWeekRangeLabel").textContent = weekInfo.label;
  document.getElementById("adminWeekRangeDates").textContent = weekInfo.dateRange;

  // 다음주 버튼 비활성화 (이번주일 때)
  const nextBtn = document.getElementById("nextWeekBtn");
  if (nextBtn) {
    nextBtn.disabled = adminWeekOffset >= 0;
    nextBtn.style.opacity = adminWeekOffset >= 0 ? "0.5" : "1";
  }
}

// 관리자용 주간 리포트 로드 및 표시
async function loadAdminWeeklyReport(uid) {
  const previewEl = document.getElementById("adminWeeklyReportPreview");
  if (!previewEl) return;

  previewEl.innerHTML = '<div class="ghost" style="text-align:center;">주간 리포트를 불러오는 중...</div>';

  try {
    const weekInfo = getWeekRangeForOffset(adminWeekOffset);
    const weekKeys = weekInfo.weekKeys;

    // 일별 데이터 수집
    const dailyDataMap = new Map();
    for (const key of weekKeys) {
      const dailySnap = await getDoc(dailyRef(uid, key));
      trackRead();
      if (dailySnap.exists()) {
        dailyDataMap.set(key, dailySnap.data());
      }
    }

    // 평가 데이터 수집
    let evals = [];
    try {
      const evalQ = query(evalsCol(uid));
      const evalSnap = await getDocs(evalQ);
      trackRead(evalSnap.size);
      evalSnap.forEach(docu => {
        const data = docu.data();
        if (data.date >= weekKeys[0] && data.date <= weekKeys[6]) {
          evals.push(data);
        }
      });
      evals.sort((a, b) => a.date.localeCompare(b.date));
    } catch (evalErr) {
    }

    // 시험 데이터 수집
    const testScores = {};
    for (const key of weekKeys) {
      const testQ = query(testsCol(uid, key));
      const testSnap = await getDocs(testQ);
      trackRead(testSnap.size);
      testSnap.forEach(docu => {
        const t = docu.data();
        if (!testScores[t.subject]) testScores[t.subject] = [];
        testScores[t.subject].push({ score: t.score, wrong: t.wrongCount, date: key });
      });
    }

    // 통계 계산
    let totalTime = 0, totalProgress = 0, count = 0;
    let totalTasks = 0, completedTasks = 0;
    let studyDays = 0;

    weekKeys.forEach(key => {
      const d = dailyDataMap.get(key) || {};
      const sec = getEffectiveTimerSecondsForKey(d, key);
      const prog = Number(d.progress) || 0;
      const tot = Number(d.totalTasks) || 0;
      const com = Number(d.completedTasks) || 0;

      if (sec > 0) studyDays++;
      totalTime += sec;
      totalProgress += prog;
      count++;
      totalTasks += tot;
      completedTasks += com;
    });

    // 지각 통계 계산
    let tardinessCount = 0;
    let tardinessMinutes = 0;
    weekKeys.forEach(key => {
      const d = dailyDataMap.get(key);
      if (d && d.tardiness && d.tardiness.lateMinutes) {
        tardinessCount++;
        tardinessMinutes += d.tardiness.lateMinutes;
      }
    });

    const avgProgress = count > 0 ? Math.round(totalProgress / count) : 0;
    const hours = Math.floor(totalTime / 3600);
    const mins = Math.floor((totalTime % 3600) / 60);

    // 과목별 성적
    let subjectsHtml = '';
    if (Object.keys(testScores).length > 0) {
      Object.keys(testScores).forEach(subj => {
        const scores = testScores[subj];
        const avgScore = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);
        subjectsHtml += `<div style="display:inline-block; margin:4px 8px 4px 0; padding:4px 10px; background:#f0f0f0; border-radius:8px;"><strong>${subj}</strong> ${avgScore}점</div>`;
      });
    } else {
      subjectsHtml = '<span class="ghost">시험 기록 없음</span>';
    }

    // AI 종합 평가 생성
    const aiEval = generateAIEvaluation({
      studyMinutes: Math.floor(totalTime / 60),
      studyDays,
      progress: avgProgress,
      completedTasks,
      totalTasks,
      testScores,
      tardinessCount,
      tardinessMinutes,
      evaluations: evals,
      type: "weekly"
    });

    // HTML 생성
    previewEl.innerHTML = `
      <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; margin-bottom:12px;">
        <div style="background:#f0f9ff; padding:10px; border-radius:8px; text-align:center;">
          <div class="kicker">공부시간</div>
          <div style="font-weight:700; font-size:16px;">${hours}시간 ${mins}분</div>
        </div>
        <div style="background:#f0fdf4; padding:10px; border-radius:8px; text-align:center;">
          <div class="kicker">공부한 날</div>
          <div style="font-weight:700; font-size:16px;">${studyDays}일</div>
        </div>
        <div style="background:#fef3c7; padding:10px; border-radius:8px; text-align:center;">
          <div class="kicker">평균 진행률</div>
          <div style="font-weight:700; font-size:16px;">${avgProgress}%</div>
        </div>
      </div>
      <div style="margin-bottom:10px;">
        <div style="font-weight:600; margin-bottom:6px;">📊 과목별 성적</div>
        ${subjectsHtml}
      </div>
      ${aiEval.html}
    `;
  } catch (err) {
    previewEl.innerHTML = '<div class="ghost" style="text-align:center; color:#ff6b6b;">리포트 로드 실패</div>';
  }
}

// 주간 리포트 텍스트 생성 (이메일/공유용)
async function generateWeeklyReportText(uid, userData) {
  const weekInfo = getWeekRangeForOffset(adminWeekOffset);
  const weekKeys = weekInfo.weekKeys;

  // 일별 데이터 수집
  const dailyDataMap = new Map();
  for (const key of weekKeys) {
    const dailySnap = await getDoc(dailyRef(uid, key));
    trackRead();
    if (dailySnap.exists()) {
      dailyDataMap.set(key, dailySnap.data());
    }
  }

  // 평가 데이터 수집
  let evals = [];
  try {
    const evalQ = query(evalsCol(uid));
    const evalSnap = await getDocs(evalQ);
    trackRead(evalSnap.size);
    evalSnap.forEach(docu => {
      const data = docu.data();
      if (data.date >= weekKeys[0] && data.date <= weekKeys[6]) {
        evals.push(data);
      }
    });
    evals.sort((a, b) => a.date.localeCompare(b.date));
  } catch (evalErr) {
  }

  // 시험 데이터 수집
  const testScores = {};
  for (const key of weekKeys) {
    const testQ = query(testsCol(uid, key));
    const testSnap = await getDocs(testQ);
    trackRead(testSnap.size);
    testSnap.forEach(docu => {
      const t = docu.data();
      if (!testScores[t.subject]) testScores[t.subject] = [];
      testScores[t.subject].push({ score: t.score, wrong: t.wrongCount, date: key });
    });
  }

  // 통계 계산
  let totalTime = 0, totalProgress = 0, count = 0;
  let totalTasks = 0, completedTasks = 0;
  let studyDays = 0;

  weekKeys.forEach(key => {
    const d = dailyDataMap.get(key) || {};
    const sec = getEffectiveTimerSecondsForKey(d, key);
    const prog = Number(d.progress) || 0;
    const tot = Number(d.totalTasks) || 0;
    const com = Number(d.completedTasks) || 0;

    if (sec > 0) studyDays++;
    totalTime += sec;
    totalProgress += prog;
    count++;
    totalTasks += tot;
    completedTasks += com;
  });

  const avgProgress = count > 0 ? Math.round(totalProgress / count) : 0;
  const hours = Math.floor(totalTime / 3600);
  const mins = Math.floor((totalTime % 3600) / 60);

  // 지각 통계 계산
  let tardinessCount = 0;
  let tardinessMinutes = 0;
  weekKeys.forEach(key => {
    const d = dailyDataMap.get(key);
    if (d && d.tardiness && d.tardiness.lateMinutes) {
      tardinessCount++;
      tardinessMinutes += d.tardiness.lateMinutes;
    }
  });

  // 과목별 성적
  let testSummary = "";
  const testSubjects = Object.keys(testScores);
  if (testSubjects.length === 0) {
    testSummary = "• 시험 기록 없음\n";
  } else {
    testSubjects.forEach(subj => {
      const scores = testScores[subj];
      const avgScore = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);
      const totalWrong = scores.reduce((sum, s) => sum + s.wrong, 0);
      testSummary += `• ${subj}: 평균 ${avgScore}점, 오답 ${totalWrong}개 (${scores.length}회)\n`;
    });
  }

  // AI 종합 평가 생성
  const aiEval = generateAIEvaluation({
    studyMinutes: Math.floor(totalTime / 60),
    studyDays,
    progress: avgProgress,
    completedTasks,
    totalTasks,
    testScores,
    tardinessCount,
    tardinessMinutes,
    evaluations: evals,
    type: "weekly"
  });

  const reportText = `📊 ${userData.name} 주간 학습 리포트 (${weekInfo.dateRange})\n\n` +
    `📈 주간 통계\n` +
    `• 총 공부시간: ${hours}시간 ${mins}분\n` +
    `• 공부한 날: ${studyDays}일\n` +
    `• 평균 진행률: ${avgProgress}%\n` +
    `• 과제 완료: ${completedTasks}/${totalTasks}\n\n` +
    `📝 시험 결과\n${testSummary}\n` +
    aiEval.text;

  return {
    title: `${userData.name} 주간 학습 리포트 (${weekInfo.dateRange})`,
    text: reportText
  };
}

// 주간 리포트 공유 모달 열기
async function sendWeeklyReport(uid, userData) {
  // 로딩 표시
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'emailLoading';
  loadingDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
  loadingDiv.innerHTML = '<div style="background:#fff;padding:30px;border-radius:16px;text-align:center;"><div style="font-size:24px;margin-bottom:10px;">📊</div><div id="loadingText">주간 리포트 생성 중...</div></div>';
  document.body.appendChild(loadingDiv);

  try {
    const reportData = await generateWeeklyReportText(uid, userData);
    const recipientEmail = userData.parentEmail || "";
    const recipientLabel = recipientEmail || "(미등록)";

    // 로딩 화면 제거
    const loading = document.getElementById('emailLoading');
    if (loading) loading.remove();

    // 복사 모달 표시
    const copyModal = document.createElement('div');
    copyModal.id = 'copyEmailModal';
    copyModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
    copyModal.innerHTML = `
      <div style="background:#fff;padding:24px;border-radius:16px;max-width:600px;width:100%;max-height:80vh;overflow:auto;">
        <h3 style="margin:0 0 16px 0;color:#667eea;">📊 주간 학습 리포트 공유</h3>
        <div style="margin-bottom:12px;">
          <label style="font-weight:600;font-size:14px;">받는 사람:</label>
          <input type="text" value="${recipientLabel}" readonly style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-top:4px;background:#f8f9fb;">
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-weight:600;font-size:14px;">제목:</label>
          <input type="text" id="emailSubjectField" value="${reportData.title}" readonly style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-top:4px;background:#f8f9fb;">
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-weight:600;font-size:14px;">내용: <span style="font-weight:400;color:#888;">(직접 수정 가능)</span></label>
          <textarea id="emailBodyField" style="width:100%;height:300px;padding:10px;border:1px solid #667eea;border-radius:8px;margin-top:4px;background:#fff;font-size:13px;line-height:1.5;resize:none;">${reportData.text}</textarea>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="copyEmailBtn" style="flex:1;min-width:140px;padding:12px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:600;">📋 리포트 복사</button>
          <button id="kakaoShareBtn" style="flex:1;min-width:140px;padding:12px;background:#FEE500;color:#3C1E1E;border:none;border-radius:10px;cursor:pointer;font-weight:600;">💬 카톡 보내기</button>
          <button id="smsShareBtn" style="flex:1;min-width:140px;padding:12px;background:#0f9d58;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:600;">📩 문자 보내기</button>
          <button id="closeEmailModal" style="padding:12px 20px;background:#f1f2f6;border:none;border-radius:10px;cursor:pointer;font-weight:600;">닫기</button>
        </div>
        <p id="copyStatus" style="text-align:center;margin-top:12px;color:#22a06b;font-weight:600;display:none;">✅ 복사되었습니다!</p>
      </div>
    `;
    document.body.appendChild(copyModal);

    // 복사 버튼
    document.getElementById('copyEmailBtn').onclick = async () => {
      const fullText = document.getElementById('emailBodyField').value;
      try {
        await navigator.clipboard.writeText(fullText);
        document.getElementById('copyStatus').style.display = 'block';
      } catch (e) {
        const textarea = document.getElementById('emailBodyField');
        textarea.select();
        document.execCommand('copy');
        document.getElementById('copyStatus').style.display = 'block';
      }
    };

    // 카톡 공유 버튼
    document.getElementById('kakaoShareBtn').onclick = () => {
      const currentText = document.getElementById('emailBodyField').value;
      if (window.Kakao && window.Kakao.isInitialized()) {
        window.Kakao.Share.sendDefault({
          objectType: 'text',
          text: currentText,
          link: {
            mobileWebUrl: window.location.href,
            webUrl: window.location.href
          }
        });
      } else {
        navigator.clipboard.writeText(currentText).then(() => {
          alert('내용이 복사되었습니다!\n카카오톡에서 붙여넣기 해주세요.');
        }).catch(() => {
          alert('복사 실패. 내용을 직접 복사해주세요.');
        });
      }
    };

    // 문자 공유 버튼
    document.getElementById('smsShareBtn').onclick = () => {
      const currentText = document.getElementById('emailBodyField').value;
      const smsLink = `sms:?&body=${encodeURIComponent(currentText)}`;
      window.location.href = smsLink;
    };

    // 닫기 버튼
    document.getElementById('closeEmailModal').onclick = () => {
      copyModal.remove();
    };
  } catch (err) {
    const loading = document.getElementById('emailLoading');
    if (loading) loading.remove();
    alert("주간 리포트 생성 중 오류가 발생했습니다.");
  }
}

// 학부모 주간 리포트 메일 발송 (오늘 요약)
async function sendParentEmail(uid, userData) {
  // 로딩 표시
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'emailLoading';
  loadingDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
  loadingDiv.innerHTML = '<div style="background:#fff;padding:30px;border-radius:16px;text-align:center;"><div style="font-size:24px;margin-bottom:10px;">📧</div><div id="loadingText">리포트 생성 중...</div></div>';
  document.body.appendChild(loadingDiv);

  const updateLoading = (text) => {
    const el = document.getElementById('loadingText');
    if (el) el.textContent = text;
  };

  try {
    const todayKey = getTodayKey();

    // 오늘 데이터 수집
    const dailySnap = await getDoc(dailyRef(uid, todayKey));
    const dailyData = dailySnap.exists() ? dailySnap.data() : {};
    const timerSec = getEffectiveTimerSecondsForKey(dailyData, todayKey);
    const progress = Number(dailyData.progress) || 0;
    const totalTasks = Number(dailyData.totalTasks) || 0;
    const completedTasks = Number(dailyData.completedTasks) || 0;

    const hours = Math.floor(timerSec / 3600);
    const mins = Math.floor((timerSec % 3600) / 60);

    updateLoading("오늘 학습 데이터 수집 중...");

    // 오늘의 과제 요약
    const tasksSnap = await getDocs(tasksCol(uid, todayKey));
    const subjectTasks = {};
    tasksSnap.forEach(docu => {
      const task = docu.data();
      const subj = task.subject || "기타";
      if (!subjectTasks[subj]) subjectTasks[subj] = { total: 0, completed: 0 };
      subjectTasks[subj].total++;
      if (task.completed) subjectTasks[subj].completed++;
    });

    let taskSummary = "";
    const taskSubjects = Object.keys(subjectTasks);
    if (taskSubjects.length === 0) {
      taskSummary = "• 오늘 학습 항목 없음\n";
    } else {
      taskSubjects.forEach(subj => {
        const info = subjectTasks[subj];
        taskSummary += `• ${subj}: ${info.completed}/${info.total} 완료\n`;
      });
    }

    updateLoading("오늘 시험 데이터 수집 중...");

    // 오늘 시험 결과 수집
    const testSnap = await getDocs(testsCol(uid, todayKey));
    const testScores = {};
    testSnap.forEach(docu => {
      const t = docu.data();
      if (!testScores[t.subject]) testScores[t.subject] = [];
      testScores[t.subject].push({ score: t.score, wrong: t.wrongCount });
    });

    let testSummary = "";
    const testSubjects = Object.keys(testScores);
    if (testSubjects.length === 0) {
      testSummary = "• 오늘 시험 기록 없음\n";
    } else {
      testSubjects.forEach(subj => {
        const scores = testScores[subj];
        const avgScore = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);
        const totalWrong = scores.reduce((sum, s) => sum + s.wrong, 0);
        testSummary += `• ${subj}: 평균 ${avgScore}점, 오답 ${totalWrong}개 (${scores.length}회)\n`;
      });
    }

    updateLoading("오늘 평가 데이터 수집 중...");

    // 오늘 평가 수집
    let todayEval = null;
    try {
      const evalQ = query(
        evalsCol(uid),
        where("date", "==", todayKey),
        orderBy("evaluatedAt", "desc"),
        limit(1)
      );
      const evalSnap = await getDocs(evalQ);
      if (!evalSnap.empty) {
        todayEval = evalSnap.docs[0].data();
      }
    } catch (evalErr) {
    }

    // 지각 데이터
    const tardinessData = dailyData.tardiness || {};

    // AI 종합 평가 생성
    const aiEval = generateAIEvaluation({
      studyMinutes: Math.floor(timerSec / 60),
      studyDays: 1,
      progress,
      completedTasks,
      totalTasks,
      testScores,
      tardinessCount: tardinessData.lateMinutes ? 1 : 0,
      tardinessMinutes: tardinessData.lateMinutes || 0,
      evaluations: todayEval ? [todayEval] : [],
      type: "daily"
    });

    const recipientEmail = userData.parentEmail || "";
    const recipientLabel = recipientEmail || "(미등록)";
    const shareTitle = `${userData.name} 오늘 학습 요약 (${todayKey})`;

    const summaryText = `📌 ${userData.name} 오늘 학습 요약 (${todayKey})\n\n` +
          `⏱️ 공부시간: ${hours}시간 ${mins}분\n` +
          `📈 진행률: ${progress}%\n` +
          `✅ 과제 완료: ${completedTasks}/${totalTasks}\n\n` +
          `📚 오늘 학습 내용\n${taskSummary}\n` +
          `📝 시험 결과\n${testSummary}\n` +
          aiEval.text;

    // 로딩 화면 제거
    const loading = document.getElementById('emailLoading');
    if (loading) loading.remove();

    // 복사 모달 표시
    const copyModal = document.createElement('div');
    copyModal.id = 'copyEmailModal';
    copyModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
    copyModal.innerHTML = `
      <div style="background:#fff;padding:24px;border-radius:16px;max-width:600px;width:100%;max-height:80vh;overflow:auto;">
        <h3 style="margin:0 0 16px 0;color:#667eea;">📨 오늘 학습 요약 공유</h3>
        <div style="margin-bottom:12px;">
          <label style="font-weight:600;font-size:14px;">받는 사람:</label>
          <input type="text" value="${recipientLabel}" readonly style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-top:4px;background:#f8f9fb;">
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-weight:600;font-size:14px;">제목:</label>
          <input type="text" id="emailSubjectField" value="${shareTitle}" readonly style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-top:4px;background:#f8f9fb;">
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-weight:600;font-size:14px;">내용: <span style="font-weight:400;color:#888;">(직접 수정 가능)</span></label>
          <textarea id="emailBodyField" style="width:100%;height:250px;padding:10px;border:1px solid #667eea;border-radius:8px;margin-top:4px;background:#fff;font-size:13px;line-height:1.5;resize:none;">${summaryText}</textarea>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="copyEmailBtn" style="flex:1;min-width:140px;padding:12px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:600;">📋 요약 복사</button>
          <button id="kakaoShareBtn" style="flex:1;min-width:140px;padding:12px;background:#FEE500;color:#3C1E1E;border:none;border-radius:10px;cursor:pointer;font-weight:600;">💬 카톡 보내기</button>
          <button id="smsShareBtn" style="flex:1;min-width:140px;padding:12px;background:#0f9d58;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:600;">📩 문자 보내기</button>
          <button id="closeEmailModal" style="padding:12px 20px;background:#f1f2f6;border:none;border-radius:10px;cursor:pointer;font-weight:600;">닫기</button>
        </div>
        <p id="copyStatus" style="text-align:center;margin-top:12px;color:#22a06b;font-weight:600;display:none;">✅ 복사되었습니다!</p>
      </div>
    `;
    document.body.appendChild(copyModal);

    // 복사 버튼 - 수정된 내용 사용
    document.getElementById('copyEmailBtn').onclick = async () => {
      const fullText = document.getElementById('emailBodyField').value;
      try {
        await navigator.clipboard.writeText(fullText);
        document.getElementById('copyStatus').style.display = 'block';
      } catch (e) {
        // 폴백: textarea 선택 후 복사
        const textarea = document.getElementById('emailBodyField');
        textarea.select();
        document.execCommand('copy');
        document.getElementById('copyStatus').style.display = 'block';
      }
    };

    // 카톡 공유 버튼 - 수정된 내용 사용
    document.getElementById('kakaoShareBtn').onclick = () => {
      const currentText = document.getElementById('emailBodyField').value;
      // 카카오톡 공유 (텍스트)
      if (window.Kakao && window.Kakao.isInitialized()) {
        window.Kakao.Share.sendDefault({
          objectType: 'text',
          text: currentText,
          link: {
            mobileWebUrl: window.location.href,
            webUrl: window.location.href
          }
        });
      } else {
        // 카카오 SDK 미설정시 복사 후 안내
        navigator.clipboard.writeText(currentText).then(() => {
          alert('내용이 복사되었습니다!\n카카오톡에서 붙여넣기 해주세요.');
        }).catch(() => {
          alert('복사 실패. 내용을 직접 복사해주세요.');
        });
      }
    };

    // 문자 공유 버튼 - 수정된 내용 사용
    document.getElementById('smsShareBtn').onclick = () => {
      const currentText = document.getElementById('emailBodyField').value;
      const smsLink = `sms:?&body=${encodeURIComponent(currentText)}`;
      window.location.href = smsLink;
    };

    // 닫기 버튼
    document.getElementById('closeEmailModal').onclick = () => {
      copyModal.remove();
    };
  } catch (err) {
    // 로딩 화면 제거
    const loading = document.getElementById('emailLoading');
    if (loading) loading.remove();

    alert("메일 생성 중 오류가 발생했습니다: " + err.message);
  }
}

// ========== 경고 알림 기능 ==========

// 관리자가 학생에게 경고 보내기
async function sendWarningToStudent() {
  if (!currentStudentId) {
    alert("학생이 선택되지 않았습니다.");
    return;
  }

  const selectValue = document.getElementById("warningMessageSelect").value;
  let warningMessage;

  if (selectValue === "custom") {
    warningMessage = document.getElementById("customWarningInput").value.trim();
    if (!warningMessage) {
      alert("경고 메시지를 입력하세요.");
      return;
    }
  } else {
    warningMessage = selectValue;
  }

  try {
    // 학생의 사용자 문서에 경고 정보 저장
    const userRef = doc(db, "users", currentStudentId);
    await setDoc(userRef, {
      warning: {
        message: warningMessage,
        sentAt: new Date(),
        sentBy: me.uid,
        read: false
      }
    }, { merge: true });

    trackWrite(1);

    // 입력 초기화
    document.getElementById("warningMessageSelect").value = "멍때리지 말고 집중!";
    document.getElementById("customWarningWrap").style.display = "none";
    document.getElementById("customWarningInput").value = "";

    alert("⚠️ 경고가 전송되었습니다!");
  } catch (err) {
    alert("경고 전송 실패: " + err.message);
  }
}

// 학생 화면에 경고 팝업 표시
function showWarningPopup(warningData) {
  const modal = document.getElementById("warningModal");
  const messageText = document.getElementById("warningMessageText");
  const timeText = document.getElementById("warningTime");

  messageText.textContent = warningData.message;

  // 시간 포맷팅
  const sentAt = warningData.sentAt?.toDate ? warningData.sentAt.toDate() : new Date(warningData.sentAt);
  timeText.textContent = sentAt.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  modal.style.display = "flex";
}

// 경고 팝업 닫기
async function closeWarningModal() {
  const modal = document.getElementById("warningModal");
  modal.style.display = "none";

  // 경고를 읽음 처리
  if (me) {
    try {
      const userRef = doc(db, "users", me.uid);
      await setDoc(userRef, {
        warning: {
          read: true
        }
      }, { merge: true });
      trackWrite(1);
    } catch (err) {
    }
  }
}

// 학생용: 경고 수신 리스너 설정
function setupWarningListener() {
  if (!me || myData?.role !== "student") return;

  // 기존 리스너 해제
  if (unsubWarning) {
    unsubWarning();
    unsubWarning = null;
  }

  const userRef = doc(db, "users", me.uid);
  unsubWarning = onSnapshot(userRef, (docSnap) => {
    if (!docSnap.exists()) return;

    const data = docSnap.data();
    if (data.warning && !data.warning.read) {
      showWarningPopup(data.warning);
    }
  }, (err) => {
  });
}

// ========== 학생 요청사항 시스템 ==========
let studentRequestsInitialized = false;
let lastStudentRequestIds = new Set();
let originalTitle = document.title;
let studentRequestToastTimer = null;
let studentRequestNotificationRequested = false;
let studentRequestNotificationEnabled = false;

function setStudentRequestTitleBadge(count) {
  if (count > 0) {
    document.title = `(${count}) 학생 요청 - ${originalTitle}`;
  } else {
    document.title = originalTitle;
  }
}

function clearStudentRequestTitleBadge() {
  document.title = originalTitle;
}

function showStudentRequestToast({ count, studentName, message }) {
  if (!count) return;

  let toast = document.getElementById("studentRequestToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "studentRequestToast";
    document.body.appendChild(toast);
  }

  toast.innerHTML = `
    <div class="student-request-toast__title">🙋 학생 요청 ${count}건</div>
    <div class="student-request-toast__body">
      ${studentName ? `<strong>${escapeHtml(studentName)}</strong>: ` : ""}${escapeHtml(message || "새 요청이 도착했습니다.")}
    </div>
    <div class="student-request-toast__actions">
      <button type="button" id="studentRequestToastViewBtn">요청 보기</button>
      <button type="button" id="studentRequestToastCloseBtn">닫기</button>
    </div>
  `;
  toast.classList.add("student-request-toast--show");
  if (studentRequestToastTimer) {
    clearTimeout(studentRequestToastTimer);
  }
  studentRequestToastTimer = setTimeout(() => {
    toast.classList.remove("student-request-toast--show");
  }, 8000);

  const viewBtn = document.getElementById("studentRequestToastViewBtn");
  const closeBtn = document.getElementById("studentRequestToastCloseBtn");

  if (viewBtn) {
    viewBtn.onclick = () => {
      const section = document.getElementById("studentRequestSection");
      if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  }

  if (closeBtn) {
    closeBtn.onclick = () => {
      toast.classList.remove("student-request-toast--show");
    };
  }
}

function maybeRequestStudentRequestNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    studentRequestNotificationEnabled = true;
    return;
  }
  if (Notification.permission === "denied") return;
  if (studentRequestNotificationRequested) return;

  studentRequestNotificationRequested = true;
  const allow = confirm("학생 요청이 들어오면 시스템 알림을 받을까요?");
  if (!allow) return;

  Notification.requestPermission().then((permission) => {
    studentRequestNotificationEnabled = permission === "granted";
  }).catch(() => {
    studentRequestNotificationEnabled = false;
  });
}

function showStudentRequestSystemNotification({ count, studentName, message }) {
  if (!("Notification" in window)) return;
  if (!studentRequestNotificationEnabled) return;
  if (!document.hidden) return;

  const title = count > 0 ? `학생 요청 ${count}건` : "새 학생 요청";
  const body = `${studentName ? `${studentName}: ` : ""}${message || "새 요청이 도착했습니다."}`;

  const notification = new Notification(title, { body });
  notification.onclick = () => {
    window.focus();
    const section = document.getElementById("studentRequestSection");
    if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
  };
}

function notifyStudentRequestUpdate(docs, addedDocs) {
  const count = docs.length;

  if (document.hidden) {
    setStudentRequestTitleBadge(count);
  } else {
    clearStudentRequestTitleBadge();
  }

  if (addedDocs.length > 0) {
    const latest = addedDocs[0].data ? addedDocs[0].data() : addedDocs[0];
    showStudentRequestToast({
      count,
      studentName: latest?.studentName || "",
      message: latest?.message || ""
    });
    showStudentRequestSystemNotification({
      count,
      studentName: latest?.studentName || "",
      message: latest?.message || ""
    });
  }
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    clearStudentRequestTitleBadge();
  }
});

// 학생: 요청사항 전송
async function sendStudentRequest(message) {
  if (!me || !myData || myData.role !== "student") return;

  if (!message || message.trim() === "") {
    alert("요청 내용을 입력하세요.");
    return;
  }

  try {
    // studentRequests 컬렉션에 저장 (학원별로 분류)
    await addDoc(collection(db, "studentRequests"), {
      studentId: me.uid,
      studentName: myData.name || "학생",
      grade: myData.grade || "",
      academyId: myData.academyId,
      message: message.trim(),
      sentAt: new Date(),
      confirmed: false
    });
    trackWrite();

    // 성공 메시지 표시
    const msgEl = document.getElementById("requestSentMessage");
    if (msgEl) {
      msgEl.style.display = "block";
      setTimeout(() => {
        msgEl.style.display = "none";
      }, 2000);
    }

    // 입력 필드 초기화
    const customInput = document.getElementById("customRequestInput");
    if (customInput) customInput.value = "";

  } catch (err) {
    alert("요청 전송 중 오류가 발생했습니다.");
  }
}

// 학생: 요청 버튼 이벤트 설정
function setupStudentRequestButtons() {
  // 프리셋 버튼들
  document.querySelectorAll(".student-request-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const message = btn.dataset.request;
      sendStudentRequest(message);
    });
  });

  // 직접 입력 전송 버튼
  const sendBtn = document.getElementById("sendCustomRequestBtn");
  if (sendBtn) {
    sendBtn.addEventListener("click", () => {
      const input = document.getElementById("customRequestInput");
      if (input && input.value.trim()) {
        sendStudentRequest(input.value);
      }
    });
  }

  // Enter 키로 전송
  const customInput = document.getElementById("customRequestInput");
  if (customInput) {
    customInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && customInput.value.trim()) {
        sendStudentRequest(customInput.value);
      }
    });
  }
}

// 관리자: 학생 요청 실시간 리스너
let unsubStudentRequests = null;

function setupStudentRequestsListener() {
  if (!me || !myData || myData.role !== "admin") return;

  maybeRequestStudentRequestNotificationPermission();

  // 기존 리스너 해제
  if (unsubStudentRequests) {
    unsubStudentRequests();
    unsubStudentRequests = null;
  }

  // 인덱스 없이 작동하도록 단순 쿼리 사용 (클라이언트에서 정렬)
  const q = query(
    collection(db, "studentRequests"),
    where("academyId", "==", myData.academyId)
  );

  unsubStudentRequests = onSnapshot(q, (snap) => {
    trackRead(snap.size || 1);
    // confirmed가 false인 것만 필터링하고 시간순 정렬
    const filtered = snap.docs
      .filter(d => d.data().confirmed === false)
      .sort((a, b) => {
        const timeA = a.data().sentAt?.toDate?.() || new Date(0);
        const timeB = b.data().sentAt?.toDate?.() || new Date(0);
        return timeB - timeA; // 최신순
      });
    renderStudentRequests(filtered);

    const currentIds = new Set(filtered.map(docu => docu.id));
    const added = studentRequestsInitialized
      ? filtered.filter(docu => !lastStudentRequestIds.has(docu.id))
      : [];

    notifyStudentRequestUpdate(filtered, added);

    lastStudentRequestIds = currentIds;
    studentRequestsInitialized = true;
  }, (err) => {
  });
}

// 관리자: 학생 요청 렌더링
function renderStudentRequests(docs) {
  const listEl = document.getElementById("studentRequestList");
  const countEl = document.getElementById("studentRequestCount");

  if (!listEl) return;

  countEl.textContent = docs.length;

  if (docs.length === 0) {
    listEl.innerHTML = '<div class="ghost">요청이 없습니다.</div>';
    return;
  }

  listEl.innerHTML = "";
  docs.forEach(docu => {
    const data = docu.data();
    const requestId = docu.id;
    const time = data.sentAt?.toDate?.()
      ? data.sentAt.toDate().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      : '';

    const item = document.createElement("div");
    item.style.cssText = "display:flex; align-items:center; gap:12px; padding:12px; background:linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius:10px; margin-bottom:8px; border:1px solid #fcd34d;";
    item.innerHTML = `
      <div style="flex:1;">
        <div style="font-weight:600; color:#92400e;">
          ${escapeHtml(data.studentName)} <span style="font-size:12px; color:#b45309;">(${escapeHtml(data.grade)})</span>
        </div>
        <div style="font-size:15px; margin-top:4px; color:#78350f;">${escapeHtml(data.message)}</div>
        <div style="font-size:11px; color:#a16207; margin-top:4px;">${time}</div>
      </div>
      <button class="btn" style="background:#22a06b; padding:8px 16px;" onclick="confirmStudentRequest('${requestId}')">
        ✓ 확인
      </button>
    `;
    listEl.appendChild(item);
  });
}

// 관리자: 요청 확인 (삭제)
window.confirmStudentRequest = async function(requestId) {
  try {
    await deleteDoc(doc(db, "studentRequests", requestId));
    trackWrite();
  } catch (err) {
    alert("요청 확인 중 오류가 발생했습니다.");
  }
};

// ==================== 관리자 전달사항 시스템 ====================

// 관리자 전달사항 실시간 리스너 설정
function setupAdminCommentsListener() {
  if (!me || !myData || myData.role !== "admin") return;

  // 기존 리스너 해제
  if (unsubAdminComments) {
    unsubAdminComments();
    unsubAdminComments = null;
  }

  // academyId가 같고 confirmed가 false인 것만 쿼리 (인덱스 없이 클라이언트 필터링)
  const q = query(
    adminCommentsCol(),
    where("academyId", "==", myData.academyId)
  );

  unsubAdminComments = onSnapshot(q, (snap) => {
    trackRead(snap.size || 1);
    // confirmed가 false인 것만 필터링하고 시간순 정렬
    const comments = snap.docs
      .filter(d => d.data().confirmed === false)
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const timeA = a.createdAt?.toDate?.() || new Date(0);
        const timeB = b.createdAt?.toDate?.() || new Date(0);
        return timeB - timeA; // 최신순
      });
    renderAdminComments(comments);
  }, (err) => {
  });
}

// 관리자 전달사항 렌더링
function renderAdminComments(comments) {
  const listEl = document.getElementById("adminCommentList");
  const countEl = document.getElementById("adminCommentCount");

  if (!listEl) return;

  countEl.textContent = comments.length;

  if (comments.length === 0) {
    listEl.innerHTML = '<div class="ghost">전달사항이 없습니다.</div>';
    return;
  }

  listEl.innerHTML = "";
  comments.forEach(comment => {
    const time = comment.createdAt?.toDate?.()
      ? comment.createdAt.toDate().toLocaleString('ko-KR')
      : '';

    const item = document.createElement("div");
    item.className = "admin-comment-item";
    item.innerHTML = `
      <div style="flex:1;">
        <div class="student-info">
          ${escapeHtml(comment.studentName)} <span style="font-size:12px; font-weight:400;">(${escapeHtml(comment.studentGrade)})</span>
        </div>
        <div class="comment-message">${escapeHtml(comment.message)}</div>
        <div class="comment-meta">작성: ${escapeHtml(comment.createdByName)} | ${time}</div>
      </div>
      <button class="btn" style="background:#22a06b; padding:8px 16px; white-space:nowrap;" onclick="confirmAdminComment('${comment.id}')">
        ✓ 확인
      </button>
    `;
    listEl.appendChild(item);
  });
}

// 관리자 전달사항 추가 모달 열기
async function openAddCommentModal() {
  const modal = document.getElementById("addCommentModal");
  const select = document.getElementById("commentStudentSelect");

  // 학생 목록 로드
  const usersSnap = await getDocs(query(
    collection(db, "users"),
    where("role", "==", "student"),
    where("academyId", "==", myData.academyId)
  ));
  trackRead(usersSnap.size);

  select.innerHTML = '<option value="">학생을 선택하세요</option>';
  usersSnap.forEach(docSnap => {
    const data = docSnap.data();
    const opt = document.createElement("option");
    opt.value = docSnap.id;
    opt.dataset.name = data.name;
    opt.dataset.grade = data.grade || "-";
    opt.textContent = `${data.name} (${data.grade || "-"})`;
    select.appendChild(opt);
  });

  document.getElementById("commentMessageInput").value = "";
  modal.style.display = "block";
}

// 관리자 전달사항 추가 모달 닫기
function closeAddCommentModal() {
  document.getElementById("addCommentModal").style.display = "none";
}

// 관리자 전달사항 저장
async function saveAdminComment() {
  const select = document.getElementById("commentStudentSelect");
  const messageInput = document.getElementById("commentMessageInput");

  const studentId = select.value;
  const selectedOption = select.options[select.selectedIndex];
  const studentName = selectedOption?.dataset?.name || "";
  const studentGrade = selectedOption?.dataset?.grade || "";
  const message = messageInput.value.trim();

  if (!studentId) {
    alert("학생을 선택하세요.");
    return;
  }
  if (!message) {
    alert("전달사항 내용을 입력하세요.");
    return;
  }

  try {
    await addDoc(adminCommentsCol(), {
      studentId,
      studentName,
      studentGrade,
      academyId: myData.academyId,
      message,
      createdAt: new Date(),
      createdBy: me.uid,
      createdByName: myData.name || "관리자",
      confirmed: false
    });
    trackWrite();

    closeAddCommentModal();
    alert("전달사항이 저장되었습니다!");
  } catch (err) {
    alert("전달사항 저장 중 오류가 발생했습니다.");
  }
}

// 관리자 전달사항 확인 (숨김 처리)
window.confirmAdminComment = async function(commentId) {
  try {
    const commentRef = doc(db, "adminComments", commentId);
    await updateDoc(commentRef, {
      confirmed: true,
      confirmedAt: new Date(),
      confirmedBy: me.uid,
      confirmedByName: myData.name || "관리자"
    });
    trackWrite();
  } catch (err) {
    alert("전달사항 확인 중 오류가 발생했습니다.");
  }
};

// ==================== 학생 분석 탭 ====================

// 분석 탭 이벤트 설정
function setupAnalysisTabEvents() {
  if (analysisTabsInitialized) return;
  analysisTabsInitialized = true;

  const dailyBtn = document.getElementById("analysisTabDailyBtn");
  const weeklyBtn = document.getElementById("analysisTabWeeklyBtn");
  const printBtn = document.getElementById("printReportBtn");

  dailyBtn.onclick = async () => {
    analysisCurrentReportType = "daily";
    dailyBtn.classList.remove("btn-outline");
    dailyBtn.style.background = "#22a06b";
    weeklyBtn.classList.add("btn-outline");
    weeklyBtn.style.background = "";
    if (analysisSelectedStudentId) {
      await renderAdminStudentDailyReport(analysisSelectedStudentId, analysisSelectedStudentData);
    }
  };

  weeklyBtn.onclick = async () => {
    analysisCurrentReportType = "weekly";
    weeklyBtn.classList.remove("btn-outline");
    weeklyBtn.style.background = "#22a06b";
    dailyBtn.classList.add("btn-outline");
    dailyBtn.style.background = "";
    if (analysisSelectedStudentId) {
      await renderAdminStudentWeeklyReport(analysisSelectedStudentId, analysisSelectedStudentData);
    }
  };

  printBtn.onclick = () => {
    printStudentReport();
  };
}

// 분석 탭 학생 목록 렌더링
async function renderAnalysisStudentList() {
  const listEl = document.getElementById("analysisStudentList");
  if (!listEl) return;

  listEl.innerHTML = '<div class="ghost">학생 목록을 불러오는 중...</div>';

  try {
    const students = [];
    const q = query(collection(db, "users"), where("role", "==", "student"), where("academyId", "==", myData.academyId));
    const snap = await getDocs(q);
    trackRead(snap.size || 1);

    snap.forEach(d => {
      students.push({ uid: d.id, ...d.data() });
    });

    if (students.length === 0) {
      listEl.innerHTML = '<div class="ghost">등록된 학생이 없습니다.</div>';
      return;
    }

    // 학년별 정렬
    students.sort((a, b) => (a.grade || "").localeCompare(b.grade || "") || (a.name || "").localeCompare(b.name || ""));

    listEl.innerHTML = "";
    students.forEach(s => {
      const item = document.createElement("div");
      item.className = "student-analysis-item";
      item.style.cssText = "padding:12px; background:#fff; border-radius:8px; margin-bottom:8px; cursor:pointer; border:2px solid transparent; transition:all 0.2s;";
      item.innerHTML = `
        <div style="font-weight:600;">${escapeHtml(s.name)}</div>
        <div style="font-size:12px; color:#666;">${escapeHtml(s.grade || '')}</div>
      `;
      item.onclick = (e) => selectAnalysisStudent(s.uid, s, e.currentTarget);

      // 선택된 학생 강조
      if (analysisSelectedStudentId === s.uid) {
        item.style.borderColor = "#667eea";
        item.style.background = "#eef2ff";
      }

      listEl.appendChild(item);
    });
  } catch (err) {
    listEl.innerHTML = '<div class="ghost" style="color:#ef4444;">목록을 불러오지 못했습니다.</div>';
  }
}

// 분석 탭 학생 선택
async function selectAnalysisStudent(uid, userData, clickedElement) {
  analysisSelectedStudentId = uid;
  analysisSelectedStudentData = userData;

  // 선택 표시 갱신
  document.querySelectorAll(".student-analysis-item").forEach(el => {
    el.style.borderColor = "transparent";
    el.style.background = "#fff";
  });
  clickedElement.style.borderColor = "#667eea";
  clickedElement.style.background = "#eef2ff";

  // 선택된 학생 표시
  document.getElementById("analysisSelectedStudent").innerHTML = `
    <div style="background:#fff; padding:16px; border-radius:12px; border:2px solid #667eea;">
      <h3 class="title" style="margin:0;">${escapeHtml(userData.name)} <span style="font-weight:400; font-size:14px; color:#666;">(${escapeHtml(userData.grade || '')})</span></h3>
    </div>
  `;

  // 버튼들 표시
  document.getElementById("analysisTabButtons").style.display = "block";
  document.getElementById("analysisPrintSection").style.display = "block";
  document.getElementById("analysisReportContainer").style.display = "block";

  // 기본값: 오늘 분석
  analysisCurrentReportType = "daily";
  const dailyBtn = document.getElementById("analysisTabDailyBtn");
  const weeklyBtn = document.getElementById("analysisTabWeeklyBtn");
  dailyBtn.classList.remove("btn-outline");
  dailyBtn.style.background = "#22a06b";
  weeklyBtn.classList.add("btn-outline");
  weeklyBtn.style.background = "";

  // 리포트 렌더링
  await renderAdminStudentDailyReport(uid, userData);
}

// 관리자용 오늘 분석 리포트 렌더링
async function renderAdminStudentDailyReport(uid, userData) {
  const today = getTodayKey();

  // 인쇄용 정보 설정
  document.getElementById("printStudentInfo").textContent = `${userData.name} (${userData.grade || ''})`;
  document.getElementById("printDateInfo").textContent = `오늘: ${today}`;
  document.getElementById("printDate").textContent = new Date().toLocaleString('ko-KR');

  // 오늘의 데이터 가져오기
  const dailySnap = await getDoc(dailyRef(uid, today));
  trackRead(1);
  const dailyData = dailySnap.exists() ? dailySnap.data() : {};

  // 제목 업데이트
  document.getElementById("analysisReportTitle").textContent = "📊 오늘의 AI 학습 리포트";
  document.getElementById("analysisReportRange").textContent = today;

  // 오늘의 평가 데이터 수집
  let todayEval = null;
  try {
    const evalQ = query(evalsCol(uid), where("date", "==", today));
    const evalSnap = await getDocs(evalQ);
    trackRead(evalSnap.size || 1);
    if (!evalSnap.empty) {
      const evals = evalSnap.docs.map(d => d.data());
      evals.sort((a, b) => {
        const timeA = a.evaluatedAt?.toDate?.() || new Date(0);
        const timeB = b.evaluatedAt?.toDate?.() || new Date(0);
        return timeB - timeA;
      });
      todayEval = evals[0];
    }
  } catch (evalErr) {
  }

  // 오늘의 시험 결과 수집
  const testQ = query(testsCol(uid, today));
  const testSnap = await getDocs(testQ);
  trackRead(testSnap.size || 1);
  const testScores = {};
  testSnap.forEach(docu => {
    const t = docu.data();
    if (!testScores[t.subject]) testScores[t.subject] = [];
    testScores[t.subject].push({ score: t.score, wrong: t.wrongCount });
  });

  // 오늘의 과목별 학습 항목 수집
  const tasksQ = query(tasksCol(uid, today));
  const tasksSnap = await getDocs(tasksQ);
  trackRead(tasksSnap.size || 1);
  const subjectTasks = {};
  tasksSnap.forEach(docu => {
    const task = docu.data();
    const subj = task.subject || "기타";
    if (!subjectTasks[subj]) subjectTasks[subj] = { total: 0, completed: 0 };
    subjectTasks[subj].total++;
    if (task.completed) subjectTasks[subj].completed++;
  });

  // 통계 계산
  const timerSec = getEffectiveTimerSecondsForKey(dailyData, today);
  const progress = Number(dailyData.progress) || 0;
  const totalTasks = Number(dailyData.totalTasks) || 0;
  const completedTasks = Number(dailyData.completedTasks) || 0;
  const hours = Math.floor(timerSec / 3600);
  const mins = Math.floor((timerSec % 3600) / 60);

  // 📈 오늘의 학습 통계
  document.getElementById("analysisReportStats").innerHTML = `
    <div class="stat-card">
      <div class="kicker">오늘 공부시간</div>
      <div class="num">${hours}시간 ${mins}분</div>
    </div>
    <div class="stat-card">
      <div class="kicker">진행률</div>
      <div class="num">${progress}%</div>
    </div>
    <div class="stat-card">
      <div class="kicker">완료/전체 과제</div>
      <div class="num">${completedTasks} / ${totalTasks}</div>
    </div>
    <div class="stat-card">
      <div class="kicker">시험 응시</div>
      <div class="num">${testSnap.size}회</div>
    </div>
  `;

  // ✨ AI 종합 평가
  let summary = "";
  if (progress >= 90 && timerSec >= 3600) {
    summary = "🎉 <strong>완벽한 하루!</strong> 오늘은 정말 열심히 공부했어요. 이런 날이 쌓이면 큰 발전이 됩니다!";
  } else if (progress >= 80) {
    summary = "👍 <strong>훌륭해요!</strong> 오늘 목표를 잘 달성했습니다. 내일도 이대로 화이팅!";
  } else if (progress >= 60) {
    summary = "😊 <strong>괜찮아요!</strong> 오늘도 학습을 위해 노력했네요. 조금만 더 집중하면 더 좋을 거예요.";
  } else if (timerSec > 0) {
    summary = "💪 <strong>시작이 반!</strong> 오늘 공부를 시작했다는 것이 중요합니다. 내일은 더 완성도 있게 해봐요.";
  } else {
    summary = "📚 <strong>내일은 파이팅!</strong> 오늘은 쉬는 날이었나요? 내일은 작은 목표부터 시작해봐요!";
  }
  document.getElementById("analysisReportSummary").innerHTML = `<div style="font-size:16px; line-height:1.6;">${summary}</div>`;

  // 🎯 오늘의 개선점
  const weaknesses = [];
  Object.keys(testScores).forEach(subj => {
    const scores = testScores[subj];
    const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
    const totalWrong = scores.reduce((sum, s) => sum + s.wrongCount, 0);
    if (avgScore < 70) {
      weaknesses.push(`<div class="report-item"><strong>${subj}</strong>: 평균 ${Math.round(avgScore)}점 - 개념 이해가 부족해 보입니다.</div>`);
    }
    if (totalWrong > 5) {
      weaknesses.push(`<div class="report-item"><strong>${subj}</strong>: 오답 ${totalWrong}개 - 틀린 문제를 다시 풀어보세요.</div>`);
    }
  });
  if (progress < 70 && totalTasks > 0) {
    weaknesses.push(`<div class="report-item"><strong>과제 완성도</strong>: ${progress}% - 계획한 과제를 더 많이 완료해보세요.</div>`);
  }
  if (timerSec < 1800) {
    weaknesses.push(`<div class="report-item"><strong>학습 시간</strong>: ${mins}분 - 최소 30분 이상 집중해서 공부하세요.</div>`);
  }
  document.getElementById("analysisReportWeakness").innerHTML =
    weaknesses.length > 0 ? weaknesses.join('') : '<div class="ghost">오늘은 특별한 개선점이 없습니다! 👍</div>';

  // 📚 과목별 학습 현황
  let subjectsHtml = '';
  if (Object.keys(subjectTasks).length > 0) {
    Object.keys(subjectTasks).forEach(subj => {
      const info = subjectTasks[subj];
      const rate = info.total > 0 ? Math.round((info.completed / info.total) * 100) : 0;
      const icon = rate >= 80 ? "✅" : rate >= 50 ? "🔶" : "❌";
      subjectsHtml += `<div class="report-item">${icon} <strong>${subj}</strong>: ${info.completed}/${info.total} 완료 (${rate}%)</div>`;
    });
    if (Object.keys(testScores).length > 0) {
      subjectsHtml += '<div style="margin-top:12px; padding-top:12px; border-top:1px solid #eee;"><strong>📝 오늘의 시험 결과</strong></div>';
      Object.keys(testScores).forEach(subj => {
        const scores = testScores[subj];
        const avgScore = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);
        const icon = avgScore >= 90 ? "🌟" : avgScore >= 80 ? "😊" : avgScore >= 70 ? "😐" : "😢";
        subjectsHtml += `<div class="report-item">${icon} <strong>${subj}</strong>: 평균 ${avgScore}점 (${scores.length}회)</div>`;
      });
    }
    subjectsHtml += buildVocabRangeHtml("오늘의 시험 범위", dailyData.engVocabRange || "", dailyData.korVocabRange || "");
  } else {
    subjectsHtml = '<div class="ghost">오늘 학습 항목이 없습니다.</div>';
    subjectsHtml += buildVocabRangeHtml("오늘의 시험 범위", dailyData.engVocabRange || "", dailyData.korVocabRange || "");
  }
  document.getElementById("analysisReportSubjects").innerHTML = subjectsHtml;

  // ⚖️ 밸런스
  document.getElementById("analysisReportBalance").innerHTML = '<div class="ghost">밸런스 분석은 주간 리포트에서 확인하세요.</div>';

  // ⏰ 오늘의 학습 패턴
  let routineHtml = '';
  if (timerSec > 0) {
    routineHtml = `
      <div class="report-item">⏱️ <strong>총 학습 시간</strong>: ${hours}시간 ${mins}분</div>
      <div class="report-item">📊 <strong>과제 달성률</strong>: ${progress}%</div>
      <div class="report-item">✍️ <strong>학습한 과목</strong>: ${Object.keys(subjectTasks).join(", ") || "없음"}</div>
    `;
  } else {
    routineHtml = '<div class="ghost">오늘은 학습 기록이 없습니다.</div>';
  }
  document.getElementById("analysisReportRoutine").innerHTML = routineHtml;

  // 🤖 AI 종합 학습 평가
  const tardinessData = dailyData.tardiness || {};
  const aiEvalDaily = generateAIEvaluation({
    studyMinutes: Math.floor(timerSec / 60),
    studyDays: 1,
    progress,
    completedTasks,
    totalTasks,
    testScores,
    tardinessCount: tardinessData.lateMinutes ? 1 : 0,
    tardinessMinutes: tardinessData.lateMinutes || 0,
    evaluations: todayEval ? [todayEval] : [],
    type: "daily"
  });
  document.getElementById("analysisReportTeacherEval").innerHTML = aiEvalDaily.html;

  // 📝 내일의 학습 계획
  const plans = [];
  if (timerSec < 3600) {
    plans.push(`<div class="report-item">⏰ <strong>학습 시간 늘리기</strong>: 내일은 최소 1시간 이상 집중해서 공부해보세요.</div>`);
  }
  if (progress < 80 && totalTasks > 0) {
    plans.push(`<div class="report-item">✅ <strong>완성도 높이기</strong>: 계획한 과제를 최대한 많이 완료하는 것을 목표로 하세요.</div>`);
  }
  Object.keys(testScores).forEach(subj => {
    const scores = testScores[subj];
    const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
    if (avgScore < 70) {
      plans.push(`<div class="report-item">📖 <strong>${subj} 복습</strong>: 틀린 문제를 다시 풀고 개념을 정리하세요.</div>`);
    }
  });
  if (Object.keys(subjectTasks).length < 2) {
    plans.push(`<div class="report-item">📚 <strong>과목 다양화</strong>: 여러 과목을 골고루 공부하면 더 좋습니다.</div>`);
  }
  if (plans.length === 0) {
    plans.push(`<div class="report-item">🎯 <strong>오늘처럼!</strong> 오늘과 같은 패턴으로 내일도 열심히 해봐요!</div>`);
  }
  document.getElementById("analysisReportPlan").innerHTML = plans.join('');
  document.getElementById("analysisReportPlanTitle").textContent = "📝 내일의 학습 계획";

  // 💡 개선 제안
  const suggestions = [];
  if (todayEval) {
    const gradeToNum = { "상": 3, "중": 2, "하": 1 };
    const lowItems = [];
    if (todayEval.focus && gradeToNum[todayEval.focus] < 2) lowItems.push("집중력");
    if (todayEval.homework && gradeToNum[todayEval.homework] < 2) lowItems.push("숙제 완성도");
    if (todayEval.attitude && gradeToNum[todayEval.attitude] < 2) lowItems.push("학습 태도");
    if (todayEval.understanding && gradeToNum[todayEval.understanding] < 2) lowItems.push("이해도");
    if (lowItems.length > 0) {
      suggestions.push(`<div class="report-item">선생님 평가에서 <strong>${lowItems.join(", ")}</strong> 부분이 낮았어요. 특별히 신경 써보세요.</div>`);
    }
  }
  if (progress < 50 && totalTasks > 3) {
    suggestions.push(`<div class="report-item">과제를 너무 많이 계획한 것 같아요. 현실적인 양으로 조정해보세요.</div>`);
  }
  if (timerSec === 0 && totalTasks > 0) {
    suggestions.push(`<div class="report-item">타이머를 사용하지 않았네요. 타이머를 켜고 공부하면 집중도가 높아집니다!</div>`);
  }
  if (suggestions.length === 0) {
    suggestions.push(`<div class="report-item">오늘 학습 패턴이 좋습니다! 계속 유지하세요. 👍</div>`);
  }
  document.getElementById("analysisReportSuggestions").innerHTML = suggestions.join('');

  // 🌟 오늘의 칭찬
  const strengths = [];
  if (progress >= 90) {
    strengths.push(`<div class="report-item">✨ <strong>완벽한 달성!</strong> 오늘 목표를 거의 다 이뤘어요. 정말 대단합니다!</div>`);
  }
  if (timerSec >= 7200) {
    strengths.push(`<div class="report-item">💪 <strong>엄청난 노력!</strong> 2시간 이상 집중해서 공부했어요. 훌륭합니다!</div>`);
  }
  if (completedTasks >= 5) {
    strengths.push(`<div class="report-item">🎯 <strong>과제 킬러!</strong> ${completedTasks}개의 과제를 완료했어요. 실행력이 뛰어나네요!</div>`);
  }
  Object.keys(testScores).forEach(subj => {
    const scores = testScores[subj];
    const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
    if (avgScore >= 90) {
      strengths.push(`<div class="report-item">🌟 <strong>${subj} 우수!</strong> 평균 ${Math.round(avgScore)}점으로 훌륭한 성적을 냈어요!</div>`);
    }
  });
  if (Object.keys(subjectTasks).length >= 3) {
    strengths.push(`<div class="report-item">📚 <strong>균형잡힌 학습!</strong> ${Object.keys(subjectTasks).length}개 과목을 골고루 공부했어요.</div>`);
  }
  if (strengths.length === 0) {
    strengths.push(`<div class="report-item">💫 <strong>노력하는 모습!</strong> 오늘도 학습을 위해 시간을 투자했어요. 이런 작은 노력이 쌓여 큰 발전을 만듭니다!</div>`);
  }
  document.getElementById("analysisReportStrengths").innerHTML = strengths.join('');
}

// 관리자용 주간 분석 리포트 렌더링
async function renderAdminStudentWeeklyReport(uid, userData) {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const weekKeys = [];
  for (let d = new Date(monday); d <= sunday; d.setDate(d.getDate() + 1)) {
    weekKeys.push(d.toLocaleDateString('en-CA', { timeZone:'Asia/Seoul' }));
  }

  // 인쇄용 정보 설정
  document.getElementById("printStudentInfo").textContent = `${userData.name} (${userData.grade || ''})`;
  document.getElementById("printDateInfo").textContent = `주간: ${weekKeys[0]} ~ ${weekKeys[6]}`;
  document.getElementById("printDate").textContent = new Date().toLocaleString('ko-KR');

  // 제목 업데이트
  document.getElementById("analysisReportTitle").textContent = "📊 이번 주 AI 학습 리포트";
  document.getElementById("analysisReportRange").textContent = `${weekKeys[0]} ~ ${weekKeys[6]}`;

  // 일별 데이터 수집
  const dailyDataMap = new Map();
  for (const key of weekKeys) {
    const dailySnap = await getDoc(dailyRef(uid, key));
    trackRead(1);
    if (dailySnap.exists()) {
      dailyDataMap.set(key, dailySnap.data());
    }
  }
  const weekRanges = getLatestVocabRanges(weekKeys, dailyDataMap);

  // 평가 데이터 수집
  let evals = [];
  try {
    const evalQ = query(evalsCol(uid));
    const evalSnap = await getDocs(evalQ);
    trackRead(evalSnap.size || 1);
    evalSnap.forEach(docu => {
      const data = docu.data();
      if (data.date >= weekKeys[0] && data.date <= weekKeys[6]) {
        evals.push(data);
      }
    });
    evals.sort((a, b) => a.date.localeCompare(b.date));
  } catch (evalErr) {
  }

  // 시험 데이터 수집
  const testScores = {};
  for (const key of weekKeys) {
    const testQ = query(testsCol(uid, key));
    const testSnap = await getDocs(testQ);
    trackRead(testSnap.size || 1);
    testSnap.forEach(docu => {
      const t = docu.data();
      if (!testScores[t.subject]) testScores[t.subject] = [];
      testScores[t.subject].push({ score: t.score, wrong: t.wrongCount, date: key });
    });
  }

  // 통계 계산
  let totalTime = 0, totalProgress = 0, count = 0;
  let totalTasks = 0, completedTasks = 0;
  let studyDays = 0;

  weekKeys.forEach(key => {
    const d = dailyDataMap.get(key) || {};
    const sec = getEffectiveTimerSecondsForKey(d, key);
    const prog = Number(d.progress) || 0;
    const tot = Number(d.totalTasks) || 0;
    const com = Number(d.completedTasks) || 0;

    if (sec > 0) studyDays++;
    totalTime += sec;
    totalProgress += prog;
    count++;
    totalTasks += tot;
    completedTasks += com;
  });

  // 지각 통계 계산
  let tardinessCount = 0;
  let tardinessMinutes = 0;
  weekKeys.forEach(key => {
    const d = dailyDataMap.get(key);
    if (d && d.tardiness && d.tardiness.lateMinutes) {
      tardinessCount++;
      tardinessMinutes += d.tardiness.lateMinutes;
    }
  });

  const avgProgress = count > 0 ? Math.round(totalProgress / count) : 0;
  const hours = Math.floor(totalTime / 3600);
  const mins = Math.floor((totalTime % 3600) / 60);
  const avgTimePerDay = count > 0 ? Math.round(totalTime / count / 60) : 0;

  // 📈 학습 통계
  document.getElementById("analysisReportStats").innerHTML = `
    <div class="stat-card">
      <div class="kicker">총 공부시간</div>
      <div class="num">${hours}시간 ${mins}분</div>
    </div>
    <div class="stat-card">
      <div class="kicker">공부한 날</div>
      <div class="num">${studyDays}일</div>
    </div>
    <div class="stat-card">
      <div class="kicker">평균 진행률</div>
      <div class="num">${avgProgress}%</div>
    </div>
    <div class="stat-card">
      <div class="kicker">완료/전체 과제</div>
      <div class="num">${completedTasks} / ${totalTasks}</div>
    </div>
    <div class="stat-card">
      <div class="kicker">하루 평균 공부</div>
      <div class="num">${avgTimePerDay}분</div>
    </div>
    <div class="stat-card" style="${tardinessCount > 0 ? 'background:#fff5f5; border-color:#ff6b6b;' : 'background:#f0fff4; border-color:#22a06b;'}">
      <div class="kicker">지각 현황</div>
      <div class="num" style="color:${tardinessCount > 0 ? '#ff6b6b' : '#22a06b'};">${tardinessCount > 0 ? tardinessCount + '회 (' + tardinessMinutes + '분)' : '없음 ✓'}</div>
    </div>
  `;

  // ✨ AI 종합 평가
  let summary = "";
  if (avgProgress >= 80 && studyDays >= 6) {
    summary = "🎉 <strong>최고예요!</strong> 이번 주는 완벽한 한 주였습니다. 계획적이고 성실한 학습 태도가 돋보입니다.";
  } else if (avgProgress >= 80) {
    summary = "🎉 <strong>훌륭해요!</strong> 목표 달성률이 매우 높습니다. 조금 더 자주 공부한다면 완벽합니다!";
  } else if (avgProgress >= 60) {
    summary = "👍 <strong>잘했어요!</strong> 꾸준히 학습하고 있습니다. 조금만 더 집중하면 더 좋은 결과를 얻을 수 있어요.";
  } else if (avgProgress >= 40) {
    summary = "💪 <strong>노력이 필요해요.</strong> 목표 달성을 위해 좀 더 집중이 필요합니다. 계획을 세분화해보세요.";
  } else {
    summary = "⚠️ <strong>분발이 필요해요.</strong> 이번 주는 학습량이 부족했습니다. 작은 목표부터 차근차근 시작해봐요!";
  }
  document.getElementById("analysisReportSummary").innerHTML = `<div style="font-size:16px; line-height:1.6;">${summary}</div>`;

  // 🎯 AI 약점 분석
  const weaknesses = [];
  Object.keys(testScores).forEach(subj => {
    const scores = testScores[subj];
    const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
    const totalWrong = scores.reduce((sum, s) => sum + s.wrongCount, 0);
    if (avgScore < 70) {
      weaknesses.push(`<div class="report-item"><strong>${subj}</strong>: 평균 ${Math.round(avgScore)}점 - 기본 개념 복습이 시급합니다.</div>`);
    } else if (avgScore < 85) {
      weaknesses.push(`<div class="report-item"><strong>${subj}</strong>: 평균 ${Math.round(avgScore)}점 - 심화 학습이 필요합니다.</div>`);
    }
    if (totalWrong > 10) {
      weaknesses.push(`<div class="report-item"><strong>${subj}</strong>: 오답 ${totalWrong}개 누적 - 오답 노트를 만들어 다시 풀어보세요.</div>`);
    }
  });
  if (avgProgress < 70) {
    weaknesses.push(`<div class="report-item"><strong>학습 완성도</strong>: 평균 ${avgProgress}% - 계획한 과제를 끝까지 완료하는 습관이 필요합니다.</div>`);
  }
  if (studyDays < 5) {
    weaknesses.push(`<div class="report-item"><strong>학습 빈도</strong>: 주 ${studyDays}일 - 매일 조금씩 공부하는 것이 효과적입니다.</div>`);
  }
  if (avgTimePerDay < 60) {
    weaknesses.push(`<div class="report-item"><strong>학습 시간</strong>: 하루 평균 ${avgTimePerDay}분 - 최소 1시간 이상 집중 학습을 확보하세요.</div>`);
  }
  if (tardinessCount >= 2) {
    weaknesses.push(`<div class="report-item" style="background:#fff5f5;"><strong>⏰ 지각</strong>: 주 ${tardinessCount}회 (총 ${tardinessMinutes}분) - 정해진 시간에 학습을 시작하는 습관이 필요합니다.</div>`);
  }
  document.getElementById("analysisReportWeakness").innerHTML =
    weaknesses.length > 0 ? weaknesses.join('') : '<div class="ghost">특별한 약점이 발견되지 않았습니다! 👍</div>';

  // 📚 과목별 성취도
  let subjectsHtml = '';
  if (Object.keys(testScores).length > 0) {
    Object.keys(testScores).forEach(subj => {
      const scores = testScores[subj];
      const avgScore = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);
      const trend = scores.length > 1 ? (scores[scores.length - 1].score - scores[0].score) : 0;
      const trendIcon = trend > 0 ? "📈" : trend < 0 ? "📉" : "➡️";
      const trendText = trend > 0 ? `+${trend}점 상승` : trend < 0 ? `${trend}점 하락` : "변동 없음";
      subjectsHtml += `
        <div class="report-item">
          <strong>${subj}</strong>: 평균 ${avgScore}점 ${trendIcon} ${trendText}
          <div class="kicker" style="margin-top:4px;">시험 횟수: ${scores.length}회</div>
        </div>
      `;
    });
  } else {
    subjectsHtml = '<div class="ghost">이번 주 시험 결과가 없습니다.</div>';
  }
  subjectsHtml += buildVocabRangeHtml("이번 주 시험 범위 (최근 입력)", weekRanges.engRange, weekRanges.korRange);
  document.getElementById("analysisReportSubjects").innerHTML = subjectsHtml;

  // ⚖️ 과목별 학습 밸런스
  const subjectTaskCounts = {};
  let totalTasksAcrossSubjects = 0;
  for (const key of weekKeys) {
    const tasksQ = query(tasksCol(uid, key));
    const tasksSnap = await getDocs(tasksQ);
    trackRead(tasksSnap.size || 1);
    tasksSnap.forEach(docu => {
      const task = docu.data();
      const subj = task.subject || "기타";
      if (subj !== "모든 과목") {
        if (!subjectTaskCounts[subj]) subjectTaskCounts[subj] = { total: 0, completed: 0 };
        subjectTaskCounts[subj].total++;
        totalTasksAcrossSubjects++;
        if (task.completed) subjectTaskCounts[subj].completed++;
      }
    });
  }

  let balanceHtml = '';
  if (Object.keys(subjectTaskCounts).length > 0) {
    const sortedSubjects = Object.keys(subjectTaskCounts).sort((a, b) => subjectTaskCounts[b].total - subjectTaskCounts[a].total);
    sortedSubjects.forEach(subj => {
      const info = subjectTaskCounts[subj];
      const percentage = totalTasksAcrossSubjects > 0 ? Math.round((info.total / totalTasksAcrossSubjects) * 100) : 0;
      const completionRate = info.total > 0 ? Math.round((info.completed / info.total) * 100) : 0;
      let balanceIcon = "⚪";
      let balanceNote = "";
      if (percentage >= 40) { balanceIcon = "🔴"; balanceNote = " (과집중)"; }
      else if (percentage >= 25) { balanceIcon = "🟡"; balanceNote = " (높은 비중)"; }
      else if (percentage >= 15) { balanceIcon = "🟢"; balanceNote = " (적정)"; }
      else if (percentage >= 5) { balanceIcon = "🔵"; balanceNote = " (낮은 비중)"; }
      else { balanceIcon = "⚪"; balanceNote = " (미미한 비중)"; }
      balanceHtml += `
        <div class="report-item">
          ${balanceIcon} <strong>${subj}</strong>: ${info.completed}/${info.total}개 (전체의 ${percentage}%${balanceNote})
          <div class="kicker" style="margin-top:4px;">완료율: ${completionRate}%</div>
        </div>
      `;
    });
    balanceHtml += '<div style="margin-top:16px; padding-top:16px; border-top:1px solid #eee;"><strong>📊 밸런스 분석</strong></div>';
    const numSubjects = sortedSubjects.length;
    const maxSubject = sortedSubjects[0];
    const maxPercentage = totalTasksAcrossSubjects > 0 ? Math.round((subjectTaskCounts[maxSubject].total / totalTasksAcrossSubjects) * 100) : 0;
    if (numSubjects === 1) {
      balanceHtml += `<div class="report-item">이번 주는 <strong>${maxSubject}</strong>만 집중적으로 학습했습니다. 다른 과목도 골고루 학습하는 것을 권장합니다.</div>`;
    } else if (maxPercentage >= 40) {
      balanceHtml += `<div class="report-item">⚠️ <strong>${maxSubject}</strong>에 과도하게 집중했습니다 (${maxPercentage}%). 다른 과목에도 시간을 배분하세요.</div>`;
    } else if (numSubjects >= 4) {
      balanceHtml += `<div class="report-item">✅ ${numSubjects}개 과목을 골고루 학습했습니다. 균형잡힌 학습 패턴입니다!</div>`;
    } else if (numSubjects >= 2) {
      const neglectedSubjects = ["국어", "영어", "수학", "과학", "사회"].filter(s => !subjectTaskCounts[s]);
      if (neglectedSubjects.length > 0) {
        balanceHtml += `<div class="report-item">💡 <strong>${neglectedSubjects.join(", ")}</strong> 과목이 소홀했습니다. 다음 주에는 이 과목들도 포함해보세요.</div>`;
      }
    }
  } else {
    balanceHtml = '<div class="ghost">이번 주 과목별 학습 항목이 없습니다.</div>';
  }
  document.getElementById("analysisReportBalance").innerHTML = balanceHtml;

  // ⏰ 학습 루틴 분석
  let routineHtml = '';
  const dayLabels = ['월', '화', '수', '목', '금', '토', '일'];
  weekKeys.forEach((key, idx) => {
    const d = dailyDataMap.get(key) || {};
    const sec = getEffectiveTimerSecondsForKey(d, key);
    const prog = Number(d.progress) || 0;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const icon = sec > 0 ? "✅" : "❌";
    routineHtml += `<div class="report-item">${icon} <strong>${key} (${dayLabels[idx]})</strong>: ${h}시간 ${m}분 / 진행률 ${prog}%</div>`;
  });
  document.getElementById("analysisReportRoutine").innerHTML = routineHtml;

  // 🤖 AI 종합 학습 평가
  const aiEvalWeekly = generateAIEvaluation({
    studyMinutes: Math.floor(totalTime / 60),
    studyDays,
    progress: avgProgress,
    completedTasks,
    totalTasks,
    testScores,
    tardinessCount,
    tardinessMinutes,
    evaluations: evals,
    type: "weekly"
  });
  document.getElementById("analysisReportTeacherEval").innerHTML = aiEvalWeekly.html;

  // 📝 다음 주 AI 맞춤 학습 계획
  const plans = [];
  if (studyDays < 5) {
    plans.push(`<div class="report-item">📅 <strong>매일 학습 루틴</strong>: 주중 5일 이상 공부하기를 목표로 하세요.</div>`);
  }
  if (avgTimePerDay < 60) {
    plans.push(`<div class="report-item">⏰ <strong>학습 시간 늘리기</strong>: 하루 최소 1시간 이상 집중 학습 시간을 확보하세요.</div>`);
  }
  Object.keys(testScores).forEach(subj => {
    const scores = testScores[subj];
    const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
    if (avgScore < 70) {
      plans.push(`<div class="report-item">📖 <strong>${subj} 기본 개념</strong>: 교과서 정독 및 기본 문제 30개 풀기</div>`);
    } else if (avgScore < 85) {
      plans.push(`<div class="report-item">🎯 <strong>${subj} 심화 학습</strong>: 고난도 문제 20개 도전하기</div>`);
    }
  });
  if (avgProgress < 70) {
    plans.push(`<div class="report-item">✅ <strong>완성도 높이기</strong>: 매일 계획한 과제를 100% 완료하기에 도전하세요.</div>`);
  }
  if (plans.length === 0) {
    plans.push(`<div class="report-item">🎯 <strong>현재 수준 유지</strong>: 지금처럼만 계속하면 됩니다! 꾸준함을 유지하세요.</div>`);
  }
  document.getElementById("analysisReportPlan").innerHTML = plans.join('');
  document.getElementById("analysisReportPlanTitle").textContent = "📝 다음 주 AI 맞춤 학습 계획";

  // 💡 AI 보완 제안
  const suggestions = [];
  if (studyDays < 5) {
    suggestions.push(`<div class="report-item">이번 주는 ${studyDays}일만 공부했어요. 주말을 포함해 매일 조금씩 공부하는 습관을 만들어보세요.</div>`);
  }
  if (evals.length > 0) {
    const gradeToNum = { "상": 3, "중": 2, "하": 1 };
    let lowItems = [];
    let focusSum = 0, homeworkSum = 0, attitudeSum = 0, understandingSum = 0;
    let counts = { focus: 0, homework: 0, attitude: 0, understanding: 0 };
    evals.forEach(e => {
      if (e.focus) { focusSum += gradeToNum[e.focus]; counts.focus++; }
      if (e.homework) { homeworkSum += gradeToNum[e.homework]; counts.homework++; }
      if (e.attitude) { attitudeSum += gradeToNum[e.attitude]; counts.attitude++; }
      if (e.understanding) { understandingSum += gradeToNum[e.understanding]; counts.understanding++; }
    });
    if (counts.focus > 0 && focusSum / counts.focus < 2) lowItems.push("집중력");
    if (counts.homework > 0 && homeworkSum / counts.homework < 2) lowItems.push("숙제 완성도");
    if (counts.attitude > 0 && attitudeSum / counts.attitude < 2) lowItems.push("학습 태도");
    if (counts.understanding > 0 && understandingSum / counts.understanding < 2) lowItems.push("이해도");
    if (lowItems.length > 0) {
      suggestions.push(`<div class="report-item">선생님 평가에서 <strong>${lowItems.join(", ")}</strong> 부분이 낮게 나왔어요. 특별히 신경 써서 개선해보세요.</div>`);
    }
  }
  if (totalTasks > 0 && completedTasks / totalTasks < 0.7) {
    suggestions.push(`<div class="report-item">과제 완성률이 ${Math.round(completedTasks / totalTasks * 100)}%입니다. 계획을 좀 더 현실적으로 세우거나, 완성도를 높여보세요.</div>`);
  }
  if (suggestions.length === 0) {
    suggestions.push(`<div class="report-item">특별히 보완할 점이 없습니다! 현재 학습 패턴을 유지하세요. 👍</div>`);
  }
  document.getElementById("analysisReportSuggestions").innerHTML = suggestions.join('');

  // 🌟 AI가 칭찬하는 점
  const strengths = [];
  if (studyDays >= 6) {
    strengths.push(`<div class="report-item">🌟 <strong>완벽한 출석!</strong> 거의 매일 공부했어요. 이런 꾸준함이 실력 향상의 비결입니다.</div>`);
  }
  if (avgProgress >= 80) {
    strengths.push(`<div class="report-item">✨ <strong>목표 달성 우수!</strong> 평균 ${avgProgress}%의 높은 달성률을 보였습니다.</div>`);
  }
  if (hours >= 10) {
    strengths.push(`<div class="report-item">💪 <strong>열정적인 학습!</strong> 이번 주 총 ${hours}시간 이상 공부했어요. 대단합니다!</div>`);
  }
  if (totalTasks > 0 && completedTasks / totalTasks >= 0.8) {
    strengths.push(`<div class="report-item">🎯 <strong>높은 완성도!</strong> 주어진 과제의 ${Math.round(completedTasks / totalTasks * 100)}%를 완료했어요.</div>`);
  }
  Object.keys(testScores).forEach(subj => {
    const scores = testScores[subj];
    if (scores.length > 1) {
      const trend = scores[scores.length - 1].score - scores[0].score;
      if (trend >= 10) {
        strengths.push(`<div class="report-item">📈 <strong>${subj} 급상승!</strong> ${trend}점이나 올랐어요. 노력의 결과가 보이네요!</div>`);
      }
    }
  });
  if (strengths.length === 0) {
    strengths.push(`<div class="report-item">💫 <strong>꾸준한 노력!</strong> 이번 주도 학습을 위해 시간을 투자했어요. 이런 노력이 쌓이면 큰 발전이 됩니다!</div>`);
  }
  document.getElementById("analysisReportStrengths").innerHTML = strengths.join('');
}

// 리포트 인쇄
function printStudentReport() {
  if (!analysisSelectedStudentId || !analysisSelectedStudentData) {
    alert("학생을 먼저 선택하세요.");
    return;
  }
  window.print();
}

// ========== 출석 관리 탭 함수들 ==========

// 출석 관리 탭 이벤트 설정
function setupAttendanceTabEvents() {
  if (attendanceTabsInitialized) return;
  attendanceTabsInitialized = true;

  // 날짜 선택 이벤트
  const dateInput = document.getElementById("attendanceDate");
  if (dateInput) {
    dateInput.addEventListener("change", async () => {
      if (attendanceSelectedStudentId) {
        await loadTardinessForDate(attendanceSelectedStudentId, dateInput.value);
      }
    });
  }

  // 저장 버튼 이벤트
  const saveBtn = document.getElementById("saveTardinessBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", saveTardiness);
  }

  // 삭제 버튼 이벤트
  const deleteBtn = document.getElementById("deleteTardinessBtn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", deleteTardiness);
  }
}

// 출석 관리 학생 목록 렌더링
async function renderAttendanceStudentList() {
  const container = document.getElementById("attendanceStudentList");
  if (!container) return;

  container.innerHTML = '<div class="ghost">학생 목록을 불러오는 중...</div>';

  try {
    const students = [];
    const q = query(collection(db, "users"), where("role", "==", "student"), where("academyId", "==", myData.academyId));
    const snap = await getDocs(q);
    trackRead(snap.size || 1);

    snap.forEach(d => {
      students.push({ id: d.id, ...d.data() });
    });

    if (students.length === 0) {
      container.innerHTML = '<div class="ghost">등록된 학생이 없습니다.</div>';
      return;
    }

    // 학년별 정렬
    students.sort((a, b) => (a.grade || "").localeCompare(b.grade || "") || (a.name || "").localeCompare(b.name || ""));

    container.innerHTML = students.map(s => `
      <div class="student-item" data-uid="${s.id}" style="padding:10px; margin-bottom:8px; background:#fff; border-radius:8px; cursor:pointer; border:2px solid transparent; transition:all 0.2s;">
        <div style="font-weight:700;">${escapeHtml(s.name || s.nickname || "이름없음")}</div>
        <div style="font-size:12px; color:#666;">${escapeHtml(s.grade || "")}</div>
      </div>
    `).join("");

    // 학생 클릭 이벤트
    container.querySelectorAll(".student-item").forEach(item => {
      item.addEventListener("click", () => {
        const uid = item.dataset.uid;
        const student = students.find(s => s.id === uid);
        if (student) {
          selectAttendanceStudent(uid, student, item);
        }
      });
    });
  } catch (err) {
    container.innerHTML = '<div class="ghost" style="color:#ff6b6b;">학생 목록 로드 실패</div>';
  }
}

// 출석 관리 학생 선택
async function selectAttendanceStudent(uid, userData, clickedElement) {
  attendanceSelectedStudentId = uid;
  attendanceSelectedStudentData = userData;

  // 선택 UI 업데이트
  document.querySelectorAll("#attendanceStudentList .student-item").forEach(item => {
    item.style.borderColor = "transparent";
    item.style.background = "#fff";
  });
  if (clickedElement) {
    clickedElement.style.borderColor = "#667eea";
    clickedElement.style.background = "#f0f4ff";
  }

  // 선택된 학생 표시
  const selectedDiv = document.getElementById("attendanceSelectedStudent");
  selectedDiv.innerHTML = `
    <span style="color:#667eea;">📋</span>
    <strong>${escapeHtml(userData.name || userData.nickname || "이름없음")}</strong>
    <span style="color:#666; font-size:14px; margin-left:8px;">${escapeHtml(userData.grade || "")}</span>
  `;

  // 날짜 선택 표시 및 오늘 날짜 설정
  const datePicker = document.getElementById("attendanceDatePicker");
  datePicker.style.display = "block";

  const dateInput = document.getElementById("attendanceDate");
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  dateInput.value = today;
  dateInput.max = today; // 미래 날짜 선택 불가

  // 폼 표시
  document.getElementById("attendanceForm").style.display = "block";

  // 해당 날짜의 지각 기록 로드
  await loadTardinessForDate(uid, today);

  // 지각 히스토리 로드
  await renderAttendanceHistory(uid);
}

// 특정 날짜의 지각 기록 로드
async function loadTardinessForDate(uid, dateKey) {
  const lateMinutesInput = document.getElementById("lateMinutesInput");
  const lateReasonInput = document.getElementById("lateReasonInput");
  const deleteBtn = document.getElementById("deleteTardinessBtn");
  const messageDiv = document.getElementById("tardinessMessage");

  // 입력 필드 초기화
  lateMinutesInput.value = "";
  lateReasonInput.value = "";
  deleteBtn.style.display = "none";
  messageDiv.innerHTML = "";

  try {
    const dayDoc = await getDoc(dailyRef(uid, dateKey));
    trackRead();

    if (dayDoc.exists()) {
      const data = dayDoc.data();
      if (data.tardiness) {
        lateMinutesInput.value = data.tardiness.lateMinutes || "";
        lateReasonInput.value = data.tardiness.reason || "";
        deleteBtn.style.display = "inline-block";
        messageDiv.innerHTML = `<span class="success">✓ ${dateKey} 지각 기록이 있습니다.</span>`;
      } else {
        messageDiv.innerHTML = `<span class="ghost">${dateKey}에 지각 기록이 없습니다.</span>`;
      }
    } else {
      messageDiv.innerHTML = `<span class="ghost">${dateKey}에 학습 기록이 없습니다.</span>`;
    }
  } catch (err) {
    messageDiv.innerHTML = `<span class="error">지각 기록 로드 실패</span>`;
  }
}

// 지각 기록 저장
async function saveTardiness() {
  if (!attendanceSelectedStudentId) {
    alert("학생을 먼저 선택하세요.");
    return;
  }

  const dateKey = document.getElementById("attendanceDate").value;
  const lateMinutes = parseInt(document.getElementById("lateMinutesInput").value) || 0;
  const reason = document.getElementById("lateReasonInput").value.trim();
  const messageDiv = document.getElementById("tardinessMessage");

  if (lateMinutes <= 0) {
    messageDiv.innerHTML = '<span class="error">지각 시간을 입력하세요.</span>';
    return;
  }

  if (!reason) {
    messageDiv.innerHTML = '<span class="error">지각 사유를 입력하세요.</span>';
    return;
  }

  try {
    const tardinessData = {
      lateMinutes: lateMinutes,
      reason: reason,
      recordedBy: me.uid,
      recordedAt: serverTimestamp()
    };

    await setDoc(dailyRef(attendanceSelectedStudentId, dateKey), {
      tardiness: tardinessData
    }, { merge: true });
    trackWrite();

    messageDiv.innerHTML = '<span class="success">✓ 지각 기록이 저장되었습니다.</span>';
    document.getElementById("deleteTardinessBtn").style.display = "inline-block";

    // 히스토리 새로고침
    await renderAttendanceHistory(attendanceSelectedStudentId);
  } catch (err) {
    messageDiv.innerHTML = '<span class="error">저장 실패</span>';
  }
}

// 지각 기록 삭제
async function deleteTardiness() {
  if (!attendanceSelectedStudentId) return;

  const dateKey = document.getElementById("attendanceDate").value;
  const messageDiv = document.getElementById("tardinessMessage");

  if (!confirm(`${dateKey}의 지각 기록을 삭제하시겠습니까?`)) {
    return;
  }

  try {
    await setDoc(dailyRef(attendanceSelectedStudentId, dateKey), {
      tardiness: deleteField()
    }, { merge: true });
    trackWrite();

    // 입력 필드 초기화
    document.getElementById("lateMinutesInput").value = "";
    document.getElementById("lateReasonInput").value = "";
    document.getElementById("deleteTardinessBtn").style.display = "none";
    messageDiv.innerHTML = '<span class="success">✓ 지각 기록이 삭제되었습니다.</span>';

    // 히스토리 새로고침
    await renderAttendanceHistory(attendanceSelectedStudentId);
  } catch (err) {
    messageDiv.innerHTML = '<span class="error">삭제 실패</span>';
  }
}

// 지각 히스토리 렌더링 (최근 30일)
async function renderAttendanceHistory(uid) {
  const container = document.getElementById("attendanceHistoryList");
  if (!container) return;

  container.innerHTML = '<div class="ghost">지각 기록을 불러오는 중...</div>';

  try {
    // 최근 30일의 daily 문서 조회
    const dailySnap = await getDocs(dailiesCol(uid));
    trackRead();

    const tardinessRecords = [];
    dailySnap.forEach(doc => {
      const data = doc.data();
      if (data.tardiness && data.tardiness.lateMinutes) {
        tardinessRecords.push({
          date: doc.id,
          ...data.tardiness
        });
      }
    });

    // 날짜 내림차순 정렬
    tardinessRecords.sort((a, b) => b.date.localeCompare(a.date));

    // 최근 30일만 표시
    const recentRecords = tardinessRecords.slice(0, 30);

    if (recentRecords.length === 0) {
      container.innerHTML = `
        <div class="no-tardiness" style="background:#f0fff4; border-left:4px solid #22a06b; padding:12px; border-radius:8px;">
          <span style="color:#22a06b; font-weight:700;">✓ 지각 기록이 없습니다!</span>
        </div>
      `;
      return;
    }

    // 통계 계산
    const totalCount = recentRecords.length;
    const totalMinutes = recentRecords.reduce((sum, r) => sum + (r.lateMinutes || 0), 0);

    container.innerHTML = `
      <div style="display:flex; gap:16px; margin-bottom:16px;">
        <div class="stat-card" style="flex:1; text-align:center;">
          <div class="kicker">총 지각 횟수</div>
          <div class="num" style="color:#ff6b6b;">${totalCount}회</div>
        </div>
        <div class="stat-card" style="flex:1; text-align:center;">
          <div class="kicker">총 지각 시간</div>
          <div class="num" style="color:#ff6b6b;">${totalMinutes}분</div>
        </div>
      </div>
      <div style="max-height:300px; overflow-y:auto;">
        ${recentRecords.map(r => `
          <div class="tardiness-item" style="background:#fff5f5; border-left:4px solid #ff6b6b; padding:12px; margin-bottom:8px; border-radius:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:700; color:#333;">${r.date}</span>
              <span style="color:#ff6b6b; font-weight:700;">${r.lateMinutes}분 지각</span>
            </div>
            <div style="color:#666; font-size:14px; margin-top:4px;">사유: ${r.reason || "-"}</div>
          </div>
        `).join("")}
      </div>
    `;
  } catch (err) {
    container.innerHTML = '<div class="ghost" style="color:#ff6b6b;">지각 기록 로드 실패</div>';
  }
}

// 기간별 지각 통계 계산 (리포트용)
async function getTardinessStats(uid, days) {
  const result = { totalCount: 0, totalMinutes: 0, records: [] };

  try {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days);

    const dailySnap = await getDocs(dailiesCol(uid));
    trackRead();

    dailySnap.forEach(doc => {
      const docDate = new Date(doc.id + "T00:00:00");
      if (docDate >= startDate && docDate <= today) {
        const data = doc.data();
        if (data.tardiness && data.tardiness.lateMinutes) {
          result.totalCount++;
          result.totalMinutes += data.tardiness.lateMinutes;
          result.records.push({
            date: doc.id,
            lateMinutes: data.tardiness.lateMinutes,
            reason: data.tardiness.reason
          });
        }
      }
    });

    // 날짜 내림차순 정렬
    result.records.sort((a, b) => b.date.localeCompare(a.date));
  } catch (err) {
  }

  return result;
}

// ===== 채팅 시스템 =====

// 채팅 이벤트 리스너 초기화
function initChatEventListeners() {
  // 채팅 플로팅 버튼 클릭 이벤트
  const floatingBtn = document.getElementById("chatFloatingBtn");
  if (floatingBtn) {
    floatingBtn.onclick = function() {
      if (myData && myData.role === "student") {
        openStudentChat();
      } else if (myData && myData.role === "admin") {
        openAdminChat();
      }
    };
  }

  // 학생용 채팅 닫기 버튼
  const closeStudentBtn = document.getElementById("closeStudentChatBtn");
  if (closeStudentBtn) closeStudentBtn.onclick = closeStudentChat;

  const sendStudentBtn = document.getElementById("sendStudentChatBtn");
  if (sendStudentBtn) sendStudentBtn.onclick = sendStudentMessage;

  const studentInput = document.getElementById("studentChatInput");
  if (studentInput) {
    studentInput.onkeydown = function(e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendStudentMessage();
      }
    };
  }

  // 관리자용 채팅 닫기 버튼
  const closeAdminBtn = document.getElementById("closeAdminChatBtn");
  if (closeAdminBtn) closeAdminBtn.onclick = closeAdminChat;

  const sendAdminBtn = document.getElementById("sendAdminChatBtn");
  if (sendAdminBtn) sendAdminBtn.onclick = sendAdminMessage;

  const adminInput = document.getElementById("adminChatInput");
  if (adminInput) {
    adminInput.onkeydown = function(e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendAdminMessage();
      }
    };
  }

  // 새 대화 모달
  const newChatBtn = document.getElementById("newChatBtn");
  if (newChatBtn) newChatBtn.onclick = openNewChatModal;

  const closeNewChatBtn = document.getElementById("closeNewChatModalBtn");
  if (closeNewChatBtn) closeNewChatBtn.onclick = closeNewChatModal;
}

// DOM 로드 후 채팅 이벤트 리스너 초기화
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initChatEventListeners);
} else {
  initChatEventListeners();
}

// 새 대화 모달 열기
async function openNewChatModal() {
  const modal = document.getElementById("newChatModal");
  if (!modal) return;
  modal.style.display = "flex";

  const listEl = document.getElementById("newChatStudentList");
  if (!listEl) return;
  listEl.innerHTML = '<div class="ghost" style="padding:20px; text-align:center;">로딩 중...</div>';

  try {
    // 우리 학원 학생 목록 가져오기
    const q = query(
      collection(db, "users"),
      where("academyId", "==", myData.academyId),
      where("role", "==", "student")
    );
    const snap = await getDocs(q);
    trackRead();

    if (snap.empty) {
      listEl.innerHTML = '<div class="ghost" style="padding:20px; text-align:center;">등록된 학생이 없습니다</div>';
      return;
    }

    let html = "";
    snap.forEach(docSnap => {
      const student = docSnap.data();
      const uid = docSnap.id;
      const name = student.name || student.nickname || "학생";
      const grade = student.grade || "";
      html += `
        <div class="new-chat-student-item" onclick="startNewChatWithStudent('${uid}', '${name.replace(/'/g, "\\'")}')">
          <span class="name">${name}</span>
          ${grade ? `<span class="grade">${grade}</span>` : ""}
        </div>
      `;
    });
    listEl.innerHTML = html;
  } catch (err) {
    listEl.innerHTML = '<div class="ghost" style="padding:20px; text-align:center; color:#e74c3c;">오류가 발생했습니다</div>';
  }
}

// 새 대화 모달 닫기
function closeNewChatModal() {
  const modal = document.getElementById("newChatModal");
  if (modal) modal.style.display = "none";
}

// 학생과 새 대화 시작
window.startNewChatWithStudent = async function(studentUid, studentName) {
  closeNewChatModal();

  const roomId = getChatRoomId(studentUid, myData.academyId);
  currentChatRoomId = roomId;

  // 채팅방 확인 및 생성
  const roomRef = doc(db, "chatRooms", roomId);
  const roomSnap = await getDoc(roomRef);
  trackRead();

  if (!roomSnap.exists()) {
    // 채팅방 생성
    await setDoc(roomRef, {
      academyId: myData.academyId,
      studentId: studentUid,
      studentName: studentName,
      adminId: me.uid,
      adminName: myData.name || myData.nickname || "선생님",
      participants: [studentUid, me.uid],
      lastMessage: "",
      lastMessageAt: serverTimestamp(),
      unreadCount: { student: 0, admin: 0 },
      createdAt: serverTimestamp()
    });
    trackWrite();
  }

  // 입력 활성화
  const inputEl = document.getElementById("adminChatInput");
  const sendBtn = document.getElementById("sendAdminChatBtn");
  if (inputEl) inputEl.disabled = false;
  if (sendBtn) sendBtn.disabled = false;

  // 메시지 로드
  setupAdminChatMessagesListener(roomId);

  // 학생 목록 새로고침 (새 채팅방이 추가됨)
  setupAdminChatRoomsListener();
};

// 학생용 채팅 열기
async function openStudentChat() {
  const popup = document.getElementById("studentChatPopup");
  if (popup) popup.classList.add("open");

  const roomId = getChatRoomId(me.uid, myData.academyId);
  currentChatRoomId = roomId;

  // 채팅방 확인 및 생성
  const roomRef = doc(db, "chatRooms", roomId);
  const roomSnap = await getDoc(roomRef);
  trackRead();

  if (!roomSnap.exists()) {
    // 채팅방 생성 (첫 메시지 전송 시 실제 생성)
    await setDoc(roomRef, {
      academyId: myData.academyId,
      studentId: me.uid,
      studentName: myData.name || myData.nickname || "학생",
      participants: [me.uid],
      lastMessage: "",
      lastMessageAt: serverTimestamp(),
      unreadCount: {},
      createdAt: serverTimestamp()
    });
    trackWrite();
  }

  // 메시지 로드 및 실시간 리스너 설정
  setupStudentChatListener(roomId);

  // 읽음 처리
  markMessagesAsRead(roomId);
}

// 학생용 채팅 닫기
function closeStudentChat() {
  const popup = document.getElementById("studentChatPopup");
  if (popup) popup.classList.remove("open");

  // 메시지 리스너 해제
  if (unsubChatMessages) {
    unsubChatMessages();
    unsubChatMessages = null;
  }
  currentChatRoomId = null;
}

// 학생용 채팅 메시지 리스너
function setupStudentChatListener(roomId) {
  if (unsubChatMessages) {
    unsubChatMessages();
  }

  const q = query(
    chatMessagesCol(roomId),
    orderBy("createdAt", "asc")
  );

  unsubChatMessages = onSnapshot(q, (snapshot) => {
    trackRead();
    renderChatMessages(snapshot.docs, "studentChatMessages");

    // 새 메시지 있으면 스크롤
    const container = document.getElementById("studentChatMessages");
    container.scrollTop = container.scrollHeight;

    // 창이 열려있으면 읽음 처리
    if (currentChatRoomId === roomId) {
      markMessagesAsRead(roomId);
    }
  });
}

// 채팅 메시지 렌더링 (공용)
function renderChatMessages(docs, containerId) {
  const container = document.getElementById(containerId);
  if (!docs || docs.length === 0) {
    container.innerHTML = '<div class="chat-empty">메시지가 없습니다. 대화를 시작해보세요!</div>';
    return;
  }

  let html = "";
  docs.forEach(docSnap => {
    const msg = docSnap.data();
    const isSent = msg.senderId === me.uid;
    const time = msg.createdAt ? new Date(msg.createdAt.toDate()).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "";

    html += `
      <div class="chat-message ${isSent ? "sent" : "received"}">
        <div class="chat-message-content">${escapeHtml(msg.message)}</div>
        <div class="chat-message-time">${time}</div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// 학생용 메시지 전송
async function sendStudentMessage() {
  const input = document.getElementById("studentChatInput");
  const message = input.value.trim();
  if (!message || !currentChatRoomId) return;

  input.value = "";

  try {
    // 메시지 추가
    await addDoc(chatMessagesCol(currentChatRoomId), {
      senderId: me.uid,
      senderName: myData.name || myData.nickname || "학생",
      senderRole: "student",
      message: message,
      createdAt: serverTimestamp(),
      read: false
    });
    trackWrite();

    // 채팅방 정보 업데이트
    await updateDoc(doc(db, "chatRooms", currentChatRoomId), {
      lastMessage: message.substring(0, 50),
      lastMessageAt: serverTimestamp(),
      lastMessageBy: me.uid,
      [`unreadCount.admin`]: increment(1)
    });
    trackWrite();
  } catch (err) {
    alert("메시지 전송에 실패했습니다.");
  }
}

// 메시지 읽음 처리
async function markMessagesAsRead(roomId) {
  try {
    const role = myData.role === "student" ? "student" : "admin";
    await updateDoc(doc(db, "chatRooms", roomId), {
      [`unreadCount.${role}`]: 0
    });
    trackWrite();
  } catch (err) {
    // 채팅방이 없을 수 있음 - 무시
  }
}

// 관리자용 채팅 열기
function openAdminChat() {
  const popup = document.getElementById("adminChatPopup");
  if (popup) popup.classList.add("open");

  // 학생 목록 로드
  setupAdminChatRoomsListener();
}

// 관리자용 채팅 닫기
function closeAdminChat() {
  const popup = document.getElementById("adminChatPopup");
  if (popup) popup.classList.remove("open");

  // 리스너 해제
  if (unsubChatRooms) {
    unsubChatRooms();
    unsubChatRooms = null;
  }
  if (unsubChatMessages) {
    unsubChatMessages();
    unsubChatMessages = null;
  }
  currentChatRoomId = null;

  // 선택 상태 초기화
  const msgEl = document.getElementById("adminChatMessages");
  const inputEl = document.getElementById("adminChatInput");
  const sendBtn = document.getElementById("sendAdminChatBtn");
  if (msgEl) msgEl.innerHTML = '<div class="chat-empty" style="text-align:center; padding:40px;">학생을 선택하세요</div>';
  if (inputEl) inputEl.disabled = true;
  if (sendBtn) sendBtn.disabled = true;
}

// 관리자용 채팅방 목록 리스너
function setupAdminChatRoomsListener() {
  if (unsubChatRooms) {
    unsubChatRooms();
  }

  // 인덱스 없이 쿼리 (클라이언트에서 정렬)
  const q = query(
    chatRoomsCol(),
    where("academyId", "==", myData.academyId)
  );

  unsubChatRooms = onSnapshot(q, (snapshot) => {
    trackRead();

    // 클라이언트에서 lastMessageAt 기준 정렬
    const sortedDocs = [...snapshot.docs].sort((a, b) => {
      const aTime = a.data().lastMessageAt?.toMillis() || 0;
      const bTime = b.data().lastMessageAt?.toMillis() || 0;
      return bTime - aTime; // 내림차순
    });

    renderChatStudentList(sortedDocs);

    // 총 읽지 않은 메시지 수 계산
    let totalUnread = 0;
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.unreadCount && data.unreadCount.admin) {
        totalUnread += data.unreadCount.admin;
      }
    });
    updateChatBadge(totalUnread);
  });
}

// 학생 목록 렌더링 (관리자용)
function renderChatStudentList(docs) {
  const container = document.getElementById("chatStudentListContent");

  if (!docs || docs.length === 0) {
    container.innerHTML = '<div class="chat-empty" style="padding:20px; text-align:center;">채팅 내역이 없습니다</div>';
    return;
  }

  let html = "";
  docs.forEach(docSnap => {
    const room = docSnap.data();
    const roomId = docSnap.id;
    const unread = room.unreadCount && room.unreadCount.admin ? room.unreadCount.admin : 0;
    const time = room.lastMessageAt ? new Date(room.lastMessageAt.toDate()).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "";
    const isActive = currentChatRoomId === roomId ? "active" : "";

    html += `
      <div class="chat-student-item ${isActive}" data-room-id="${roomId}" onclick="selectChatStudent('${roomId}')">
        <div class="chat-student-info">
          <span class="name">${escapeHtml(room.studentName || "학생")}</span>
          <span class="preview">${escapeHtml(room.lastMessage || "")}</span>
        </div>
        <div class="chat-student-meta">
          <span class="chat-student-time">${time}</span>
          ${unread > 0 ? `<span class="unread-dot"></span>` : ""}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// 학생 선택 (관리자용)
window.selectChatStudent = async function(roomId) {
  currentChatRoomId = roomId;

  // 선택 UI 업데이트
  document.querySelectorAll(".chat-student-item").forEach(el => {
    el.classList.remove("active");
    if (el.dataset.roomId === roomId) {
      el.classList.add("active");
    }
  });

  // 입력 활성화
  const inputEl = document.getElementById("adminChatInput");
  const sendBtn = document.getElementById("sendAdminChatBtn");
  if (inputEl) inputEl.disabled = false;
  if (sendBtn) sendBtn.disabled = false;

  // 메시지 로드
  setupAdminChatMessagesListener(roomId);

  // 읽음 처리
  markMessagesAsRead(roomId);
};

// 관리자용 메시지 리스너
function setupAdminChatMessagesListener(roomId) {
  if (unsubChatMessages) {
    unsubChatMessages();
  }

  const q = query(
    chatMessagesCol(roomId),
    orderBy("createdAt", "asc")
  );

  unsubChatMessages = onSnapshot(q, (snapshot) => {
    trackRead();
    renderChatMessages(snapshot.docs, "adminChatMessages");

    // 새 메시지 있으면 스크롤
    const container = document.getElementById("adminChatMessages");
    container.scrollTop = container.scrollHeight;

    // 창이 열려있으면 읽음 처리
    if (currentChatRoomId === roomId) {
      markMessagesAsRead(roomId);
    }
  });
}

// 관리자용 메시지 전송
async function sendAdminMessage() {
  const input = document.getElementById("adminChatInput");
  const message = input.value.trim();
  if (!message || !currentChatRoomId) return;

  input.value = "";

  try {
    // 채팅방 정보 가져오기
    const roomSnap = await getDoc(doc(db, "chatRooms", currentChatRoomId));
    trackRead();
    const roomData = roomSnap.data();

    // 메시지 추가
    await addDoc(chatMessagesCol(currentChatRoomId), {
      senderId: me.uid,
      senderName: myData.name || myData.nickname || "선생님",
      senderRole: "admin",
      message: message,
      createdAt: serverTimestamp(),
      read: false
    });
    trackWrite();

    // 채팅방 정보 업데이트
    await updateDoc(doc(db, "chatRooms", currentChatRoomId), {
      lastMessage: message.substring(0, 50),
      lastMessageAt: serverTimestamp(),
      lastMessageBy: me.uid,
      adminId: me.uid,
      adminName: myData.name || myData.nickname || "선생님",
      [`unreadCount.student`]: increment(1)
    });
    trackWrite();
  } catch (err) {
    alert("메시지 전송에 실패했습니다.");
  }
}

// 채팅 배지 업데이트
function updateChatBadge(count) {
  const badge = document.getElementById("chatUnreadBadge");
  if (!badge) return;

  if (count > 0) {
    badge.textContent = count > 99 ? "99+" : count;
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }
}

// 채팅 토스트 알림 표시
function showChatToast(senderName, message) {
  const toast = document.getElementById("chatToast");
  const bodyEl = document.getElementById("chatToastBody");

  if (!toast || !bodyEl) return;

  const truncatedMsg = message.length > 30 ? message.substring(0, 30) + "..." : message;
  bodyEl.innerHTML = `<strong>${escapeHtml(senderName)}</strong>: ${escapeHtml(truncatedMsg)}`;

  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 4000);
}

// 브라우저 알림 표시
function showChatSystemNotification(senderName, message) {
  if (!("Notification" in window)) return;

  if (Notification.permission === "granted") {
    new Notification(`💬 ${senderName}`, {
      body: message,
      icon: "https://via.placeholder.com/48?text=💬",
      tag: "chat-notification"
    });
  }
}

// 채팅 알림 권한 요청
function maybeRequestChatNotificationPermission() {
  if (!("Notification" in window)) return;

  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}

// 학생용 채팅 리스너 설정 (renderStudent에서 호출)
function setupStudentChatRoomListener() {
  const roomId = getChatRoomId(me.uid, myData.academyId);

  // 채팅방 문서 리스너
  const roomRef = doc(db, "chatRooms", roomId);

  if (unsubChatRooms) {
    unsubChatRooms();
  }

  unsubChatRooms = onSnapshot(roomRef, (docSnap) => {
    trackRead();
    if (docSnap.exists()) {
      const data = docSnap.data();
      const unread = data.unreadCount && data.unreadCount.student ? data.unreadCount.student : 0;
      updateChatBadge(unread);

      // 새 메시지 알림 (창이 닫혀있고, 내가 보낸 게 아닐 때)
      const popup = document.getElementById("studentChatPopup");
      const isPopupOpen = popup && popup.classList.contains("open");
      if (unread > 0 && data.lastMessageBy !== me.uid && !isPopupOpen) {
        const senderName = data.adminName || "선생님";
        showChatToast(senderName, data.lastMessage);
        showChatSystemNotification(senderName, data.lastMessage);
      }
    }
  });
}

// 관리자용 채팅 알림 리스너 (renderAdmin에서 호출)
function setupAdminChatNotificationListener() {
  const q = query(
    chatRoomsCol(),
    where("academyId", "==", myData.academyId)
  );

  if (unsubChatRooms) {
    unsubChatRooms();
  }

  let initialLoad = true;

  unsubChatRooms = onSnapshot(q, (snapshot) => {
    trackRead();

    // 총 읽지 않은 메시지 수 계산
    let totalUnread = 0;
    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (data.unreadCount && data.unreadCount.admin) {
        totalUnread += data.unreadCount.admin;
      }
    });
    updateChatBadge(totalUnread);

    // 새 메시지 알림 (초기 로드가 아니고, 채팅창이 닫혀있을 때)
    const popup = document.getElementById("adminChatPopup");
    const isPopupOpen = popup && popup.classList.contains("open");
    if (!initialLoad && !isPopupOpen) {
      snapshot.docChanges().forEach(change => {
        if (change.type === "modified") {
          const data = change.doc.data();
          if (data.lastMessageBy !== me.uid && data.unreadCount && data.unreadCount.admin > 0) {
            const senderName = data.studentName || "학생";
            showChatToast(senderName, data.lastMessage);
            showChatSystemNotification(senderName, data.lastMessage);
          }
        }
      });
    }

    initialLoad = false;
  });
}

// =====================================================
// 오답 분석 시스템 (Wrong Answer Analysis System)
// =====================================================

// Global state for wrong answer analysis
let currentProblemSet = null;
let currentProblemSetId = null;
let problemSetProblems = []; // Array of problems in current set
let wrongAnswerTabInitialized = false;

// =====================================================
// AI API Management
// =====================================================

// API Key management
function getApiKeys() {
  // API 키는 사용자가 설정에서 직접 입력해야 합니다
  const geminiKey = localStorage.getItem('geminiApiKey') || '';
  const openaiKey = localStorage.getItem('openaiApiKey') || '';
  const claudeKey = localStorage.getItem('claudeApiKey') || '';
  return { geminiKey, openaiKey, claudeKey };
}

function saveApiKeys(geminiKey, openaiKey, claudeKey) {
  console.log('Saving API keys:', { geminiKey: geminiKey ? '설정됨' : '없음', openaiKey: openaiKey ? '설정됨' : '없음', claudeKey: claudeKey ? '설정됨' : '없음' });

  // 항상 저장 (빈 값이라도)
  localStorage.setItem('geminiApiKey', geminiKey || '');
  localStorage.setItem('openaiApiKey', openaiKey || '');
  localStorage.setItem('claudeApiKey', claudeKey || '');

  // 저장 확인
  const savedClaude = localStorage.getItem('claudeApiKey');
  console.log('Claude key saved:', savedClaude ? '성공' : '실패', savedClaude?.substring(0, 20) + '...');

  updateAiStatus();
  showNotification('API 키가 저장되었습니다.', 'success');
}

function updateAiStatus() {
  console.log('🔄 [updateAiStatus] 상태 업데이트 시작');

  const { geminiKey, openaiKey, claudeKey } = getApiKeys();

  console.log('🔄 [updateAiStatus] API 키 상태:');
  console.log('  - Gemini:', geminiKey ? `✅ 설정됨 (${geminiKey.substring(0, 10)}...)` : '❌ 없음');
  console.log('  - OpenAI:', openaiKey ? `✅ 설정됨 (${openaiKey.substring(0, 10)}...)` : '❌ 없음');
  console.log('  - Claude:', claudeKey ? `✅ 설정됨 (${claudeKey.substring(0, 10)}...)` : '❌ 없음');

  // localStorage 직접 확인
  console.log('🔄 [updateAiStatus] localStorage 직접 확인:');
  console.log('  - geminiApiKey:', localStorage.getItem('geminiApiKey')?.substring(0, 15) || '(없음)');
  console.log('  - openaiApiKey:', localStorage.getItem('openaiApiKey')?.substring(0, 15) || '(없음)');
  console.log('  - claudeApiKey:', localStorage.getItem('claudeApiKey')?.substring(0, 15) || '(없음)');

  const geminiState = document.querySelector('#geminiStatus .ai-state');
  const gptState = document.querySelector('#gptStatus .ai-state');
  const claudeState = document.querySelector('#claudeStatus .ai-state');

  console.log('🔄 [updateAiStatus] DOM 요소 찾기:');
  console.log('  - geminiState:', geminiState ? '✅ 찾음' : '❌ 못찾음');
  console.log('  - gptState:', gptState ? '✅ 찾음' : '❌ 못찾음');
  console.log('  - claudeState:', claudeState ? '✅ 찾음' : '❌ 못찾음');

  if (geminiState) {
    if (geminiKey) {
      geminiState.textContent = '준비됨';
      geminiState.dataset.state = 'ready';
    } else {
      geminiState.textContent = '미설정';
      geminiState.dataset.state = 'unconfigured';
    }
  }

  if (gptState) {
    if (openaiKey) {
      gptState.textContent = '준비됨';
      gptState.dataset.state = 'ready';
    } else {
      gptState.textContent = '미설정';
      gptState.dataset.state = 'unconfigured';
    }
  }

  if (claudeState) {
    console.log('🔄 [updateAiStatus] Claude 상태 업데이트:', claudeKey ? '준비됨' : '미설정');
    if (claudeKey) {
      claudeState.textContent = '준비됨';
      claudeState.dataset.state = 'ready';
    } else {
      claudeState.textContent = '미설정';
      claudeState.dataset.state = 'unconfigured';
    }
  }

  console.log('🔄 [updateAiStatus] 상태 업데이트 완료');
}

function loadApiKeysToInputs() {
  console.log('📥 [loadApiKeysToInputs] 입력 필드에 키 로드 시작');

  const { geminiKey, openaiKey, claudeKey } = getApiKeys();

  console.log('📥 [loadApiKeysToInputs] 가져온 키:');
  console.log('  - Gemini:', geminiKey ? `${geminiKey.substring(0, 15)}...` : '(없음)');
  console.log('  - OpenAI:', openaiKey ? `${openaiKey.substring(0, 15)}...` : '(없음)');
  console.log('  - Claude:', claudeKey ? `${claudeKey.substring(0, 15)}...` : '(없음)');

  const geminiInput = document.getElementById('geminiApiKey');
  const openaiInput = document.getElementById('openaiApiKey');
  const claudeInput = document.getElementById('claudeApiKey');

  console.log('📥 [loadApiKeysToInputs] 입력 필드 찾기:');
  console.log('  - geminiInput:', geminiInput ? '✅' : '❌');
  console.log('  - openaiInput:', openaiInput ? '✅' : '❌');
  console.log('  - claudeInput:', claudeInput ? '✅' : '❌');

  if (geminiInput && geminiKey) {
    geminiInput.value = geminiKey;
    console.log('📥 [loadApiKeysToInputs] Gemini 입력 필드 설정 완료');
  }
  if (openaiInput && openaiKey) {
    openaiInput.value = openaiKey;
    console.log('📥 [loadApiKeysToInputs] OpenAI 입력 필드 설정 완료');
  }
  if (claudeInput && claudeKey) {
    claudeInput.value = claudeKey;
    console.log('📥 [loadApiKeysToInputs] Claude 입력 필드 설정 완료');
  }

  console.log('📥 [loadApiKeysToInputs] updateAiStatus 호출');
  updateAiStatus();
}

// Call Gemini Vision API
async function callGeminiVision(imageUrl, prompt) {
  const { geminiKey } = getApiKeys();
  if (!geminiKey) throw new Error('Gemini API 키가 설정되지 않았습니다.');

  // Fetch image and convert to base64
  const imageResponse = await fetch(imageUrl);
  const imageBlob = await imageResponse.blob();
  const base64 = await blobToBase64(imageBlob);
  const mimeType = imageBlob.type || 'image/jpeg';

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64.split(',')[1] } }
        ]
      }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 2048
      }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Gemini API 호출 실패');
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Call OpenAI GPT-4o Vision API
async function callGptVision(imageUrl, prompt) {
  const { openaiKey } = getApiKeys();
  if (!openaiKey) throw new Error('OpenAI API 키가 설정되지 않았습니다.');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }],
      max_tokens: 2048,
      temperature: 0.4
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'OpenAI API 호출 실패');
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// Call Claude Vision API
async function callClaudeVision(imageUrl, prompt) {
  console.log('🟣 [Claude] callClaudeVision 시작');
  console.log('🟣 [Claude] imageUrl:', imageUrl?.substring(0, 100) + '...');
  console.log('🟣 [Claude] prompt 길이:', prompt?.length);

  const { claudeKey } = getApiKeys();
  console.log('🟣 [Claude] API 키 존재:', !!claudeKey);
  console.log('🟣 [Claude] API 키 앞부분:', claudeKey?.substring(0, 20) + '...');

  if (!claudeKey) {
    console.error('🟣 [Claude] ❌ API 키가 없습니다!');
    throw new Error('Claude API 키가 설정되지 않았습니다.');
  }

  try {
    // Fetch image and convert to base64
    console.log('🟣 [Claude] 이미지 다운로드 중...');
    const imageResponse = await fetch(imageUrl);
    console.log('🟣 [Claude] 이미지 응답 상태:', imageResponse.status);

    if (!imageResponse.ok) {
      throw new Error(`이미지 다운로드 실패: ${imageResponse.status}`);
    }

    const imageBlob = await imageResponse.blob();
    console.log('🟣 [Claude] 이미지 blob 크기:', imageBlob.size, 'bytes');
    console.log('🟣 [Claude] 이미지 타입:', imageBlob.type);

    const base64 = await blobToBase64(imageBlob);
    const mimeType = imageBlob.type || 'image/jpeg';
    const base64Data = base64.split(',')[1];
    console.log('🟣 [Claude] Base64 데이터 길이:', base64Data?.length);

    // API 요청 준비
    const requestBody = {
      model: 'claude-sonnet-4-5',  // 최신 모델명 (2025년 기준)
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType,
              data: base64Data
            }
          },
          { type: 'text', text: prompt }
        ]
      }]
    };

    console.log('🟣 [Claude] API 요청 시작...');
    console.log('🟣 [Claude] 모델:', requestBody.model);
    console.log('🟣 [Claude] max_tokens:', requestBody.max_tokens);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(requestBody)
    });

    console.log('🟣 [Claude] API 응답 상태:', response.status, response.statusText);

    const responseData = await response.json();
    console.log('🟣 [Claude] API 응답 데이터:', JSON.stringify(responseData).substring(0, 500));

    if (!response.ok) {
      console.error('🟣 [Claude] ❌ API 오류:', responseData);
      throw new Error(responseData.error?.message || `Claude API 오류: ${response.status}`);
    }

    const resultText = responseData.content?.[0]?.text || '';
    console.log('🟣 [Claude] ✅ 성공! 응답 길이:', resultText.length);
    console.log('🟣 [Claude] 응답 미리보기:', resultText.substring(0, 200) + '...');

    return resultText;

  } catch (error) {
    console.error('🟣 [Claude] ❌ 예외 발생:', error.message);
    console.error('🟣 [Claude] 스택:', error.stack);
    throw error;
  }
}

// Helper: Convert blob to base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Compare AI responses and select best one
function compareAiResponses(geminiResponse, gptResponse, claudeResponse) {
  // Scoring criteria
  const scoreResponse = (text) => {
    let score = 0;

    // Length score (moderate length is better)
    const length = text.length;
    if (length > 100 && length < 1500) score += 20;
    else if (length >= 1500) score += 10;

    // Structure score (has clear sections)
    if (text.includes('정답') || text.includes('해설')) score += 15;
    if (text.includes('이유') || text.includes('때문')) score += 10;

    // Specificity score (mentions numbers or specific details)
    if (/\d+번/.test(text)) score += 15;
    if (text.includes('번을 선택') || text.includes('오답')) score += 10;

    // Educational value (explains why)
    if (text.includes('왜냐하면') || text.includes('따라서') || text.includes('그러므로')) score += 10;

    // Korean language quality
    const koreanRatio = (text.match(/[가-힣]/g) || []).length / text.length;
    if (koreanRatio > 0.5) score += 10;

    return score;
  };

  const geminiScore = geminiResponse ? scoreResponse(geminiResponse) : 0;
  const gptScore = gptResponse ? scoreResponse(gptResponse) : 0;
  const claudeScore = claudeResponse ? scoreResponse(claudeResponse) : 0;

  console.log(`AI Score - Gemini: ${geminiScore}, GPT: ${gptScore}, Claude: ${claudeScore}`);

  // Find the best response
  const scores = [
    { text: geminiResponse, source: 'gemini', score: geminiScore },
    { text: gptResponse, source: 'gpt', score: gptScore },
    { text: claudeResponse, source: 'claude', score: claudeScore }
  ].filter(r => r.text);

  if (scores.length === 0) {
    return { text: null, source: null, score: 0 };
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  // Return the highest scoring response
  return scores[0];
}

// Generate explanation for a single problem using multiple AIs
async function generateProblemExplanation(problem, problemIndex, wrongStats) {
  const { geminiKey, openaiKey, claudeKey } = getApiKeys();

  if (!geminiKey && !openaiKey && !claudeKey) {
    throw new Error('최소 하나의 API 키가 필요합니다.');
  }

  const prompt = `당신은 교육 전문가입니다. 다음 문제를 분석하고 상세한 해설을 작성해주세요.

문제 번호: ${problemIndex + 1}
정답: ${problem.correctAnswer}번
보기 개수: ${problem.choiceCount}개

학생들의 오답 현황:
${Object.entries(wrongStats).map(([choice, count]) => `- ${choice}번 선택: ${count}명`).join('\n')}

다음 형식으로 해설을 작성해주세요:

【정답 해설】
정답이 ${problem.correctAnswer}번인 이유를 명확하게 설명해주세요. 문제에서 요구하는 핵심 개념과 정답 선택의 근거를 제시해주세요.

【오답 분석】
${Object.keys(wrongStats).filter(k => parseInt(k) !== problem.correctAnswer).map(choice =>
  `${choice}번: 이 선택지가 왜 틀린지, 정답과의 차이점을 설명해주세요.`
).join('\n')}

문제 이미지를 분석하여 정확한 해설을 제공해주세요. 한국어로 답변해주세요.`;

  let geminiResponse = null;
  let gptResponse = null;
  let claudeResponse = null;

  // Call all APIs in parallel
  const promises = [];

  if (geminiKey && problem.imageUrl) {
    promises.push(
      callGeminiVision(problem.imageUrl, prompt)
        .then(r => { geminiResponse = r; })
        .catch(e => { console.error('Gemini error:', e); })
    );
  }

  if (openaiKey && problem.imageUrl) {
    promises.push(
      callGptVision(problem.imageUrl, prompt)
        .then(r => { gptResponse = r; })
        .catch(e => { console.error('GPT error:', e); })
    );
  }

  if (claudeKey && problem.imageUrl) {
    promises.push(
      callClaudeVision(problem.imageUrl, prompt)
        .then(r => { claudeResponse = r; })
        .catch(e => { console.error('Claude error:', e); })
    );
  }

  await Promise.all(promises);

  // Compare and select best response
  const result = compareAiResponses(geminiResponse, gptResponse, claudeResponse);

  return {
    explanation: result.text,
    source: result.source,
    geminiResponse,
    gptResponse,
    claudeResponse
  };
}

// Firebase collection references for wrong answer system
function problemSetsCol() {
  return collection(db, "academies", myData.academyId, "problemSets");
}

function studentAnswersCol(problemSetId) {
  return collection(db, "academies", myData.academyId, "problemSets", problemSetId, "studentAnswers");
}

// Setup wrong answer tab events
function setupWrongAnswerTabEvents() {
  if (wrongAnswerTabInitialized) return;
  wrongAnswerTabInitialized = true;

  // Sub-tab navigation
  const subTabs = document.querySelectorAll("#wrongAnswerSubTabs .sub-tab");
  subTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const targetTab = tab.dataset.subtab;
      switchWrongAnswerSubTab(targetTab);
    });
  });

  // Problem set creation
  const createSetBtn = document.getElementById("createProblemSetBtn");
  if (createSetBtn) {
    createSetBtn.addEventListener("click", createNewProblemSet);
  }

  // Add problem button
  const addProblemBtn = document.getElementById("addProblemBtn");
  if (addProblemBtn) {
    addProblemBtn.addEventListener("click", addNewProblem);
  }

  // Save problem set button
  const saveProblemSetBtn = document.getElementById("saveProblemSetBtn");
  if (saveProblemSetBtn) {
    saveProblemSetBtn.addEventListener("click", saveProblemSet);
  }

  // Student selection for answer input
  const studentSelect = document.getElementById("wrongAnswerStudentSelect");
  if (studentSelect) {
    studentSelect.addEventListener("change", loadStudentAnswerForm);
  }

  // DAY selection for answer input
  const daySelectForAnswer = document.getElementById("wrongAnswerDaySelect");
  if (daySelectForAnswer) {
    daySelectForAnswer.addEventListener("change", onDaySelectChange);
  }

  // Save student answers button
  const saveWrongAnswersBtn = document.getElementById("saveWrongAnswersBtn");
  if (saveWrongAnswersBtn) {
    saveWrongAnswersBtn.addEventListener("click", saveStudentAnswers);
  }

  // Generate AI explanation button
  const generateExplanationBtn = document.getElementById("generateExplanationBtn");
  if (generateExplanationBtn) {
    generateExplanationBtn.addEventListener("click", generateAIExplanations);
  }

  // API key save button
  const saveApiKeysBtn = document.getElementById("saveApiKeysBtn");
  console.log('🔧 [setupWrongAnswerTabEvents] saveApiKeysBtn 찾기:', saveApiKeysBtn ? '✅ 찾음' : '❌ 못찾음');

  if (saveApiKeysBtn) {
    saveApiKeysBtn.addEventListener("click", () => {
      console.log('💾 [저장 버튼] 클릭됨!');

      const geminiInput = document.getElementById("geminiApiKey");
      const openaiInput = document.getElementById("openaiApiKey");
      const claudeInput = document.getElementById("claudeApiKey");

      console.log('💾 [저장 버튼] 입력 필드 찾기:');
      console.log('  - geminiInput:', geminiInput ? '✅' : '❌');
      console.log('  - openaiInput:', openaiInput ? '✅' : '❌');
      console.log('  - claudeInput:', claudeInput ? '✅' : '❌');

      const geminiKey = geminiInput?.value?.trim() || "";
      const openaiKey = openaiInput?.value?.trim() || "";
      const claudeKey = claudeInput?.value?.trim() || "";

      console.log('💾 [저장 버튼] 입력된 값:');
      console.log('  - geminiKey:', geminiKey ? `${geminiKey.substring(0, 15)}... (길이: ${geminiKey.length})` : '(비어있음)');
      console.log('  - openaiKey:', openaiKey ? `${openaiKey.substring(0, 15)}... (길이: ${openaiKey.length})` : '(비어있음)');
      console.log('  - claudeKey:', claudeKey ? `${claudeKey.substring(0, 15)}... (길이: ${claudeKey.length})` : '(비어있음)');

      console.log('💾 [저장 버튼] saveApiKeys 호출...');
      saveApiKeys(geminiKey, openaiKey, claudeKey);

      console.log('💾 [저장 버튼] updateAiStatus 호출...');
      updateAiStatus();

      console.log('💾 [저장 버튼] 완료!');
    });
    console.log('🔧 [setupWrongAnswerTabEvents] 저장 버튼 이벤트 리스너 등록 완료');
  }

  // Load API keys on tab init
  console.log('🔧 [setupWrongAnswerTabEvents] loadApiKeysToInputs 호출...');
  loadApiKeysToInputs();
  updateAiStatus();

  // Quick PDF registration
  const quickPdfInput = document.getElementById("quickPdfInput");
  if (quickPdfInput) {
    quickPdfInput.addEventListener("change", handleQuickPdfSelect);
  }

  const quickRegisterBtn = document.getElementById("quickRegisterBtn");
  if (quickRegisterBtn) {
    quickRegisterBtn.addEventListener("click", quickRegisterProblemSet);
  }

  // Setup drag and drop for PDF
  setupPdfDragAndDrop();

  // Auto-detect answers button
  const autoDetectBtn = document.getElementById("autoDetectAnswersBtn");
  if (autoDetectBtn) {
    autoDetectBtn.addEventListener("click", extractAnswersFromPdf);
  }

  // DAY 계산 실시간 표시
  const problemCountInput = document.getElementById("quickProblemCount");
  const perDayInput = document.getElementById("quickProblemsPerDay");
  const dayCalcResult = document.getElementById("dayCalcResult");

  function updateDayCalc() {
    const total = parseInt(problemCountInput?.value) || 0;
    const perDay = parseInt(perDayInput?.value) || 0;
    if (dayCalcResult) {
      if (total > 0 && perDay > 0) {
        const days = Math.ceil(total / perDay);
        dayCalcResult.textContent = `→ ${days}개 DAY`;
      } else {
        dayCalcResult.textContent = "";
      }
    }
  }

  if (problemCountInput) problemCountInput.addEventListener("input", updateDayCalc);
  if (perDayInput) perDayInput.addEventListener("input", updateDayCalc);

  // Problem set selections are now handled by click events in loadProblemSets()
}

// Switch between wrong answer sub-tabs
function switchWrongAnswerSubTab(tabName) {
  // Map tab names to content IDs
  const tabContentMap = {
    "upload": "wrongAnswerUploadContent",
    "input": "wrongAnswerInputContent",
    "result": "wrongAnswerResultContent"
  };

  // Update tab buttons
  document.querySelectorAll("#adminTabWrongAnswer .sub-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.subtab === tabName);
  });

  // Update tab content - show selected, hide others
  document.querySelectorAll("#adminTabWrongAnswer .wrong-answer-sub-content").forEach(content => {
    content.style.display = content.id === tabContentMap[tabName] ? "block" : "none";
  });

  // Load data based on tab
  if (tabName === "upload") {
    // Load problem sets for registration
    loadProblemSets();
  } else if (tabName === "input") {
    loadProblemSets();
    loadStudentsForAnswerInput();
  } else if (tabName === "result") {
    loadProblemSets();
  }
}

// Load problem sets from Firebase
async function loadProblemSets() {
  try {
    const q = query(problemSetsCol(), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    const problemSetList = document.getElementById("savedProblemSetList");
    const answerSelectList = document.getElementById("problemSetSelectList");
    const explanationSelectList = document.getElementById("resultProblemSetList");

    if (problemSetList) {
      problemSetList.innerHTML = "";
    }

    // Clear the clickable lists
    if (answerSelectList) {
      answerSelectList.innerHTML = "";
    }
    if (explanationSelectList) {
      explanationSelectList.innerHTML = "";
    }

    if (snapshot.empty) {
      if (problemSetList) {
        problemSetList.innerHTML = '<div class="no-data">등록된 문제 세트가 없습니다.</div>';
      }
      if (answerSelectList) {
        answerSelectList.innerHTML = '<div class="ghost">등록된 문제 세트가 없습니다.</div>';
      }
      if (explanationSelectList) {
        explanationSelectList.innerHTML = '<div class="ghost">등록된 문제 세트가 없습니다.</div>';
      }
      return;
    }

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const setId = docSnap.id;

      // Add to problem set list (register tab)
      if (problemSetList) {
        const item = document.createElement("div");
        item.className = "problem-set-item";
        item.innerHTML = `
          <div class="problem-set-info">
            <strong>${escapeHtml(data.title)}</strong>
            <span class="problem-count">${data.problemCount || 0}문제</span>
            <span class="date">${data.createdAt ? new Date(data.createdAt.toDate()).toLocaleDateString('ko-KR') : ''}</span>
          </div>
          <div class="problem-set-actions">
            <button class="btn-small btn-edit" onclick="editProblemSet('${setId}')">수정</button>
            <button class="btn-small btn-delete" onclick="deleteProblemSet('${setId}')">삭제</button>
          </div>
        `;
        problemSetList.appendChild(item);
      }

      // Add to answer input clickable list
      if (answerSelectList) {
        const item = document.createElement("div");
        item.className = "problem-set-select-item";
        item.dataset.setId = setId;
        item.innerHTML = `
          <strong>${escapeHtml(data.title)}</strong>
          <span class="problem-count">${data.problemCount || 0}문제</span>
        `;
        item.addEventListener("click", () => selectProblemSetForAnswer(setId, data));
        answerSelectList.appendChild(item);
      }

      // Add to explanation clickable list
      if (explanationSelectList) {
        const item = document.createElement("div");
        item.className = "problem-set-select-item";
        item.dataset.setId = setId;
        item.innerHTML = `
          <strong>${escapeHtml(data.title)}</strong>
          <span class="problem-count">${data.problemCount || 0}문제</span>
        `;
        item.addEventListener("click", () => selectProblemSetForExplanation(setId, data));
        explanationSelectList.appendChild(item);
      }
    });
  } catch (error) {
    console.error("Error loading problem sets:", error);
    showNotification("문제 세트 로딩 실패: " + error.message, "error");
  }
}

// =====================================================
// Quick PDF Registration (빠른 등록)
// =====================================================

let quickPdfFile = null;

// Initialize PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Setup drag and drop for PDF upload
function setupPdfDragAndDrop() {
  const uploadArea = document.getElementById("quickPdfUploadArea");
  if (!uploadArea) return;

  // Click to select file
  uploadArea.addEventListener("click", () => {
    document.getElementById("quickPdfInput")?.click();
  });

  // Drag events
  uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.style.background = "rgba(255,255,255,0.3)";
    uploadArea.style.borderColor = "white";
  });

  uploadArea.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.style.background = "rgba(255,255,255,0.1)";
    uploadArea.style.borderColor = "rgba(255,255,255,0.5)";
  });

  uploadArea.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.style.background = "rgba(255,255,255,0.1)";
    uploadArea.style.borderColor = "rgba(255,255,255,0.5)";

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type === 'application/pdf') {
        handlePdfFile(file);
      } else {
        showNotification("PDF 파일만 업로드 가능합니다.", "warning");
      }
    }
  });
}

// Handle PDF file (from input or drag-drop)
function handlePdfFile(file) {
  quickPdfFile = file;
  const statusDiv = document.getElementById("quickPdfStatus");
  if (statusDiv) {
    statusDiv.innerHTML = `
      <span style="font-size:36px;">✅</span>
      <p style="margin:8px 0 0 0; font-weight:600;">${file.name}</p>
      <p style="margin:4px 0 0 0; font-size:12px; opacity:0.8;">${(file.size / 1024 / 1024).toFixed(2)} MB</p>
    `;
  }
  showNotification(`PDF 업로드됨: ${file.name}`, "success");
}

// Handle quick PDF file selection (from input)
function handleQuickPdfSelect(event) {
  const file = event.target.files[0];
  if (!file || file.type !== 'application/pdf') {
    showNotification("PDF 파일만 업로드 가능합니다.", "warning");
    return;
  }
  handlePdfFile(file);
}

// Extract text from PDF and detect answers
async function extractAnswersFromPdf() {
  if (!quickPdfFile) {
    showNotification("먼저 PDF 파일을 업로드하세요.", "warning");
    return;
  }

  const statusDiv = document.getElementById("autoDetectStatus");
  const answersInput = document.getElementById("quickAnswers");
  const countInput = document.getElementById("quickProblemCount");

  if (statusDiv) {
    statusDiv.style.display = "block";
    statusDiv.innerHTML = "🔄 PDF 분석 중... 잠시만 기다려주세요.";
  }

  try {
    // Load PDF
    const arrayBuffer = await quickPdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    // Extract text from all pages (focus on last pages for 미주/정답)
    let allText = "";
    const totalPages = pdf.numPages;

    // Read all pages but prioritize last pages (where 미주 usually is)
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(" ");
      allText += pageText + "\n";
    }

    console.log("Extracted PDF text:", allText.substring(0, 2000)); // Debug

    // Try to detect answers from text
    const detected = detectAnswersFromText(allText);

    if (detected.answers.length > 0) {
      // Found answers!
      answersInput.value = detected.answers.join("");
      if (countInput && !countInput.value) {
        countInput.value = detected.answers.length;
      }

      if (statusDiv) {
        statusDiv.innerHTML = `✅ ${detected.answers.length}개 정답 인식 완료! (패턴: ${detected.pattern})`;
        statusDiv.style.background = "rgba(34, 197, 94, 0.3)";
      }
      showNotification(`${detected.answers.length}개 정답이 자동으로 입력되었습니다!`, "success");
    } else {
      if (statusDiv) {
        statusDiv.innerHTML = "⚠️ 정답을 자동 인식하지 못했습니다. 직접 입력해주세요.";
        statusDiv.style.background = "rgba(251, 191, 36, 0.3)";
      }
      showNotification("정답 패턴을 찾지 못했습니다. 직접 입력해주세요.", "warning");
    }

  } catch (error) {
    console.error("PDF parsing error:", error);
    if (statusDiv) {
      statusDiv.innerHTML = "❌ PDF 분석 실패: " + error.message;
      statusDiv.style.background = "rgba(239, 68, 68, 0.3)";
    }
    showNotification("PDF 분석 실패: " + error.message, "error");
  }
}

// Detect answer patterns from text
function detectAnswersFromText(text) {
  const answers = [];
  let pattern = "";

  // Common answer patterns in Korean tests
  const patterns = [
    // Pattern 1: "1. ③" or "1.③" or "1 ③"
    { regex: /(\d+)\s*[.\):\s]\s*([①②③④⑤])/g, name: "번호.동그라미" },
    // Pattern 2: "1번 정답: 3" or "1번 답: 3"
    { regex: /(\d+)\s*번?\s*(?:정답|답)[:\s]*(\d)/g, name: "번호 정답:숫자" },
    // Pattern 3: "1-③" or "1-3"
    { regex: /(\d+)\s*[-–]\s*([①②③④⑤\d])/g, name: "번호-답" },
    // Pattern 4: "정답 ③①④②⑤" (continuous circled numbers)
    { regex: /정답[:\s]*([①②③④⑤]+)/g, name: "정답:동그라미나열" },
    // Pattern 5: "1)③ 2)④ 3)①"
    { regex: /(\d+)\s*\)\s*([①②③④⑤])/g, name: "번호)동그라미" },
    // Pattern 6: Just a sequence of circled numbers (last resort)
    { regex: /([①②③④⑤]{5,})/g, name: "동그라미나열" },
    // Pattern 7: "답: 31425" or "정답: 31425"
    { regex: /(?:정답|답)[:\s]*(\d{5,})/g, name: "정답:숫자나열" },
    // Pattern 8: Table format "1 | ③ | 2 | ④"
    { regex: /(\d+)\s*[|│]\s*([①②③④⑤\d])/g, name: "표형식" }
  ];

  const circledToNum = { '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5' };

  // Try each pattern
  for (const p of patterns) {
    const matches = [...text.matchAll(p.regex)];

    if (p.name === "정답:동그라미나열" || p.name === "동그라미나열") {
      // Continuous circled numbers
      for (const match of matches) {
        const circled = match[1];
        for (const c of circled) {
          if (circledToNum[c]) {
            answers.push(circledToNum[c]);
          }
        }
        if (answers.length >= 5) {
          pattern = p.name;
          return { answers, pattern };
        }
      }
    } else if (p.name === "정답:숫자나열") {
      // Continuous numbers
      for (const match of matches) {
        const nums = match[1];
        for (const n of nums) {
          if (/[1-5]/.test(n)) {
            answers.push(n);
          }
        }
        if (answers.length >= 5) {
          pattern = p.name;
          return { answers, pattern };
        }
      }
    } else {
      // Numbered patterns (1.③, 2.④, etc.)
      const answerMap = {};
      for (const match of matches) {
        const num = parseInt(match[1]);
        let answer = match[2];

        // Convert circled number to digit
        if (circledToNum[answer]) {
          answer = circledToNum[answer];
        }

        if (num >= 1 && num <= 200 && /[1-5]/.test(answer)) {
          answerMap[num] = answer;
        }
      }

      // Convert map to array
      const keys = Object.keys(answerMap).map(Number).sort((a, b) => a - b);
      if (keys.length >= 5) {
        // Check if consecutive
        let isConsecutive = true;
        for (let i = 1; i < keys.length; i++) {
          if (keys[i] !== keys[i-1] + 1) {
            isConsecutive = false;
            break;
          }
        }

        if (isConsecutive || keys.length >= 10) {
          for (const k of keys) {
            answers.push(answerMap[k]);
          }
          pattern = p.name;
          return { answers, pattern };
        }
      }
    }
  }

  return { answers: [], pattern: "" };
}

// Parse answer string (supports both numbers and circled numbers)
function parseAnswerString(answerStr, problemCount) {
  const circledToNum = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5, '⑥': 6, '⑦': 7, '⑧': 8, '⑨': 9 };
  const answers = [];

  // Remove spaces and other characters
  const cleaned = answerStr.replace(/[\s,.\-_]/g, '');

  for (const char of cleaned) {
    if (circledToNum[char]) {
      answers.push(circledToNum[char]);
    } else if (/[1-9]/.test(char)) {
      answers.push(parseInt(char));
    }
  }

  // Validate count
  if (answers.length !== problemCount) {
    return null;
  }

  return answers;
}

// Quick register problem set with PDF
async function quickRegisterProblemSet() {
  const nameInput = document.getElementById("quickProblemSetName");
  const countInput = document.getElementById("quickProblemCount");
  const perDayInput = document.getElementById("quickProblemsPerDay");
  const choiceSelect = document.getElementById("quickChoiceCount");
  const answersInput = document.getElementById("quickAnswers");

  const name = nameInput?.value?.trim();
  const problemCount = parseInt(countInput?.value) || 0;
  const problemsPerDay = parseInt(perDayInput?.value) || 0;
  const choiceCount = parseInt(choiceSelect?.value) || 5;
  const answersStr = answersInput?.value?.trim();

  // Validation
  if (!name) {
    showNotification("문제 세트 이름을 입력하세요.", "warning");
    nameInput?.focus();
    return;
  }

  if (!quickPdfFile) {
    showNotification("PDF 파일을 업로드하세요.", "warning");
    return;
  }

  if (problemCount < 1 || problemCount > 200) {
    showNotification("문제 수를 1~200 사이로 입력하세요.", "warning");
    countInput?.focus();
    return;
  }

  // DAY당 문제 수 검증 (선택사항 - 입력 안 하면 DAY 구분 없음)
  let totalDays = 0;
  if (problemsPerDay > 0) {
    if (problemsPerDay > problemCount) {
      showNotification("DAY당 문제 수가 총 문제 수보다 클 수 없습니다.", "warning");
      perDayInput?.focus();
      return;
    }
    totalDays = Math.ceil(problemCount / problemsPerDay);
  }

  if (!answersStr) {
    showNotification("정답을 입력하세요.", "warning");
    answersInput?.focus();
    return;
  }

  const answers = parseAnswerString(answersStr, problemCount);
  if (!answers) {
    showNotification(`정답 개수가 맞지 않습니다. (입력: ${parseAnswerString(answersStr, 999)?.length || 0}개, 필요: ${problemCount}개)`, "warning");
    answersInput?.focus();
    return;
  }

  // Validate answers within choice range
  for (let i = 0; i < answers.length; i++) {
    if (answers[i] < 1 || answers[i] > choiceCount) {
      showNotification(`${i + 1}번 정답(${answers[i]})이 보기 수(${choiceCount})를 초과합니다.`, "warning");
      return;
    }
  }

  // Start registration
  const registerBtn = document.getElementById("quickRegisterBtn");
  if (registerBtn) {
    registerBtn.disabled = true;
    registerBtn.innerHTML = '⏳ 등록 중...';
  }

  try {
    // 1. Upload PDF to Firebase Storage
    const pdfRef = ref(storage, `problemSets/${Date.now()}_${quickPdfFile.name}`);
    await uploadBytes(pdfRef, quickPdfFile);
    const pdfUrl = await getDownloadURL(pdfRef);

    // 2. Create problems array
    const problems = [];
    for (let i = 0; i < problemCount; i++) {
      problems.push({
        imageUrl: pdfUrl,  // All problems reference the same PDF
        fileName: quickPdfFile.name,
        problemNumber: i + 1,
        choiceCount: choiceCount,
        correctAnswer: answers[i],
        explanation: "",
        wrongExplanations: {}
      });
    }

    // 3. Save to Firebase
    const docRef = await addDoc(problemSetsCol(), {
      title: name,
      problems: problems,
      pdfUrl: pdfUrl,
      pdfFileName: quickPdfFile.name,
      totalProblems: problemCount,
      problemsPerDay: problemsPerDay || null,  // DAY당 문제 수 (없으면 null)
      totalDays: totalDays || null,            // 총 DAY 수 (없으면 null)
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    showNotification(`✅ "${name}" 등록 완료! (${problemCount}문제)`, "success");

    // Reset form
    nameInput.value = "";
    countInput.value = "";
    answersInput.value = "";
    if (perDayInput) perDayInput.value = "";
    const dayCalcResult = document.getElementById("dayCalcResult");
    if (dayCalcResult) dayCalcResult.textContent = "";
    quickPdfFile = null;
    document.getElementById("quickPdfStatus").innerHTML = `
      <span style="font-size:32px;">📄</span>
      <p style="margin:8px 0 0 0;">클릭하여 PDF 선택</p>
    `;
    document.getElementById("quickPdfInput").value = "";

    // Reload problem sets list
    await loadProblemSets();

  } catch (error) {
    console.error("Quick registration error:", error);
    showNotification("등록 실패: " + error.message, "error");
  } finally {
    if (registerBtn) {
      registerBtn.disabled = false;
      registerBtn.innerHTML = '⚡ 한번에 등록하기';
    }
  }
}

// Create new problem set
function createNewProblemSet() {
  currentProblemSetId = null;
  currentProblemSet = {
    title: "",
    problems: []
  };
  problemSetProblems = [];

  document.getElementById("problemSetName").value = "";
  document.getElementById("problemList").innerHTML = "";
  // Reset form visibility

  addNewProblem(); // Add first empty problem
}

// Add new problem card
function addNewProblem() {
  const container = document.getElementById("problemList");
  const problemIndex = problemSetProblems.length;

  const problemData = {
    id: `temp_${Date.now()}_${problemIndex}`,
    imageUrl: "",
    imageFile: null,
    choiceCount: 5,
    correctAnswer: null,
    explanation: "",
    wrongExplanations: {}
  };

  problemSetProblems.push(problemData);

  const card = document.createElement("div");
  card.className = "problem-card";
  card.dataset.index = problemIndex;
  card.innerHTML = `
    <div class="problem-card-header">
      <h4>문제 ${problemIndex + 1}</h4>
      <button type="button" class="btn-icon btn-delete-problem" onclick="deleteProblem(${problemIndex})">🗑️</button>
    </div>
    <div class="problem-image-upload" data-index="${problemIndex}">
      <input type="file" accept="image/*,application/pdf" id="problemImage_${problemIndex}" style="display:none" onchange="handleProblemImageSelect(${problemIndex}, this)">
      <div class="upload-placeholder" onclick="document.getElementById('problemImage_${problemIndex}').click()">
        <span class="upload-icon">📄</span>
        <span>클릭하여 파일 업로드</span>
        <span class="upload-hint">이미지 또는 PDF 파일</span>
      </div>
      <img class="preview-image" style="display:none" onclick="document.getElementById('problemImage_${problemIndex}').click()">
      <div class="pdf-preview" style="display:none" onclick="document.getElementById('problemImage_${problemIndex}').click()">
        <span class="pdf-icon">📑</span>
        <span class="pdf-filename"></span>
      </div>
    </div>
    <div class="choice-count-selector">
      <label>보기 개수:</label>
      <select onchange="updateChoiceCount(${problemIndex}, this.value)">
        <option value="4">4지선다</option>
        <option value="5" selected>5지선다</option>
      </select>
    </div>
    <div class="correct-answer-selector">
      <label>정답 선택:</label>
      <div class="choice-buttons" id="choiceButtons_${problemIndex}">
        ${[1,2,3,4,5].map(n => `<button type="button" class="choice-btn" data-choice="${n}" onclick="selectCorrectAnswer(${problemIndex}, ${n})">${n}</button>`).join('')}
      </div>
    </div>
  `;

  container.appendChild(card);

  // Setup drag and drop for this card
  setupImageDragDrop(card.querySelector('.problem-image-upload'), problemIndex);
}

// Setup drag and drop for image upload
function setupImageDragDrop(element, problemIndex) {
  element.addEventListener('dragover', (e) => {
    e.preventDefault();
    element.classList.add('drag-over');
  });

  element.addEventListener('dragleave', () => {
    element.classList.remove('drag-over');
  });

  element.addEventListener('drop', (e) => {
    e.preventDefault();
    element.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0 && (files[0].type.startsWith('image/') || files[0].type === 'application/pdf')) {
      handleProblemImage(problemIndex, files[0]);
    }
  });
}

// Handle problem image selection
function handleProblemImageSelect(index, input) {
  if (input.files && input.files[0]) {
    handleProblemImage(index, input.files[0]);
  }
}

// Handle problem image or PDF (common function)
function handleProblemImage(index, file) {
  const uploadArea = document.querySelector(`.problem-image-upload[data-index="${index}"]`);
  const placeholder = uploadArea.querySelector('.upload-placeholder');
  const preview = uploadArea.querySelector('.preview-image');
  const pdfPreview = uploadArea.querySelector('.pdf-preview');

  placeholder.style.display = 'none';

  if (file.type === 'application/pdf') {
    // PDF file - show PDF icon and filename
    preview.style.display = 'none';
    if (pdfPreview) {
      pdfPreview.style.display = 'flex';
      pdfPreview.querySelector('.pdf-filename').textContent = file.name;
    }
    problemSetProblems[index].imageFile = file;
    problemSetProblems[index].imageUrl = null;
    problemSetProblems[index].isPdf = true;
    problemSetProblems[index].fileName = file.name;
  } else {
    // Image file - show preview
    if (pdfPreview) pdfPreview.style.display = 'none';
    const reader = new FileReader();
    reader.onload = (e) => {
      preview.src = e.target.result;
      preview.style.display = 'block';
      problemSetProblems[index].imageUrl = e.target.result;
    };
    reader.readAsDataURL(file);
    problemSetProblems[index].imageFile = file;
    problemSetProblems[index].isPdf = false;
  }
}

// Delete a problem from the set
function deleteProblem(index) {
  if (problemSetProblems.length <= 1) {
    showNotification("최소 1개의 문제가 필요합니다.", "warning");
    return;
  }

  if (!confirm(`문제 ${index + 1}을 삭제하시겠습니까?`)) return;

  problemSetProblems.splice(index, 1);
  renderProblemCards();
}

// Re-render all problem cards
function renderProblemCards() {
  const container = document.getElementById("problemList");
  container.innerHTML = "";

  problemSetProblems.forEach((problem, index) => {
    const card = document.createElement("div");
    card.className = "problem-card";
    card.dataset.index = index;

    const hasFile = problem.imageUrl || problem.imageFile;
    const isPdf = problem.isPdf;
    const showImage = hasFile && !isPdf;
    const showPdf = hasFile && isPdf;

    card.innerHTML = `
      <div class="problem-card-header">
        <h4>문제 ${index + 1}</h4>
        <button type="button" class="btn-icon btn-delete-problem" onclick="deleteProblem(${index})">🗑️</button>
      </div>
      <div class="problem-image-upload" data-index="${index}">
        <input type="file" accept="image/*,application/pdf" id="problemImage_${index}" style="display:none" onchange="handleProblemImageSelect(${index}, this)">
        <div class="upload-placeholder" style="${hasFile ? 'display:none' : ''}" onclick="document.getElementById('problemImage_${index}').click()">
          <span class="upload-icon">📄</span>
          <span>클릭하여 파일 업로드</span>
          <span class="upload-hint">이미지 또는 PDF 파일</span>
        </div>
        <img class="preview-image" src="${problem.imageUrl || ''}" style="${showImage ? '' : 'display:none'}" onclick="document.getElementById('problemImage_${index}').click()">
        <div class="pdf-preview" style="${showPdf ? 'display:flex' : 'display:none'}" onclick="document.getElementById('problemImage_${index}').click()">
          <span class="pdf-icon">📑</span>
          <span class="pdf-filename">${problem.fileName || 'PDF 파일'}</span>
        </div>
      </div>
      <div class="choice-count-selector">
        <label>보기 개수:</label>
        <select onchange="updateChoiceCount(${index}, this.value)">
          <option value="4" ${problem.choiceCount === 4 ? 'selected' : ''}>4지선다</option>
          <option value="5" ${problem.choiceCount === 5 ? 'selected' : ''}>5지선다</option>
        </select>
      </div>
      <div class="correct-answer-selector">
        <label>정답 선택:</label>
        <div class="choice-buttons" id="choiceButtons_${index}">
          ${Array.from({length: problem.choiceCount}, (_, i) => i + 1).map(n =>
            `<button type="button" class="choice-btn ${problem.correctAnswer === n ? 'selected' : ''}" data-choice="${n}" onclick="selectCorrectAnswer(${index}, ${n})">${n}</button>`
          ).join('')}
        </div>
      </div>
    `;

    container.appendChild(card);
    setupImageDragDrop(card.querySelector('.problem-image-upload'), index);
  });
}

// Update choice count for a problem
function updateChoiceCount(index, count) {
  const choiceCount = parseInt(count);
  problemSetProblems[index].choiceCount = choiceCount;

  // Reset correct answer if it exceeds new count
  if (problemSetProblems[index].correctAnswer > choiceCount) {
    problemSetProblems[index].correctAnswer = null;
  }

  // Re-render choice buttons
  const buttonContainer = document.getElementById(`choiceButtons_${index}`);
  buttonContainer.innerHTML = Array.from({length: choiceCount}, (_, i) => i + 1).map(n =>
    `<button type="button" class="choice-btn ${problemSetProblems[index].correctAnswer === n ? 'selected' : ''}" data-choice="${n}" onclick="selectCorrectAnswer(${index}, ${n})">${n}</button>`
  ).join('');
}

// Select correct answer for a problem
function selectCorrectAnswer(index, answer) {
  problemSetProblems[index].correctAnswer = answer;

  // Update button styles
  const buttonContainer = document.getElementById(`choiceButtons_${index}`);
  buttonContainer.querySelectorAll('.choice-btn').forEach(btn => {
    btn.classList.toggle('selected', parseInt(btn.dataset.choice) === answer);
  });
}

// Save problem set to Firebase
async function saveProblemSet() {
  const title = document.getElementById("problemSetName").value.trim();

  if (!title) {
    showNotification("문제 세트 제목을 입력하세요.", "warning");
    return;
  }

  if (problemSetProblems.length === 0) {
    showNotification("최소 1개의 문제를 추가하세요.", "warning");
    return;
  }

  // Validate all problems have files and correct answers
  for (let i = 0; i < problemSetProblems.length; i++) {
    const problem = problemSetProblems[i];
    if (!problem.imageUrl && !problem.imageFile) {
      showNotification(`문제 ${i + 1}에 파일을 업로드하세요. (이미지 또는 PDF)`, "warning");
      return;
    }
    if (!problem.correctAnswer) {
      showNotification(`문제 ${i + 1}의 정답을 선택하세요.`, "warning");
      return;
    }
  }

  try {
    showNotification("저장 중...", "info");

    // Upload images and get URLs
    const problemsData = [];
    for (let i = 0; i < problemSetProblems.length; i++) {
      const problem = problemSetProblems[i];
      let imageUrl = problem.imageUrl;

      // Upload new image if file exists
      if (problem.imageFile) {
        const fileName = `problems/${myData.academyId}/${Date.now()}_${i}_${problem.imageFile.name}`;
        const storageRef = ref(storage, fileName);
        await uploadBytes(storageRef, problem.imageFile);
        imageUrl = await getDownloadURL(storageRef);
      }

      problemsData.push({
        index: i,
        imageUrl: imageUrl,
        isPdf: problem.isPdf || false,
        fileName: problem.fileName || null,
        choiceCount: problem.choiceCount,
        correctAnswer: problem.correctAnswer,
        explanation: problem.explanation || "",
        wrongExplanations: problem.wrongExplanations || {}
      });
    }

    const setData = {
      title: title,
      problems: problemsData,
      problemCount: problemsData.length,
      academyId: myData.academyId,
      createdBy: me.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    if (currentProblemSetId) {
      // Update existing
      await updateDoc(doc(problemSetsCol(), currentProblemSetId), setData);
      showNotification("문제 세트가 수정되었습니다.", "success");
    } else {
      // Create new
      const docRef = await addDoc(problemSetsCol(), setData);
      currentProblemSetId = docRef.id;
      showNotification("문제 세트가 저장되었습니다.", "success");
    }

    // Reload problem sets
    await loadProblemSets();

    // Reset form for new entry
    createNewProblemSet();

  } catch (error) {
    console.error("Error saving problem set:", error);
    showNotification("저장 실패: " + error.message, "error");
  }
}

// Edit existing problem set
async function editProblemSet(setId) {
  try {
    const docSnap = await getDoc(doc(problemSetsCol(), setId));
    if (!docSnap.exists()) {
      showNotification("문제 세트를 찾을 수 없습니다.", "error");
      return;
    }

    const data = docSnap.data();
    currentProblemSetId = setId;
    currentProblemSet = data;
    problemSetProblems = data.problems || [];

    document.getElementById("problemSetName").value = data.title;

    renderProblemCards();

  } catch (error) {
    console.error("Error loading problem set:", error);
    showNotification("문제 세트 로딩 실패: " + error.message, "error");
  }
}

// Delete problem set
async function deleteProblemSet(setId) {
  if (!confirm("이 문제 세트를 삭제하시겠습니까? 관련된 모든 데이터가 삭제됩니다.")) return;

  try {
    // Delete the problem set document
    await deleteDoc(doc(problemSetsCol(), setId));

    showNotification("문제 세트가 삭제되었습니다.", "success");
    await loadProblemSets();

  } catch (error) {
    console.error("Error deleting problem set:", error);
    showNotification("삭제 실패: " + error.message, "error");
  }
}

// Load students for answer input
async function loadStudentsForAnswerInput() {
  try {
    const studentSelect = document.getElementById("wrongAnswerStudentSelect");
    if (!studentSelect) return;

    studentSelect.innerHTML = '<option value="">학생 선택...</option>';

    // Get students from users collection
    const q = query(
      collection(db, "users"),
      where("academyId", "==", myData.academyId),
      where("role", "==", "student")
    );

    const snapshot = await getDocs(q);

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      console.log("학생 데이터:", data); // 디버깅용
      const option = document.createElement("option");
      option.value = docSnap.id;
      // name, nickname, displayName 순으로 시도
      const studentName = data.name || data.nickname || data.displayName || data.email;
      option.textContent = studentName;
      studentSelect.appendChild(option);
    });

  } catch (error) {
    console.error("Error loading students:", error);
  }
}

// Handle problem set selection for answer input (click-based)
async function selectProblemSetForAnswer(setId, data) {
  currentProblemSetId = setId;
  currentProblemSet = data;
  problemSetProblems = data.problems || [];

  // Update UI - highlight selected item
  document.querySelectorAll("#problemSetSelectList .problem-set-select-item").forEach(item => {
    item.classList.toggle("selected", item.dataset.setId === setId);
  });

  // Update title
  const titleElement = document.getElementById("selectedProblemSetTitle");
  if (titleElement) {
    titleElement.textContent = data.title;
  }

  // Show the form and hide placeholder
  const form = document.getElementById("wrongAnswerInputForm");
  const placeholder = document.getElementById("wrongAnswerInputPlaceholder");
  if (form) form.style.display = "block";
  if (placeholder) placeholder.style.display = "none";

  // Setup DAY selection if problem set has DAY info
  setupDaySelection(data);

  // Load student answer form if student is selected
  loadStudentAnswerForm();

  // Load submitted answers list
  await loadSubmittedAnswersList();
}

// Setup DAY selection dropdown
function setupDaySelection(data) {
  const dayContainer = document.getElementById("daySelectContainer");
  const daySelect = document.getElementById("wrongAnswerDaySelect");
  const dayRangeInfo = document.getElementById("dayRangeInfo");

  if (!dayContainer || !daySelect) return;

  const problemsPerDay = data.problemsPerDay || 0;
  const totalDays = data.totalDays || 0;
  const totalProblems = data.totalProblems || (data.problems?.length || 0);

  // Reset dropdown
  daySelect.innerHTML = '<option value="">전체 문제</option>';
  if (dayRangeInfo) dayRangeInfo.textContent = "";

  if (problemsPerDay > 0 && totalDays > 0) {
    // Populate DAY options
    for (let day = 1; day <= totalDays; day++) {
      const startNum = (day - 1) * problemsPerDay + 1;
      const endNum = Math.min(day * problemsPerDay, totalProblems);
      const option = document.createElement("option");
      option.value = day;
      option.textContent = `DAY ${day} (${startNum}~${endNum}번)`;
      daySelect.appendChild(option);
    }
    dayContainer.style.display = "block";
  } else {
    dayContainer.style.display = "none";
  }
}

// Handle DAY selection change
function onDaySelectChange() {
  const daySelect = document.getElementById("wrongAnswerDaySelect");
  const dayRangeInfo = document.getElementById("dayRangeInfo");

  if (!currentProblemSet || !daySelect) return;

  const selectedDay = parseInt(daySelect.value) || 0;
  const problemsPerDay = currentProblemSet.problemsPerDay || 0;
  const totalProblems = currentProblemSet.totalProblems || problemSetProblems.length;

  if (selectedDay > 0 && problemsPerDay > 0) {
    const startNum = (selectedDay - 1) * problemsPerDay + 1;
    const endNum = Math.min(selectedDay * problemsPerDay, totalProblems);
    if (dayRangeInfo) {
      dayRangeInfo.textContent = `📍 ${startNum}번 ~ ${endNum}번 문제가 표시됩니다`;
    }
  } else {
    if (dayRangeInfo) dayRangeInfo.textContent = "";
  }

  // Reload the form with filtered problems
  loadStudentAnswerForm();
}

// Load student answer form
async function loadStudentAnswerForm() {
  const studentId = document.getElementById("wrongAnswerStudentSelect")?.value;
  const setId = currentProblemSetId;
  const formContainer = document.getElementById("answerInputList");

  if (!studentId || !setId || !formContainer) {
    if (formContainer) formContainer.innerHTML = '<div class="ghost">학생을 선택하세요</div>';
    return;
  }

  if (!currentProblemSet || problemSetProblems.length === 0) {
    formContainer.innerHTML = '<div class="no-data">문제 세트 데이터를 불러오는 중...</div>';
    return;
  }

  // Check for existing answers
  let existingAnswers = {};
  try {
    const answerDocSnap = await getDoc(doc(studentAnswersCol(setId), studentId));
    if (answerDocSnap.exists()) {
      existingAnswers = answerDocSnap.data().answers || {};
    }
  } catch (error) {
    console.error("Error loading existing answers:", error);
  }

  // Get DAY filter settings
  const daySelect = document.getElementById("wrongAnswerDaySelect");
  const selectedDay = parseInt(daySelect?.value) || 0;
  const problemsPerDay = currentProblemSet.problemsPerDay || 0;
  const totalProblems = currentProblemSet.totalProblems || problemSetProblems.length;

  // Calculate problem range based on selected DAY
  let startIndex = 0;
  let endIndex = problemSetProblems.length;

  if (selectedDay > 0 && problemsPerDay > 0) {
    startIndex = (selectedDay - 1) * problemsPerDay;
    endIndex = Math.min(selectedDay * problemsPerDay, totalProblems);
  }

  // Filter problems by DAY range
  const filteredProblems = problemSetProblems.slice(startIndex, endIndex);

  if (filteredProblems.length === 0) {
    formContainer.innerHTML = '<div class="ghost">해당 DAY에 문제가 없습니다.</div>';
    return;
  }

  // Render form with filtered problems
  formContainer.innerHTML = filteredProblems.map((problem, filteredIndex) => {
    const actualIndex = startIndex + filteredIndex; // Original problem index
    const existingAnswer = existingAnswers[actualIndex];
    const isCorrect = existingAnswer === problem.correctAnswer;

    const thumbnailContent = problem.isPdf
      ? `<a href="${problem.imageUrl}" target="_blank" class="pdf-thumbnail-link">
           <span class="pdf-icon">📑</span>
           <span>${problem.fileName || 'PDF 보기'}</span>
         </a>`
      : `<img src="${problem.imageUrl}" alt="문제 ${actualIndex + 1}">`;

    return `
      <div class="answer-input-row ${existingAnswer ? (isCorrect ? 'correct' : 'wrong') : ''}">
        <div class="problem-thumbnail">
          ${thumbnailContent}
        </div>
        <div class="answer-input-content">
          <span class="problem-number">문제 ${actualIndex + 1}</span>
          <div class="answer-choices">
            ${Array.from({length: problem.choiceCount}, (_, i) => i + 1).map(n => `
              <button type="button" class="choice-btn ${existingAnswer === n ? 'selected' : ''} ${n === problem.correctAnswer ? 'correct-answer' : ''}"
                      data-problem="${actualIndex}" data-choice="${n}" onclick="selectStudentAnswer(${actualIndex}, ${n})">
                ${n}
              </button>
            `).join('')}
          </div>
          <span class="correct-indicator">(정답: ${problem.correctAnswer}번)</span>
        </div>
      </div>
    `;
  }).join('');
}

// Select student answer
function selectStudentAnswer(problemIndex, answer) {
  const row = document.querySelector(`.answer-input-row .answer-choices button[data-problem="${problemIndex}"].selected`);
  if (row) {
    row.classList.remove('selected');
  }

  const newBtn = document.querySelector(`.answer-input-row .answer-choices button[data-problem="${problemIndex}"][data-choice="${answer}"]`);
  if (newBtn) {
    newBtn.classList.add('selected');
  }

  // Update row styling based on correct/wrong
  const problem = problemSetProblems[problemIndex];
  const inputRow = newBtn.closest('.answer-input-row');
  inputRow.classList.remove('correct', 'wrong');
  inputRow.classList.add(answer === problem.correctAnswer ? 'correct' : 'wrong');
}

// Save student answers
async function saveStudentAnswers() {
  const studentId = document.getElementById("wrongAnswerStudentSelect").value;
  const setId = currentProblemSetId;

  if (!studentId || !setId) {
    showNotification("학생과 문제 세트를 선택하세요.", "warning");
    return;
  }

  // Collect answers
  const answers = {};
  document.querySelectorAll('.answer-input-row .answer-choices button.selected').forEach(btn => {
    const problemIndex = parseInt(btn.dataset.problem);
    const choice = parseInt(btn.dataset.choice);
    answers[problemIndex] = choice;
  });

  if (Object.keys(answers).length === 0) {
    showNotification("답을 하나 이상 입력하세요.", "warning");
    return;
  }

  try {
    // Get student name
    const studentDoc = await getDoc(doc(db, "users", studentId));
    const studentName = studentDoc.exists() ? (studentDoc.data().displayName || studentDoc.data().email) : "Unknown";

    await setDoc(doc(studentAnswersCol(setId), studentId), {
      studentId: studentId,
      studentName: studentName,
      answers: answers,
      updatedAt: serverTimestamp()
    });

    showNotification("학생 답안이 저장되었습니다.", "success");

    // Reload submitted answers list
    await loadSubmittedAnswersList();

  } catch (error) {
    console.error("Error saving student answers:", error);
    showNotification("저장 실패: " + error.message, "error");
  }
}

// Load list of students who have submitted answers
async function loadSubmittedAnswersList() {
  const setId = currentProblemSetId;
  const container = document.getElementById("submittedAnswersList");

  if (!setId || !container) return;

  try {
    const snapshot = await getDocs(studentAnswersCol(setId));

    if (snapshot.empty) {
      container.innerHTML = '<div class="ghost">아직 입력된 오답이 없습니다.</div>';
      return;
    }

    let html = '';
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const answerCount = data.answers ? Object.keys(data.answers).length : 0;
      const wrongCount = data.answers ? Object.values(data.answers).filter((ans, idx) => {
        return problemSetProblems[idx] && ans !== problemSetProblems[idx].correctAnswer;
      }).length : 0;

      html += `
        <div class="submitted-answer-item">
          <span class="student-name">${escapeHtml(data.studentName || '알 수 없음')}</span>
          <span class="answer-stats">${answerCount}문제 응답, ${wrongCount}개 오답</span>
        </div>
      `;
    });

    container.innerHTML = html;
  } catch (error) {
    console.error("Error loading submitted answers:", error);
    container.innerHTML = '<div class="ghost">오답 목록 로딩 실패</div>';
  }
}

// Handle problem set selection for explanation view (click-based)
async function selectProblemSetForExplanation(setId, data) {
  currentProblemSetId = setId;
  currentProblemSet = data;
  problemSetProblems = data.problems || [];

  // Update UI - highlight selected item
  document.querySelectorAll("#resultProblemSetList .problem-set-select-item").forEach(item => {
    item.classList.toggle("selected", item.dataset.setId === setId);
  });

  // Show the result view and hide placeholder
  const resultView = document.getElementById("wrongAnswerResultView");
  const placeholder = document.getElementById("wrongAnswerResultPlaceholder");
  if (resultView) resultView.style.display = "block";
  if (placeholder) placeholder.style.display = "none";

  await loadExplanationView();
}

// Load explanation view
async function loadExplanationView() {
  const setId = currentProblemSetId;
  if (!setId || !currentProblemSet) return;

  const statsContainer = document.getElementById("wrongAnswerStats");
  const explanationContainer = document.getElementById("problemExplanationList");

  // Load student answers to calculate statistics
  const answersSnapshot = await getDocs(studentAnswersCol(setId));

  // Calculate statistics per problem
  const stats = problemSetProblems.map((problem, index) => {
    const stat = {
      total: 0,
      correct: 0,
      wrong: 0,
      wrongByChoice: {}
    };

    for (let i = 1; i <= problem.choiceCount; i++) {
      if (i !== problem.correctAnswer) {
        stat.wrongByChoice[i] = 0;
      }
    }

    answersSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      const answer = data.answers ? data.answers[index] : null;
      if (answer !== null && answer !== undefined) {
        stat.total++;
        if (answer === problem.correctAnswer) {
          stat.correct++;
        } else {
          stat.wrong++;
          if (stat.wrongByChoice[answer] !== undefined) {
            stat.wrongByChoice[answer]++;
          }
        }
      }
    });

    return stat;
  });

  // Render statistics
  if (statsContainer) {
    statsContainer.innerHTML = `
      <h4>📊 오답 통계</h4>
      <div class="stats-grid">
        ${stats.map((stat, index) => {
          const correctRate = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
          return `
            <div class="stat-item">
              <span class="stat-label">문제 ${index + 1}</span>
              <span class="stat-value ${correctRate >= 70 ? 'good' : correctRate >= 40 ? 'medium' : 'bad'}">${correctRate}%</span>
              <span class="stat-detail">(${stat.correct}/${stat.total}명 정답)</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // Render explanation cards
  if (explanationContainer) {
    explanationContainer.innerHTML = problemSetProblems.map((problem, index) => {
      const stat = stats[index];
      const wrongChoices = Object.entries(stat.wrongByChoice)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1]);

      const previewContent = problem.isPdf
        ? `<a href="${problem.imageUrl}" target="_blank" class="pdf-preview-link">
             <span class="pdf-icon">📑</span>
             <span>${problem.fileName || 'PDF 보기'}</span>
           </a>`
        : `<img src="${problem.imageUrl}" alt="문제 ${index + 1}">`;

      return `
        <div class="explanation-card">
          <div class="explanation-header">
            <h4>문제 ${index + 1}</h4>
            <span class="correct-rate ${stat.total > 0 && (stat.correct / stat.total) >= 0.7 ? 'good' : (stat.correct / stat.total) >= 0.4 ? 'medium' : 'bad'}">
              정답률: ${stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0}%
            </span>
          </div>
          <div class="explanation-content">
            <div class="problem-preview">
              ${previewContent}
            </div>
            <div class="explanation-details">
              <div class="correct-answer-display">
                <strong>정답:</strong> <span class="answer-badge correct">${problem.correctAnswer}번</span>
              </div>

              ${wrongChoices.length > 0 ? `
                <div class="wrong-answers-summary">
                  <strong>오답 분포:</strong>
                  ${wrongChoices.map(([choice, count]) => `
                    <span class="answer-badge wrong">${choice}번 (${count}명)</span>
                  `).join('')}
                </div>
              ` : ''}

              <div class="explanation-box correct-explanation">
                <h5>✅ 정답 해설</h5>
                <div class="explanation-text" id="correctExplanation_${index}">
                  ${problem.explanation || '<span class="no-explanation">해설이 없습니다. AI 생성 버튼을 클릭하세요.</span>'}
                </div>
                <button class="btn-small btn-edit" onclick="editExplanation(${index}, 'correct')">수정</button>
              </div>

              ${wrongChoices.map(([choice]) => `
                <div class="explanation-box wrong-explanation">
                  <h5>❌ ${choice}번을 선택한 경우</h5>
                  <div class="explanation-text" id="wrongExplanation_${index}_${choice}">
                    ${(problem.wrongExplanations && problem.wrongExplanations[choice]) || '<span class="no-explanation">해설이 없습니다.</span>'}
                  </div>
                  <button class="btn-small btn-edit" onclick="editExplanation(${index}, '${choice}')">수정</button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
}

// Edit explanation
function editExplanation(problemIndex, type) {
  const problem = problemSetProblems[problemIndex];
  let currentText = "";
  let elementId = "";

  if (type === 'correct') {
    currentText = problem.explanation || "";
    elementId = `correctExplanation_${problemIndex}`;
  } else {
    currentText = (problem.wrongExplanations && problem.wrongExplanations[type]) || "";
    elementId = `wrongExplanation_${problemIndex}_${type}`;
  }

  const element = document.getElementById(elementId);
  if (!element) return;

  // Replace with textarea
  element.innerHTML = `
    <textarea class="explanation-edit-textarea" id="editTextarea_${problemIndex}_${type}">${escapeHtml(currentText)}</textarea>
    <div class="edit-buttons">
      <button class="btn-small btn-save" onclick="saveExplanationEdit(${problemIndex}, '${type}')">저장</button>
      <button class="btn-small btn-cancel" onclick="cancelExplanationEdit(${problemIndex}, '${type}')">취소</button>
    </div>
  `;
}

// Save explanation edit
async function saveExplanationEdit(problemIndex, type) {
  const textarea = document.getElementById(`editTextarea_${problemIndex}_${type}`);
  if (!textarea) return;

  const newText = textarea.value.trim();
  const problem = problemSetProblems[problemIndex];

  if (type === 'correct') {
    problem.explanation = newText;
  } else {
    if (!problem.wrongExplanations) problem.wrongExplanations = {};
    problem.wrongExplanations[type] = newText;
  }

  // Save to Firebase
  try {
    await updateDoc(doc(problemSetsCol(), currentProblemSetId), {
      problems: problemSetProblems,
      updatedAt: serverTimestamp()
    });

    showNotification("해설이 저장되었습니다.", "success");

    // Re-render the explanation
    const elementId = type === 'correct' ? `correctExplanation_${problemIndex}` : `wrongExplanation_${problemIndex}_${type}`;
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = newText || '<span class="no-explanation">해설이 없습니다.</span>';
    }

  } catch (error) {
    console.error("Error saving explanation:", error);
    showNotification("저장 실패: " + error.message, "error");
  }
}

// Cancel explanation edit
function cancelExplanationEdit(problemIndex, type) {
  const problem = problemSetProblems[problemIndex];
  let text = "";

  if (type === 'correct') {
    text = problem.explanation || "";
  } else {
    text = (problem.wrongExplanations && problem.wrongExplanations[type]) || "";
  }

  const elementId = type === 'correct' ? `correctExplanation_${problemIndex}` : `wrongExplanation_${problemIndex}_${type}`;
  const element = document.getElementById(elementId);
  if (element) {
    element.innerHTML = text || '<span class="no-explanation">해설이 없습니다.</span>';
  }
}

// Generate AI explanations
async function generateAIExplanations() {
  const setId = currentProblemSetId;
  if (!setId || !currentProblemSet) {
    showNotification("문제 세트를 선택하세요.", "warning");
    return;
  }

  // Check if API keys are configured
  const { geminiKey, openaiKey } = getApiKeys();
  if (!geminiKey && !openaiKey) {
    showNotification("API 키를 먼저 설정해주세요. (Gemini 또는 OpenAI)", "warning");
    return;
  }

  const generateBtn = document.getElementById("generateExplanationBtn");
  const progressContainer = document.getElementById("aiGenerationProgress");
  const progressFill = progressContainer?.querySelector(".progress-fill");
  const progressText = progressContainer?.querySelector(".progress-text");

  if (generateBtn) {
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<span class="ai-generating"></span> AI 해설 생성 중...';
  }

  if (progressContainer) {
    progressContainer.style.display = "block";
  }

  try {
    // Collect wrong answer statistics
    const answersSnapshot = await getDocs(studentAnswersCol(setId));
    const totalProblems = problemSetProblems.length;
    let completedProblems = 0;
    let aiUsedSources = { gemini: 0, gpt: 0, claude: 0 };

    for (let index = 0; index < problemSetProblems.length; index++) {
      const problem = problemSetProblems[index];

      // Update progress
      if (progressText) {
        progressText.textContent = `문제 ${index + 1}/${totalProblems} 분석 중...`;
      }
      if (progressFill) {
        progressFill.style.width = `${(index / totalProblems) * 100}%`;
      }

      // Calculate wrong answers for this problem
      const wrongByChoice = {};
      for (let i = 1; i <= problem.choiceCount; i++) {
        if (i !== problem.correctAnswer) {
          wrongByChoice[i] = 0;
        }
      }

      answersSnapshot.forEach(docSnap => {
        const data = docSnap.data();
        const answer = data.answers ? data.answers[index] : null;
        if (answer !== null && answer !== problem.correctAnswer && wrongByChoice[answer] !== undefined) {
          wrongByChoice[answer]++;
        }
      });

      // Use AI to generate explanation if problem has image
      if (problem.imageUrl) {
        try {
          const aiResult = await generateProblemExplanation(problem, index, wrongByChoice);

          if (aiResult && aiResult.explanation) {
            problem.explanation = aiResult.explanation;
            problem.aiSource = aiResult.source; // Track which AI provided the answer

            // Count AI usage
            if (aiResult.source === 'gemini') aiUsedSources.gemini++;
            else if (aiResult.source === 'gpt') aiUsedSources.gpt++;
            else if (aiResult.source === 'claude') aiUsedSources.claude++;

            // Parse wrong answer explanations from AI response
            const wrongExplanations = parseWrongExplanations(aiResult.explanation, wrongByChoice);
            if (Object.keys(wrongExplanations).length > 0) {
              problem.wrongExplanations = wrongExplanations;
            }
          }
        } catch (aiError) {
          console.error(`AI error for problem ${index + 1}:`, aiError);
          // Fall back to template if AI fails
          if (!problem.explanation) {
            problem.explanation = `문제 ${index + 1}의 정답은 ${problem.correctAnswer}번입니다. (AI 분석 실패 - 수동 해설 필요)`;
          }
        }
      } else {
        // No image - use template
        if (!problem.explanation) {
          problem.explanation = `문제 ${index + 1}의 정답은 ${problem.correctAnswer}번입니다. 이 문제는 주어진 조건을 정확히 분석하고 적절한 답을 선택하는 능력을 평가합니다.`;
        }
      }

      // Generate fallback wrong answer explanations if not set
      if (!problem.wrongExplanations) problem.wrongExplanations = {};

      Object.entries(wrongByChoice).forEach(([choice, count]) => {
        if (count > 0 && !problem.wrongExplanations[choice]) {
          problem.wrongExplanations[choice] = `${choice}번을 선택한 학생이 ${count}명 있습니다. ${choice}번은 오답입니다. 정답인 ${problem.correctAnswer}번과의 차이점을 이해하고, 문제의 핵심 조건을 다시 확인해보세요.`;
        }
      });

      completedProblems++;
    }

    // Final progress update
    if (progressFill) {
      progressFill.style.width = "100%";
    }
    if (progressText) {
      progressText.textContent = "저장 중...";
    }

    // Save to Firebase
    await updateDoc(doc(problemSetsCol(), currentProblemSetId), {
      problems: problemSetProblems,
      updatedAt: serverTimestamp()
    });

    // Show success with AI usage stats
    let successMsg = "AI 해설이 생성되었습니다.";
    if (aiUsedSources.gemini > 0 || aiUsedSources.gpt > 0 || aiUsedSources.claude > 0) {
      const aiStats = [];
      if (aiUsedSources.gemini > 0) aiStats.push(`Gemini: ${aiUsedSources.gemini}개`);
      if (aiUsedSources.gpt > 0) aiStats.push(`GPT-4o: ${aiUsedSources.gpt}개`);
      if (aiUsedSources.claude > 0) aiStats.push(`Claude: ${aiUsedSources.claude}개`);
      successMsg += ` (${aiStats.join(", ")})`;
    }
    showNotification(successMsg, "success");

    // Reload explanation view
    await loadExplanationView();

  } catch (error) {
    console.error("Error generating explanations:", error);
    showNotification("AI 해설 생성 실패: " + error.message, "error");
  } finally {
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.innerHTML = '✨ AI 해설 자동 생성';
    }
    if (progressContainer) {
      setTimeout(() => {
        progressContainer.style.display = "none";
        if (progressFill) progressFill.style.width = "0%";
      }, 2000);
    }
  }
}

// Parse wrong answer explanations from AI response
function parseWrongExplanations(aiResponse, wrongByChoice) {
  const wrongExplanations = {};

  // Try to find sections for each wrong choice
  Object.keys(wrongByChoice).forEach(choice => {
    // Look for patterns like "1번:" or "【1번】" or "1번 선택지"
    const patterns = [
      new RegExp(`${choice}번[:\\s]*([^\\d【]*?)(?=\\d번|【|$)`, 's'),
      new RegExp(`【${choice}번】[:\\s]*([^【]*?)(?=【|$)`, 's'),
      new RegExp(`${choice}번 선택지[:\\s]*([^\\d]*?)(?=\\d번|$)`, 's')
    ];

    for (const pattern of patterns) {
      const match = aiResponse.match(pattern);
      if (match && match[1] && match[1].trim().length > 20) {
        wrongExplanations[choice] = match[1].trim();
        break;
      }
    }
  });

  return wrongExplanations;
}

// Make functions globally accessible
window.editProblemSet = editProblemSet;
window.deleteProblemSet = deleteProblemSet;
window.deleteProblem = deleteProblem;
window.handleProblemImageSelect = handleProblemImageSelect;
window.updateChoiceCount = updateChoiceCount;
window.selectCorrectAnswer = selectCorrectAnswer;
window.selectStudentAnswer = selectStudentAnswer;
window.editExplanation = editExplanation;
window.saveExplanationEdit = saveExplanationEdit;
window.cancelExplanationEdit = cancelExplanationEdit;
