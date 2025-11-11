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

let me = null;
let myData = null;
let currentSubject = "모든 과목";
const subjects = new Set(["모든 과목", "국어", "영어", "수학", "과학", "사회"]);
const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
let timerSeconds = 0;
let timerId = null;
let lastSave = 0;
let unsubTasks = null;
let currentScope = "today";
let currentStudentId = null;

function dailyRef(uid = me?.uid, key = todayKey) {
  return doc(db, "users", uid, "daily", key);
}
function dailiesCol(uid = me?.uid) {
  return collection(db, "users", uid, "daily");
}
function tasksCol(uid = me?.uid, key = todayKey) {
  return collection(db, "users", uid, "daily", key, "tasks");
}
function testsCol(uid = me?.uid, key = todayKey) {
  return collection(db, "users", uid, "daily", key, "testResults");
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
    errDiv.textContent = "로그인 실패: " + (error.message || "알 수 없는 오류");
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
  const err = document.getElementById("suErr");
  const ok = document.getElementById("suOk");
  err.textContent = "";
  ok.textContent = "";
  
  if (!name || !email) { err.textContent = "이름/이메일을 입력하세요."; return; }
  if (role === "student" && !nickname) { err.textContent = "닉네임을 입력하세요."; return; }
  if (pw.length < 6) { err.textContent = "비밀번호는 6자 이상."; return; }
  if (pw !== pw2) { err.textContent = "비밀번호가 일치하지 않습니다."; return; }
  if (role === "student" && !grade) { err.textContent = "학년을 선택하세요."; return; }
  
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    await setDoc(doc(db, "users", cred.user.uid), {
      name, 
      nickname: nickname || name,
      email, 
      role, 
      grade: (role === "admin" ? "" : grade),
      parentEmail: (role === "student" ? parentEmail : ""),
      createdAt: new Date()
    });
    ok.textContent = "가입 완료! 로그인해 주세요.";
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
    }, 1500);
  } catch (e) {
    err.textContent = "회원가입 오류: " + (e.message || e.code || "알 수 없는 오류");
  }
}

async function logout() {
  if (timerId) { clearInterval(timerId); timerId = null; }
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
  
  try {
    const userRef = doc(db, "users", me.uid);
    const userDoc = await getDoc(userRef);
    
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
  document.getElementById("todayLabel").textContent = todayKey;
  renderTabs();
  document.getElementById("taskTitle").textContent = `[${currentSubject}] 학습 항목`;
  await loadDailyStatus();
  loadTasks(currentSubject);
  await renderTestList();
  await renderScoreChart();
  setScope(currentScope);
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
  renderTimer();
}

function renderProgress(pct) {
  pct = Math.max(0, Math.min(100, Number(pct) || 0));
  const fill = document.getElementById("progressFill");
  fill.style.width = pct + "%";
  fill.textContent = pct + "%";
}

async function recalcProgressAndSave(uid = me.uid, key = todayKey) {
  const q = await getDocs(tasksCol(uid, key));
  let total = 0, done = 0;
  q.forEach(docu => {
    const t = docu.data();
    if (t.__deleted) return;
    total++;
    if (t.completed) done++;
  });
  const pct = (total > 0 ? Math.round(done / total * 100) : 0);
  if (uid === me.uid && key === todayKey) renderProgress(pct);
  await setDoc(dailyRef(uid, key), { 
    progress: pct, 
    totalTasks: total, 
    completedTasks: done,
    lastUpdated: new Date()
  }, { merge: true });
}

function startTimer() {
  if (timerId) return;
  timerId = setInterval(() => {
    timerSeconds += 1;
    renderTimer();
    if (Date.now() - lastSave > 10000) {
      lastSave = Date.now();
      setDoc(dailyRef(), { timerSeconds }, { merge: true });
    }
  }, 1000);
}

function pauseTimer() {
  if (!timerId) return;
  clearInterval(timerId);
  timerId = null;
  setDoc(dailyRef(), { timerSeconds }, { merge: true });
}

function resetTimer() {
  if (!confirm("오늘 타이머를 0으로 초기화할까요?")) return;
  timerSeconds = 0;
  renderTimer();
  setDoc(dailyRef(), { timerSeconds }, { merge: true });
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
  await setDoc(dailyRef(), {}, { merge: true });
  await addDoc(tasksCol(), { subject: subj, title, completed: false, createdAt: new Date() });
  await recalcProgressAndSave();
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
      row.innerHTML = `
        <div class="task-left">
          <input type="checkbox" ${t.completed ? "checked" : ""}>
          ${subj === "모든 과목" ? `<span class="badge">${t.subject}</span>` : ""}
          <span class="task-title">${t.title}</span>
        </div>
        <button class="btn btn-outline">삭제</button>`;
      row.querySelector("input").onchange = async () => {
        await updateDoc(doc(tasksCol(), docu.id), { completed: row.querySelector("input").checked });
        await recalcProgressAndSave();
      };
      row.querySelector("button").onclick = async () => {
        if (!confirm("이 항목을 삭제하시겠습니까?")) return;
        await deleteDoc(doc(tasksCol(), docu.id));
        await recalcProgressAndSave();
      };
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
async function renderRanking() {
  if (!myData || !myData.grade) {
    document.getElementById("rankingList").innerHTML = '<div class="ghost">학년 정보가 없습니다.</div>';
    return;
  }
  
  document.getElementById("myGradeLabel").textContent = myData.grade;
  
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
  
  // 같은 학년 학생들 가져오기
  const usersSnap = await getDocs(query(collection(db, "users"), where("grade", "==", myData.grade)));
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
      score,
      avgProgress,
      totalTime,
      studyDays,
      badges
    });
  }
  
  rankings.sort((a, b) => b.score - a.score);
  
  // 1등에게 챔피언 배지 추가
  if (rankings.length > 0 && !rankings[0].badges.includes("👑 주간 챔피언")) {
    rankings[0].badges.push("👑 주간 챔피언");
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
    list.innerHTML = '<div class="ghost">같은 학년의 학생이 없습니다.</div>';
    return;
  }
  
  rankings.forEach((rank, index) => {
    const item = document.createElement("div");
    item.className = "rank-item" + (index === 0 ? " mvp" : "");
    
    const hours = Math.floor(rank.totalTime / 3600);
    const mins = Math.floor((rank.totalTime % 3600) / 60);
    
    item.innerHTML = `
      <div class="rank-num">${index + 1}</div>
      <div class="rank-info">
        <div class="rank-name">${rank.name} ${rank.uid === me.uid ? "(나)" : ""}</div>
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
  
  await switchAdminTab("students");
}

async function switchAdminTab(tabName) {
  document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
  document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");
  
  document.getElementById("adminTabStudents").style.display = "none";
  document.getElementById("adminTabCompare").style.display = "none";
  document.getElementById("adminTabWarning").style.display = "none";
  
  if (tabName === "students") {
    document.getElementById("adminTabStudents").style.display = "block";
    await renderStudentList();
  } else if (tabName === "compare") {
    document.getElementById("adminTabCompare").style.display = "block";
    await renderCompareView();
  } else if (tabName === "warning") {
    document.getElementById("adminTabWarning").style.display = "block";
    await renderWarningView();
  }
}

async function renderStudentList() {
  const list = document.getElementById("adminList");
  list.innerHTML = "";
  
  const usersSnap = await getDocs(query(collection(db, "users"), where("role", "==", "student")));
  
  if (usersSnap.empty) {
    list.innerHTML = '<div class="ghost">등록된 학생이 없습니다.</div>';
    return;
  }
  
  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data();
    const dailySnap = await getDoc(dailyRef(userDoc.id, todayKey));
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
  const usersSnap = await getDocs(query(collection(db, "users"), where("role", "==", "student")));
  
  if (usersSnap.empty) {
    document.getElementById("compareStats").innerHTML = '<div class="ghost">학생 데이터가 없습니다.</div>';
    return;
  }
  
  const students = [];
  let totalProgress = 0, totalTime = 0;
  
  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data();
    const dailySnap = await getDoc(dailyRef(userDoc.id, todayKey));
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
  
  const usersSnap = await getDocs(query(collection(db, "users"), where("role", "==", "student")));
  
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

async function openStudentModal(uid, userData) {
  currentStudentId = uid;
  document.getElementById("studentModal").style.display = "block";
  document.getElementById("modalStudentName").textContent = userData.name;
  document.getElementById("modalTodayDate").textContent = todayKey;
  
  // 오늘 평가 불러오기
  const evalQ = query(evalsCol(uid), where("date", "==", todayKey), limit(1));
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
}

function closeModal() {
  document.getElementById("studentModal").style.display = "none";
  currentStudentId = null;
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
    date: todayKey,
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
  if (!currentStudentId) return;
  
  const subject = document.getElementById("taskSubject").value.trim();
  const title = document.getElementById("taskTitle").value.trim();
  
  if (!subject || !title) {
    alert("과목과 항목 내용을 모두 입력하세요.");
    return;
  }
  
  await setDoc(dailyRef(currentStudentId, todayKey), {}, { merge: true });
  await addDoc(tasksCol(currentStudentId, todayKey), {
    subject,
    title,
    completed: false,
    createdAt: new Date(),
    assignedBy: me.uid
  });
  
  await recalcProgressAndSave(currentStudentId, todayKey);
  
  document.getElementById("taskSubject").value = "";
  document.getElementById("taskTitle").value = "";
  
  alert("학습 지시가 추가되었습니다!");
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
    date: todayKey
  });
  
  document.getElementById("counselMemo").value = "";
  await loadCounselingHistory(currentStudentId);
  
  alert("상담 메모가 저장되었습니다!");
}

async function renderDailyReport() {
  // 오늘의 데이터 가져오기
  const dailySnap = await getDoc(dailyRef(me.uid, todayKey));
  const dailyData = dailySnap.exists() ? dailySnap.data() : {};

  // 제목 업데이트
  document.querySelector("#reportWrap h3.title").textContent = "📊 오늘의 AI 학습 리포트";
  document.getElementById("reportWeekRange").textContent = todayKey;

  // 오늘의 평가 데이터 수집
  const evalQ = query(
    evalsCol(me.uid),
    where("date", "==", todayKey),
    orderBy("evaluatedAt", "desc"),
    limit(1)
  );
  const evalSnap = await getDocs(evalQ);
  const todayEval = evalSnap.empty ? null : evalSnap.docs[0].data();

  // 오늘의 시험 결과 수집
  const testQ = query(testsCol(me.uid, todayKey));
  const testSnap = await getDocs(testQ);
  const testScores = {};
  testSnap.forEach(docu => {
    const t = docu.data();
    if (!testScores[t.subject]) testScores[t.subject] = [];
    testScores[t.subject].push({ score: t.score, wrong: t.wrongCount });
  });

  // 오늘의 과목별 학습 항목 수집
  const tasksQ = query(tasksCol(me.uid, todayKey));
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
  
  if (completedTasks / totalTasks < 0.7) {
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
  
  if (completedTasks / totalTasks >= 0.8) {
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
  const avgDiff = weekProgressDiffs.reduce((a, b) => a + b, 0) / weekProgressDiffs.length;
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
