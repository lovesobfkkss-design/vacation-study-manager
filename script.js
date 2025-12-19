import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, addDoc, getDocs, query, where, orderBy, onSnapshot, documentId, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// 카카오 SDK 초기화
if (window.Kakao && !window.Kakao.isInitialized()) {
  window.Kakao.init('81a7dfd46e80c803f2b0f7a4e47aedbe');
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
let timerId = null;
let lastSave = 0;
let unsubTasks = null;
let unsubWarning = null;
let unsubRegistrations = null;
let unsubAllAcademies = null;
let currentScope = "today";

// 슈퍼 관리자 설정
const SUPER_ADMIN_EMAIL = "lovesobfkkss@gmail.com";
function isSuperAdmin() {
  return me && me.email === SUPER_ADMIN_EMAIL;
}
let currentStudentId = null;

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

// 주기적으로 localStorage에 저장
setInterval(() => {
  localStorage.setItem('dailyReadCount', dailyReadCount.toString());
  localStorage.setItem('dailyWriteCount', dailyWriteCount.toString());
}, 30000); // 30초마다

function dailyRef(uid = me?.uid, key = null) {
  if (!uid) { console.error("dailyRef: uid is required"); return null; }
  return doc(db, "users", uid, "daily", key || getTodayKey());
}
function dailiesCol(uid = me?.uid) {
  if (!uid) { console.error("dailiesCol: uid is required"); return null; }
  return collection(db, "users", uid, "daily");
}
function tasksCol(uid = me?.uid, key = null) {
  if (!uid) { console.error("tasksCol: uid is required"); return null; }
  return collection(db, "users", uid, "daily", key || getTodayKey(), "tasks");
}
function testsCol(uid = me?.uid, key = null) {
  if (!uid) { console.error("testsCol: uid is required"); return null; }
  return collection(db, "users", uid, "daily", key || getTodayKey(), "testResults");
}
function evalsCol(uid) {
  return collection(db, "users", uid, "evaluations");
}
function counselCol(uid) {
  return collection(db, "users", uid, "counseling");
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
  // 타이머 정지
  if (timerId) { clearInterval(timerId); timerId = null; }
  // Firestore 리스너 해제
  if (unsubTasks) { unsubTasks(); unsubTasks = null; }
  if (unsubCheckRequests) { unsubCheckRequests(); unsubCheckRequests = null; }
  if (unsubDailyStatus) { unsubDailyStatus(); unsubDailyStatus = null; }
  if (unsubStudentTimer) { unsubStudentTimer(); unsubStudentTimer = null; }
  if (unsubWarning) { unsubWarning(); unsubWarning = null; }
  await signOut(auth);
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
  document.getElementById("loginView").style.display = "none";
  document.getElementById("signupView").style.display = "none";
  document.getElementById("adminView").style.display = "none";
  document.getElementById("studentView").style.display = "block";
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
  const snap = await getDoc(dailyRef());
  let progress = 0, seconds = 0;
  if (snap.exists()) {
    const d = snap.data();
    progress = Number(d.progress) || 0;
    seconds = Number(d.timerSeconds) || 0;
  } else {
    await setDoc(dailyRef(), { progress: 0, timerSeconds: 0 }, { merge: true });
  }
  renderProgress(progress);
  timerSeconds = seconds;

  // 관리자 원격 제어 감지를 위한 실시간 리스너
  if (unsubDailyStatus) unsubDailyStatus();
  unsubDailyStatus = onSnapshot(dailyRef(), (docSnap) => {
    if (!docSnap.exists()) return;
    const data = docSnap.data();

    // 관리자가 원격으로 제어한 경우
    if (data.timerControlledBy && data.timerControlledBy !== me.uid) {
      // 타이머 시작 명령
      if (data.timerRunning && !timerId) {
        startTimer();
        showRemoteControlAlert("관리자가 타이머를 시작했습니다.");
      }
      // 타이머 정지 명령
      if (!data.timerRunning && timerId) {
        pauseTimer();
        showRemoteControlAlert("관리자가 타이머를 정지했습니다.");
      }
      // 타이머 초기화
      if (data.timerSeconds === 0 && timerSeconds > 0) {
        timerSeconds = 0;
        renderTimer();
        showRemoteControlAlert("관리자가 타이머를 초기화했습니다.");
      }
    }
  });
  renderTimer();
}

function renderProgress(pct) {
  pct = Math.max(0, Math.min(100, Number(pct) || 0));
  const fill = document.getElementById("progressFill");
  fill.style.width = pct + "%";
  fill.textContent = pct + "%";
}

async function recalcProgressAndSave(uid = me.uid, key = null) {
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
}

function startTimer() {
  if (timerId) return;
  timerId = setInterval(() => {
    timerSeconds += 1;
    renderTimer();
    if (Date.now() - lastSave > 60000) {
      lastSave = Date.now();
      setDoc(dailyRef(), { timerSeconds }, { merge: true }).then(() => {
        trackWrite();
      }).catch(err => {
        console.error("타이머 저장 실패:", err);
      });
    }
  }, 1000);
}

function pauseTimer() {
  if (!timerId) return;
  clearInterval(timerId);
  timerId = null;
  setDoc(dailyRef(), { timerSeconds }, { merge: true }).catch(err => {
    console.error("타이머 저장 실패:", err);
  });
}

function resetTimer() {
  if (!confirm("오늘 타이머를 0으로 초기화할까요?")) return;
  timerSeconds = 0;
  renderTimer();
  setDoc(dailyRef(), { timerSeconds }, { merge: true }).catch(err => {
    console.error("타이머 초기화 저장 실패:", err);
  });
}

function renderTimer() {
  const s = Math.floor(timerSeconds);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  document.getElementById("timerLabel").textContent = `${h}:${m}:${sec}`;
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
    console.error("과제 추가 실패:", err);
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
  const subj = document.getElementById("testSubject").value;
  const score = Number(document.getElementById("testScore").value);
  const wrong = Number(document.getElementById("testWrong").value);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    alert("점수는 0~100 사이로 입력하세요.");
    return;
  }
  if (!Number.isInteger(wrong) || wrong < 0) {
    alert("오답 개수는 0 이상의 정수로 입력하세요.");
    return;
  }
  await setDoc(dailyRef(), {}, { merge: true });
  await addDoc(testsCol(), { subject: subj, score, wrongCount: wrong, createdAt: new Date() });
  document.getElementById("testScore").value = "";
  document.getElementById("testWrong").value = "";
  await renderTestList();
  await renderScoreChart();
}

async function renderTestList() {
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
    row.innerHTML = `
      <div><strong>[${r.subject}]</strong> 점수: ${r.score}점 / 오답: ${r.wrongCount}개</div>
      <div class="kicker">${date.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })}</div>
    `;
    list.appendChild(row);
  });
}

let scoreChart;
async function renderScoreChart() {
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
    const sec = Number(d.timerSeconds) || 0;
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
  if (!myData || !myData.grade) {
    document.getElementById("rankingList").innerHTML = '<div class="ghost">학년 정보가 없습니다.</div>';
    return;
  }

  document.getElementById("myGradeLabel").textContent = myData.grade;

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

  // 학생 쿼리: 학원 랭킹 vs 전국 랭킹
  let usersSnap;
  if (currentRankingType === "academy") {
    // 우리 학원 + 같은 학년 학생들
    usersSnap = await getDocs(query(
      collection(db, "users"),
      where("grade", "==", myData.grade),
      where("academyId", "==", myData.academyId || "")
    ));
    document.getElementById("rankingSubtitle").textContent = `${myData.academyName || "우리 학원"} | 점수 = 공부시간(분) + 진행률 × 10`;
  } else {
    // 전국 같은 학년 학생들
    usersSnap = await getDocs(query(
      collection(db, "users"),
      where("grade", "==", myData.grade)
    ));
    document.getElementById("rankingSubtitle").textContent = "전국 | 점수 = 공부시간(분) + 진행률 × 10";
  }

  const rankings = [];

  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data();
    if (userData.role !== "student") continue;

    let totalTime = 0;
    let totalProgress = 0;
    let count = 0;
    let studyDays = 0;

    for (const key of weekKeys) {
      const dailySnap = await getDoc(dailyRef(userDoc.id, key));
      if (dailySnap.exists()) {
        const d = dailySnap.data();
        const sec = Number(d.timerSeconds) || 0;
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
      ? "우리 학원에 같은 학년 학생이 없습니다."
      : "같은 학년의 학생이 없습니다.";
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

  await switchAdminTab("students");
}

async function switchAdminTab(tabName) {
  document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
  document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");

  document.getElementById("adminTabStudents").style.display = "none";
  document.getElementById("adminTabCompare").style.display = "none";
  document.getElementById("adminTabWarning").style.display = "none";
  document.getElementById("adminTabRegistrations").style.display = "none";

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
  } else if (tabName === "compare") {
    document.getElementById("adminTabCompare").style.display = "block";
    await renderCompareView();
  } else if (tabName === "warning") {
    document.getElementById("adminTabWarning").style.display = "block";
    await renderWarningView();
  } else if (tabName === "registrations") {
    document.getElementById("adminTabRegistrations").style.display = "block";
    loadStudentRegistrations();
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
      tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">아직 가입한 학생이 없습니다.</td></tr>';
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
        </tr>
      `;
    }).join('');
  }, (error) => {
    console.error("가입 현황 로드 오류:", error);
    tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">데이터를 불러오는 중 오류가 발생했습니다.</td></tr>';
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
    console.error("전체 학원 로드 오류:", error);
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

async function renderStudentList() {
  const list = document.getElementById("adminList");
  list.innerHTML = "";

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

  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data();
    const dailySnap = await getDoc(dailyRef(userDoc.id, getTodayKey()));
    const dailyData = dailySnap.exists() ? dailySnap.data() : {};

    const progress = Number(dailyData.progress) || 0;
    const seconds = Number(dailyData.timerSeconds) || 0;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    const card = document.createElement("div");
    card.className = "student-card";
    card.innerHTML = `
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div>
          <strong>${userData.name}</strong>
          <span class="badge" style="margin-left:8px;">${userData.grade || "-"}</span>
          <div class="kicker" style="margin-top:4px;">
            오늘 진행률: ${progress}% | 공부시간: ${hours}시간 ${mins}분
          </div>
        </div>
        <button class="btn btn-outline">상세보기</button>
      </div>
    `;

    card.querySelector("button").onclick = () => openStudentModal(userDoc.id, userData);
    list.appendChild(card);
  }
}

async function renderCompareView() {
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
    const seconds = Number(dailyData.timerSeconds) || 0;
    
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
        const sec = Number(d.timerSeconds) || 0;
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

async function openStudentModal(uid, userData) {
  currentStudentId = uid;
  currentStudentData = userData;
  document.getElementById("studentModal").style.display = "block";
  document.getElementById("modalStudentName").textContent = userData.name;
  document.getElementById("modalTodayDate").textContent = getTodayKey();

  // 학부모 이메일 표시
  document.getElementById("modalParentEmail").textContent = userData.parentEmail || "(등록되지 않음)";

  // 학부모 메일 버튼 이벤트
  document.getElementById("sendParentEmailBtn").onclick = () => sendParentEmail(uid, userData);

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
}

function closeModal() {
  document.getElementById("studentModal").style.display = "none";
  currentStudentId = null;
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
    const seconds = Number(data.timerSeconds) || 0;
    const isRunning = data.timerRunning || false;

    // 시간 표시
    const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    document.getElementById("modalTimerDisplay").textContent = `${h}:${m}:${s}`;

    // 상태 표시
    document.getElementById("modalTimerStatus").textContent = isRunning ? "🟢 실행 중" : "⏸️ 정지됨";
    document.getElementById("modalTimerStatus").style.color = isRunning ? "#22a06b" : "#666";
  });

  // 버튼 이벤트 연결
  document.getElementById("modalTimerStartBtn").onclick = () => remoteTimerStart(uid);
  document.getElementById("modalTimerPauseBtn").onclick = () => remoteTimerPause(uid);
  document.getElementById("modalTimerResetBtn").onclick = () => remoteTimerReset(uid);
}

async function remoteTimerStart(uid) {
  try {
    await setDoc(dailyRef(uid, getTodayKey()), {
      timerRunning: true,
      timerStartedAt: new Date(),
      timerControlledBy: me.uid
    }, { merge: true });
    trackWrite();
  } catch (err) {
    alert("타이머 시작 실패: " + err.message);
  }
}

async function remoteTimerPause(uid) {
  try {
    await setDoc(dailyRef(uid, getTodayKey()), {
      timerRunning: false,
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
    console.error("학습 지시 추가 실패:", err);
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
    counseledAt: new Date(),
    date: getTodayKey()
  });
  
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
  const evalQ = query(
    evalsCol(me.uid),
    where("date", "==", today),
    orderBy("evaluatedAt", "desc"),
    limit(1)
  );
  const evalSnap = await getDocs(evalQ);
  const todayEval = evalSnap.empty ? null : evalSnap.docs[0].data();

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
  const timerSec = Number(dailyData.timerSeconds) || 0;
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
  } else {
    subjectsHtml = '<div class="ghost">오늘 학습 항목이 없습니다.</div>';
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

  // 👨‍🏫 선생님 평가
  if (!todayEval) {
    document.getElementById("reportTeacherEval").innerHTML = '<div class="ghost">오늘은 선생님 평가가 아직 없습니다.</div>';
  } else {
    let teacherHtml = `
      <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:12px; margin-bottom:12px;">
        <div class="report-item">집중력: <strong>${todayEval.focus || "-"}</strong></div>
        <div class="report-item">숙제 완성도: <strong>${todayEval.homework || "-"}</strong></div>
        <div class="report-item">학습 태도: <strong>${todayEval.attitude || "-"}</strong></div>
        <div class="report-item">이해도: <strong>${todayEval.understanding || "-"}</strong></div>
      </div>
    `;

    if (todayEval.memo) {
      teacherHtml += `<div class="report-item" style="margin-top:12px;"><strong>선생님 코멘트:</strong> "${todayEval.memo}"</div>`;
    }

    document.getElementById("reportTeacherEval").innerHTML = teacherHtml;
  }

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
  
  // 평가 데이터 수집
  const evalQ = query(
    evalsCol(me.uid),
    where("date", ">=", weekKeys[0]),
    where("date", "<=", weekKeys[6]),
    orderBy("date", "asc")
  );
  const evalSnap = await getDocs(evalQ);
  const evals = [];
  evalSnap.forEach(docu => evals.push(docu.data()));
  
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
    const sec = Number(d.timerSeconds) || 0;
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
    const sec = Number(d.timerSeconds) || 0;
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

  // 평가 데이터 수집
  const evalQ = query(
    evalsCol(me.uid),
    where("date", ">=", monthKeys[0]),
    where("date", "<=", monthKeys[monthKeys.length - 1]),
    orderBy("date", "asc")
  );
  const evalSnap = await getDocs(evalQ);
  const evals = [];
  evalSnap.forEach(docu => evals.push(docu.data()));

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
    const sec = Number(d.timerSeconds) || 0;
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
      const sec = Number(d.timerSeconds) || 0;
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
  
  const q = query(counselCol(uid), orderBy("counseledAt", "desc"), limit(3));
  const snap = await getDocs(q);
  
  if (snap.empty) {
    historyDiv.innerHTML = '<div class="ghost">상담 기록이 없습니다.</div>';
    return;
  }
  
  snap.forEach(docu => {
    const data = docu.data();
    const date = new Date(data.counseledAt?.seconds ? data.counseledAt.seconds * 1000 : data.counseledAt);

    const item = document.createElement("div");
    item.className = "memo-item";
    item.innerHTML = `
      <div class="kicker">${date.toLocaleString('ko-KR')}</div>
      <div style="margin-top:4px;">${data.memo}</div>
    `;
    historyDiv.appendChild(item);
  });
}

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

// 학부모 주간 리포트 메일 발송
async function sendParentEmail(uid, userData) {
  if (!userData.parentEmail) {
    alert("학부모 이메일이 등록되어 있지 않습니다.");
    return;
  }

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

    // 주간 날짜 범위 계산
    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const weekKeys = [];
    for (let d = new Date(monday); d <= sunday; d.setDate(d.getDate() + 1)) {
      weekKeys.push(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }));
    }

    const weekRange = `${weekKeys[0]} ~ ${weekKeys[6]}`;

    // 주간 데이터 수집
    let totalTime = 0;
    let totalProgress = 0;
    let studyDays = 0;
    let dayCount = 0;

    for (const key of weekKeys) {
      const dailySnap = await getDoc(dailyRef(uid, key));
      if (dailySnap.exists()) {
        const d = dailySnap.data();
        const sec = Number(d.timerSeconds) || 0;
        const prog = Number(d.progress) || 0;

        if (sec > 0) studyDays++;
        totalTime += sec;
        totalProgress += prog;
        dayCount++;
      }
    }

    const avgProgress = dayCount > 0 ? Math.round(totalProgress / dayCount) : 0;
    const hours = Math.floor(totalTime / 3600);
    const mins = Math.floor((totalTime % 3600) / 60);

    updateLoading("성적 데이터 수집 중...");

    // 과목별 성적 수집
    const subjectScores = {};
    for (const key of weekKeys) {
      const testSnap = await getDocs(testsCol(uid, key));
      testSnap.forEach(doc => {
        const t = doc.data();
        if (!subjectScores[t.subject]) {
          subjectScores[t.subject] = [];
        }
        subjectScores[t.subject].push({ score: t.score, wrong: t.wrongCount });
      });
    }

    // 주간 평가 수집 (인덱스 필요할 수 있음 - 간단히 처리)
    let evalSummary = "";
    let latestMemo = "";
    try {
      const evalQ = query(
        evalsCol(uid),
        where("date", ">=", weekKeys[0]),
        where("date", "<=", weekKeys[6]),
        orderBy("date", "desc"),
        limit(5)
      );
      const evalSnap = await getDocs(evalQ);

      if (!evalSnap.empty) {
        const evalCounts = { focus: [], homework: [], attitude: [], understanding: [] };
        evalSnap.forEach(doc => {
          const e = doc.data();
          if (e.focus) evalCounts.focus.push(e.focus);
          if (e.homework) evalCounts.homework.push(e.homework);
          if (e.attitude) evalCounts.attitude.push(e.attitude);
          if (e.understanding) evalCounts.understanding.push(e.understanding);
          if (e.memo && !latestMemo) latestMemo = e.memo;
        });

        const getAvgGrade = (arr) => {
          if (arr.length === 0) return "-";
          const map = { "상": 3, "중": 2, "하": 1 };
          const avg = arr.reduce((sum, g) => sum + (map[g] || 0), 0) / arr.length;
          if (avg >= 2.5) return "상";
          if (avg >= 1.5) return "중";
          return "하";
        };

        evalSummary = `집중력: ${getAvgGrade(evalCounts.focus)} | 숙제: ${getAvgGrade(evalCounts.homework)} | 태도: ${getAvgGrade(evalCounts.attitude)} | 이해도: ${getAvgGrade(evalCounts.understanding)}`;
      }
    } catch (evalErr) {
      console.warn("평가 데이터 조회 실패 (인덱스 필요할 수 있음):", evalErr);
    }

    updateLoading("랭킹 계산 중...");

    // 학원 내 랭킹 계산 (오늘 데이터 기준 - 빠른 계산)
    let academyRank = "-";
    let academyTotal = 0;
    const todayForRanking = getTodayKey();

    if (userData.grade && userData.academyId) {
      const academyUsersSnap = await getDocs(query(
        collection(db, "users"),
        where("grade", "==", userData.grade),
        where("academyId", "==", userData.academyId)
      ));

      const rankings = [];
      for (const userDoc of academyUsersSnap.docs) {
        const u = userDoc.data();
        if (u.role !== "student") continue;

        const snap = await getDoc(dailyRef(userDoc.id, todayForRanking));
        let score = 0;
        if (snap.exists()) {
          const d = snap.data();
          const mins = Math.floor((Number(d.timerSeconds) || 0) / 60);
          const prog = Number(d.progress) || 0;
          score = mins + (prog * 10);
        }
        rankings.push({ id: userDoc.id, score });
      }

      rankings.sort((a, b) => b.score - a.score);
      academyTotal = rankings.length;
      const myIdx = rankings.findIndex(r => r.id === uid);
      if (myIdx >= 0) academyRank = myIdx + 1;
    }

    // 과목별 성적 텍스트
    let subjectText = "";
    for (const [subj, scores] of Object.entries(subjectScores)) {
      const avgScore = Math.round(scores.reduce((s, x) => s + x.score, 0) / scores.length);
      const avgWrong = Math.round(scores.reduce((s, x) => s + x.wrong, 0) / scores.length);
      subjectText += `• ${subj}: ${avgScore}점 (평균 오답 ${avgWrong}개)\n`;
    }
    if (!subjectText) subjectText = "• 이번 주 시험 기록 없음\n";

    // 메일 제목
    const emailSubject = `[${myData?.academyName || "학원"}] ${userData.name} 학생 주간 학습 리포트 (${weekRange})`;

    // 메일 본문
    const body = `안녕하세요, ${userData.name} 학생의 학부모님.

이번 주 학습 현황을 알려드립니다.

━━━━━━━━━━━━━━━━━━━━━━━━

📊 이번 주 요약
• 총 공부시간: ${hours}시간 ${mins}분
• 평균 진행률: ${avgProgress}%
• 학습일수: ${studyDays}일/7일

🏆 학원 내 랭킹 (${userData.grade})
• ${academyRank}위 / ${academyTotal}명

📚 과목별 성적
${subjectText}
👨‍🏫 선생님 평가
${evalSummary || "• 이번 주 평가 기록 없음"}
${latestMemo ? `\n📝 선생님 코멘트\n"${latestMemo}"` : ""}

━━━━━━━━━━━━━━━━━━━━━━━━

감사합니다.
${myData?.academyName || "학원"} 드림
`;

    // mailto 링크로 메일 앱 열기
    const mailtoLink = `mailto:${userData.parentEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(body)}`;

    // 로딩 화면 제거
    const loading = document.getElementById('emailLoading');
    if (loading) loading.remove();

    // 복사 모달 표시
    const copyModal = document.createElement('div');
    copyModal.id = 'copyEmailModal';
    copyModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
    copyModal.innerHTML = `
      <div style="background:#fff;padding:24px;border-radius:16px;max-width:600px;width:100%;max-height:80vh;overflow:auto;">
        <h3 style="margin:0 0 16px 0;color:#667eea;">📧 학부모 주간 리포트</h3>
        <div style="margin-bottom:12px;">
          <label style="font-weight:600;font-size:14px;">받는 사람:</label>
          <input type="text" value="${userData.parentEmail}" readonly style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-top:4px;background:#f8f9fb;">
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-weight:600;font-size:14px;">제목:</label>
          <input type="text" id="emailSubjectField" value="${emailSubject}" readonly style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-top:4px;background:#f8f9fb;">
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-weight:600;font-size:14px;">내용:</label>
          <textarea id="emailBodyField" readonly style="width:100%;height:250px;padding:10px;border:1px solid #ddd;border-radius:8px;margin-top:4px;background:#f8f9fb;font-size:13px;line-height:1.5;resize:none;">${body}</textarea>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="copyEmailBtn" style="flex:1;min-width:140px;padding:12px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:600;">📋 내용 복사</button>
          <button id="kakaoShareBtn" style="flex:1;min-width:140px;padding:12px;background:#FEE500;color:#3C1E1E;border:none;border-radius:10px;cursor:pointer;font-weight:600;">💬 카톡 보내기</button>
          <button id="closeEmailModal" style="padding:12px 20px;background:#f1f2f6;border:none;border-radius:10px;cursor:pointer;font-weight:600;">닫기</button>
        </div>
        <p id="copyStatus" style="text-align:center;margin-top:12px;color:#22a06b;font-weight:600;display:none;">✅ 복사되었습니다!</p>
      </div>
    `;
    document.body.appendChild(copyModal);

    // 복사 버튼
    document.getElementById('copyEmailBtn').onclick = async () => {
      const fullText = `받는 사람: ${userData.parentEmail}\n제목: ${emailSubject}\n\n${body}`;
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

    // 카톡 공유 버튼
    document.getElementById('kakaoShareBtn').onclick = () => {
      // 카카오톡 공유 (텍스트)
      if (window.Kakao && window.Kakao.isInitialized()) {
        window.Kakao.Share.sendDefault({
          objectType: 'text',
          text: `📊 ${userData.name} 학생 주간 리포트\n\n` +
                `총 공부시간: ${hours}시간 ${mins}분\n` +
                `평균 진행률: ${avgProgress}%\n` +
                `학습일수: ${studyDays}일/7일\n` +
                `학원 내 랭킹: ${academyRank}위/${academyTotal}명\n\n` +
                (evalSummary ? `선생님 평가: ${evalSummary}\n` : '') +
                (latestMemo ? `코멘트: "${latestMemo}"` : ''),
          link: {
            mobileWebUrl: window.location.href,
            webUrl: window.location.href
          }
        });
      } else {
        // 카카오 SDK 미설정시 복사 후 안내
        const kakaoText = `📊 ${userData.name} 학생 주간 리포트 (${weekRange})\n\n` +
                `총 공부시간: ${hours}시간 ${mins}분\n` +
                `평균 진행률: ${avgProgress}%\n` +
                `학습일수: ${studyDays}일/7일\n` +
                `학원 내 랭킹: ${academyRank}위/${academyTotal}명\n\n` +
                (evalSummary ? `👨‍🏫 선생님 평가\n${evalSummary}\n\n` : '') +
                (latestMemo ? `📝 코멘트\n"${latestMemo}"` : '');

        navigator.clipboard.writeText(kakaoText).then(() => {
          alert('내용이 복사되었습니다!\n카카오톡에서 붙여넣기 해주세요.');
        }).catch(() => {
          alert('복사 실패. 내용을 직접 복사해주세요.');
        });
      }
    };

    // 닫기 버튼
    document.getElementById('closeEmailModal').onclick = () => {
      copyModal.remove();
    };
  } catch (err) {
    // 로딩 화면 제거
    const loading = document.getElementById('emailLoading');
    if (loading) loading.remove();

    console.error("학부모 메일 생성 오류:", err);
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
    console.error("경고 전송 실패:", err);
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
      console.error("경고 읽음 처리 실패:", err);
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
    console.error("경고 리스너 오류:", err);
  });
}
