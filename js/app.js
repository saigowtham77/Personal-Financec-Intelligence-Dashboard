/* ============================================================
   Ledgerline — App Controller
   ============================================================ */

(function () {
  // ---------- Auth guard ----------
  const session = Store.getSession();
  if (!session || !session.email) {
    window.location.href = "index.html";
    return;
  }

  let user = Store.currentUser();
  let transactions = Store.loadTransactions();
  let blocklist = Store.loadBlocklist();
  let prefs = Store.loadPrefs();

  const fmt = (n) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
  const maskFmt = (n) => prefs.hideBalances ? "•••••" : fmt(n);

  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2400);
  }

  // ---------- Profile / topbar ----------
  function initials(name) {
    return (name || "U").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  }

  function refreshProfileUI() {
    document.getElementById("avatarInitial").textContent = initials(user.name);
    document.getElementById("profileNameChip").textContent = (user.name || "User").split(" ")[0];
    document.getElementById("pmName").textContent = user.name || "User";
    document.getElementById("pmEmail").textContent = user.email || "";
    document.getElementById("pmStatements").textContent = transactions.length ? "1 loaded" : "None yet";
    document.getElementById("hideBalancesToggle").checked = !!prefs.hideBalances;
    document.getElementById("settingsHideToggle").checked = !!prefs.hideBalances;
    document.getElementById("settingsName").value = user.name || "";
    document.getElementById("settingsEmail").value = user.email || "";
    // masked, non-sensitive per-browser reference (not a real account number)
    const ref = (user.email || "user").split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 9000 + 1000;
    document.getElementById("pmAccountRef").textContent = "•••• " + ref;
  }

  document.getElementById("profileChipBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("profileMenu").classList.toggle("open");
  });
  document.addEventListener("click", () => document.getElementById("profileMenu").classList.remove("open"));
  document.getElementById("profileMenu").addEventListener("click", (e) => e.stopPropagation());

  document.getElementById("hideBalancesToggle").addEventListener("change", (e) => {
    prefs.hideBalances = e.target.checked;
    Store.savePrefs(prefs);
    document.getElementById("settingsHideToggle").checked = prefs.hideBalances;
    renderAll();
  });
  document.getElementById("settingsHideToggle").addEventListener("change", (e) => {
    prefs.hideBalances = e.target.checked;
    Store.savePrefs(prefs);
    document.getElementById("hideBalancesToggle").checked = prefs.hideBalances;
    renderAll();
  });
  document.getElementById("quickHideBtn").addEventListener("click", () => {
    prefs.hideBalances = !prefs.hideBalances;
    Store.savePrefs(prefs);
    refreshProfileUI();
    renderAll();
  });

  document.getElementById("settingsName").addEventListener("change", (e) => {
    user.name = e.target.value.trim() || user.name;
    try {
      const users = JSON.parse(localStorage.getItem("ledgerline_users")) || {};
      if (users[user.email]) { users[user.email].name = user.name; localStorage.setItem("ledgerline_users", JSON.stringify(users)); }
    } catch (err) {}
    refreshProfileUI();
    toast("Profile updated");
  });

  function doLogout() { Store.logout(); }
  document.getElementById("pmLogoutBtn").addEventListener("click", doLogout);
  document.getElementById("sidebarLogout").addEventListener("click", doLogout);

  document.getElementById("pmResetBtn").addEventListener("click", () => {
    if (confirm("Clear all transactions and dues loaded in this browser? This can't be undone.")) {
      transactions = [];
      blocklist = [];
      Store.clearTransactions();
      Store.saveBlocklist([]);
      renderAll();
      toast("Local data cleared");
    }
  });

  document.querySelectorAll("[data-view].menu-action").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // ---------- Navigation ----------
  function switchView(name) {
    document.querySelectorAll(".nav-item[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === name));
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + name));
    const titles = {
      overview: "Overview", upload: "Upload Statement", transactions: "Transactions",
      categories: "Categories", trends: "Trends & Predictions", health: "Financial Health",
      blocklist: "Dues & Blocklist", reports: "Reports & Export", settings: "Settings"
    };
    document.getElementById("viewTitle").innerHTML = `<span class="eyebrow">Ledgerline</span>${titles[name] || name}`;
    document.getElementById("sidebar").classList.remove("open");
    if (name === "categories") renderCategoriesView();
    if (name === "trends") renderTrendsView();
    if (name === "health") renderHealthView();
    if (name === "reports") renderReportsView();
  }
  document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  document.getElementById("menuToggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });

  // ---------- Upload ----------
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  document.getElementById("browseBtn").addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("click", (e) => { if (e.target.id !== "browseBtn") fileInput.click(); });
  ["dragenter", "dragover"].forEach(ev => dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(ev => dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove("drag"); }));
  dropZone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  fileInput.addEventListener("change", (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });

  let pendingImport = null; // { categorized, fileLabel, parseResult }

  function handleFile(file) {
    const statusEl = document.getElementById("uploadStatus");
    statusEl.textContent = "Reading " + file.name + "…";
    const reader = new FileReader();
    reader.onload = (e) => runVerification(e.target.result, file.name);
    reader.onerror = () => { statusEl.innerHTML = `<span style="color:var(--rose)">Couldn't read that file — try again.</span>`; };
    reader.readAsText(file);
  }

  function runVerification(csvText, fileLabel) {
    const statusEl = document.getElementById("uploadStatus");
    const parseResult = Parser.parseCSV(csvText);

    if (!parseResult.transactions.length) {
      statusEl.innerHTML = `<span style="color:var(--rose)">Verification failed — no usable transactions found in "${fileLabel}". ${parseResult.errors.join(" ")}</span>`;
      document.getElementById("verifyPanel").classList.add("hidden");
      pendingImport = null;
      return;
    }

    const categorized = Categorize.categorizeAll(parseResult.transactions);
    pendingImport = { categorized, fileLabel, parseResult };
    statusEl.innerHTML = `<span style="color:var(--text-muted)">Parsed "${fileLabel}" — review below, then confirm to import.</span>`;
    renderVerifyPanel(pendingImport);
  }

  function renderVerifyPanel(pending) {
    const { categorized, fileLabel, parseResult } = pending;
    const panel = document.getElementById("verifyPanel");
    panel.classList.remove("hidden");

    const statusTag = document.getElementById("verifyStatusTag");
    statusTag.textContent = parseResult.valid ? "Looks good" : "Check columns";
    statusTag.style.color = parseResult.valid ? "var(--teal)" : "var(--amber)";

    const existingIds = new Set(transactions.map(t => t.id));
    const newCount = categorized.filter(t => !existingIds.has(t.id)).length;
    const dupCount = categorized.length - newCount;

    document.getElementById("verifySummaryCards").innerHTML = `
      <div class="card stat-card"><div class="label">Rows Read</div><div class="value">${parseResult.totalRows}</div><div class="delta">from ${escapeHtml(fileLabel)}</div></div>
      <div class="card stat-card"><div class="label">Valid Transactions</div><div class="value">${categorized.length}</div><div class="delta up">Ready to import</div></div>
      <div class="card stat-card"><div class="label">Skipped Rows</div><div class="value">${parseResult.skipped}</div><div class="delta ${parseResult.skipped ? "down" : ""}">${parseResult.skipped ? "See issues" : "None"}</div></div>
      <div class="card stat-card"><div class="label">Already Loaded</div><div class="value">${dupCount}</div><div class="delta">${newCount} new rows will be added</div></div>
    `;

    const cols = parseResult.detectedColumns || {};
    const colLabels = { date: "Date", description: "Description", amount: "Amount", debit: "Debit", credit: "Credit", type: "Type" };
    document.getElementById("verifyColumns").innerHTML = Object.keys(colLabels).map(k => {
      const found = cols[k];
      return `<span class="chip" style="${found ? "border-color:var(--teal); color:var(--teal);" : ""}">${colLabels[k]}: ${found ? escapeHtml(found) : "not found"}</span>`;
    }).join("");

    const issues = [
      ...parseResult.errors,
      ...(parseResult.parseWarnings || []),
      ...(parseResult.duplicateCount ? [`${parseResult.duplicateCount} duplicate row(s) detected within the file itself.`] : [])
    ];
    const rowIssues = (parseResult.skippedRows || []).slice(0, 12).map(s => `Row ${s.row}: ${s.reason}`);
    const allIssues = [...issues, ...rowIssues];
    document.getElementById("verifyIssues").innerHTML = allIssues.length
      ? allIssues.map(i => `<div style="padding:4px 0; border-bottom:1px solid var(--card-border);">${escapeHtml(i)}</div>`).join("")
      : `<div style="color:var(--teal);">No issues found — every row parsed cleanly.</div>`;

    document.getElementById("verifyPreviewBody").innerHTML = categorized.slice(0, 8).map(t => `
      <tr>
        <td class="mono">${t.dateStr}</td>
        <td>${escapeHtml(t.description)}</td>
        <td><span class="cat-pill">${t.category}</span></td>
        <td>${t.direction === "credit" ? "Credit" : "Debit"}</td>
        <td style="text-align:right;" class="${t.direction === "credit" ? "amt-credit" : "amt-debit"}">${t.direction === "credit" ? "+" : "−"}${fmt(t.amount)}</td>
      </tr>
    `).join("");
  }

  document.getElementById("confirmImportBtn").addEventListener("click", () => {
    if (!pendingImport) return;
    transactions = mergeTransactions(transactions, pendingImport.categorized);
    Store.saveTransactions(transactions);
    document.getElementById("uploadStatus").innerHTML = `<span style="color:var(--teal)">Imported ${pendingImport.categorized.length} transactions from "${escapeHtml(pendingImport.fileLabel)}". Preprocessing complete.</span>`;
    document.getElementById("verifyPanel").classList.add("hidden");
    toast("Statement imported");
    pendingImport = null;
    renderAll();
    switchView("overview");
  });

  document.getElementById("discardImportBtn").addEventListener("click", () => {
    pendingImport = null;
    document.getElementById("verifyPanel").classList.add("hidden");
    document.getElementById("uploadStatus").textContent = "Import discarded.";
  });

  function mergeTransactions(existing, incoming) {
    const seen = new Set(existing.map(t => t.id));
    const merged = [...existing];
    incoming.forEach(t => { if (!seen.has(t.id)) { merged.push(t); seen.add(t.id); } });
    merged.sort((a, b) => new Date(a.date) - new Date(b.date));
    return merged;
  }

  document.getElementById("loadSampleBtn").addEventListener("click", () => {
    fetch("sample_data/sample_transactions.csv")
      .then(r => r.text())
      .then(text => runVerification(text, "sample_transactions.csv"))
      .catch(() => toast("Couldn't load the sample file — try uploading your own CSV."));
  });

  document.getElementById("clearDataBtn").addEventListener("click", () => {
    if (confirm("Remove all loaded transactions?")) {
      transactions = [];
      Store.clearTransactions();
      renderAll();
      toast("Transactions cleared");
    }
  });

  // ---------- Overview ----------
  function renderOverview() {
    const totals = Analytics.monthlyTotals(transactions);
    const cats = Analytics.categoryTotals(transactions);
    const prediction = Analytics.predictNextMonth(transactions);
    const health = Analytics.healthScore(transactions, blocklist);
    const insights = Analytics.generateInsights(transactions, prediction, health);

    const totalIncome = totals.reduce((a, m) => a + m.income, 0);
    const totalExpense = totals.reduce((a, m) => a + m.expense, 0);
    const net = totalIncome - totalExpense;
    const lastMonth = totals[totals.length - 1];
    const prevMonth = totals[totals.length - 2];
    const momChange = (lastMonth && prevMonth && prevMonth.expense) ? Math.round(((lastMonth.expense - prevMonth.expense) / prevMonth.expense) * 100) : null;

    document.getElementById("statCards").innerHTML = `
      <div class="card stat-card"><div class="icon-corner">IN</div><div class="label">Total Income</div><div class="value">${maskFmt(totalIncome)}</div><div class="delta">${totals.length} month(s) of data</div></div>
      <div class="card stat-card"><div class="icon-corner">OUT</div><div class="label">Total Expenses</div><div class="value">${maskFmt(totalExpense)}</div><div class="delta ${momChange === null ? "" : momChange > 0 ? "down" : "up"}">${momChange === null ? "No comparison yet" : (momChange > 0 ? "▲" : "▼") + " " + Math.abs(momChange) + "% vs prior month"}</div></div>
      <div class="card stat-card"><div class="icon-corner">NET</div><div class="label">Net Position</div><div class="value">${maskFmt(net)}</div><div class="delta ${net >= 0 ? "up" : "down"}">${net >= 0 ? "Saving overall" : "Spending more than earned"}</div></div>
      <div class="card stat-card"><div class="icon-corner">FWD</div><div class="label">Predicted Next Month</div><div class="value">${maskFmt(prediction.predicted)}</div><div class="delta">${prediction.confidence} confidence</div></div>
    `;

    Charts.monthlyTrend("chartOverviewTrend", totals);
    Charts.categoryPie("chartOverviewPie", cats);

    document.getElementById("insightsList").innerHTML = insights.length
      ? insights.map(i => `<div class="insight-line"><span class="dot"></span>${i}</div>`).join("")
      : `<div class="empty-state"><div class="big">No insights yet</div>Upload a statement to see analysis here.</div>`;

    setGauge("gaugeArc", health.score, health.color);
    document.getElementById("ovHealthScore").textContent = health.score;
    document.getElementById("ovHealthBand").textContent = health.band;
    document.getElementById("ovHealthBand").style.background = `var(--${health.color}-dim, var(--card-alt))`;
    document.getElementById("ovHealthBand").style.color = `var(--${health.color}, var(--text-muted))`;
  }

  function setGauge(elId, score, color) {
    const el = document.getElementById(elId);
    if (!el) return;
    const circumference = 289;
    const offset = circumference - (Math.min(100, Math.max(0, score)) / 100) * circumference;
    el.style.strokeDashoffset = offset;
    const colorMap = { teal: "#4FD1AE", amber: "#E8A33D", rose: "#E1614F", muted: "#5D726F" };
    el.setAttribute("stroke", colorMap[color] || "#4FD1AE");
  }

  // ---------- Transactions ----------
  function renderTransactionsView() {
    const catFilter = document.getElementById("txnCategoryFilter");
    const currentCats = Categorize.categoryList();
    catFilter.innerHTML = `<option value="">All categories</option>` + currentCats.map(c => `<option value="${c}">${c}</option>`).join("");
    drawTransactionTable();
  }

  function drawTransactionTable() {
    const search = document.getElementById("txnSearch").value.toLowerCase();
    const catF = document.getElementById("txnCategoryFilter").value;
    const dirF = document.getElementById("txnDirectionFilter").value;

    const filtered = transactions.filter(t => {
      if (search && !t.description.toLowerCase().includes(search)) return false;
      if (catF && t.category !== catF) return false;
      if (dirF && t.direction !== dirF) return false;
      return true;
    }).slice().reverse();

    document.getElementById("txnCount").textContent = `${filtered.length} of ${transactions.length} rows`;

    document.getElementById("txnTableBody").innerHTML = filtered.length ? filtered.map(t => `
      <tr>
        <td class="mono">${t.dateStr}</td>
        <td>${escapeHtml(t.description)}</td>
        <td><span class="cat-pill">${t.category}</span></td>
        <td>${t.direction === "credit" ? "Credit" : "Debit"}</td>
        <td style="text-align:right;" class="${t.direction === "credit" ? "amt-credit" : "amt-debit"}">${t.direction === "credit" ? "+" : "−"}${maskFmt(t.amount)}</td>
      </tr>
    `).join("") : `<tr><td colspan="5"><div class="empty-state"><div class="big">No transactions match</div>Try clearing filters or upload a statement.</div></td></tr>`;
  }

  ["txnSearch"].forEach(id => document.getElementById(id).addEventListener("input", drawTransactionTable));
  ["txnCategoryFilter", "txnDirectionFilter"].forEach(id => document.getElementById(id).addEventListener("change", drawTransactionTable));

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- Categories ----------
  function renderCategoriesView() {
    const cats = Analytics.categoryTotals(transactions);
    const total = cats.reduce((a, c) => a + c.total, 0);
    Charts.topCategoriesBar("chartCatBar", cats);
    Charts.categoryPie("chartCatPie", cats);
    document.getElementById("catCount").textContent = `${cats.length} categories`;
    document.getElementById("categoryTable").innerHTML = cats.length ? cats.map(c => `
      <div style="display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--card-border);">
        <div style="flex:1;">
          <div style="font-size:13.5px; font-weight:600;">${c.category}</div>
          <div style="height:6px; border-radius:4px; background:var(--card-alt); margin-top:6px; overflow:hidden;">
            <div style="height:100%; width:${total ? (c.total / total * 100) : 0}%; background:var(--teal);"></div>
          </div>
        </div>
        <div class="mono" style="font-size:13px; min-width:90px; text-align:right;">${maskFmt(c.total)}</div>
        <div class="mono" style="font-size:11.5px; color:var(--text-faint); min-width:40px; text-align:right;">${total ? Math.round(c.total / total * 100) : 0}%</div>
      </div>
    `).join("") : `<div class="empty-state"><div class="big">No categorized spending yet</div>Upload a statement to break it down.</div>`;
  }

  // ---------- Trends & Predictions ----------
  function renderTrendsView() {
    const totals = Analytics.monthlyTotals(transactions);
    const prediction = Analytics.predictNextMonth(transactions);
    const avgMonthly = totals.length ? totals.reduce((a, m) => a + m.expense, 0) / totals.length : 0;
    const delta = avgMonthly ? Math.round(((prediction.predicted - avgMonthly) / avgMonthly) * 100) : 0;

    document.getElementById("predictionCards").innerHTML = `
      <div class="card stat-card"><div class="label">Predicted Next Month</div><div class="value">${maskFmt(prediction.predicted)}</div><div class="delta">${prediction.confidence} confidence</div></div>
      <div class="card stat-card"><div class="label">Average Monthly Spend</div><div class="value">${maskFmt(avgMonthly)}</div><div class="delta">${prediction.monthsUsed} month(s) analyzed</div></div>
      <div class="card stat-card"><div class="label">vs. Average</div><div class="value">${delta > 0 ? "+" : ""}${delta}%</div><div class="delta ${delta > 0 ? "down" : "up"}">${delta > 0 ? "Above" : "At or below"} typical spend</div></div>
      <div class="card stat-card"><div class="label">Trend Direction</div><div class="value" style="font-size:19px; text-transform:capitalize;">${prediction.trend || "—"}</div><div class="delta">Based on linear trend</div></div>
    `;

    document.getElementById("predictionMethodTag").textContent = prediction.method;
    Charts.predictionChart("chartPrediction", totals, prediction.predicted);

    const cats = Analytics.categoryTotals(transactions).slice(0, 8);
    document.getElementById("catPredictionTable").innerHTML = cats.length ? `
      <table><thead><tr><th>Category</th><th>Recent total</th><th>Predicted next month</th></tr></thead>
      <tbody>${cats.map(c => {
        const est = Analytics.predictCategoryNextMonth(transactions, c.category);
        return `<tr><td>${c.category}</td><td class="mono">${maskFmt(c.total)}</td><td class="mono" style="color:var(--amber);">${maskFmt(est)}</td></tr>`;
      }).join("")}</tbody></table>
    ` : `<div class="empty-state">No category history yet.</div>`;
  }

  // ---------- Health ----------
  function renderHealthView() {
    const health = Analytics.healthScore(transactions, blocklist);
    setGauge("gaugeArcBig", health.score, health.color);
    document.getElementById("healthScoreBig").textContent = health.score;
    document.getElementById("healthBandBig").textContent = health.band;
    document.getElementById("healthFactors").innerHTML = health.factors.length ? health.factors.map(f => `
      <div style="margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:6px;">
          <span>${f.label}</span><span class="mono">${f.pts} / ${f.max}</span>
        </div>
        <div style="height:8px; border-radius:4px; background:var(--card-alt); overflow:hidden;">
          <div style="height:100%; width:${(f.pts / f.max) * 100}%; background:var(--teal);"></div>
        </div>
      </div>
    `).join("") : `<div class="empty-state">Upload a statement to compute your score.</div>`;
  }

  // ---------- Blocklist / Dues ----------
  function computeStatus(item) {
    if (item.status === "paid") return "paid";
    const due = new Date(item.dueDate);
    return due < new Date(new Date().toDateString()) ? "overdue" : "pending";
  }

  function renderBlocklistView() {
    const withStatus = blocklist.map(b => ({ ...b, computed: computeStatus(b) }));
    const overdueCount = withStatus.filter(b => b.computed === "overdue").length;
    document.getElementById("dueCountTag").textContent = `${blocklist.length} tracked`;
    const badge = document.getElementById("dueBadge");
    if (overdueCount > 0) { badge.textContent = overdueCount; badge.classList.remove("hidden"); }
    else { badge.classList.add("hidden"); }

    document.getElementById("blocklistItems").innerHTML = withStatus.length ? withStatus.map(b => `
      <div class="blocklist-row">
        <div>
          <div class="who">${escapeHtml(b.who)}</div>
          <div class="due">Due ${b.dueDate}</div>
        </div>
        <div class="amt">${maskFmt(b.amount)}</div>
        <div class="status-pill ${b.computed}">${b.computed}</div>
        <div style="display:flex; gap:6px;">
          ${b.computed !== "paid" ? `<button class="btn btn-primary btn-sm" data-mark-paid="${b.id}">Mark paid</button>` : ""}
          <button class="btn btn-danger btn-sm" data-remove-due="${b.id}">Remove</button>
        </div>
      </div>
    `).join("") : `<div class="empty-state"><div class="big">Nothing tracked yet</div>Add a bill, EMI, or amount someone owes you below.</div>`;

    document.querySelectorAll("[data-mark-paid]").forEach(btn => {
      btn.addEventListener("click", () => {
        const item = blocklist.find(b => b.id === btn.dataset.markPaid);
        if (item) { item.status = "paid"; Store.saveBlocklist(blocklist); renderAll(); toast("Marked as paid"); }
      });
    });
    document.querySelectorAll("[data-remove-due]").forEach(btn => {
      btn.addEventListener("click", () => {
        blocklist = blocklist.filter(b => b.id !== btn.dataset.removeDue);
        Store.saveBlocklist(blocklist);
        renderAll();
      });
    });
  }

  document.getElementById("addDueBtn").addEventListener("click", () => {
    const who = document.getElementById("dueWho").value.trim();
    const amount = parseFloat(document.getElementById("dueAmount").value);
    const dueDate = document.getElementById("dueDate").value;
    if (!who || !amount || !dueDate) { toast("Fill in who, amount, and due date"); return; }
    blocklist.push({ id: "due_" + Date.now(), who, amount, dueDate, status: "unpaid" });
    Store.saveBlocklist(blocklist);
    document.getElementById("dueWho").value = "";
    document.getElementById("dueAmount").value = "";
    document.getElementById("dueDate").value = "";
    renderAll();
    toast("Added to blocklist");
  });

  // ---------- Reports ----------
  function renderReportsView() {
    const totals = Analytics.monthlyTotals(transactions);
    const cats = Analytics.categoryTotals(transactions);
    const health = Analytics.healthScore(transactions, blocklist);
    const prediction = Analytics.predictNextMonth(transactions);

    document.getElementById("reportPreview").innerHTML = `
      <h4 style="font-family:var(--font-display); margin:0 0 6px;">Financial summary — ${user.name || user.email}</h4>
      <p style="color:var(--text-faint); font-size:12px; margin:0 0 18px;" class="mono">Generated ${new Date().toLocaleDateString()}</p>
      <table><thead><tr><th>Month</th><th>Income</th><th>Expenses</th><th>Net</th></tr></thead>
      <tbody>${totals.map(m => `<tr><td>${m.month}</td><td class="mono">${fmt(m.income)}</td><td class="mono">${fmt(m.expense)}</td><td class="mono">${fmt(m.income - m.expense)}</td></tr>`).join("")}</tbody></table>
      <h4 style="font-family:var(--font-display); margin:20px 0 6px;">Top categories</h4>
      <table><thead><tr><th>Category</th><th>Total</th></tr></thead>
      <tbody>${cats.slice(0, 8).map(c => `<tr><td>${c.category}</td><td class="mono">${fmt(c.total)}</td></tr>`).join("")}</tbody></table>
      <p style="margin-top:18px; font-size:13px;">Health score: <strong class="mono">${health.score}/100</strong> (${health.band}) · Predicted next month spend: <strong class="mono">${fmt(prediction.predicted)}</strong></p>
    `;
  }

  document.getElementById("exportCsvBtn").addEventListener("click", () => {
    if (!transactions.length) { toast("No transactions to export"); return; }
    const rows = [["Date", "Description", "Category", "Direction", "Amount"]];
    transactions.forEach(t => rows.push([t.dateStr, t.description, t.category, t.direction, t.amount]));
    downloadCsv(rows, "ledgerline_transactions.csv");
  });

  document.getElementById("exportSummaryBtn").addEventListener("click", () => {
    const totals = Analytics.monthlyTotals(transactions);
    if (!totals.length) { toast("No data to export"); return; }
    const rows = [["Month", "Income", "Expenses", "Net"]];
    totals.forEach(m => rows.push([m.month, m.income.toFixed(2), m.expense.toFixed(2), (m.income - m.expense).toFixed(2)]));
    downloadCsv(rows, "ledgerline_monthly_summary.csv");
  });

  document.getElementById("exportPdfBtn").addEventListener("click", () => {
    renderReportsView();
    window.print();
  });

  function downloadCsv(rows, filename) {
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("Downloaded " + filename);
  }

  // ---------- Settings: custom rule ----------
  document.getElementById("addRuleBtn").addEventListener("click", () => {
    const kw = document.getElementById("ruleKeyword").value.trim();
    const cat = document.getElementById("ruleCategory").value.trim();
    if (!kw || !cat) { toast("Enter both a keyword and category"); return; }
    Categorize.saveCustomRule(cat, kw);
    transactions = Categorize.categorizeAll(transactions.map(t => ({ ...t, category: null })));
    Store.saveTransactions(transactions);
    document.getElementById("ruleKeyword").value = "";
    document.getElementById("ruleCategory").value = "";
    renderAll();
    toast(`Rule saved — re-categorized ${transactions.length} transactions`);
  });

  // ---------- Global render ----------
  function renderAll() {
    document.getElementById("clearDataBtn").classList.toggle("hidden", transactions.length === 0);
    refreshProfileUI();
    renderOverview();
    renderTransactionsView();
    renderBlocklistView();
    if (document.getElementById("view-categories").classList.contains("active")) renderCategoriesView();
    if (document.getElementById("view-trends").classList.contains("active")) renderTrendsView();
    if (document.getElementById("view-health").classList.contains("active")) renderHealthView();
    if (document.getElementById("view-reports").classList.contains("active")) renderReportsView();
  }

  renderAll();
})();
