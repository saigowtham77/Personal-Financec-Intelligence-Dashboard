/* ============================================================
   Ledgerline — Chart rendering (Chart.js)
   ============================================================ */

const Charts = (() => {
  const PALETTE = ["#4FD1AE", "#E8A33D", "#7FA9E1", "#E1614F", "#C792E8",
                   "#6FCF97", "#F2C94C", "#56CCF2", "#EB9DA0", "#9B9FA8"];

  const instances = {};

  Chart.defaults.color = "#8FA3A0";
  Chart.defaults.font.family = "'IBM Plex Sans', sans-serif";
  Chart.defaults.borderColor = "rgba(237,239,238,0.08)";

  function destroy(id) {
    if (instances[id]) { instances[id].destroy(); delete instances[id]; }
  }

  function categoryPie(canvasId, categoryTotals) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const top = categoryTotals.slice(0, 7);
    const rest = categoryTotals.slice(7);
    const labels = top.map(c => c.category);
    const data = top.map(c => c.total);
    if (rest.length) {
      labels.push("Other categories");
      data.push(rest.reduce((a, c) => a + c.total, 0));
    }
    instances[canvasId] = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{ data, backgroundColor: PALETTE, borderColor: "#142A2E", borderWidth: 2 }]
      },
      options: {
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: { position: "right", labels: { boxWidth: 10, font: { size: 11 }, padding: 12 } },
          tooltip: {
            callbacks: {
              label: (c) => ` ${c.label}: ₹${c.parsed.toLocaleString("en-IN")}`
            }
          }
        }
      }
    });
  }

  function monthlyTrend(canvasId, monthlyTotals) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    instances[canvasId] = new Chart(ctx, {
      type: "line",
      data: {
        labels: monthlyTotals.map(m => m.month),
        datasets: [
          {
            label: "Income",
            data: monthlyTotals.map(m => m.income),
            borderColor: "#4FD1AE",
            backgroundColor: "rgba(79,209,174,0.12)",
            tension: 0.35,
            fill: true,
            pointRadius: 3
          },
          {
            label: "Expenses",
            data: monthlyTotals.map(m => m.expense),
            borderColor: "#E1614F",
            backgroundColor: "rgba(225,97,79,0.10)",
            tension: 0.35,
            fill: true,
            pointRadius: 3
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { boxWidth: 10, font: { size: 11.5 } } },
          tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ₹${c.parsed.y.toLocaleString("en-IN")}` } }
        },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: "rgba(237,239,238,0.06)" }, ticks: { callback: v => "₹" + (v / 1000) + "k" } }
        }
      }
    });
  }

  function topCategoriesBar(canvasId, categoryTotals) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const top = categoryTotals.slice(0, 6);
    instances[canvasId] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: top.map(c => c.category),
        datasets: [{ data: top.map(c => c.total), backgroundColor: PALETTE, borderRadius: 6, maxBarThickness: 34 }]
      },
      options: {
        indexAxis: "y",
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ₹${c.parsed.x.toLocaleString("en-IN")}` } } },
        scales: {
          x: { grid: { color: "rgba(237,239,238,0.06)" }, ticks: { callback: v => "₹" + (v / 1000) + "k" } },
          y: { grid: { display: false } }
        }
      }
    });
  }

  function predictionChart(canvasId, monthlyTotals, predicted) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const labels = monthlyTotals.map(m => m.month);
    const actual = monthlyTotals.map(m => m.expense);
    const nextLabel = "Next month";
    instances[canvasId] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: [...labels, nextLabel],
        datasets: [{
          label: "Monthly expenses",
          data: [...actual, null],
          backgroundColor: "#E8A33D",
          borderRadius: 6,
          maxBarThickness: 40
        }, {
          label: "Predicted",
          data: [...actual.map(() => null), predicted],
          backgroundColor: "rgba(232,163,61,0.35)",
          borderColor: "#E8A33D",
          borderWidth: 2,
          borderDash: [6, 4],
          borderRadius: 6,
          maxBarThickness: 40
        }]
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { boxWidth: 10, font: { size: 11.5 } } },
          tooltip: { callbacks: { label: (c) => ` ₹${(c.parsed.y || 0).toLocaleString("en-IN")}` } }
        },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: "rgba(237,239,238,0.06)" }, ticks: { callback: v => "₹" + (v / 1000) + "k" } }
        }
      }
    });
  }

  return { categoryPie, monthlyTrend, topCategoriesBar, predictionChart };
})();
