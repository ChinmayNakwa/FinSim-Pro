"""
FinSim Pro — LangGraph report generation workflow
Accepts a SimulationResponse (already computed) and produces:
  - Per-section Gemini narrative
  - Chart.js-ready chart data
  - Structured yearly table
  - PDF endpoint uses Matplotlib for server-side rendering
"""
from __future__ import annotations

import io
import base64
import re
from typing import Optional, TypedDict

from langchain_google_genai import ChatGoogleGenerativeAI
# from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, END

from models import SimulationResponse

from dotenv import load_dotenv
load_dotenv()

import os
print("KEY:", os.getenv("GOOGLE_API_KEY"))  


llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite-preview", temperature=0.3)
# llm = ChatGroq(
#     model_name="",
#     api_key=os.getenv("GROQ_API_KEY"),
#     temperature=0.3
# )

# ─────────────────────────────────────────────────────────────────────────────
# STATE
# ─────────────────────────────────────────────────────────────────────────────

class ReportState(TypedDict):
    sim: SimulationResponse
    net_worth_data:  Optional[dict]
    tax_data:        Optional[dict]
    portfolio_data:  Optional[dict]
    rebalance_data:  Optional[dict]
    yearly_data:     Optional[list]
    narrative:       Optional[dict]
    charts:          Optional[dict]
    report:          Optional[dict]


# ─────────────────────────────────────────────────────────────────────────────
# SECTION NODES
# ─────────────────────────────────────────────────────────────────────────────

def net_worth_node(state: ReportState) -> dict:
    sim = state["sim"]
    return {"net_worth_data": {
        "labels": [f"Yr {y}" for y in sim.years_axis],
        "p10":    sim.p10_path,
        "p25":    sim.p25_path,
        "p50":    sim.p50_path,
        "p75":    sim.p75_path,
        "p90":    sim.p90_path,
        "fire_number": sim.fire_number,
        "kpis": {
            "median_final":  sim.median_net_worth_final,
            "p10_final":     sim.p10_net_worth_final,
            "p90_final":     sim.p90_net_worth_final,
            "prob_positive": sim.prob_positive_pct,
            "prob_crore":    sim.prob_crore_pct,
            "max_drawdown":  sim.max_drawdown,
            "sharpe":        sim.sharpe_ratio,
            "fire_prob":     sim.fire_prob_pct,
            "years_to_fire": sim.years_to_fire,
            "blended_cagr":  sim.blended_cagr,
            "blended_vol":   sim.blended_vol,
        },
    }}


def tax_node(state: ReportState) -> dict:
    sim = state["sim"]
    return {"tax_data": {
        "labels":      [f"Yr {y}" for y in sim.years_axis[1:]],
        "income_tax":  sim.annual_income_tax,
        "ltcg_tax":    sim.annual_ltcg_tax,
        "stcg_tax":    sim.annual_stcg_tax,
        "summary": {
            "total_income_tax": sim.total_income_tax_avg,
            "total_ltcg":       sim.total_ltcg_tax_avg,
            "total_stcg":       sim.total_stcg_tax_avg,
            "avg_eff_rate":     sim.avg_effective_rate_pct,
            "snapshot":         sim.tax_snapshot.dict(),
        },
        "regime_comparison": sim.regime_comparison,
        "asset_tax_summary": sim.asset_tax_summary,
    }}


def portfolio_node(state: ReportState) -> dict:
    sim = state["sim"]
    forecasts = [f.dict() for f in sim.asset_forecasts]
    total_value = sum(sim.asset_final_values.values()) or 1.0
    return {"portfolio_data": {
        "labels":       list(sim.asset_final_values.keys()),
        "final_values": list(sim.asset_final_values.values()),
        "weights_pct":  [round(v / total_value * 100, 2) for v in sim.asset_final_values.values()],
        "cagr_labels":  [f["asset_class"] for f in forecasts],
        "cagrs":        [round(f["cagr"] * 100, 2) for f in forecasts],
        "vols":         [round(f["vol"] * 100, 2) for f in forecasts],
        "data_sources": [f["data_source"] for f in forecasts],
    }}


def rebalance_node(state: ReportState) -> dict:
    sim = state["sim"]
    reb = sim.rebalance
    return {"rebalance_data": {
        "needed":      reb.needed,
        "total_drift": reb.total_drift,
        "labels":      list(reb.current_allocation.keys()),
        "current_pct": list(reb.current_allocation.values()),
        "target_pct":  [reb.target_allocation.get(k, 0) for k in reb.current_allocation.keys()],
        "suggestions": [s.dict() for s in reb.suggestions],
    }}


def yearly_node(state: ReportState) -> dict:
    sim = state["sim"]
    return {"yearly_data": [r.dict() for r in sim.yearly_table]}


# ─────────────────────────────────────────────────────────────────────────────
# NARRATIVE NODE
# ─────────────────────────────────────────────────────────────────────────────

def narrative_node(state: ReportState) -> dict:
    nw  = state["net_worth_data"]
    tax = state["tax_data"]
    pf  = state["portfolio_data"]
    reb = state["rebalance_data"]
    yr  = state["yearly_data"]
    sim = state["sim"]

    prompt = f"""You are a Senior Indian Financial Planner writing a professional client report.
Analyze the simulation results and write a structured narrative.

=== NET WORTH ===
- Blended CAGR: {nw['kpis']['blended_cagr']*100:.2f}%, Vol: {nw['kpis']['blended_vol']*100:.2f}%
- Median final: ₹{nw['kpis']['median_final']/1e7:.2f}Cr | P10: ₹{nw['kpis']['p10_final']/1e7:.2f}Cr | P90: ₹{nw['kpis']['p90_final']/1e7:.2f}Cr
- FIRE prob: {nw['kpis']['fire_prob']:.1f}% | Years to FIRE: {nw['kpis']['years_to_fire'] or 'Not reached'}
- Max drawdown: {nw['kpis']['max_drawdown']*100:.1f}% | Sharpe: {nw['kpis']['sharpe']:.2f}
- Prob positive: {nw['kpis']['prob_positive']:.1f}% | Prob ₹1Cr: {nw['kpis']['prob_crore']:.1f}%

=== TAX ===
- Regime: {tax['summary']['snapshot']['regime'].upper()}
- Effective rate: {tax['summary']['avg_eff_rate']:.2f}%
- Total income tax: ₹{tax['summary']['total_income_tax']/1e5:.1f}L
- LTCG: ₹{tax['summary']['total_ltcg']/1e5:.1f}L | STCG: ₹{tax['summary']['total_stcg']/1e5:.1f}L
- Regime comparison: {tax['regime_comparison']}
- Asset tax: {tax['asset_tax_summary']}

=== PORTFOLIO ===
- Allocation: {dict(zip(pf['labels'], pf['weights_pct']))}
- CAGRs: {dict(zip(pf['cagr_labels'], pf['cagrs']))}

=== REBALANCING ===
- Needed: {reb['needed']} | Drift: {reb['total_drift']}%
- Suggestions: {reb['suggestions']}

=== GOALS ===
{[g.dict() for g in sim.goal_results]}

=== FIRST 5 YEARS ===
{yr[:5]}

Write each section below. Use markdown with ## headers. Be specific with ₹ numbers. Max 100 words per section.

## Executive Summary
## Net Worth Outlook
## Tax Strategy
## Portfolio Analysis
## Rebalancing Action Plan
## Goal Tracker
## Key Risks & Recommendations
"""

    response = llm.invoke(prompt)
    text = response.content
    if isinstance(text, list):
        text = "".join([p.get("text", "") if isinstance(p, dict) else str(p) for p in text])

    return {"narrative": {"full": str(text)}}


# ─────────────────────────────────────────────────────────────────────────────
# ASSEMBLE NODE
# ─────────────────────────────────────────────────────────────────────────────

def assemble_node(state: ReportState) -> dict:
    sim = state["sim"]
    return {"report": {
        "narrative": state["narrative"]["full"],
        "charts": {
            "net_worth":  state["net_worth_data"],
            "tax":        state["tax_data"],
            "portfolio":  state["portfolio_data"],
            "rebalance":  state["rebalance_data"],
        },
        "yearly_table": state["yearly_data"],
        "meta": {
            "fire_number":   sim.fire_number,
            "years_to_fire": sim.years_to_fire,
            "blended_cagr":  sim.blended_cagr,
            "blended_vol":   sim.blended_vol,
            "emi_monthly":   sim.emi_monthly,
        },
    }}


# ─────────────────────────────────────────────────────────────────────────────
# PDF GENERATION  (called directly from /generate-report/pdf endpoint)
# ─────────────────────────────────────────────────────────────────────────────

def generate_pdf_report(report_payload: dict) -> bytes:
    """
    Renders a self-contained HTML file with embedded Matplotlib PNGs.
    Returns raw HTML bytes for file download.
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.ticker as mticker

    DARK_BG = "#0f1419"
    CARD_BG = "#111c27"
    GREEN   = "#00e676"
    BLUE    = "#29b6f6"
    AMBER   = "#ffb300"
    MUTED   = "#8899aa"
    TEXT    = "#e0e8f0"

    plt.rcParams.update({
        "figure.facecolor": CARD_BG, "axes.facecolor": CARD_BG,
        "text.color": TEXT, "axes.labelcolor": TEXT,
        "xtick.color": MUTED, "ytick.color": MUTED,
        "axes.edgecolor": "#1e2a35", "grid.color": "#1e2a35",
        "font.family": "monospace",
    })

    def fig_to_b64(fig) -> str:
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=130, bbox_inches="tight",
                    facecolor=CARD_BG, edgecolor="none")
        plt.close(fig)
        return base64.b64encode(buf.getvalue()).decode()

    charts    = report_payload["charts"]
    narrative = report_payload["narrative"]
    yearly    = report_payload["yearly_table"]
    meta      = report_payload["meta"]
    imgs      = {}

    # ── Net Worth fan chart ──
    nw = charts["net_worth"]
    fig, ax = plt.subplots(figsize=(11, 4))
    x = range(len(nw["labels"]))
    ax.fill_between(x, [v/1e7 for v in nw["p10"]], [v/1e7 for v in nw["p90"]],
                    color=GREEN, alpha=0.08, label="P10–P90 band")
    ax.plot(x, [v/1e7 for v in nw["p50"]], color=GREEN, lw=2.5, label="Median (P50)")
    ax.axhline(nw["fire_number"]/1e7, color=AMBER, lw=1.5, ls="--",
               label=f"FIRE ₹{nw['fire_number']/1e7:.2f}Cr")
    ax.set_xticks(list(x)[::2])
    ax.set_xticklabels(nw["labels"][::2], fontsize=7)
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"₹{v:.1f}Cr"))
    ax.set_title("Net Worth Projection (Monte Carlo)", color=TEXT, pad=10)
    ax.legend(fontsize=8, framealpha=0.2)
    ax.grid(True, ls="--", lw=0.4)
    imgs["net_worth"] = fig_to_b64(fig)

    # ── Tax stacked bar ──
    tx = charts["tax"]
    fig, ax = plt.subplots(figsize=(11, 3.5))
    xi = range(len(tx["labels"]))
    it = [v/1e5 for v in tx["income_tax"]]
    lt = [v/1e5 for v in tx["ltcg_tax"]]
    st = [v/1e5 for v in tx["stcg_tax"]]
    ax.bar(xi, it, label="Income Tax", color="#ef5350", width=0.6)
    ax.bar(xi, lt, bottom=it, label="LTCG", color=AMBER, width=0.6)
    ax.bar(xi, st, bottom=[a+b for a,b in zip(it,lt)], label="STCG", color=BLUE, width=0.6, alpha=0.7)
    ax.set_xticks(list(xi)[::2])
    ax.set_xticklabels(tx["labels"][::2], fontsize=7)
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"₹{v:.0f}L"))
    ax.set_title("Annual Tax Breakdown", color=TEXT, pad=10)
    ax.legend(fontsize=8, framealpha=0.2)
    ax.grid(True, axis="y", ls="--", lw=0.4)
    imgs["tax"] = fig_to_b64(fig)

    # ── Portfolio: doughnut + CAGR bar ──
    pf = charts["portfolio"]
    colors = [GREEN, BLUE, AMBER, "#ef5350", "#ab47bc", "#26c6da", "#d4e157"]
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4))
    wedges, texts, autotexts = ax1.pie(
        pf["final_values"], labels=pf["labels"], autopct="%1.1f%%",
        colors=colors[:len(pf["labels"])], pctdistance=0.75, startangle=90,
        wedgeprops={"width": 0.5, "edgecolor": DARK_BG, "linewidth": 1.5}
    )
    for t in texts: t.set_fontsize(7)
    for t in autotexts: t.set_fontsize(7); t.set_color(DARK_BG)
    ax1.set_title("Final Portfolio Allocation", color=TEXT, pad=10)
    xi2 = range(len(pf["cagr_labels"]))
    ax2.bar(xi2, pf["cagrs"], color=GREEN, width=0.4, label="CAGR %", alpha=0.85)
    ax2.bar([x+0.4 for x in xi2], pf["vols"], color=BLUE, width=0.4, label="Vol %", alpha=0.85)
    ax2.set_xticks([x+0.2 for x in xi2])
    ax2.set_xticklabels(pf["cagr_labels"], fontsize=7, rotation=20, ha="right")
    ax2.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"{v:.1f}%"))
    ax2.set_title("Asset CAGR vs Volatility", color=TEXT, pad=10)
    ax2.legend(fontsize=8, framealpha=0.2)
    ax2.grid(True, axis="y", ls="--", lw=0.4)
    imgs["portfolio"] = fig_to_b64(fig)

    # ── Rebalance grouped bar ──
    rb = charts["rebalance"]
    fig, ax = plt.subplots(figsize=(11, 3.5))
    xi = range(len(rb["labels"]))
    ax.bar(xi, rb["current_pct"], width=0.4, color=BLUE, label="Current %", alpha=0.85)
    ax.bar([x+0.4 for x in xi], rb["target_pct"], width=0.4, color=GREEN, label="Target %", alpha=0.85)
    ax.set_xticks([x+0.2 for x in xi])
    ax.set_xticklabels(rb["labels"], fontsize=7, rotation=15, ha="right")
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"{v:.0f}%"))
    ax.set_title("Rebalancing: Current vs Target", color=TEXT, pad=10)
    ax.legend(fontsize=8, framealpha=0.2)
    ax.grid(True, axis="y", ls="--", lw=0.4)
    imgs["rebalance"] = fig_to_b64(fig)

    # ── Narrative → HTML sections ──
    sections = re.split(r'\n## ', narrative.strip())
    narrative_html = ""
    for s in sections:
        lines = s.strip().split("\n", 1)
        title = lines[0].lstrip("# ").strip()
        body  = lines[1].strip() if len(lines) > 1 else ""
        body_html = body.replace("\n\n", "</p><p>").replace("\n", "<br>")
        # Bold markdown
        body_html = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', body_html)
        narrative_html += f"""
        <div class="section">
          <h2>{title}</h2>
          <p>{body_html}</p>
        </div>"""

    # ── Yearly table rows ──
    def fmt_cr(v):
        return f"₹{v/1e7:.2f}Cr" if abs(v) >= 1e7 else f"₹{v/1e5:.1f}L"

    table_rows = "".join(f"""
        <tr>
          <td>{r['year']}</td><td>{r['age']}</td>
          <td>{fmt_cr(r['net_worth_median'])}</td>
          <td>{fmt_cr(r['net_worth_p10'])}</td>
          <td>{fmt_cr(r['net_worth_p90'])}</td>
          <td>{fmt_cr(r['annual_income'])}</td>
          <td>{fmt_cr(r['annual_expenses'])}</td>
          <td>{fmt_cr(r['est_income_tax'])}</td>
          <td>{r['fire_progress_pct']:.1f}%</td>
          <td>{', '.join(r['goals_due']) or '—'}</td>
        </tr>""" for r in yearly)

    # ── Rebalance suggestion cards ──
    reb_cards = ""
    if rb["suggestions"]:
        for s in rb["suggestions"]:
            action_color = GREEN if s["action"] == "BUY" else "#ef5350"
            reb_cards += f"""
            <div class="reb-item">
              <span class="badge" style="background:{'rgba(0,230,118,0.15)' if s['action']=='BUY' else 'rgba(239,83,80,0.15)'};
                    color:{action_color}">{s['action']}</span>
              <strong>{s['asset_class']}</strong>
              <span style="color:{MUTED}">
                ₹{s['amount']/1e5:.1f}L &nbsp;·&nbsp; {s['current_pct']}% → {s['target_pct']}%
                &nbsp;·&nbsp; drift {s['drift']}%
              </span>
            </div>"""
    else:
        reb_cards = f"<p style='color:{MUTED};margin-top:8px'>No rebalancing needed.</p>"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>FinSim Pro — Financial Report</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ background:{DARK_BG}; color:{TEXT}; font-family:'Segoe UI',sans-serif;
         font-size:13px; line-height:1.7; padding:40px; }}
  h1 {{ color:{GREEN}; font-size:26px; margin-bottom:4px; }}
  h2 {{ color:{GREEN}; font-size:15px; margin:28px 0 8px;
        border-bottom:1px solid #1e2a35; padding-bottom:4px; }}
  .subtitle {{ color:{MUTED}; font-size:11px; font-family:monospace; margin-bottom:32px; }}
  .kpi-row {{ display:flex; gap:12px; flex-wrap:wrap; margin:20px 0; }}
  .kpi {{ background:{CARD_BG}; border:1px solid #1e2a35; border-radius:10px;
          padding:14px 18px; flex:1; min-width:140px; }}
  .kpi .val {{ font-size:20px; font-weight:bold; color:{GREEN}; }}
  .kpi .lbl {{ font-size:10px; color:{MUTED}; font-family:monospace; text-transform:uppercase; }}
  .chart-block {{ background:{CARD_BG}; border:1px solid #1e2a35; border-radius:12px;
                  padding:20px; margin:20px 0; }}
  .chart-block img {{ width:100%; border-radius:6px; }}
  .section {{ background:{CARD_BG}; border:1px solid #1e2a35; border-radius:12px;
              padding:20px 24px; margin:16px 0; }}
  .section p {{ color:#aabbc8; margin-top:8px; }}
  table {{ width:100%; border-collapse:collapse; font-size:11px; font-family:monospace; }}
  th {{ background:#1e2a35; color:{GREEN}; padding:8px 10px; text-align:left;
        font-size:10px; text-transform:uppercase; }}
  td {{ padding:7px 10px; border-bottom:1px solid #1a2530; color:#ccd8e0; }}
  tr:hover td {{ background:#162030; }}
  .badge {{ display:inline-block; padding:2px 8px; border-radius:20px;
            font-size:10px; font-family:monospace; font-weight:bold; }}
  .rebalance-list {{ display:flex; flex-direction:column; gap:8px; margin-top:12px; }}
  .reb-item {{ display:flex; align-items:center; gap:12px; padding:10px 14px;
               background:#0d1820; border-radius:8px; border:1px solid #1e2a35; }}
</style>
</head>
<body>

<h1>FinSim Pro — Financial Strategy Report</h1>
<div class="subtitle">MONTE CARLO SIMULATION ENGINE v2.0 &nbsp;·&nbsp; LangGraph + Gemini</div>

<div class="kpi-row">
  <div class="kpi"><div class="val">₹{meta['fire_number']/1e7:.2f}Cr</div><div class="lbl">FIRE Target</div></div>
  <div class="kpi"><div class="val">{meta['years_to_fire'] or '—'} yrs</div><div class="lbl">Years to FIRE</div></div>
  <div class="kpi"><div class="val">{meta['blended_cagr']*100:.2f}%</div><div class="lbl">Blended CAGR</div></div>
  <div class="kpi"><div class="val">{meta['blended_vol']*100:.2f}%</div><div class="lbl">Portfolio Vol</div></div>
  <div class="kpi"><div class="val">₹{meta['emi_monthly']:,.0f}</div><div class="lbl">Monthly EMI</div></div>
</div>

<div class="chart-block">
  <h2>Net Worth Projection</h2>
  <img src="data:image/png;base64,{imgs['net_worth']}" alt="Net Worth">
</div>

{narrative_html}

<div class="chart-block">
  <h2>Tax Breakdown Over Time</h2>
  <img src="data:image/png;base64,{imgs['tax']}" alt="Tax Breakdown">
</div>

<div class="chart-block">
  <h2>Portfolio Analysis</h2>
  <img src="data:image/png;base64,{imgs['portfolio']}" alt="Portfolio">
</div>

<div class="chart-block">
  <h2>Rebalancing Analysis</h2>
  <img src="data:image/png;base64,{imgs['rebalance']}" alt="Rebalance">
  <div class="rebalance-list">{reb_cards}</div>
</div>

<div class="chart-block">
  <h2>Year-by-Year Projection</h2>
  <table>
    <thead>
      <tr>
        <th>Year</th><th>Age</th><th>NW Median</th><th>P10</th><th>P90</th>
        <th>Income</th><th>Expenses</th><th>Tax</th><th>FIRE %</th><th>Goals</th>
      </tr>
    </thead>
    <tbody>{table_rows}</tbody>
  </table>
</div>

</body>
</html>"""

    return html.encode("utf-8")


# ─────────────────────────────────────────────────────────────────────────────
# BUILD GRAPH
# ─────────────────────────────────────────────────────────────────────────────

workflow = StateGraph(ReportState)
workflow.add_node("net_worth", net_worth_node)
workflow.add_node("tax",       tax_node)
workflow.add_node("portfolio", portfolio_node)
workflow.add_node("rebalance", rebalance_node)
workflow.add_node("yearly",    yearly_node)
workflow.add_node("narrative", narrative_node)
workflow.add_node("assemble",  assemble_node)

workflow.set_entry_point("net_worth")
workflow.add_edge("net_worth", "tax")
workflow.add_edge("tax",       "portfolio")
workflow.add_edge("portfolio", "rebalance")
workflow.add_edge("rebalance", "yearly")
workflow.add_edge("yearly",    "narrative")
workflow.add_edge("narrative", "assemble")
workflow.add_edge("assemble",  END)

report_executor = workflow.compile()