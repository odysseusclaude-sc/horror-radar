# Market Research Prompt Templates

Use these when evaluating business or app ideas. Run them in sequence for a full validation.

---

## 1. Market Sizing (TAM / SAM / SOM)

```
You are a market research analyst tasked with estimating the market size for the following business idea.

<idea>
{{BUSINESS_IDEA}}
</idea>

Using chain-of-thought reasoning, estimate:

<tam>
Total Addressable Market — the global revenue opportunity if 100% market share was achieved.
Show your assumptions and calculation steps.
</tam>

<sam>
Serviceable Addressable Market — the segment reachable with this specific product and distribution model.
</sam>

<som>
Serviceable Obtainable Market — realistic 3-year capture given competitive landscape and resources.
</som>

Constraints:
- Cite specific data sources or comparable companies where possible
- Flag assumptions clearly
- Do NOT fabricate statistics — mark estimates as estimates
```

---

## 2. Competitor Analysis

```
You are a competitive intelligence analyst tasked with mapping the competitive landscape for the following idea.

<idea>
{{BUSINESS_IDEA}}
</idea>

Identify the top 5-8 competitors (direct and indirect) inside <competitors> tags. For each:
- Name and URL
- Core value proposition
- Pricing model
- Key strengths
- Key weaknesses
- Target customer

Then produce a competitive positioning map inside <positioning> tags showing where gaps exist.

Finally, identify the single most defensible differentiation angle for this idea inside <differentiation> tags.

Constraints:
- Focus on currently active competitors
- Flag if a competitor has recently shut down or pivoted
```

---

## 3. User Persona

```
You are a UX researcher tasked with defining the ideal user for the following product idea.

<idea>
{{BUSINESS_IDEA}}
</idea>

Build 2-3 distinct user personas inside <personas> tags. For each persona include:
- Name and demographic snapshot
- Primary job-to-be-done
- Key frustrations with current solutions
- Motivations and goals
- Where they spend time online
- Willingness to pay

Then identify which persona is the highest-priority beachhead customer inside <beachhead> tags and explain why.

Constraints:
- Base personas on realistic user archetypes, not ideals
- Do NOT assume the user is technical unless the product requires it
```

---

## 4. Problem Validation

```
You are a product strategist tasked with validating whether the following idea solves a real, urgent problem.

<idea>
{{BUSINESS_IDEA}}
</idea>

Using chain-of-thought reasoning, evaluate inside <validation> tags:
1. Is this a hair-on-fire problem or a vitamin?
2. How do people currently solve this (workarounds, alternatives)?
3. What would make someone switch to this solution?
4. What is the cost of NOT solving this problem for the user?

Then give a validation verdict inside <verdict> tags:
- Problem strength: Strong / Moderate / Weak
- Reasoning
- Recommended next validation step (e.g. user interviews, landing page test, waitlist)

Constraints:
- Be honest — a weak problem is more useful to know than false validation
```

---

## 5. Full Business Validation (Combined)

```
You are a startup analyst tasked with conducting a full validation of the following business idea.

<idea>
{{BUSINESS_IDEA}}
</idea>

<context>
{{ADDITIONAL_CONTEXT}}
</context>

Run the following analysis in sequence:

1. Problem validation — is this a real, urgent problem?
2. Market sizing — TAM/SAM/SOM with assumptions
3. Competitor landscape — top 5 competitors, gaps, differentiation angle
4. User persona — 2 primary personas and beachhead customer
5. Revenue model — 2-3 viable monetisation approaches with pros/cons
6. Key risks — top 3 risks and mitigation strategies

Write each section in its own XML tag: <problem>, <market>, <competitors>, <personas>, <revenue>, <risks>

Conclude with an overall investment of time/effort recommendation inside <recommendation> tags:
- Pursue / Explore further / Deprioritise
- Reasoning in 3 bullet points
- Suggested first action

Constraints:
- Be direct — this is for decision-making, not reassurance
- Flag all assumptions clearly
- Do NOT fabricate data — use "estimated" where exact figures are unavailable
```
