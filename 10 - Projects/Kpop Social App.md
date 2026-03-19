# Kpop Social App

> A fan project coordination platform with a social layer built for Kpop communities.

---

## Project Vision

A platform that serves as the **operational backbone for fan communities** — where the organising, coordinating, and executing of fan projects actually happens, wrapped in a social layer that makes it feel like a community rather than a project management tool.

**Not trying to replace Weverse.** Not another generic social network. Instead: the tool that fan project organisers actually need, surrounded by the social features that keep fans coming back daily.

---

## The Three Layers

### 1. Social Layer
*Brings people in and keeps them coming back*

- User profiles with fandom identity (bias, stan level, fan name)
- Artist/group community pages with sub-sections
- Post and comment threads with upvoting
- Follow system and personalised activity feed
- Group chat per community, per project, per meetup
- Fanart and fan content sharing
- Direct messaging between mutual followers (Phase 2)

### 2. Project Layer
*The core differentiator — why users stay*

- Fan project creation and management
- Milestone and progress tracking
- External fundraising link integration (no in-platform payments at MVP)
- Organiser reputation and trust scores
- Verified organiser programme
- Proof of expenditure uploads
- Project history and documentation
- Fan project templates

### 3. Information Layer
*Utility — why users check daily*

- Concert and event listings (user submitted)
- Comeback schedule aggregation
- Fan-submitted news and updates
- Notifications and alerts

---

## Meetup Coordination

A genuinely underserved feature. Fans currently coordinate meetups via Twitter threads and Discord — chaotic and fragmented.

**Meetup Types:**
- **Concert Meetup** — tied to a specific concert, small group (5–20 people)
- **Album Release Party** — fans gather to listen together
- **Fan Project Meetup** — working session to plan or execute a project
- **General Gathering** — casual fan meetup

**Key Features:**
- RSVP system (free — no payments)
- Auto-created attendee chat room
- Post-meetup photo sharing thread
- Meetup history on organiser profile
- Safety features: organiser verification, report function, safety tips

---

## The Fandom Identity System

Instead of generic interests, users build a fandom identity:

- **"I stan" list** — select groups/artists with tiered levels (Casual fan → Fan → Stan → Ultimate bias)
- **Fan club affiliations** — join and be part of established fan clubs
- **Bias field** — favourite member
- **Bias wrecker field** — second favourite
- **Fan name display** — ARMY, BLINK, ONCE, etc.

These cultural signals let fans immediately know who they're talking to.

---

## The Reputation System

Trust infrastructure that ties the social and project layers together:

| Badge | How Earned |
|---|---|
| Organiser Score | Completed projects, funds accounted for, community ratings |
| Contributor Badge | Participated in fan projects |
| Event Veteran | Attended meetups through the platform |
| Verified Organiser | Track record established, verified by platform |

---

## Market Position

### Existing Competition
| Platform | Backer | Limitation |
|---|---|---|
| Weverse | HYBE (BTS, NewJeans) | Label-controlled, not fan-project focused |
| Lysn | SM Entertainment | Artist-specific |
| Bubble | Various labels | Subscription model, no community tools |
| Twitter/X | — | Chaotic, no structure for coordination |
| Discord | — | Siloed, hard to discover |

### The Gap
No existing platform lets fan project organisers **manage projects transparently, coordinate across fandoms, and document projects in one place.** Labels will never prioritise this because it doesn't benefit them.

---

## Feature Roadmap

### MVP — Months 1–3
- [ ] User registration and profiles with fandom identity
- [ ] Artist/group community pages
- [ ] Post and comment threads
- [ ] Follow system and basic activity feed
- [ ] Community chat (public, per artist)
- [ ] Concert and event listings (user submitted)
- [ ] Fan project pages (tracking only, no payments)
- [ ] External fundraising link integration

### Phase 2 — Months 4–6
- [ ] Meetup creation and RSVP system
- [ ] Fanart and content sharing
- [ ] DMs between mutual followers
- [ ] Organiser reputation scores
- [ ] Project templates
- [ ] Verified organiser programme
- [ ] Premium organiser accounts (monetisation)

### Phase 3 — Month 7+
- [ ] Streaming party coordination tools
- [ ] Live event threads (real-time during concerts)
- [ ] Stripe Connect for organisers (when legally ready)
- [ ] Fan club official accounts
- [ ] Mobile app (React Native via Expo)

---

## Tech Stack

### Frontend
- **Next.js** (web first — validate before building mobile)
- React Native via Expo (Phase 3 — mobile)

### Backend & Database
- **Supabase** — PostgreSQL, Auth, Realtime, Storage
- Row Level Security for privacy controls

### Infrastructure
- **Vercel** — frontend hosting (free tier)
- **Cloudflare R2** — media/image storage (very cheap)
- **Resend.com** — transactional email (generous free tier)

### Chat
- **Supabase Realtime** — good to ~10,000 users (free)
- Stream.io or Sendbird — when scale requires it

### Search
- **Supabase full-text search** — built in, free to start
- Algolia or Typesense — when search becomes critical

### AI/Automation (Mac Mini)
- **n8n** — workflow automation
- **Ollama + DeepSeek R1** — local AI for private code review
- **Claude API** — content moderation pipeline, hard tasks

---

## Core Database Schema

```sql
-- Social
users (id, username, email, bio, avatar, created_at)
artist_groups (id, name, fandom_name, debut_date, agency)
user_fandoms (user_id, group_id, stan_level, bias_member)
posts (id, user_id, community_id, content, type, created_at)
comments (id, post_id, user_id, content, created_at)
follows (follower_id, following_id, created_at)

-- Events and Meetups
events (id, name, type, date, venue, city, country, group_id, submitted_by)
meetups (id, title, type, organiser_id, event_id, date, capacity, status)
meetup_rsvps (meetup_id, user_id, status, created_at)

-- Fan Projects
projects (id, title, organiser_id, group_id, goal, description, 
          status, external_link, deadline)
project_updates (id, project_id, content, amount_raised, created_at)
project_participants (project_id, user_id, joined_at)

-- Chat
chat_rooms (id, type, name, project_id, meetup_id)
messages (id, room_id, user_id, content, created_at)

-- Moderation
reports (id, reporter_id, content_type, content_id, reason, status)
user_reputation (user_id, organiser_score, projects_completed, events_attended)
```

---

## Legal & Compliance

### Company Setup (Before Launch)
- [ ] Register Singapore Pte Ltd via ACRA (~$315 SGD)
- [ ] Draft Terms of Service
- [ ] Draft Privacy Policy (PDPA compliant)
- [ ] Community Guidelines with DMCA process
- [ ] Fundraising disclaimer

### Content Rules
**Allowed:**
- Original fanart
- Fan-written content
- Concert photos taken by fans
- Fan project documentation

**Prohibited:**
- Official music videos or audio
- Official photocards or album scans
- Content claiming to be from artists
- Paparazzi or private photos of artists

### Fundraising Approach
- **MVP:** Display project goals and link to external platforms (KoFi, GoFundMe, PayPal)
- **Phase 2:** Stripe Connect — organisers connect their own Stripe accounts, platform takes % fee, never holds funds
- **Never:** In-platform wallets, stored balances, or cross-border transfers without MAS licence

---

## Monetisation (No Payment Licence Required)

| Revenue Stream | Detail | Timing |
|---|---|---|
| Free tier | 1 active project, basic features | Launch |
| Organiser tier ($8–12/month) | Unlimited projects, analytics, verification badge | Phase 2 |
| Verified fan club accounts | Premium features for established fan clubs | Phase 2 |
| Stripe Connect fee | Small % of transactions facilitated | Phase 3 |
| Advertising | Kpop brands, merchandise shops, ticket affiliates | Later |

---

## Content Moderation Strategy

### Known Challenges in Kpop Spaces
- Fan wars between different fandoms
- Harassment over differing opinions
- Spread of unverified rumours about artists
- Inappropriate shipping content
- Anti-fan activity

### Moderation Toolkit

**Automated (n8n on Mac Mini):**
- Keyword filtering for slurs
- Spam detection
- Duplicate content detection
- New account rate limiting
- AI-assisted flagging via Claude API

**Community-driven:**
- Flag/report system with categories
- Trusted community moderators
- Voting to hide low-quality content
- Auto-hide content reaching X flags

**Admin tools:**
- Content queue for flagged posts
- User warning system
- Temporary and permanent bans
- Appeal process
- Audit log of moderation actions

---

## Go-To-Market Strategy

### Where Kpop Fans Are
- Twitter/X — largest Kpop fan base
- Reddit (r/kpop, r/bangtan, fandom subreddits)
- Discord servers (every major fandom has several)
- TikTok (younger fans)

### Launch Approach
1. **Build in public on Twitter** — share the journey, Kpop + tech crossover is a real niche
2. **Target fan project organisers first** — they have the most pain, find them on Twitter
3. **One fandom first** — ARMY (BTS fans) are the largest and most organised
4. **Invite-only beta** — 50–100 real users is enough to validate
5. **Watch how they actually use it** — not how you imagined they would

---

## Development Setup

### Tools
- **Claude Code** — primary AI coding assistant (writes, debugs, refactors)
- **OpenClaw / n8n agent** — research, planning, competitive monitoring
- **Mac Mini** — development machine + 24/7 AI assistant server
- **Hostinger VPS** — IP shield via WireGuard

### Mac Mini AI Workflows for This Project

| Workflow | Trigger | Output |
|---|---|---|
| Daily Dev Standup | Every morning 8am | Focused plan for the day via Telegram |
| Code Review | Paste function into chat | Private local model review (code never leaves Mac) |
| Research Assistant | On demand question | Structured report saved to Obsidian |
| Competitor Monitoring | Every Monday | Weekly competitive intelligence report |
| Content Moderation | Flagged content in production | Moderation recommendation to admin queue |

---

## Feasibility Assessment

| Factor | Assessment |
|---|---|
| Technical feasibility | ✅ High — proven stack, AI-assisted development |
| Solo buildability | ✅ Yes — scoped correctly |
| Market gap | ✅ Real and underserved |
| Legal complexity | ⚠️ Manageable in stages |
| User acquisition | ⚠️ Hardest part — needs community relationships |
| Timeline (no deadline) | 10–14 months to something worth sharing |

---

## Realistic Timeline

| Phase | Duration | Milestone |
|---|---|---|
| Foundation | 4–8 weeks | Auth, profiles, one community page |
| Core Social | 6–12 weeks | Posts, comments, chat, follow system |
| Fan Projects | 4–8 weeks | Project pages, tracking, external links |
| Meetups & Events | 4–6 weeks | RSVP system, event listings |
| Beta Launch | Month 3–4 | 50–100 real users, closed beta |
| Iterate | Ongoing | Based on real user feedback |

---

## First Version Target (6–8 weeks)

Just four things:
1. Sign up and create a profile with bias and fandoms
2. One community page (start with one group)
3. Post a text update and comment on others
4. Create a fan project page with title, description, and external link

---

## Key Risks

| Risk | Mitigation |
|---|---|
| Motivation cliff at month 2–3 | Small milestones, show people early, build what's interesting first |
| Scope creep via AI | Write MVP feature list, stick to it, understand what Claude Code builds |
| Building without understanding | Never copy code you can't explain, read docs alongside AI tools |
| Kpop community is tough to enter | Talk to real fans before, during, and after building |
| Label takedowns | Never host official content, robust DMCA process |

---

## The Single Most Important First Step

Before writing any code — find 5 fan project organisers on Reddit or Twitter and ask:

> *"I'm building a tool specifically for fan project coordination. I'd love to hear about your biggest frustrations with how you currently manage projects. No pitch — just genuinely want to understand the problem."*

The answers reshape everything.

---

## Notes & Ideas Parking Lot

*Use this section to capture ideas that aren't MVP but worth remembering*

- Streaming party coordination (coordinate when everyone streams a song together — huge in Kpop)
- Fan project history as a public archive — cultural documentation angle
- Cross-fandom collaboration tools (projects that involve multiple fandoms)
- Billboard/chart tracking integration
- Comeback countdown feature
- Fan-made lightstick colour guides per venue

---

*Project started: March 2026*
*Status: Planning phase*
*Builder: Solo*
*Stack: Next.js · Supabase · Vercel · n8n · Claude Code*
