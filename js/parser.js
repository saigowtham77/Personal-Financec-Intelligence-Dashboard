/* ============================================================
   Ledgerline — Statement Parser
   Cleans and normalizes messy CSV exports from banks, cards and
   payment apps into a consistent transaction shape:
   { id, date, description, amount, direction, category, raw }
   amount is always a positive number; direction is "credit" or "debit".
   ============================================================ */

const Parser = (() => {

  const DATE_KEYS = ["date", "transaction date", "txn date", "value date", "posting date"];
  const DESC_KEYS = ["description", "narration", "particulars", "details", "memo", "merchant"];
  const AMOUNT_KEYS = ["amount", "amt", "transaction amount"];
  const DEBIT_KEYS = ["debit", "withdrawal", "withdrawal amt", "debit amount"];
  const CREDIT_KEYS = ["credit", "deposit", "deposit amt", "credit amount"];
  const TYPE_KEYS = ["type", "transaction type", "dr/cr", "cr/dr"];

  function normalizeHeader(h) {
    return String(h || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function findKey(headerMap, candidates) {
    for (const c of candidates) {
      if (headerMap[c] !== undefined) return headerMap[c];
    }
    return null;
  }

  function parseAmountToken(token) {
    if (token === null || token === undefined) return null;
    let s = String(token).trim();
    if (s === "") return null;
    let negative = false;
    if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
    s = s.replace(/[₹$,\s]/g, "");
    if (/^-/.test(s)) { negative = true; s = s.slice(1); }
    if (/^\+/.test(s)) { s = s.slice(1); }
    const n = parseFloat(s);
    if (isNaN(n)) return null;
    return negative ? -Math.abs(n) : n;
  }

  function parseDateToken(token) {
    if (!token) return null;
    const s = String(token).trim();
    // Try ISO first
    let d = new Date(s);
    if (!isNaN(d.getTime()) && /\d{4}/.test(s)) return d;
    // Try DD/MM/YYYY or DD-MM-YYYY
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      let [, a, b, y] = m;
      if (y.length === 2) y = "20" + y;
      // Assume day-month-year (common outside the US) when day > 12
      let day = parseInt(a, 10), month = parseInt(b, 10);
      if (day > 12) {
        d = new Date(parseInt(y), month - 1, day);
      } else {
        d = new Date(parseInt(y), month - 1, day);
      }
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }

  function inferDirection(row, headerMap, amount, debitKey, creditKey, typeKey) {
    if (debitKey && row[debitKey] !== undefined && parseAmountToken(row[debitKey]) !== null && parseAmountToken(row[debitKey]) !== 0) {
      return "debit";
    }
    if (creditKey && row[creditKey] !== undefined && parseAmountToken(row[creditKey]) !== null && parseAmountToken(row[creditKey]) !== 0) {
      return "credit";
    }
    if (typeKey && row[typeKey]) {
      const t = String(row[typeKey]).trim().toLowerCase();
      if (t.startsWith("cr") || t.includes("credit") || t.includes("deposit")) return "credit";
      if (t.startsWith("dr") || t.includes("debit") || t.includes("withdraw")) return "debit";
    }
    if (amount !== null) return amount < 0 ? "debit" : "credit";
    return "debit";
  }

  function parseCSV(text) {
    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false
    });

    const parseWarnings = (result.errors || []).slice(0, 5).map(e => `Row ${e.row != null ? e.row + 2 : "?"}: ${e.message}`);

    if (!result.data || !result.data.length) {
      return {
        transactions: [], errors: ["No rows found in file — is this a valid CSV export?"],
        skipped: 0, skippedRows: [], detectedColumns: {}, duplicateCount: 0,
        totalRows: 0, valid: false, parseWarnings
      };
    }

    const rawHeaders = result.meta.fields || Object.keys(result.data[0]);
    const headerMap = {};
    rawHeaders.forEach(h => { headerMap[normalizeHeader(h)] = h; });

    const dateKey = findKey(headerMap, DATE_KEYS);
    const descKey = findKey(headerMap, DESC_KEYS);
    const amountKey = findKey(headerMap, AMOUNT_KEYS);
    const debitKey = findKey(headerMap, DEBIT_KEYS);
    const creditKey = findKey(headerMap, CREDIT_KEYS);
    const typeKey = findKey(headerMap, TYPE_KEYS);

    const detectedColumns = {
      date: dateKey, description: descKey, amount: amountKey,
      debit: debitKey, credit: creditKey, type: typeKey
    };

    const transactions = [];
    const skippedRows = [];
    const errors = [];
    const seenSignatures = new Set();
    let duplicateCount = 0;

    if (!dateKey) errors.push("No recognizable Date column found (looked for: Date, Transaction Date, Value Date…).");
    if (!descKey) errors.push("No recognizable Description column found (looked for: Description, Narration, Particulars…).");
    if (!amountKey && !debitKey && !creditKey) errors.push("No recognizable Amount, Debit, or Credit column found.");

    result.data.forEach((row, idx) => {
      const rowNum = idx + 2; // +1 for header row, +1 for 1-indexing
      const dateRaw = dateKey ? row[dateKey] : null;
      const descRaw = descKey ? row[descKey] : "Unlabeled transaction";
      let amount = null;
      let direction = "debit";

      if (amountKey && row[amountKey] !== undefined && row[amountKey] !== "") {
        amount = parseAmountToken(row[amountKey]);
        direction = inferDirection(row, headerMap, amount, debitKey, creditKey, typeKey);
      } else if (debitKey || creditKey) {
        const dVal = debitKey ? parseAmountToken(row[debitKey]) : null;
        const cVal = creditKey ? parseAmountToken(row[creditKey]) : null;
        if (dVal) { amount = dVal; direction = "debit"; }
        else if (cVal) { amount = cVal; direction = "credit"; }
      }

      const date = parseDateToken(dateRaw);

      if (date === null) {
        skippedRows.push({ row: rowNum, reason: `Unrecognized or missing date ("${dateRaw ?? ""}")` });
        return;
      }
      if (amount === null || !isFinite(amount)) {
        skippedRows.push({ row: rowNum, reason: `Missing or unreadable amount` });
        return;
      }
      if (amount === 0) {
        skippedRows.push({ row: rowNum, reason: `Zero-value transaction` });
        return;
      }

      const signature = `${date.toISOString().slice(0, 10)}|${String(descRaw).trim().toLowerCase()}|${Math.abs(amount).toFixed(2)}|${direction}`;
      if (seenSignatures.has(signature)) duplicateCount++;
      seenSignatures.add(signature);

      transactions.push({
        id: "t" + idx + "_" + Math.abs(amount).toFixed(0) + "_" + date.getTime(),
        date: date,
        dateStr: date.toISOString().slice(0, 10),
        monthKey: date.toISOString().slice(0, 7),
        description: String(descRaw || "Unlabeled transaction").trim(),
        amount: Math.abs(amount),
        direction: direction,
        category: null
      });
    });

    transactions.sort((a, b) => a.date - b.date);

    const valid = transactions.length > 0 && !!dateKey && !!descKey && (!!amountKey || !!debitKey || !!creditKey);

    return {
      transactions,
      errors,
      parseWarnings,
      skipped: skippedRows.length,
      skippedRows,
      detectedColumns,
      duplicateCount,
      totalRows: result.data.length,
      valid
    };
  }

  return { parseCSV };
})();
