/* ============================================================
   Ledgerline — Analytics Engine
   Aggregation, trend/prediction modeling, and the composite
   Financial Health Score. Predictions use a blend of a simple
   linear regression over monthly totals and a weighted moving
   average, which is a common lightweight approach for short,
   noisy monthly series.
   ============================================================ */

const Analytics = (() => {

  function monthlyTotals(transactions) {
    const months = {};
    transactions.forEach(t => {
      if (!months[t.monthKey]) months[t.monthKey] = { income: 0, expense: 0, count: 0 };
      if (t.direction === "credit") months[t.monthKey].income += t.amount;
      else months[t.monthKey].expense += t.amount;
      months[t.monthKey].count++;
    });
    return Object.keys(months).sort().map(k => ({ month: k, ...months[k] }));
  }

  function categoryTotals(transactions, monthKey) {
    const cats = {};
    transactions
      .filter(t => t.direction === "debit" && (!monthKey || t.monthKey === monthKey))
      .forEach(t => {
        cats[t.category] = (cats[t.category] || 0) + t.amount;
      });
    return Object.keys(cats)
      .map(k => ({ category: k, total: cats[k] }))
      .sort((a, b) => b.total - a.total);
  }

  function categoryMonthlySeries(transactions, category) {
    const months = {};
    transactions
      .filter(t => t.direction === "debit" && t.category === category)
      .forEach(t => { months[t.monthKey] = (months[t.monthKey] || 0) + t.amount; });
    return Object.keys(months).sort().map(k => ({ month: k, total: months[k] }));
  }

  // Ordinary least squares on index -> value
  function linearRegression(values) {
    const n = values.length;
    if (n === 0) return { slope: 0, intercept: 0 };
    if (n === 1) return { slope: 0, intercept: values[0] };
    const xs = values.map((_, i) => i);
    const xMean = xs.reduce((a, b) => a + b, 0) / n;
    const yMean = values.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - xMean) * (values[i] - yMean);
      den += (xs[i] - xMean) ** 2;
    }
    const slope = den === 0 ? 0 : num / den;
    const intercept = yMean - slope * xMean;
    return { slope, intercept };
  }

  function weightedMovingAverage(values, windowSize = 3) {
    const window = values.slice(-windowSize);
    if (!window.length) return 0;
    let weightSum = 0, total = 0;
    window.forEach((v, i) => {
      const w = i + 1; // more recent months weigh more
      total += v * w;
      weightSum += w;
    });
    return total / weightSum;
  }

  function predictNextMonth(transactions) {
    const totals = monthlyTotals(transactions);
    const expenseSeries = totals.map(m => m.expense);

    if (expenseSeries.length === 0) {
      return { predicted: 0, method: "none", confidence: "low", monthsUsed: 0 };
    }
    if (expenseSeries.length === 1) {
      return { predicted: Math.round(expenseSeries[0]), method: "single-month carryover", confidence: "low", monthsUsed: 1 };
    }

    const { slope, intercept } = linearRegression(expenseSeries);
    const regressionPrediction = intercept + slope * expenseSeries.length;
    const wma = weightedMovingAverage(expenseSeries, Math.min(3, expenseSeries.length));

    // Blend: trust regression more once we have >=4 months of data
    const blendWeight = expenseSeries.length >= 4 ? 0.6 : 0.35;
    const blended = blendWeight * regressionPrediction + (1 - blendWeight) * wma;
    const predicted = Math.max(0, Math.round(blended));

    const mean = expenseSeries.reduce((a, b) => a + b, 0) / expenseSeries.length;
    const variance = expenseSeries.reduce((a, b) => a + (b - mean) ** 2, 0) / expenseSeries.length;
    const cv = mean === 0 ? 1 : Math.sqrt(variance) / mean;
    const confidence = expenseSeries.length >= 4 && cv < 0.2 ? "high" : (expenseSeries.length >= 3 && cv < 0.4 ? "medium" : "low");

    return {
      predicted,
      method: "blended regression + weighted moving average",
      confidence,
      monthsUsed: expenseSeries.length,
      trend: slope > mean * 0.02 ? "rising" : (slope < -mean * 0.02 ? "falling" : "stable")
    };
  }

  function predictCategoryNextMonth(transactions, category) {
    const series = categoryMonthlySeries(transactions, category).map(m => m.total);
    if (!series.length) return 0;
    if (series.length === 1) return Math.round(series[0]);
    const { slope, intercept } = linearRegression(series);
    const reg = intercept + slope * series.length;
    const wma = weightedMovingAverage(series, Math.min(3, series.length));
    return Math.max(0, Math.round(0.5 * reg + 0.5 * wma));
  }

  function healthScore(transactions, blocklist) {
    const totals = monthlyTotals(transactions);
    if (!totals.length) {
      return { score: 0, band: "No data", color: "muted", factors: [] };
    }

    const lastN = totals.slice(-6);
    const totalIncome = lastN.reduce((a, m) => a + m.income, 0);
    const totalExpense = lastN.reduce((a, m) => a + m.expense, 0);

    // 1. Savings rate (0-40 pts)
    const savingsRate = totalIncome > 0 ? (totalIncome - totalExpense) / totalIncome : -1;
    const savingsPts = Math.max(0, Math.min(40, (savingsRate + 0.2) / 0.5 * 40));

    // 2. Expense volatility (0-20 pts) — lower coefficient of variation is better
    const expenses = lastN.map(m => m.expense);
    const mean = expenses.reduce((a, b) => a + b, 0) / expenses.length;
    const variance = expenses.reduce((a, b) => a + (b - mean) ** 2, 0) / expenses.length;
    const cv = mean === 0 ? 1 : Math.sqrt(variance) / mean;
    const volatilityPts = Math.max(0, Math.min(20, (1 - cv) * 20));

    // 3. Category concentration (0-15 pts) — penalize a single non-housing
    //    category dominating spend
    const cats = categoryTotals(transactions).filter(c => c.category !== "Housing & Rent" && c.category !== "Income");
    const totalCatSpend = cats.reduce((a, c) => a + c.total, 0);
    const topShare = totalCatSpend > 0 && cats.length ? cats[0].total / totalCatSpend : 0;
    const concentrationPts = Math.max(0, Math.min(15, (1 - topShare) * 15));

    // 4. On-time payments from the blocklist / dues tracker (0-15 pts)
    const dues = blocklist || [];
    const paid = dues.filter(d => d.status === "paid").length;
    const overdue = dues.filter(d => d.status === "overdue").length;
    const paymentPts = dues.length === 0 ? 15 : Math.max(0, 15 * (paid / dues.length) - overdue * 2);

    // 5. Trend direction (0-10 pts)
    const { slope } = linearRegression(expenses);
    const trendPts = slope <= 0 ? 10 : Math.max(0, 10 - (slope / (mean || 1)) * 100);

    const rawScore = savingsPts + volatilityPts + concentrationPts + paymentPts + trendPts;
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));

    let band, color;
    if (score >= 80) { band = "Excellent"; color = "teal"; }
    else if (score >= 60) { band = "Healthy"; color = "teal"; }
    else if (score >= 40) { band = "Needs attention"; color = "amber"; }
    else { band = "At risk"; color = "rose"; }

    return {
      score,
      band,
      color,
      factors: [
        { label: "Savings rate", pts: Math.round(savingsPts), max: 40 },
        { label: "Spending stability", pts: Math.round(volatilityPts), max: 20 },
        { label: "Category balance", pts: Math.round(concentrationPts), max: 15 },
        { label: "On-time dues", pts: Math.round(paymentPts < 0 ? 0 : paymentPts), max: 15 },
        { label: "Spending trend", pts: Math.round(trendPts), max: 10 }
      ]
    };
  }

  function generateInsights(transactions, prediction, health) {
    const insights = [];
    const totals = monthlyTotals(transactions);
    const cats = categoryTotals(transactions);

    if (cats.length) {
      const top = cats[0];
      const totalExpense = cats.reduce((a, c) => a + c.total, 0);
      const pct = totalExpense ? Math.round((top.total / totalExpense) * 100) : 0;
      insights.push(`${top.category} is your largest spending category at ${pct}% of total expenses.`);
    }

    if (totals.length >= 2) {
      const last = totals[totals.length - 1];
      const prev = totals[totals.length - 2];
      if (prev.expense > 0) {
        const change = Math.round(((last.expense - prev.expense) / prev.expense) * 100);
        if (Math.abs(change) >= 5) {
          insights.push(`Spending ${change > 0 ? "rose" : "fell"} ${Math.abs(change)}% from ${prev.month} to ${last.month}.`);
        }
      }
    }

    if (prediction && prediction.predicted) {
      insights.push(`Projected spend next month is ₹${prediction.predicted.toLocaleString("en-IN")} (${prediction.confidence} confidence, ${prediction.trend || "steady"} trend).`);
    }

    if (health && health.factors && health.factors.length) {
      const weakest = [...health.factors].sort((a, b) => (a.pts / a.max) - (b.pts / b.max))[0];
      if (weakest) insights.push(`Your weakest health factor right now is "${weakest.label}" — improving it would raise your score the most.`);
    }

    const weekday = { total: 0, count: 0 };
    const weekend = { total: 0, count: 0 };
    transactions.filter(t => t.direction === "debit").forEach(t => {
      const day = t.date.getDay();
      const bucket = (day === 0 || day === 6) ? weekend : weekday;
      bucket.total += t.amount;
      bucket.count++;
    });
    if (weekday.count && weekend.count) {
      const wdAvg = weekday.total / weekday.count;
      const weAvg = weekend.total / weekend.count;
      if (weAvg > wdAvg * 1.15) {
        insights.push(`Weekend transactions average ₹${Math.round(weAvg).toLocaleString("en-IN")}, noticeably higher than weekday transactions.`);
      }
    }

    return insights;
  }

  return {
    monthlyTotals, categoryTotals, categoryMonthlySeries,
    predictNextMonth, predictCategoryNextMonth,
    healthScore, generateInsights
  };
})();
