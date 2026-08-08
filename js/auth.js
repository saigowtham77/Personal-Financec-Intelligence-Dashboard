/* ============================================================
   Ledgerline — Auth (client-side demo)
   Accounts and hashed passwords are stored in this browser's
   localStorage only. This is a front-end demo, not production
   security: never reuse a real banking password here.
   ============================================================ */

const LS_USERS = "ledgerline_users";
const LS_SESSION = "ledgerline_session";

function seedDemoUser() {
  const users = getUsers();
  if (!users["demo@ledgerline.app"]) {
    users["demo@ledgerline.app"] = {
      name: "Demo User",
      email: "demo@ledgerline.app",
      passHash: simpleHash("demo1234"),
      createdAt: Date.now()
    };
    saveUsers(users);
  }
}

function getUsers() {
  try { return JSON.parse(localStorage.getItem(LS_USERS)) || {}; }
  catch (e) { return {}; }
}
function saveUsers(users) {
  localStorage.setItem(LS_USERS, JSON.stringify(users));
}

// Not cryptographic — a lightweight obfuscation suitable only for this
// local demo so raw passwords are never stored verbatim.
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return "h" + hash.toString(36) + str.length;
}

function startSession(email) {
  localStorage.setItem(LS_SESSION, JSON.stringify({ email, at: Date.now() }));
}

seedDemoUser();

// If already signed in, skip straight to dashboard
try {
  const sess = JSON.parse(localStorage.getItem(LS_SESSION));
  if (sess && sess.email && getUsers()[sess.email]) {
    window.location.href = "dashboard.html";
  }
} catch (e) {}

document.querySelectorAll(".toggle-vis").forEach(btn => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.target);
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    btn.textContent = showing ? "show" : "hide";
  });
});

document.getElementById("toSignup").addEventListener("click", () => {
  document.getElementById("loginPanel").classList.add("hidden");
  document.getElementById("signupPanel").classList.remove("hidden");
});
document.getElementById("toLogin").addEventListener("click", () => {
  document.getElementById("signupPanel").classList.add("hidden");
  document.getElementById("loginPanel").classList.remove("hidden");
});

document.getElementById("loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const pass = document.getElementById("loginPass").value;
  const users = getUsers();
  const errEl = document.getElementById("loginError");
  const user = users[email];
  if (user && user.passHash === simpleHash(pass)) {
    errEl.classList.remove("show");
    startSession(email);
    window.location.href = "dashboard.html";
  } else {
    errEl.textContent = "Incorrect email or password.";
    errEl.classList.add("show");
  }
});

document.getElementById("signupForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("suName").value.trim();
  const email = document.getElementById("suEmail").value.trim().toLowerCase();
  const pass = document.getElementById("suPass").value;
  const errEl = document.getElementById("signupError");
  const users = getUsers();

  if (users[email]) {
    errEl.textContent = "An account with this email already exists on this browser.";
    errEl.classList.add("show");
    return;
  }
  if (pass.length < 6) {
    errEl.textContent = "Password must be at least 6 characters.";
    errEl.classList.add("show");
    return;
  }
  users[email] = { name, email, passHash: simpleHash(pass), createdAt: Date.now() };
  saveUsers(users);
  errEl.classList.remove("show");
  startSession(email);
  window.location.href = "dashboard.html";
});
