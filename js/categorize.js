/* ============================================================
   Ledgerline — Categorization Engine
   Rule-based classifier (keyword matching over the description
   field) that assigns each transaction to a spending category.
   Users can add custom keyword rules which are stored locally
   and take priority over the built-in defaults.
   ============================================================ */

const Categorize = (() => {

  const DEFAULT_RULES = {
    "Housing & Rent": ["rent", "landlord", "lease", "housing society", "maintenance fee", "apartment"],
    "Groceries": ["grocery", "bigbasket", "grofers", "dmart", "supermarket", "reliance fresh", "more retail"],
    "Dining & Delivery": ["swiggy", "zomato", "restaurant", "cafe", "dining", "food court", "dominos", "pizza", "starbucks", "dinner", "lunch"],
    "Transport & Fuel": ["uber", "ola", "petrol", "fuel", "diesel", "metro", "parking", "toll", "irctc", "railway", "taxi"],
    "Utilities & Bills": ["electricity", "water bill", "gas bill", "broadband", "wifi", "mobile recharge", "jio", "airtel", "vodafone", "utility"],
    "Subscriptions": ["netflix", "spotify", "prime video", "hotstar", "subscription", "youtube premium", "icloud", "saas"],
    "Shopping": ["amazon", "flipkart", "myntra", "shopping", "mall", "retail", "ajio"],
    "Health & Medical": ["hospital", "pharmacy", "clinic", "doctor", "medical", "medicine", "diagnostic", "health insurance"],
    "Entertainment": ["movie", "pvr", "inox", "cinema", "concert", "gaming", "bookmyshow", "gym", "fitness"],
    "Fees & Charges": ["fee", "charge", "penalty", "late payment", "fine", "gst", "tax"],
    "Credit Card Payment": ["credit card bill", "card payment", "cc payment"],
    "Income": ["salary", "credited", "interest credit", "refund", "reimbursement", "bonus", "payout"],
    "Transfers": ["transfer", "upi", "neft", "imps", "rtgs", "sent to", "received from"]
  };

  function getCustomRules() {
    try { return JSON.parse(localStorage.getItem("ledgerline_custom_rules")) || {}; }
    catch (e) { return {}; }
  }

  function saveCustomRule(category, keyword) {
    const rules = getCustomRules();
    if (!rules[category]) rules[category] = [];
    rules[category].push(keyword.toLowerCase());
    localStorage.setItem("ledgerline_custom_rules", JSON.stringify(rules));
  }

  function allRules() {
    const merged = {};
    Object.keys(DEFAULT_RULES).forEach(k => merged[k] = [...DEFAULT_RULES[k]]);
    const custom = getCustomRules();
    Object.keys(custom).forEach(k => {
      merged[k] = (merged[k] || []).concat(custom[k]);
    });
    return merged;
  }

  function categorize(description, direction) {
    const desc = (description || "").toLowerCase();
    const rules = allRules();

    if (direction === "credit") {
      for (const kw of rules["Income"]) {
        if (desc.includes(kw)) return "Income";
      }
    }

    for (const category of Object.keys(rules)) {
      if (category === "Income" && direction !== "credit") continue;
      for (const kw of rules[category]) {
        if (desc.includes(kw)) return category;
      }
    }

    return direction === "credit" ? "Income" : "Other / Uncategorized";
  }

  function categorizeAll(transactions) {
    return transactions.map(t => ({ ...t, category: categorize(t.description, t.direction) }));
  }

  function categoryList() {
    return Object.keys(allRules()).concat(["Other / Uncategorized"]);
  }

  return { categorize, categorizeAll, categoryList, saveCustomRule, getCustomRules };
})();
