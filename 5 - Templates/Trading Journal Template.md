---
date:
day_name: <% moment(tp.frontmatter.date).format("dddd") %>
day_num: <% parseInt(moment(tp.frontmatter.date).format("E"), 10) %>
symbol: NQ
setup:
  - None
outcome: None
stop_loss:
handles:
rr_ratio: <% tp.user.calculateRr(tp) %>
size: 4
partials_contracts:
partials_handles:
15m:
1m:
---
Tags: [[Trade Journal]]
# <% moment(tp.frontmatter.date).format("D MMM (ddd)") %> - <% tp.frontmatter.symbol %> - <% tp.frontmatter.setup %>

## 🖼️ Charts

**Context (15m Chart)**


**Execution (1m Chart)**


---

## 🧠 Analysis

### **Plan (The "BREAD")**
- Check news calendar and see if there were any prior large range days, or bank holidays. (NoNews, MediumNews, CPI, PPI, JacksonHole, FOMC, NFP (applies for the whole week), PresidentSpeech)
- Following the 15m chart narrative (bullish or bearish), seeing if the PD arrays are being adhered to. Prior to opening bell, mark out relative 15m PD arrays and ODR.
- Wait for market to open and sit on my hands to observe the first 15m candle formed during opening session. Did it validate any iFVGs or confirm any PD arrays? If so, use the 1m first FVG (f-FVG) as a price range to enter during the 0950-1010 macro. If the f-FVG coincides with a 15m PD array, use the 15m PD array instead.
- Manage the trade and move stop loss based on certain PD arrays. PROFIT!

### **Thesis (The "Why")**
*Why did I plan to take this trade? What was the broader market context?* 

### **Execution (The "How")**
*How was my entry? Was it impulsive or patient? How was my stop loss placement? How did I manage the trade? Did I follow my plan?*

### **Outcome & Review (The "What")**
- **Result:** 
- **What went well?**
	- 
- **What could be improved?**
	- 
- **Key Lesson Learned:**
	- 