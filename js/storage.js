/* ============================================================
   Ledgerline — Storage
   All data is namespaced per signed-in email and kept only in
   this browser's localStorage. Nothing is transmitted anywhere.
   ============================================================ */

const Store = (() => {

  function getSession() {
    try { return JSON.parse(localStorage.getItem("ledgerline_session")); }
    catch (e) { return null; }
  }

  function currentUser() {
    const sess = getSession();
    if (!sess || !sess.email) return null;
    try {
      const users = JSON.parse(localStorage.getItem("ledgerline_users")) || {};
      return users[sess.email] || { email: sess.email, name: sess.email.split("@")[0] };
    } catch (e) {
      return { email: sess.email, name: sess.email.split("@")[0] };
    }
  }

  function key(name) {
    const sess = getSession();
    const email = sess ? sess.email : "anon";
    return `ledgerline_${email}_${name}`;
  }

  function loadTransactions() {
    try {
      const raw = JSON.parse(localStorage.getItem(key("transactions"))) || [];
      return raw.map(t => ({ ...t, date: new Date(t.date) }));
    } catch (e) { return []; }
  }

  function saveTransactions(transactions) {
    localStorage.setItem(key("transactions"), JSON.stringify(transactions));
  }

  function clearTransactions() {
    localStorage.removeItem(key("transactions"));
  }

  function loadBlocklist() {
    try { return JSON.parse(localStorage.getItem(key("blocklist"))) || []; }
    catch (e) { return []; }
  }

  function saveBlocklist(list) {
    localStorage.setItem(key("blocklist"), JSON.stringify(list));
  }

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(key("prefs"))) || { hideBalances: false }; }
    catch (e) { return { hideBalances: false }; }
  }

  function savePrefs(prefs) {
    localStorage.setItem(key("prefs"), JSON.stringify(prefs));
  }

  function logout() {
    localStorage.removeItem("ledgerline_session");
    window.location.href = "index.html";
  }

  return {
    getSession, currentUser,
    loadTransactions, saveTransactions, clearTransactions,
    loadBlocklist, saveBlocklist,
    loadPrefs, savePrefs,
    logout
  };
})();
