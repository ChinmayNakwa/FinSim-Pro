# FinSim Pro

FinSim Pro is a high-fidelity financial simulation engine designed to provide autonomous and semi-autonomous financial planning insights. It utilizes Monte Carlo simulations to project net worth across thousands of possible market scenarios, integrated with an agentic AI layer that understands complex Indian tax laws and investment strategies to act as a digital financial advisor.

<img width="1917" height="1042" alt="Screenshot 2026-07-17 220313" src="https://github.com/user-attachments/assets/91a0e3fc-852a-4245-8bf8-8402a4f531d1" />


## What does it do?

At its core, the application bridges rigorous mathematical forecasting with natural language strategy. It doesn't just show you "best-case" scenarios; it features **Agentic capabilities**, meaning it can think through your specific financial constraints, remember your long-term goals, and generate a self-contained strategy report.

Here are its primary capabilities:

### 1. Advanced Monte Carlo Engine
FinSim Pro runs up to 2,000 parallel simulations of your financial life. Behind the scenes, the engine:
1. **Gathers Market Data:** Fetches real-time tickers (Nifty 50, Gold, S&P 500) and uses **Prophet** (Meta's forecasting tool) to calculate historical CAGR and volatility.
2. **Simulates Volatility:** Applies random Gaussian noise to your portfolio to account for market crashes and "black swan" events.
3. **Calculates Probabilities:** Returns precise success rates for your FIRE (Financial Independence, Retire Early) number and 1-Crore milestones.

### 2. FY 2024-25/25-26 Indian Tax Engine
The system includes a hard-coded, compliant tax engine that dynamically switches between regimes.
- **Dual-Regime Logic:** Automatically compares the Old vs. New Tax Regime (Budget 2025) to find your lowest liability.
- **Asset-Specific Tax:** Computes LTCG and STCG for Equity (12.5%), Gold, Real Estate, and Debt, including the ₹1.25L exemption limits.
- **Deductions:** Handles 80C, 80D, HRA exemptions, and Home Loan interest components.

### 3. Agentic Financial Reporting (LangGraph)
Using a **LangGraph** workflow and Google's **Gemini AI**, the system performs "Thinking" steps before giving advice:
- **Narrative Node:** Analyzes simulation results to write a professional executive summary.
- **Strategy Node:** Identifies shortfalls in your goals and suggests specific "BUY/SELL" actions.
- **PDF Generation:** Compiles all charts (Net Worth Fan charts, Tax stacks) into a self-contained HTML/PDF report for the user.

### 4. Smart Rebalancing & Goal Tracking
- **Age-Based Allocation:** Suggests a target portfolio based on your current age (e.g., 100 - age rule).
- **Drift Analysis:** Calculates the percentage "drift" in your portfolio and provides exact Rupee amounts needed to rebalance.
- **Goal Priority:** Tracks multiple goals (House, Education, Retirement) and visualizes the percentage funded based on median net-worth paths.

---

## Tech Stack

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS, Recharts, Chart.js.
- **Backend:** FastAPI (Python), NumPy, Pandas, Prophet.
- **AI/LLM:** LangGraph, LangChain, Google Gemini API.
- **Financial Data:** yfinance API.

## Getting Started

### Backend Setup
1. Navigate to `/backend`
2. Create a `.env` file with your `GOOGLE_API_KEY`
3. Install dependencies: `pip install -r requirements.txt`
4. Run server: `uvicorn main:app --reload`

### Client Setup
1. Navigate to `/client`
2. Install dependencies: `npm install`
3. Run development server: `npm run dev`

---
Developed by [Chinmay Nakwa](https://github.com/ChinmayNakwa)
