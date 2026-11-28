# Otty — Launch readiness

A first look, on 2026-11-15, at what Otty has today and what has to happen before it can go to people outside the project: first a **closed beta**, then a **paid public beta**, then **1.0**. It covers the big picture (business model, positioning) and the small details (a fallback in `settings.ts`, a fuse in the build).

This is a starting point, not a plan of record. Facts about the code were checked against `feat/next-five` (v0.5.0). Facts about the outside world (prices, laws, store rules, provider terms) change often and are marked **verify**: check them at the source before relying on them. None of this is legal or tax advice.

Sizes use the DEVLOG's effort scale (S, M, L, defined under "How to use this doc"): the amount and complexity of the work, never a time.

---

## 0. Summary

**Where Otty stands.** The product is well ahead of the business around it. Otty has a broad feature set, an unusually careful safety design, 746 passing unit tests, a real-model eval, and CI on every PR. Almost none of the things that turn an app into a product exist yet: it's unsigned, it has no updater, no accounts, no payments, no crash or error reports, no privacy policy, no licence, and no way to support a user who isn't sitting next to you.

**The biggest issue isn't technical: the business model and the main user don't fit together.** Otty is built for "someone who has never heard of an API" (REQUIREMENTS §1), but today the first thing it asks for is an API key from DeepSeek, Anthropic or OpenAI. That works for you and for technical friends. It will lose most of the people Otty is designed for in the first minute. It also leaves you nothing to charge for: users pay the AI company, not you. **Decide how Otty makes money (§2) before anything else**, because the answer decides whether you need a server, accounts and billing, which together are most of the work.

**The five things blocking even a closed beta:**

1. **Signing and notarization** (§5). Without them macOS warns that the app is from an unidentified developer and may be harmful, and Accessibility and Screen Recording grants are lost on every update. Testers will think Otty is broken.
2. **Auto-update** (§6). Without it, every fix means asking each tester to download a new DMG, and a security fix in Electron can't reach anyone.
3. **A way to find out what went wrong** (§14). There are no log files, no crash reports and no "send diagnostics" button. With a tester in another city, you would be blind.
4. **The unshipped stack** (§13). PRs 51, 52 and 53 (D-29 to D-36) are stacked and unmerged, and D-31 to D-36 haven't been run in the real app. Merge, run the smoke test and freeze features for the beta.
5. **A privacy policy and terms** (§12). Otty reads people's screens, highlights and files, and remembers things about them. Testers deserve to know in writing what happens to that, and you need the terms to limit your own liability.

**Add these before taking money:** the hosted AI service, accounts, payments through a merchant of record, a website and a support channel. The pool model, prices, onboarding, moat and order are in **§22, Monetisation roadmap**.

---

## Decisions so far (2026-11-16)

| Question | Decision | What it means for the work |
| --- | --- | --- |
| Business model (§2.1) | **C, hybrid.** A free tier and paid plans on hosted AI. "Use my own key" stays, as a cheaper paid plan | Build the hosted service (§9) and accounts (§8) for the paid beta. The own-key plan still needs a licence or account check (8.1) |
| AI-free features (§3.2) | **Free forever**: pick up text, typed math, saved chats and search, find in chat, copying tables, the otter | Never behind a paid plan or a usage limit. Everyone signs in (see the next row) |
| Sign-in (§8) | **Every user signs in**, on every plan | Sign in once at onboarding. After that, **never lock anyone out of what runs on their Mac**: an expired session, no internet or a server outage pauses only the AI features, while pick up text, math and saved chats keep working, and the otter asks them to sign in again in friendly words. Sign-in also gives the free tier one allowance per account (3.5) |
| Default model (§2.2) | **DeepSeek stays the default** | Disclose clearly where questions are processed, and plan the cross-border transfer wording under Singapore's and Hong Kong's laws (§11.3) |
| First markets (§2.4) | **Singapore and Hong Kong** | Laws: Singapore's PDPA and Hong Kong's PDPO first. Prices in SGD and HKD. English plus zh-HK, so translating the interface (15.6) moves up. **Provider regions:** OpenAI and Anthropic have not listed Hong Kong as a supported region (**verify** both). That affects the own-key plan for Hong Kong users who pick Claude or OpenAI, and any hosted fallback to those providers for Hong Kong users. DeepSeek as the default avoids it |
| Repository (§2.6) | **Private before the beta** | Two follow-ons. (1) CI cost: move typecheck and unit tests to Linux runners and keep macOS for builds (7.2 becomes P0). (2) Updates: the feed (`src/main/update.ts`, D-88) reads this repo's public releases, and a private repo's need a token, which must never ship in the app. Before going private, point `FEED` and `tools/release/feed.mjs` at public storage (Cloudflare R2, S3) or a separate public releases repository (6.1). Add a `LICENSE` stating all rights reserved anyway |
| Legal form (§12.1) | **Individual for now, no company yet** | The Apple Developer account is individual, so macOS shows your personal legal name as the developer, and moving to an organisation later needs Apple's migration process (**verify**). Check that your merchant of record accepts individual sellers in Singapore or Hong Kong (**verify**). Terms and liability are personal until there's a company, which makes the AI disclaimers and the limitation of liability in the terms (12.2) more important. Revisit before taking meaningful revenue |

---

## 1. What you already have

Worth listing, because a lot of this is rare in early apps and it's the base for the pitch.

| Area | What's there | Why it matters for launch |
| --- | --- | --- |
| Product | Highlight, snip and whole-screen asks; quick view and panel; explain cards; proofreading with a diff from code; memory with Undo; math by code; step cards; background and repeating jobs; drawings, slides and charts; file attachments (PDF, Word, code, notebooks); on-device text pick-up (Apple Vision); saved chats with search; zh-HK help | Enough to be useful on day one. The risk is too much, not too little (§15) |
| Character | Painted otter art, an app icon, an idle budget and a design system | The otter is the brand and the difference from ChatGPT. Very demoable |
| Safety design | `toolSafety.ts` (one table, Rule of Two), confirm cards, `knownUrls.ts`, page reader that checks every redirect, secret masking before anything leaves (`shared/secrets.ts`), CSP on built pages, sandboxed renderer, narrow preload | A real story for a privacy-conscious market. Few competitors can show it |
| Transparency | "What left the Mac" (`sent.ts`, Activity), usage meter, monthly limit, Pause everything | Directly reusable as marketing and as compliance evidence |
| Providers | One adapter per API format (`providers/`), profiles, presets for DeepSeek, Claude, OpenAI, local and custom | Makes a hosted "Otty" service a new preset rather than a rewrite (§9) |
| Data | SQLite with forward-only migrations, a guard against a newer schema (`db.ts` throws), retention setting, old shapes read by `upgrade.ts` | Updates won't silently corrupt chats |
| Tests | 54 test files, 746 tests, a search contract test, a cache byte-for-byte test, a real-model eval (118/120 baseline) with injection cases | Strong base for a release gate |
| CI | `ci.yml` (typecheck, test, build on macOS for every PR, `main` protected), `dmg.yml` (unsigned arm64 and x64 DMGs, draft release on `v*` tags), Dependabot | Half of a release pipeline exists |
| Docs | REQUIREMENTS, DEVLOG with a 127-step smoke test, CHANGELOG, BRAINSTORM, AUTONOMY | Makes it possible to hand parts of this to someone else |

---

## 2. Decisions to make first

Each of these changes the size of the rest of the list. Made so far: see **Decisions so far** above. 2.3 (distribution) and 2.5 (what the paid version promises) are still open.

### 2.1 Who pays, and for what

| Model | How it works | Good | Bad |
| --- | --- | --- | --- |
| **A. Bring your own key, paid app** | Users pay you once or yearly for Otty, and pay the AI company for usage, as today | Least work: a licence check and payments. No AI bill, no server | Keeps the API-key wall in front of non-technical users. Two bills for the user. Hard to explain the value of paying you on top |
| **B. Hosted AI, subscription** | Otty signs users in; their questions go through your server to the AI company on your account; they pay you monthly | Removes the key wall. One bill. You control model choice, cost and quality | A server, accounts, billing, abuse control and an AI bill you carry. Usage risk: heavy users can cost more than they pay |
| **C. Hybrid (recommended)** | Default is hosted (B) with a free allowance and paid plans; "Use my own key" stays as an option, perhaps on a cheaper or free plan | Fits the persona and keeps power users and the privacy-minded happy. Most of the code already supports both | You build B anyway, plus licence logic for C |
| D. Free, with sponsors or donations | — | Simple | Doesn't pay for hosted AI; not a business |

**Recommendation: C, built in two steps.** For the closed beta, keep bring-your-own-key and give testers who can't get one a key from your own account with a hard spending cap at the provider (and Otty's monthly limit, D-33). For the paid beta, add the hosted service (§9) with a free allowance.

### 2.2 Which model is the default

DeepSeek is the default today because it's quick and cheap. For a commercial product, weigh:

- **Where the data goes.** DeepSeek is a Chinese company, and its API terms and privacy policy say where data is processed (**verify** the current text). Several governments and many companies have restricted DeepSeek on work devices. An "office worker" persona will hit this. Your privacy page will have to say it plainly.
- **Hosted open-weight alternatives.** DeepSeek's open models are also served by other hosts in other regions (**verify** which, and their terms), which keeps the cost advantage with a different data location. The OpenAI-format adapter already supports them.
- **Cache behaviour.** The byte-for-byte cache design (`llm.test.ts`) is DeepSeek-specific. A proxy (§9) must not change requests, or the cache savings disappear.
- **Price per answer** is the core of your margin under B or C. See §3.3.

### 2.3 How Otty is distributed

- **The Mac App Store is very likely out.** App Store apps must be sandboxed, and Otty simulates ⌘C through System Events, needs Accessibility to read other apps' selections, and drives other apps through Apple Events (`act/`). Sandboxed apps can't do most of that (**verify** against the current App Review Guidelines, but plan around direct distribution).
- **Direct download** (DMG from your website, Developer ID signed and notarized, §5) is the normal route for apps like this. Payments go through a merchant of record (§3.4).
- **Setapp** (a subscription bundle of Mac apps) is a possible second channel later, with its own revenue share and review (**verify** terms). It suits a polished utility.
- **Homebrew cask** is free and liked by technical users; add it after signing.

### 2.4 Who the beta is for

The persona table includes "student" and "parent, retiree". Two consequences:

- **Age.** Serving under-18s, and especially under-13s, brings extra law (COPPA in the US, age-of-consent rules under GDPR) and AI provider rules on minors (**verify** each provider's policy). For the beta, say **18+** in the terms and onboarding, and revisit when there's a reason to serve students directly.
- **Language.** zh-HK help is a real difference. Decide whether the beta targets English speakers, Cantonese / Traditional Chinese speakers, or both, because it changes the website, support language and which privacy laws apply first.

### 2.5 What the first paid version promises

Pick the 4–6 features that define Otty for the beta (for example: ask about a highlight, ask about a snip, explain cards, check my writing, saved chats, memory). Put everything else behind a "Labs" switch or leave it as is but out of the marketing. Every feature you advertise is one you support. Local models are already "experimental" (memory: stretch goal); hide them from onboarding for the beta.

### 2.6 The public repository

The repository is **public with no licence file**. Legally that means "all rights reserved", but in practice anyone can read and build Otty, including your prompts, eval cases and safety logic, and some will assume it's open source.

| Option | Effect |
| --- | --- |
| Make it private | Simplest. **Cost:** GitHub Actions macOS minutes are free for public repositories but billed at a much higher rate than Linux for private ones (**verify** current pricing). Your CI runs macOS on every PR, so budget for it or move part of CI to Linux (typecheck and unit tests don't need a Mac) |
| Keep it public, add a source-available licence | e.g. Functional Source License, Business Source License or PolyForm (**verify** terms). Lets people read but not sell it, and can turn into open source later. Good for trust in a privacy product |
| Open source (MIT, Apache, GPL) | Builds trust and community. Anyone may build and give away a free Otty, so your value must be the hosted service, the signed build and support |

Decide before you have users, and add a `LICENSE` file either way.

---

## 3. Business model and pricing

The first sketch. Where they differ, §22 wins: a usage pool priced in cost (22.4), the plans in 22.7, and memory free on every plan (22.2, 22.9).

### 3.1 Plans (a sketch for model C)

| Plan | For | Includes |
| --- | --- | --- |
| Free | Trying Otty | A small monthly allowance of hosted questions, all on-Mac features (pick up text, math, saved chats) unlimited |
| Personal (monthly or yearly) | The persona | A generous allowance, background and repeating looks, drawings and slides, memory |
| Own key | Power users, privacy-minded | All features, your key, a lower price or a one-time licence |

Things to settle: what an "allowance" counts (questions are easy to understand; tokens aren't — the persona must never see "tokens"), what happens at the limit (friendly message, never a raw error, CLAUDE.md UX rule), and whether background looks count more than questions.

### 3.2 Features that never use AI

Pick up text (Apple Vision), typed math, find-in-chat, copying tables, the otter itself. These cost you nothing to serve and can stay free forever, which makes the free plan feel generous at no cost.

### 3.3 Unit economics (fill in with real numbers)

The usage meter (`usage.ts`) already counts questions, searches, pages and tokens per day. **Use the closed beta to measure the real distribution** before setting prices:

```
cost per active user per month
  = questions per month × (input tokens × input price + output tokens × output price)
  + searches × search price + background runs × their cost
  − cache savings (DeepSeek's cache, Claude's prompt caching)
```

Things that move it most:
- **Pictures.** A snip is far more input than a highlight. Snips are downscaled to 1600 px (REQUIREMENTS §6); measure what that costs per model.
- **Long chats.** Each turn resends the whole history. A cap on context length, or a summary of old turns, controls the tail.
- **Background and repeating jobs.** These run without the user present. Cap them per plan in code (the monthly limit, D-33, is the right place).
- **Explain-card warm-ups and titles** (`complete()` background calls) are cost the user didn't ask for. Measure them; make warm-ups smarter or plan-dependent if they're a large share.
- **Heavy users.** Plan for the top 5% to use many times the median. A per-plan monthly cap, enforced on the server, protects the margin.

Set the price so the median user costs a small fraction of it, and the cap bounds the worst case. Payment fees (§3.4) take a further cut.

### 3.4 Taking money

- **Use a merchant of record** (Paddle, Lemon Squeezy, FastSpring and similar; **verify** current fees and country support). They sell on your behalf and handle sales tax, VAT and GST in every country, invoices, refunds and chargebacks. For a solo developer this is far less work than Stripe directly, where you'd be responsible for registering and filing taxes in each place you sell.
- Most of them include **licence keys** and a **customer portal** (cancel, change card, invoices), which covers model A or the own-key plan with little code.
- A **refund policy** (for example 14 or 30 days, no questions) is expected and is legally required in some places for digital goods (**verify**).
- Student, education or regional pricing can come later.

### 3.5 Free-plan abuse

A free hosted allowance will be farmed by people creating many accounts to get free AI. Defences, in order of cost: email verification, one free allowance per device (a random device id in the Keychain, not hardware fingerprinting), rate limits per account and per IP on the server, and a cheap model for free usage.

---

## 4. Market and positioning

**Who Otty competes with** (**verify** current features and prices):

| Competitor | Overlap | Otty's answer |
| --- | --- | --- |
| ChatGPT for Mac, Claude for Mac, Perplexity | General assistant, screen sharing, often a ⌥Space hotkey | Lives at the cursor, explains rather than answers, teaches terms, shows what left the Mac, and it's a friend, not a chat box |
| Apple Intelligence (Writing Tools, Siri) | Proofreading and summaries built into macOS, free | Explains *why*, works in any app including where Writing Tools don't, any language pair, any model |
| Raycast AI and similar launchers | Power-user AI at a hotkey | Built for non-technical people; no commands to learn |
| Browser extensions | Explain this page | Works across every app, not just the browser |
| Meta's Muse (US-only since 2026-09-08; free, plus $20 and $100 plans) | A personal agent with goals, background work, approvals, an activity log, artifacts, connectors with read or write, memory, an avatar and a name, macOS control, and building its own tools | Muse runs in Meta's cloud, acts (buys, calls, emails) and trains on queries unless you opt out. Otty lives on your Mac and sees your screen; it prepares and asks, undoes what it does, shows everything that left, works in Cantonese for SG and HK, and is a pet in a place rather than an assistant with a face. BRAINSTORM, [Learning from Muse](BRAINSTORM.md#learning-from-muse-2026-11-24) |

**Risks to the position:**
- **A free personal agent with huge distribution** (Muse, inside WhatsApp). Otty can't win on how much it can do. It wins on what Muse's design can't offer: local and inspectable, undo, the screen you're looking at, and the relationship. Its public incidents (shared chats found through DNS, an account it read without being given access, a retailer blocking it as an unidentified agent) are exactly the trust story to tell, without naming anyone.
- **Apple and OpenAI ship features into the OS for free.** Otty's defence is the character, teaching and trust, not any one feature. Lead with those.
- **"Why pay when ChatGPT is free?"** needs a one-sentence answer on the website. Something like: *"Otty explains what's on your screen, wherever you are, in words you'll understand, and shows you everything it sends."*
- **Hotkey clash.** ChatGPT's Mac app is known to use ⌥Space (**verify**), Otty's default. `takenHotkeys` reports a failed registration; make sure onboarding notices a clash and offers another shortcut in friendly words.

---

## 5. Signing, notarization and the build

Today: `identity: null` in `electron-builder.yml`, `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` in `dmg.yml`, README tells users to right-click → Open.

| # | Item | Size | Notes |
| --- | --- | --- | --- |
| 5.1 | Join the Apple Developer Program | S | Yearly fee (**verify**). **Individual or organisation:** an individual account shows your personal legal name as the developer in macOS dialogs; an organisation account shows the company name but needs a legal entity and a D-U-N-S number, which can take weeks. Decide with §18.1 |
| 5.2 | A Developer ID Application certificate | S | Keep the private key safe (a password manager, plus an encrypted backup). Losing it means a new identity, and macOS treats the new build as a different app for permissions |
| 5.3 | Hardened runtime and entitlements review | S | **Turn the hardened runtime back on with the Developer ID:** it's off while builds are ad-hoc signed (D-49), because ad-hoc code has no Team ID and library validation refuses Electron's framework. Never add `disable-library-validation` instead. electron-builder enables the hardened runtime by default for signing. Review `build/entitlements.mac.plist`: `allow-unsigned-executable-memory` may no longer be needed by Electron 45 (**verify**, remove if not); keep `allow-jit` and `automation.apple-events` |
| 5.4 | Sign the OCR helper | S | `otty-ocr` ships in `extraResources`. Check that it's signed with the hardened runtime in the final app (`codesign -dv --verbose=4` on it and `spctl -a -vv` on the app). An unsigned helper fails notarization |
| 5.5 | Notarize and staple | S–M | electron-builder's `notarize` option with an App Store Connect API key (preferred over an app-specific password). Staple the ticket so first launch works offline |
| 5.6 | Signing in CI | M | Store the certificate (base64 `.p12`) and the API key as GitHub secrets, used only in a release job that runs on tags, in a protected GitHub **environment** that needs your approval. Never on PRs from forks |
| 5.7 | Electron fuses | S | ✅ Done (D-49, 2026-11-18): set in `electron-builder.yml`, kept by `rules/build.test.ts`. Was: not configured. Otty holds Accessibility, Screen Recording and Automation grants, and an attacker who can run the app binary with `ELECTRON_RUN_AS_NODE` or `--inspect` inherits them. Turn off `RunAsNode`, `EnableNodeOptionsEnvironmentVariable` and `EnableNodeCliInspectArguments`; turn on `EnableEmbeddedAsarIntegrityValidation`, `OnlyLoadAppFromAsar` and `EnableCookieEncryption` (electron-builder's `electronFuses`, **verify** the option name for your version) |
| 5.8 | Bundle identifier | S | `com.otty.assistant` implies you own `otty.com`. Use a reverse domain you own (§17). **Change it before the first public build**: macOS ties permissions, Keychain items and `userData` to it, so changing it later loses every user's grants and saved key |
| 5.9 | Usage descriptions | S | Only `NSAppleEventsUsageDescription` is set. Check whether Screen Recording, and anything else you prompt for, needs its own string, and keep each one in friendly words |
| 5.10 | DMG polish | S | The move-to-Applications check is ✅ done (D-53, 2026-11-18). Still open: a background with "drag Otty to Applications", a signed DMG, a sensible volume name. Consider a check that moves the app to `/Applications` on first launch, because permissions and updates break when it runs from the DMG or Downloads |
| 5.11 | Size | S | Each DMG is about 145 MB. Normal for Electron, but check what's in `out/` and `node_modules` that ships (for example whether mermaid, katex or mathjs pull in more than they need). Keep two DMGs (arm64 and x64) and pick the right one on the download page, rather than one large universal build |

---

## 6. Updates and releases

| # | Item | Size | Notes |
| --- | --- | --- | --- |
| 6.1 | Auto-update ✅ built (D-88, 2026-11-28) with Electron's own `autoUpdater` (Squirrel.Mac) and a per-arch JSON feed on GitHub Releases, signed with a self-signed certificate so every version has the same identity (Squirrel's check and TCC both key on it); tested end to end on a Mac, a forged ad-hoc update refused. Moving to the Developer ID changes the identity once: that one update must be downloaded by hand. Earlier notes: | M | On macOS it needs a signed app and a **`zip` target** next to the DMG (Squirrel.Mac installs from the zip). The feed can be GitHub Releases (the repo is public) or your own storage (S3, Cloudflare R2) if you go private |
| 6.2 | Update UX | S–M | Download quietly, then a friendly "Otty has a new version — restart when you're ready" from the otter, never a forced restart mid-answer. A "What's new" card after an update, from CHANGELOG. Never update while a job is running (`JobRunner` knows) |
| 6.3 | Channels | S | `beta` and `stable`. Testers on beta. electron-updater supports channels through the version's pre-release tag (**verify**) |
| 6.4 | Staged rollout and pulling a release | S | Ship to a share of users first, and be able to stop a bad release quickly. With GitHub Releases, unpublishing the release is the stop button |
| 6.5 | Downgrades | S | `db.ts` already throws when `otty.db` is from a newer schema. Check that the user then sees a friendly message ("This chat history is from a newer Otty — please update") rather than a crash, and add a smoke step |
| 6.6 | Electron upgrades | ongoing | Electron releases a major version every 8 weeks and supports only the latest three (**verify**). Electron 45 will be unsupported within months. Budget a small upgrade every couple of months; this is a security requirement, and the reason 6.1 is a beta blocker |
| 6.7 | Versioning | S | `0.5.0` is set by hand. Decide on semver for the app, a single place to bump it, and a release script that bumps, tags and writes release notes from CHANGELOG |
| 6.8 | Release checklist | S | Turn DEVLOG's 127-step smoke test into a short **release gate** (about 20 critical steps on a clean Mac, both architectures, the oldest supported macOS), and keep the long list for big releases |

---

## 7. CI/CD

What exists is good. What's missing:

| # | Item | Size | Notes |
| --- | --- | --- | --- |
| 7.1 | A release workflow | M | On a tag: typecheck, test, build both architectures, sign, notarize, staple, upload DMG and zip and update metadata (`latest-mac.yml`), and publish a draft release. Behind an approval environment (5.6) |
| 7.2 | Split jobs by runner | S | Typecheck and unit tests on Linux (fast, cheap, especially if the repo goes private), build and OCR helper on macOS. Keep the macOS build on PRs that touch packaging (BRAINSTORM already suggests this) |
| 7.3 | Security scanning | S | `npm audit --omit=dev` or similar on the shipped dependencies (only `pdfjs-dist` and `mammoth` are runtime `dependencies`, but everything in the renderer bundle ships too), GitHub's dependency review on PRs, CodeQL or similar for JavaScript. Secret scanning and push protection on the repo |
| 7.4 | Dependabot hygiene | S | PRs 46 (vitest 5) and 50 are open. Group updates and merge regularly; pin GitHub Actions to commit SHAs for the release workflow, since it handles signing secrets |
| 7.5 | Scheduled eval | S | BRAINSTORM already has it: run the injection and safety sets weekly with a capped key, and before each release. Fail the release if the score drops below the baseline |
| 7.6 | Licence check | S | A step that lists the licences of everything shipped and fails on a licence you haven't approved, and writes the third-party notices file (§12.6) |
| 7.7 | An end-to-end smoke | M–L | BRAINSTORM's "Otty test harness". Playwright can launch Electron apps (`_electron`, **verify**) and drive the panel and quick view. Hotkeys and macOS permissions can't run on CI, but launching, onboarding, sending a question to a stubbed provider and reopening a saved chat can. It catches "the packaged app doesn't start", which unit tests can't. **Done (D-47): `npm run smoke`, 130 tests, in CI** |
| 7.8 | Test the packaged app | S | After build, launch the `.app` headless for a few seconds and check it didn't crash (an asar or fuse mistake shows up here). **Done (D-47): `npm run smoke:packaged`, in the dmg workflow** |
| 7.9 | Server CI | M | If you build the hosted service (§9), it needs its own tests, staging environment and deploy pipeline |

---

## 8. Accounts, sign-in and licences

None of this exists. What you need depends on §2.1.

| # | Item | Model | Size | Notes |
| --- | --- | --- | --- | --- |
| 8.1 | Licence key check | A, C (own key) | M | The merchant of record issues keys; Otty activates once online and saves a signed token in the Keychain. **Offline grace** (works for days without the server), a limit on devices, and friendly wording when it fails. Never lock someone out of their saved chats |
| 8.2 | Accounts | B, C | L | Email magic link (no passwords to forget, fits the persona) and Sign in with Apple. Use a managed auth service (Clerk, Supabase Auth, Auth0, WorkOS and similar; **verify** prices) rather than writing your own |
| 8.3 | Sign-in from a desktop app | B, C | M | Open the browser to sign in, and come back to Otty through a custom URL scheme (`otty://`) or a loopback address, with PKCE. Handle `open-url` in main (not there today). Keep the session token in the Keychain via `safeStorage`, like the API keys |
| 8.4 | Account screen | B, C | S–M | In Settings: plan, allowance used this month (reuse the usage meter), manage subscription (link to the merchant's portal), sign out, delete account |
| 8.5 | Account deletion and export | B, C | S | Required by privacy law and expected. Deleting the account deletes server data; local chats stay unless the user also chooses "Forget everything" |
| 8.6 | Trial | all | S | A time-limited or allowance-limited trial with no card, and a gentle, friendly end-of-trial screen from the otter |

---

## 9. The hosted service (models B and C)

The biggest new piece of work. The provider design makes it smaller than it sounds: to the app, the hosted service is one more `Service` preset whose key is the user's session token.

| # | Item | Size | Notes |
| --- | --- | --- | --- |
| 9.1 | An AI proxy | L | Receives Otty's request, checks the session and allowance, forwards it **unchanged** to the provider (the DeepSeek cache depends on byte-for-byte prefixes) and streams the answer back. Serverless or edge platforms (Cloudflare Workers, Fly.io, and similar) handle streaming well (**verify** time limits for long answers) |
| 9.2 | Metering and limits on the server | M | Count tokens from the provider's response, per user per month, and refuse past the plan's cap with a code Otty turns into friendly words (`errors.ts` already maps 402 and 429). The client's monthly limit (D-33) stays as a second line, never the only one |
| 9.3 | No content in logs | S | The server logs ids, sizes, timings and errors, never questions, pictures or answers. Write it as a rule and a test, like `sent.ts` keeps names and counts only |
| 9.4 | Provider accounts | S | Business accounts with each provider, spending limits and alerts, and (where offered) zero data retention or no-training terms (**verify** each). These terms go in your privacy policy |
| 9.5 | Web search | M | Today DeepSeek's search, Claude's web search, or Wikipedia and DuckDuckGo straight from the Mac. Decide whether hosted users' searches go through your server (simpler billing, one more party seeing queries) or stay as now. Search APIs cost per call; count them in the allowance |
| 9.6 | Model routing | M | The server can pick the model per plan (cheap for free, better for paid) and fail over when a provider is down. Keeps Otty working through outages without a new build |
| 9.7 | What left the Mac | S | `sent.ts` and the Activity view must name the hosted service honestly: "your question went to Otty's server, then to DeepSeek". The privacy lines in `services.ts` need a hosted entry |
| 9.8 | Abuse and safety | M | Rate limits per account and IP, blocking obvious misuse, and a way to suspend an account. Check each provider's usage policy, which makes you responsible for your users' use (**verify**) |
| 9.9 | Operations | M | Uptime monitoring, error tracking, cost dashboards and alerts (a day's spend far above normal is the first sign of abuse or a bug), a status page |
| 9.10 | Keys | S | Provider keys only on the server, rotated, never in the app. With hosted mode, a stolen laptop exposes a revocable session token rather than a provider key |

---

## 10. Security hardening

Otty's design is strong. These are the gaps that matter once strangers use it.

| # | Item | Size | Notes |
| --- | --- | --- | --- |
| 10.1 | Electron fuses | S | ✅ Done (D-49). See 5.7. The most important item here, because of the permissions Otty holds |
| 10.2 | No plain-text key fallback | S | ✅ Done (D-51, 2026-11-18): a key isn't saved without the Keychain, and an old plain one moves in. Was: `settings.ts` saves the key base64-encoded but **unencrypted** when `safeStorage` isn't available. On a signed Mac build that should essentially never happen; when it does, refuse to save and say so in friendly words rather than writing the key to `settings.json` |
| 10.3 | Ignore `DEEPSEEK_API_KEY` in the packaged app | S | ✅ Done (D-51). Was: `envKey` reads it in every build. Limit it to `!app.isPackaged` so a production build's key source is only the Keychain |
| 10.4 | Encrypt `otty.db` | M | BRAINSTORM lists it. Memories and saved chats are a record of someone's life, readable by any process running as the user. SQLite encryption with a key in the Keychain (**verify** what `node:sqlite` supports, or encrypt sensitive columns). At least make sure FileVault is mentioned in the privacy page |
| 10.5 | Check IPC inputs | S–M | ✅ Done (D-44, 2026-11-17): every channel is in one table with the views that may use it and a check per argument, and a rule test and a fuzz test keep it so. |
| 10.6 | Red-team before release | M | BRAINSTORM: grow the injection set and run it before each release (7.5). Add cases for pages, files and highlights that try to make Otty send data out or change memory |
| 10.7 | A security policy | S | `SECURITY.md` with how to report a problem privately (GitHub's private vulnerability reporting is free), and a promise on response time |
| 10.8 | Server security | M | If hosted: least-privilege cloud accounts, 2FA everywhere (Apple, GitHub, merchant, cloud, domain registrar, email), secrets in a manager, dependency scanning on the server too |
| 10.9 | Account security for you | S | 2FA on GitHub (who can push to `main`), Apple Developer, the merchant and the domain. A compromised GitHub account could ship a signed malicious update to every user |

---

## 11. Privacy and data protection

Otty's whole pitch is trust, so this has to be excellent, not just compliant.

| # | Item | Size | Notes |
| --- | --- | --- | --- |
| 11.1 | Privacy policy | M | Plain words first, legal detail second. What Otty reads (highlights, snips, frontmost app and page title, files), what leaves the Mac and to whom (each provider, search services, your server if hosted), what's kept on the Mac (`otty.db`, settings, memories), what you collect (account email, billing via the merchant, opt-in diagnostics), retention, rights and contact. Reuse the "What left the Mac" design as its spine |
| 11.2 | Data map | S | One table of every place data goes, kept in `docs/`. It's what the policy, a data protection request or a journalist's question is answered from. `toolSafety.ts` and `sent.ts` already hold most of it |
| 11.3 | Which laws apply | M | First markets are Singapore and Hong Kong, so start with **Singapore's PDPA** (consent and notification, a named data protection contact, access and correction, breach notification, and the transfer limitation obligation for data sent abroad, such as to DeepSeek) and **Hong Kong's PDPO** (the data protection principles, a personal information collection statement at sign-up, and its rules on transfers abroad; **verify** which are in force). GDPR, UK GDPR and US state laws apply if you sell or market to those places later (**verify** with someone local). All of them need a clear purpose, a way to access and delete data, and disclosure of processors |
| 11.4 | Processors and transfers | S–M | Each AI provider, the auth service, the merchant, crash reporting and hosting are processors. Sign their data processing agreements (usually click-through) and list them. Sending EU users' data to the US or China needs a transfer basis (**verify**); this is where the DeepSeek default (§2.2) bites |
| 11.5 | Consent for diagnostics | S | Crash reports and analytics (§14) **off by default**, or a clear first-run choice. Never content, never screenshots |
| 11.6 | Sensitive content | S | Snips can contain passwords, banking and medical details, and other people's messages. The onboarding and the policy should say so, and how the masking (`maskSecrets`) helps but isn't perfect |
| 11.7 | Uninstall and reset | S | A "Delete all Otty data" button and a short uninstall guide (app, `~/Library/Application Support/Otty`, Keychain item, login item). Being easy to leave is part of being trusted |

---

## 12. Legal and compliance

| # | Item | Size | Notes |
| --- | --- | --- | --- |
| 12.1 | A legal entity | M | A company limits personal liability, is needed for an organisation Apple account (5.1) and makes banking and taxes cleaner. Get local advice |
| 12.2 | Terms of service / EULA | M | Licence to use the app, acceptable use (mirroring the AI providers' policies), age (18+ for now, §2.4), **AI disclaimers** (answers can be wrong; not medical, legal or financial advice — important for an app that "explains" things to non-experts), limitation of liability, subscription and refund terms, governing law. Shown and accepted in onboarding, with a version so you can ask again when it changes |
| 12.3 | AI provider terms | S | Check each provider's commercial terms allow serving your end users through your service, and their rules on minors, regions and use cases (**verify** Anthropic, OpenAI, DeepSeek). Some countries can't use some providers |
| 12.4 | AI regulation | S | The EU AI Act's transparency duties (telling people they're dealing with AI) apply from 2026 (**verify** dates and whether Otty is in scope). Otty is obviously an AI, but add a line to onboarding and the terms |
| 12.5 | Trademark and name | M | Search "Otty" in your main markets for software (Nice classes 9 and 42) before spending on the brand. File for the word mark (and possibly the otter logo) once clear |
| 12.6 | Third-party licences | S | Ship an "Acknowledgements" screen or file listing every open-source licence (Electron includes Chromium's; React, mermaid, KaTeX, pdf.js, mammoth, mathjs and others need their notices). **Flaticon UIcons:** the free licence has attribution conditions; check the current terms and either credit them as required or buy the licence that removes it (**verify**) |
| 12.7 | The otter art | S | The art is generated with OpenAI's image model (`tools/otty-art/generate.py`, D-71) and cut by `tools/otty-art/prepare.py`. OpenAI's terms assign the output to the user, but **verify** they allow a commercial mascot before release. In several countries, including the US, purely AI-generated images may not be protected by copyright (**verify**), so others could copy Otty's look. Protect the character with a trademark, and consider having an artist redraw or substantially rework the final mascot so you own it clearly |
| 12.8 | Accessibility law | S | The European Accessibility Act applies to some digital products and services sold to consumers in the EU, with exemptions for very small businesses (**verify** whether it covers Otty). NFR-6 already targets 4.5:1 contrast and keyboard use; an audit before 1.0 is good practice anyway |
| 12.9 | Export rules | S | Otty uses standard encryption (HTTPS, Keychain). For direct distribution there's usually nothing to file, but check if you'll sell to restricted countries; most merchants of record block them for you (**verify**) |

---

## 13. Quality and testing

| # | Item | Size | Notes |
| --- | --- | --- | --- |
| 13.1 | Land the stack | M | ✅ PRs 51–53 merged (2026-11-16), and steps 107–127 run through `npm run smoke` (D-47); the bugs it found are fixed. Left: the ✋ steps on a Mac |
| 13.2 | Feature freeze for the beta | — | D-37 to D-40 and Look after me wait. A beta is for finding problems in what exists, and every new feature is a new thing to support |
| 13.3 | The device matrix | M | Apple Silicon and Intel; the oldest supported macOS (13, NFR-7) through the current one; one and two displays; Spaces and full-screen apps (BRAINSTORM notes); a Chinese input method; dark mode; Retina and non-Retina; a fresh user account with no permissions. Borrow Macs or use testers for the ones you don't have |
| 13.4 | Permission flows on a signed build | S | The single most likely place for a tester to get stuck. Fresh install → onboarding → grant each permission → quit → update → check grants survive. Also: a user who says no to everything still gets a working Otty with friendly guidance |
| 13.5 | Launch at login on the installed app | S | DEVLOG "checks waiting". Only possible after signing |
| 13.6 | Model coverage | S | The eval baseline is on `deepseek-flash`. Run it on every model you'll offer or default to, and record each baseline |
| 13.7 | Long-running stability | S–M | Leave Otty running for days with repeating looks, sleep and wake, network changes and a full disk. Watch memory (NFR-3 notes 150–700 MB, which users will see in Activity Monitor and question) |
| 13.8 | Error paths | S | Every failure ends in friendly words: no network, provider down, out of credit, out of allowance, signed out, licence expired, disk full, `otty.db` from a newer version, OCR helper missing |

---

## 14. Observability and support

You can't see what happens on a tester's Mac today. Errors go to `console.error` (24 places in main) and are lost in a packaged app.

| # | Item | Size | Notes |
| --- | --- | --- | --- |
| 14.1 | Log files | S | ✅ Done (D-50, 2026-11-18): `~/Library/Logs/Otty/otty.log`, masked, rotated at 1 MB, teed from main's console. Planned: `electron-log` or a small writer to `~/Library/Logs/Otty/`, rotated, with **no content**: errors, timings, provider status codes, feature names. Run every line through `maskSecrets` too |
| 14.2 | "Copy diagnostics" / "Send to Otty's team" | S–M | ✅ Copy diagnostics done (D-50): Settings › Help, shown in full before copying. "Send to Otty's team" waits for a support address (14.6). Planned: In Settings → Help: version, macOS, architecture, permissions state (`permissions.ts`), provider kind (not the key), the last log lines. The user sees exactly what's sent before sending — consistent with "What left the Mac", and it should appear there |
| 14.3 | Crash reports | M | Electron's `crashReporter` (not used today) or the Sentry Electron SDK, **opt-in**, with breadcrumbs stripped of content. Main process and renderer crashes, and the OCR helper's failures |
| 14.4 | Product analytics (opt-in, counts only) | M | You'll need to know whether people get through onboarding, whether they come back, and which features they use. The usage meter's per-day counters are already the right shape (counts, no content). Send an aggregated daily summary only with consent, and show it in Activity. Avoid general-purpose analytics SDKs that collect more than you'd want to explain |
| 14.5 | In-app feedback | S | "Tell us what you think" from the otter menu, optionally attaching diagnostics. In a beta this is the most valuable channel you have |
| 14.6 | A support inbox and help pages | S | A support address on your domain, an FAQ (permissions, keys, hotkeys, privacy, uninstall), and a promised response time for testers |
| 14.7 | A beta community | S | A Discord, a mailing list or a simple forum, so testers can see known problems and you can announce builds |

---

## 15. Product and UX gaps

| # | Item | Size | Notes |
| --- | --- | --- | --- |
| 15.1 | The first minute | M | Onboarding today: choose a service, paste a key, test, grant permissions. With hosted AI it becomes: sign in (or skip with a free allowance), grant permissions, try one guided question. Measure every step in the beta (14.4) |
| 15.2 | Finding Otty again | S | `LSUIElement: true` means no Dock icon. If someone hides the bubble, Otty lives only in the menu bar, and new Mac users may think it quit. Make sure reopening the app from Applications brings Otty back visibly, and onboarding shows where the menu bar icon is |
| 15.3 | Plan and limit messages | S | Allowance used up, trial ended, payment failed, signed out: each a friendly otter message with one clear button, never an error code |
| 15.4 | What's new | S | After an update, a short card on what changed (6.2) |
| 15.5 | Help inside the app | S | A "How do I…" page reachable from the otter menu: the three hotkeys, how to snip, how to stop Otty, how to see what was sent |
| 15.6 | Interface language | M | Help answers can be in zh-HK, but is the interface itself? If the beta targets Cantonese speakers, the onboarding, Settings and error messages need translating too, with a way to keep strings in one place |
| 15.7 | Feature count | — | The README lists twenty capabilities. For the persona, that's a lot. Consider surfacing them gradually (try-asking chips already help; BRAINSTORM's feature-teaching idea fits here) |
| 15.8 | Accessibility audit | S–M | VoiceOver through onboarding, the panel and confirm cards; keyboard-only use; reduced motion; text size |

---

## 16. Performance and footprint

| Item | Today | For launch |
| --- | --- | --- |
| Idle CPU | About 0.25% of a core on an M4 (NFR-3), well under budget | Re-measure on an Intel Mac and on the oldest supported macOS |
| Memory | 150–700 MB as read by macOS | Users judge a menu-bar companion by this number. Measure what's using it (several windows, the drawing window, the file worker) and whether hidden windows can be closed rather than kept |
| Download | About 145 MB per architecture | Fine for a beta; trim later (5.11) |
| Startup | Not measured | Time from login to the otter appearing, especially with launch at login |
| Battery | Not measured | A companion that's always on must not show up in macOS's "using significant energy" list. Check after a day on battery |

---

## 17. Brand, website and getting the word out

| # | Item | Size | Notes |
| --- | --- | --- | --- |
| 17.1 | A domain and email | S | Matches the bundle id (5.8) and support address (14.6) |
| 17.2 | A landing page with a waitlist | S–M | One page: the otter, a 30-second video of highlight → explain, the one-sentence pitch, the privacy promise, "join the beta". Collect emails with consent |
| 17.3 | Website pages for launch | M | Download (picks the right architecture), pricing, privacy policy, terms, help, changelog, security, contact |
| 17.4 | Demo assets | S–M | Short screen recordings of the best moments: explain cards, check my writing, a chart from a table, the Activity view. The otter is the hook |
| 17.5 | Launch channels | — | Product Hunt, Mac-focused communities and newsletters, communities of your target users (language learners, people new to computers, Cantonese speakers), and the people who joined the waitlist |
| 17.6 | Social handles | S | Reserve "Otty" names where you'll post, after the trademark search (12.5) |
| 17.7 | A press kit | S | Icon, otter art, screenshots, a short description, your contact |

---

## 18. Running it as a business

| # | Item | Notes |
| --- | --- | --- |
| 18.1 | Entity, bank account, bookkeeping | §12.1. Separate business money from personal from day one |
| 18.2 | Recurring costs | Apple Developer, domain, email, auth service, hosting, crash reporting, AI usage, merchant fees, GitHub Actions if private. Put them in one sheet with the per-user cost (§3.3) so you know the break-even number of paying users |
| 18.3 | Spending limits everywhere | Provider spending caps and alerts, cloud budget alerts. A bug in a repeating look or an abusive account shouldn't be able to run up a large bill overnight |
| 18.4 | An incident plan | One page: a bad update (pull the release, ship a fix through the updater), a leaked provider key (rotate on the server; with model A there's nothing for you to rotate, the user does), a provider outage (fail over, status page), a security report (SECURITY.md process), a data request (who answers, in how long) |
| 18.5 | Continuity | You're a single point of failure. Keep the signing key, domain, Apple and merchant accounts recoverable (2FA recovery codes stored safely), and the docs current enough that someone else could ship a fix |

---

## 19. Checklist by stage

### Stage 1 — Closed beta (10–50 people you know, free)

Goal: find out whether people get through onboarding, come back, and what breaks.

| Priority | Item | Section | Size |
| --- | --- | --- | --- |
| ✅ | Business model (hybrid), default model (DeepSeek), markets (SG, HK) | 2.1, 2.2, 2.4 | — |
| P0 | ✅ Merge PRs 51–53 and run the smoke test (D-47); feature freeze | 13.1, 13.2 | M |
| P0 | Make the repo private: CI split (Linux for typecheck and tests), public storage for update files | 2.6, 7.2, 6.1 | S–M |
| P0 | Change the bundle id to a domain you own | 5.8 | S |
| P0 | Apple Developer account, Developer ID, notarization, sign the OCR helper | 5.1–5.5 | M |
| ✅ | Electron fuses (D-49) | 5.7 | S |
| P0 | Auto-update with a beta channel | 6.1–6.3 | M |
| ✅ | Log files and "Copy diagnostics" (D-50) | 14.1, 14.2 | S–M |
| P0 | A short privacy notice and beta terms (18+, "answers can be wrong", it's a beta) | 11.1, 12.2 | S |
| P0 | A `LICENSE` stating all rights reserved | 2.6 | S |
| P1 | Signed out, offline or server down: AI-free features keep working, never locked out | Decisions | S–M |
| P0 | Permissions on a signed build, launch at login | 13.4, 13.5 | S |
| P1 | Release workflow with signing in CI | 7.1, 5.6 | M |
| P1 | Opt-in crash reports | 14.3 | M |
| P1 | In-app feedback and a beta channel for testers | 14.5, 14.7 | S |
| ✅ | No plain-text key fallback, env key only in dev (D-51) | 10.2, 10.3 | S |
| P1 | Hide local models from onboarding | 2.5 | S |
| P1 | Opt-in, counts-only analytics of onboarding and weekly use, including cost per user and cache hit rate | 14.4, 22.11 | M |
| P1 | Key provision for non-technical testers (a capped key from your account) | 2.1 | S |

### Stage 2 — Paid public beta

Goal: prove people will pay, and what it costs to serve them.

| Priority | Item | Section | Size |
| --- | --- | --- | --- |
| P0 | Unit economics from the closed beta, then prices | 3.3, 3.1, 22.5 | S |
| P0 | Gateway with a key per user, the pool as a cap unit on the server, `shared/plan.ts` entitlements cached offline | 22.4, 22.6, 22.10 (M1) | L |
| P0 | Free (daily), Plus, Own key (yearly), top-ups and Founding member, a reverse trial with its recap; Pro later | 22.7, 22.8, 22.13, 8.6 | M |
| P0 | Merchant of record, refund policy | 3.4 | S–M |
| P0 | Accounts or licence keys (by model) | 8.1–8.6 | M–L |
| P0 | The hosted AI proxy with server-side limits, no content in logs (model B/C) | 9.1–9.4 | L |
| P0 | Full privacy policy, terms, data map, processor agreements | 11.1–11.4, 12.2–12.3 | M |
| P0 | A merchant of record that accepts an individual seller, with SGD and HKD prices | 3.4, Decisions | S |
| P0 | PDPA and PDPO wording: collection statement, data protection contact, transfer to DeepSeek | 11.3 | S–M |
| P0 | Website: download, pricing, privacy, terms, help, contact | 17.3 | M |
| P0 | Support inbox and FAQ | 14.6 | S |
| P1 | Trademark search and filing | 12.5 | M |
| P1 | Third-party notices, Flaticon terms, art licence check | 12.6, 12.7 | S |
| P1 | Friendly plan and limit messages, account screen | 15.3, 8.4 | S–M |
| P1 | Security scanning, licence check, scheduled eval in CI | 7.3, 7.5, 7.6 | S |
| P1 | `SECURITY.md`, 2FA on every account | 10.7, 10.9 | S |
| P1 | Free-plan abuse defences | 3.5 | M |
| P1 | Cost dashboards, spend alerts, status page | 9.9, 18.3 | M |
| P1 | Device matrix testing | 13.3 | M |

### Stage 3 — 1.0

| Priority | Item | Section | Size |
| --- | --- | --- | --- |
| P1 | Encrypt `otty.db` at rest | 10.4 | M |
| P1 | End-to-end test of the packaged app in CI | 7.7, 7.8 | M–L |
| P1 | Staged rollouts | 6.4 | S |
| P1 | Interface translation into zh-HK (Hong Kong is a first market; consider moving this into the paid beta) | 15.6 | M |
| P2 | Form a company and move the Apple account to an organisation | 12.1, 5.1 | M |
| P1 | Accessibility audit | 15.8, 12.8 | S–M |
| P1 | Memory footprint work | 16 | M |
| P1 | Incident plan, continuity | 18.4, 18.5 | S |
| P2 | Setapp, Homebrew cask | 2.3 | S–M |
| P2 | Model routing and failover on the server | 9.6 | M |
| P2 | Regional or student pricing | 3.4 | S |

---

## 20. A suggested first month

1. **Week 1 — land and go private.** Merge the stack, run the smoke test, pick a domain and change the bundle id, enrol in the Apple Developer Program as an individual, add a licence, split CI onto Linux, then make the repo private.
2. **Week 2 — a build strangers can install.** Signing, notarization, fuses, the OCR helper, the zip target and auto-update with a beta channel, then the release workflow.
3. **Week 3 — seeing and supporting.** Logs, Copy diagnostics, opt-in crash reports and counts, in-app feedback, a support address, the beta privacy notice and terms, hide local models.
4. **Week 4 — invite the first testers.** Ten people, including at least three who match the persona and have never made an API key. Watch the first minute with a few of them in person. Measure, fix, then widen.

Run the docs pass at the end of each week, as usual.

---

## 21. Open questions

Settled on 2026-11-16 (see **Decisions so far**): hybrid model, DeepSeek default, Singapore and Hong Kong first, private repo, individual for now, AI-free features free forever.

Still open:
- How big is the free tier's hosted allowance, and what do the paid and own-key plans cost in SGD and HKD? (Starting points in 22.7; needs the closed beta's numbers, §3.3 and 22.5.)
- Founding member: how many places, and does it need a cap at all?
- Model weights in the pool (22.4): are Careful and Deepest labels enough, or do people need the estimate per model?
- Can OpenRouter's per-user key limits reset monthly, and which data-retention filter does Otty require (22.6)?
- Does the own-key plan include every feature, or leave some for the full plan?
- What revenue or risk level makes you form a company?
- Which merchant of record accepts an individual seller in your country and pays out there?
- Should the hosted service ever route Hong Kong users to Claude or OpenAI, given their supported regions?
- Students: when, if ever, does Otty serve under-18s?
- Does the mascot need redrawing by an artist before the brand is filed?
- Connections (D-54): a Google Cloud OAuth client for Google Calendar, and whether to go through Google's verification for a sensitive scope before the beta or stay in testing mode with named testers (**verify** the limits). For Canvas at NUS, whether students may make their own tokens (**verify**). Tokens stay on the Mac by default; does the hosted service ever need one?

---

## 22. Monetisation roadmap

How Otty goes from free to paid without VC money, built on the decisions above (hybrid plans, everyone signs in, AI-free features free forever, DeepSeek default, Singapore and Hong Kong first). §3 is the sketch; this is the plan. Revised 2026-11-26: a usage pool priced in cost instead of a fixed number of questions, a gateway for many models, higher prices, the onboarding and conversion flow, and the moat.

Market and model prices were checked on 2026-11-26 from public pricing pages and trackers. Trackers often disagree, and many of these companies changed plans in 2026, so every figure is **verify** before it goes on a pricing page.

**The one constraint behind every choice here: no plan may lose money on its heaviest user.** A funded company can subsidise inference to win users; a bootstrapped one can't, so a margin floor is built into how the pool works (22.4), not hoped for.

### 22.1 What the market charges

| Product | Model | Prices (USD unless stated) | What to learn from it |
| --- | --- | --- | --- |
| ChatGPT | Free and Go with ads being tested, then tiers | Go about S$11/month in Singapore; Plus about S$30; Pro from $100 | S$11 is the anchor most SG users have in mind. Ads on Free and Go are a contrast Otty can draw: no ads, ever |
| Claude | Subscription by usage multiple | Pro $20 ($17 yearly); Max $100 and $200 (reports say renamed Max and Ultra) | Plans named by how much you get. These are subsidised: Otty can't match their frontier-model volume at their price |
| Google AI Plus / Pro | Bundle with storage | AI Plus S$10.98/month at SG launch; US price reportedly down to $4.99. SG students get AI Pro free for a year | Bundles make AI feel free. Students in Otty's first market have a free alternative |
| Perplexity | Subscription | Pro $20; Max $200 | The $20 slot is crowded |
| Meta Muse | Free plus paid | Free, $20 and $100 (US only) | Can't be beaten on price at the bottom |
| Raycast | Mac app, **credits** | Pro $10 (500 credits); Pro+ $20 (3,000); Max $50 (7,500). AI stops at zero from 2026-12-17 | Closest Mac comparison, and it moved from rate limits to a usage pool for the same reason Otty must. Users were upset (German Mac press covered it), mostly because AI *stops* and because credits are abstract |
| Cursor | Pool in dollars | Pro $20 with $20 of usage; Pro+ $60; Ultra $200 | Its 2025 switch to usage pricing caused unexpected charges, an apology and refunds. Lesson: never surprise anyone with a bill, show the pool before it's spent |
| Grammarly | Writing subscription | Pro $12/month yearly, $30 monthly | People already pay real money for writing help. "Check my writing" is a proven paid category |
| Setapp | Bundle, AI credits on every plan | Mac $14.99/month; developers share a usage pool | A second channel later (§2.3) |
| Superwhisper | Mac utility, freemium | Pro $8.49/month, $84.99/year, lifetime $249.99 | Single-purpose Mac AI clears under $10 a month |
| BoltAI / TypingMind | Bring your own key, one-time | BoltAI lifetime $239; TypingMind $39 | Power users pay once for a good native client |
| Replika | Companion | $7.99–$14.99/month, mostly sold yearly | People pay for a relationship with a character |

### 22.2 What people pay for (sentiment and surveys)

| Finding | Source | What it means for Otty |
| --- | --- | --- |
| Only about 3% of US households pay for AI (median $20/month); people pay when AI saves time, simplifies decisions or combines tasks | Bank of America, 2026 | Sell time saved in the app you're already in, not "AI". One place instead of switching to a chat window |
| Users who connect AI to their own data convert to paid at about 3× the rate of basic users | Recon Analytics, 120,000+ respondents | Connections (D-54: Calendar, Canvas), memory and repeating looks are the paid engine, not more questions |
| 54% think AI pricing is becoming "a rip-off"; 56% can't afford all the tools they want | Bango (vendor survey) | One simple plan beats a menu. A visible pool and no surprise charges |
| Memory across sessions is the most wanted feature; privacy is the most raised worry | Reddit roundups (secondary) | Otty's memory is local, inspectable and undoable: the feature people want, without the worry |
| 70% of Singaporeans doubt companies will protect their data (62% globally); privacy and misuse top concerns in Hong Kong | EY 2026; KPMG and GS1 HK | The trust design isn't a nice extra in SG and HK, it's the pitch |
| Apple Intelligence sees weak engagement; Writing Tools fall short for serious writers | TidBITS | The free OS features don't close the gap Otty fills (explaining why, in any app) |
| Freemium converts about 3–5% (good) to 8–12% (great); reverse trials land in the same range, with too small a sample to call a winner | ChartMogul 2026 (mostly B2B) | Plan on a few percent of free users paying. Test a reverse trial, but don't expect magic |

### 22.3 The moat

Being honest about what isn't one: **the models** (anyone can call them, and the gateway in 22.6 makes that even easier) and **any single feature** (a competent team copies a feature quickly). What compounds:

| Moat | Why it holds | How to deepen it |
| --- | --- | --- |
| **What Otty knows about you, kept on your Mac** | Memories, saved chats, habits, Pebbles and repeating looks grow every week. Moving to another app means starting over | Weekly recap on Home ("this week I explained 14 terms…"); Connections; memory that feels earned. Keep export: being free to leave is part of the trust |
| **Trust you can check** | The ledger, Undo, What left the Mac, Rule of Two and confirm cards are architecture, not settings. Cloud and ad-funded assistants can't retrofit "everything stays inspectable on your Mac" | Lead the marketing with it in SG and HK (22.2). A public security page and red-team results |
| **At the cursor, in every app** | Accessibility, OCR and Apple Events outside the App Store sandbox. Store apps can't; Apple moves slowly and only in its own apps | Polish the quick view until it's faster than switching windows |
| **The otter** | People pay for characters (Replika). A pet in a place isn't a chat box with a face | Trademark (12.5), artist-owned art (12.7), moods tied to real use |
| **Local fit** | Cantonese and zh-HK, SGD and HKD prices, support in the same time zone. The giants treat SG and HK as afterthoughts | zh-HK interface (15.6) in the paid beta, not 1.0 |

The weak point is **distribution**: the giants are already installed. The moat only works once people try Otty, which is why 22.8 matters as much as the price.

### 22.4 Recommendation: a usage pool priced in cost, shown in plain words

**Yes, use a pool.** A fixed number of questions only works when every question costs about the same. With several models it doesn't: on the numbers in 22.5, one Fable answer costs as much as 100 or more quick ones. A question count either starves the cheap models or loses money on the expensive ones.

How it works:

1. **Inside, the pool is money.** Each plan gets a monthly budget in US dollars of model and search cost. Every request is charged its real cost, read from the gateway's usage accounting (22.6), at a dated price table. Nothing is estimated.
2. **The pool is sized from the price, so the margin can't go negative:** `pool ≈ 40% of the yearly plan's monthly net revenue`, after Singapore's GST, payment fees and refunds (the yearly plan is the lowest revenue per month, so it sets the size). A user who spends all of it still leaves about 50% gross margin; a typical user leaves about 80% (22.13). This is the bootstrapping guarantee.
3. **Outside, nobody sees dollars, tokens or credits.** Settings shows a gauge ("62% left this month") and a plain estimate in the user's usual kind of question ("about 400 everyday questions, or 18 careful ones"). Each model has a friendly weight label: *Quick*, *Careful* (about 20× quick), *Deepest* (about 40–100×). This keeps the CLAUDE.md rule that money is never shown without a dated price table.
4. **When the pool runs out, Otty doesn't stop.** It keeps answering on the Quick model at the Free plan's rate, tells the user once in friendly words, and offers a top-up or the next plan. This is the difference from Raycast's "AI stops at zero" that upset people, and it costs almost nothing (22.5).
5. **Safety rails stay in code:** a per-hour rate limit against abuse, the monthly limit (D-33) for background work, and the near-limit heads-up (D-57) at 80%.
6. **No rollover, monthly reset, top-ups expire with the plan's year.** Simple to explain, and it stops one cheap month funding a heavy one.

The existing code is most of it: `shared/cap.ts` (limit, near, passed), the usage meter's per-request counts, `errors.ts` mapping 402 and 429. The pool becomes a third `MonthlyCap` unit next to `questions` and `tokens`, enforced on the server and mirrored on the Mac.

### 22.5 What a question costs, by model

Illustrative highlight question: 8,000 input tokens, 6,000 of them a cache hit (the byte-for-byte prefix, `llm.test.ts`), and 600 output tokens, or 2,000 when the model thinks. Cache writes (Anthropic bills them at about 1.25×), pictures and searches are extra.

| Model | Price per million: in / cache read / out | Everyday (600 out) | Thinking (2,000 out) | Weight vs Quick |
| --- | --- | --- | --- | --- |
| DeepSeek V4-Flash | $0.14 / $0.0028 / $0.28 | $0.0005 | $0.0009 | 1 (Quick) |
| Claude Haiku 5.5 | $0.10 / about $0.01 / $0.50 | $0.0006 | $0.0013 | 1 (Quick) |
| GPT-5 (reported) | $1.25 / $0.125 / $10 | $0.009 | $0.023 | about 20 |
| Claude Sonnet 5.5 | $2 / $0.10 / $10 | $0.011 | $0.025 | about 20 (Careful) |
| Claude Opus 5.5 | $4 / $0.20 / $20 | $0.021 | $0.049 | about 45 (Deepest) |
| Claude Fable 5.2 | $8 / $0.20 / $40 | $0.041 | $0.097 | about 100 (Deepest+) |

Claude prices are Anthropic's first-party list prices; DeepSeek's are from its pricing page, and InfoWorld reported in 2026 that some V4 prices rose by more than ten times under demand. GPT-5's are from trackers, and GPT-5.5 is reported at roughly double. All **verify**.

What this means:
- **Quick models are nearly free to serve.** A Free user's 10 quick questions a day cost at most about $0.15 a month. That's why the free plan can be generous and why "never locked out" (22.4, point 4) is affordable.
- **Frontier models are the whole risk.** A Plus pool spent only on Opus is about 60 answers. That's fine for "a careful answer when it matters", and wrong for someone who wants Claude all day.
- **Heavy frontier users belong on Own key.** Claude Pro and ChatGPT Plus are subsidised by funded companies; Otty can't match their volume at their price and shouldn't try. Own key, including an OpenRouter or Anthropic key, gives those users every Otty feature at a price that's almost pure margin.
- Measure the real sizes in the closed beta: pictures (snips are far larger than highlights), tool loops with searches and pages, explain-card warm-ups and titles, and background looks. The usage meter already counts `requests`, `input`, `output`, `cached`, `searches`, `pages` and `jobs` per day.

### 22.6 The gateway: OpenRouter

A gateway gives one integration, many models, one bill and one place that reports cost per request. For a solo developer that's a real saving.

| | Detail | What to do |
| --- | --- | --- |
| **Cost** | No markup on tokens; 5.5% on credit purchases ($0.80 minimum on card), 5% with crypto; BYOK free for the first $25,000 a month of list-price usage, then 5% | Negligible next to payment fees: about $0.20 on a $4 Plus pool |
| **Fits the code** | Speaks OpenAI's API format, which `providers/openai.ts` already sends, through `send` in `net.ts` | The hosted service is a new preset in `services.ts`, not a new adapter. Claude-only fields (`claudeExtras`) and Claude's own web search may not pass through: check, and keep Otty's own search tools as the default for hosted users |
| **DeepSeek's cache** | OpenRouter routes each model to one of several hosts. It keeps a conversation on one host ("sticky routing", keyed by `session_id`, else `prompt_cache_key`; it expires after 60 minutes idle and is skipped when you set `provider.order`) | Send the chat's thread id as `session_id`. Re-run the cache test against the gateway and watch the `cached` count in the beta: a lower hit rate multiplies cost |
| **Where data goes** | One more company sees every question, and each request may go to a different host, some outside China | Name it honestly in What left the Mac ("Otty's service, then OpenRouter, then DeepSeek") and in the privacy policy. Use its data-retention filters to allow only hosts that don't keep or train on prompts (**verify** the option). This can also answer §2.2: the same DeepSeek model from a host outside China |
| **Regions** | OpenAI's and Anthropic's own region rules apply through a gateway too | Check what Hong Kong users can reach before offering Careful and Deepest there (Decisions) |
| **Keys** | The gateway key must never ship in the app | Two ways, below |

**Two ways to wire it**, smallest first:

- **M1-lite: a key per user.** OpenRouter can create API keys through its API with a spending limit on each (**verify** that limits can reset monthly). A small server signs the user in, creates their key with the plan's pool as its limit, and hands it to the Mac's Keychain; Otty calls OpenRouter directly. No streaming proxy to run, and a stolen key is capped and revocable. Downsides: OpenRouter sees each user's key separately, the pool is enforced by OpenRouter rather than by you, and you can't change a request on the way (which suits the cache rule anyway).
- **M1-full: your own proxy** (9.1) in front of the gateway: one gateway key on the server, metering and pool in your database, routing and failover yours. More work (L), more control. Move to it when M1-lite's limits bite.

Start with M1-lite, keep the gateway behind Otty's own service name so it can be swapped for direct provider accounts later (cheaper at scale, with each provider's own data terms) without a new build.

### 22.7 Plans and prices (revised after the margin check in 22.13)

SGD first; HKD at about 5.8× rounded to local price points. SGD prices include Singapore's 9% GST, which the merchant of record collects; Hong Kong has none. "Pool" is the monthly cost budget (22.4), never shown in dollars.

| Plan | Monthly | Yearly | What it gives | For |
| --- | --- | --- | --- | --- |
| **Free** | — | — | The whole of Otty in small doses (22.14): 10 quick questions a day (resets daily), explain cards and memory without counting, **one repeating look** (up to weekly, on the quick model), **one Connection**, 3 careful answers a month, every AI-free feature unlimited. An internal cost cap of $0.20 a month per user: past it Free slows, it never costs more | Everyone, after the trial |
| **Reverse trial** | — | — | 14 days of Plus for every new account, with a $0.75 trial pool | Showing the proactive features once |
| **Plus** | S$14.90 / HK$88 | S$129 / HK$768 (about 28% off) | $3 pool: quick answers that feel unlimited, about 120 careful or 60 deepest; background looks, three repeating looks at once (`LIMITS.series`), every Connection, drawings and slides | The persona |
| **Own key** | — | S$69 / HK$398, yearly only | Every Plus feature with your own key (DeepSeek, Claude, OpenAI, OpenRouter, custom) | Power users and the privacy-minded |
| **Top-up** | S$7.90 / HK$45 | — | +$1.50 to this month's pool, about 60 careful answers | Anyone past their pool |
| **Founding member** | — | S$99 / HK$588 for the first year, held while it doesn't lapse; first 200 places | Plus | Waitlist and closed-beta testers |
| **Pro** (designed, not launched) | S$34.90 / HK$198 | S$329 / HK$1,888 | $8 pool (about 320 careful or 160 deepest), Careful as the default, more repeating looks at once, bigger files | Launch only when top-ups show the demand (22.13) |

What changed from the first revision, and why (details in 22.13):
- **GST.** The first draft forgot it. It takes 8% of every SGD price and pushed yearly plans below the margin floor, so the Plus pool is $3, not $4.
- **Free is daily, not monthly.** 150 a month ran out mid-month for exactly the people most likely to pay, and looked stingy next to ChatGPT's free text chat. Ten a day is fairer, builds a habit, and costs no more.
- **Free gets one of each power.** A Free tier that only answers questions looks like ChatGPT at the cursor and gives nobody a reason to come back. One repeating look and one Connection cost about $0.02 a month on the quick model and keep the habit going (22.14).
- **Plus yearly is S$129** (S$10.75 a month), just under ChatGPT Go and Google AI Plus. Two kinds of buyer, both pushing the price down. People who already pay for an AI would be adding a second, and only 13% of AI payers pay for another AI tool (a16z, 2026). Most of the persona pays for no AI at all (about 4.5% of consumers pay, same source), so their comparison is free ChatGPT, not ChatGPT Plus. Either way, the price has to feel small next to "free is good enough".
- **Top-up is S$7.90.** The payment fee's fixed $0.50 made the S$4.90 top-up a 28% margin.
- **Own key is yearly only.** Monthly, payment fees took about 17% of a S$6.90 charge.
- **Pro waits.** It gave the same pool per dollar as Plus, and power users compare it with subsidised Claude Pro and ChatGPT Plus. Launch it once top-ups prove the demand.

### 22.8 Onboarding and conversion

The goal: **an answer at the cursor in the user's own app within the first few minutes**, with nothing asked of them that isn't needed yet.

**The first minutes, for everyone:**

| Step | What happens | Why |
| --- | --- | --- |
| 1. Hello | The otter, one line on what Otty does, and where it lives (menu bar, the bubble) | People new to Macs think a menu-bar app quit (15.2) |
| 2. Value before anything is asked | Inside the onboarding window, a sample picture with words: "pick up the text" works at once, on the Mac, no sign-in (AI-free, free forever) | First success in seconds, and a quiet proof that some of Otty never leaves the Mac |
| 3. One-tap sign-in | Sign in with Apple, or an email link. Never a password, never an API key (Decisions: everyone signs in) | The key wall is what loses the persona today (§0) |
| 4. A live answer on a sample | A short paragraph with a hard term; the user highlights it in the onboarding window and gets a live explain card. Pick the sample from step 5's answer | The core idea lands before any macOS permission dialog |
| 5. What do you mostly do? | Study, work, reading in another language, helping family. Sets the home language (zh-HK first for HK) and the try-asking chips | Personal from the first minute; feeds the recap later |
| 6. Now in your own app | Ask for Accessibility only now, with a picture of what to switch on, then "highlight anything in Safari and press ⌥Space". Screen Recording is asked the first time they snip, not here | Permission requests that come with a reason convert far better than a wall of them |
| 7. The first look, and the trial | Set up one repeating look that fits step 5 (a Monday look at the week's deadlines for students). It stays on Free after the trial. Then: "You've got Plus free for 14 days: try a second look, or a careful answer." | Otty coming back by itself is what makes it more than a chat box, so every user gets it (22.14) |

**Power users** skip the tour from step 1 ("I know what I'm doing"): change the hotkeys, paste their own key (straight to the Own key trial), choose a model. Never hide the own-key path, and never make it the default.

**Conversion moments**, each from the otter, in friendly words, once, with one button; never a pop-up at launch:

| Moment | What Otty says | Code it builds on |
| --- | --- | --- |
| End of the reverse trial | A recap of what Plus did: "I explained 23 terms, checked 9 pieces of writing, and ran your Monday look twice." Then: keep Plus, or carry on free | Usage meter, Logbook, Home |
| The trial ends with more than one repeating look | "I'll keep your Monday look going. Your other two are paused: keep them with Plus?" The user picks which one stays; nothing disappears | `JobRunner`, `shared/repeat.ts` |
| Pool at 80% | The heads-up, with Plus or a top-up | `nearCap` (D-57) |
| Pool used up | "I'll keep answering with my quick brain. Want the careful one back?" | 22.4, point 4 |
| A Careful answer on Free | After one of the 3 free careful answers: "That was my careful brain. Plus gets plenty of those." | Model weights (22.4) |
| A weekly recap on Home | Value receipts for free users too, so the upgrade has evidence behind it | Home (D-66) |
| A Connection is added | Connected users convert at about 3× (22.2); Connections and their repeating looks are Plus | D-54 |

**Measure in the beta:** reaching step 6 (an answer in another app) inside the first session, day-1 and day-7 return, trial-to-paid, free-to-paid, and where people stop in onboarding. Too few testers for statistics, so watch several first sessions in person (§20) and treat numbers as direction.

### 22.9 What the beta and the launch focus on

From 22.2 and 22.3, in order. These are what the website, the onboarding and the demo video show; everything else stays in the app but out of the pitch (2.5).

| # | Feature | Why people pay | Plan |
| --- | --- | --- | --- |
| 1 | **Ask at the cursor** (highlight, snip, whole screen) with explain cards | Time saved in the app you're in; the thing nobody else does in every app | Free (volume), Plus (plenty) |
| 2 | **Check my writing**, with the why | A category people already pay $12–30 a month for | Free (volume), Plus |
| 3 | **Looks Otty does for you** (background and repeating, Home's Needs you) and **Connections** | Proactive work on your own data converts best | Free: one of each; Plus: more |
| 4 | **Memory you can see and undo** | The most wanted feature, without the privacy worry | Free: it's the relationship |
| 5 | **Careful and Deepest answers** | The best models when it matters, no key needed | Plus (some), top-ups, Pro later |
| 6 | **What left the Mac, Undo, no ads** | The reason to choose Otty in SG and HK; never a paid feature | Free |

Out of the pitch for the beta: drawings, slides and charts (keep, call them Labs), local models, step cards beyond the basics.

### 22.10 The roadmap

| Phase | Goal | Work | Size | Exit when |
| --- | --- | --- | --- | --- |
| **M0. Closed beta, free** | Learn usage and whether people come back | Opt-in counts-only analytics (14.4) including cost per request and cache hit rate; a capped key for testers (2.1); the onboarding in 22.8 with BYOK until M1 lands; a waitlist; an exit question on price | M | Real cost per user per model, and retention for people who match the persona |
| **M1. Plumbing** | Make plans real before any price is shown | Accounts and sign-in (8.2, 8.3); the gateway with keys per user (22.6, M1-lite); the pool as a `MonthlyCap` unit enforced on the server and mirrored on the Mac; the hosted preset in `services.ts` with an honest privacy line and a `SentTag` (9.7); a pure `shared/plan.ts` like `shared/cap.ts`, so Settings, `JobRunner` and the health banner agree; signed entitlements cached in the Keychain so offline never locks anyone out | L | A tester signs in, spends a Free pool, runs out, keeps getting quick answers, and nothing is lost |
| **M2. Paid beta** | Prove people pay | Merchant of record with SGD and HKD and an individual seller (3.4, Decisions); checkout in the browser and back through `otty://`; the account screen with the gauge (8.4); Free, Plus, Own key, top-ups and Founding member (Pro later, 22.13); the reverse trial and its recap; refund window (**verify** SG and HK rules); free-plan abuse defences (3.5) | M–L | Paying users, a known conversion rate, refund rate and cost per user |
| **M3. Tune** | Find the right numbers | One change at a time: pool sizes, model weights, trial length, the yearly discount. Grandfather every subscriber on a price change and announce it early | S per change | Margin floor holds and conversion is stable for a full billing cycle |
| **M4. 1.0 and beyond** | Grow without hurting trust | Own proxy if M1-lite's limits bite (22.6, M1-full); direct provider accounts when volume makes the gateway fee matter; family plan (one payer, separate accounts); student pricing; Setapp; team and education plans after the company exists (12.1) | M each | — |

### 22.11 Numbers to watch

| Metric | Target or use | Source |
| --- | --- | --- |
| Answer in another app during the first session | The activation number; the onboarding exists to raise it | Onboarding counts (14.4) |
| Day-7 and week-4 return | People pay for what they still use a month later | Daily active counts |
| Trial to paid, free to paid | Plan on a few percent free to paid (22.2) | Merchant plus accounts |
| Pool used, median and 95th percentile, per plan | Should sit well under 100% for the median; resize pools from this | Gateway usage |
| Gross margin per plan | At least 50% at full pool use, 70%+ typical | Revenue minus fees, pool spend, hosting (18.2) |
| Cache hit rate through the gateway | Falls → cost rises; check sticky routing | `cached` against `input` |
| Top-up buyers | Many → pools too small or weights wrong | Merchant |
| Refunds and churn reasons | What the price or the product is missing | Merchant, exit question |

### 22.12 Risks

- **Provider price shocks.** Prices are read per request and pools are in dollars, so a rise shrinks the gauge instead of the margin. Raise weights or switch hosts on the server; tell users plainly if their everyday estimate drops.
- **The pool feeling like credits.** The gauge, the plain estimate and "never stops, just slows" are there to prevent it. If testers still talk about credits, simplify further.
- **The gateway as a dependency and a data processor.** Keep it behind Otty's service name, so it can be replaced; list it in the privacy policy and in What left the Mac.
- **Frontier-heavy users on Plus.** The pool caps them; top-ups and Own key are their homes until Pro launches (22.13).
- **Free giants and subsidised frontier plans.** Don't compete on volume or price; sell 22.3.
- **Hong Kong and providers' supported regions** (Decisions). Quick models for HK users until Claude and OpenAI terms are checked.
- **Changing prices later.** Raycast's and Cursor's 2025–2026 changes are the warning: announce early, explain plainly, keep existing subscribers' terms.
- **Charging as an individual.** Personal liability and the merchant's seller rules (Decisions, 12.1). Revisit forming a company before revenue is meaningful.

### 22.13 Pricing check: satisfaction, scarcity and margin

The question: does each tier satisfy the people on it, leave enough scarcity that the right people upgrade, and keep the business solvent without outside money? The numbers come from a small model with these assumptions, each to replace with beta data:

- S$1 = US$0.77, HK$1 = US$0.128 (**verify**).
- SGD prices include 9% GST; the merchant takes 5% + $0.50 per payment; refunds and chargebacks 2%.
- Gateway fee 5.5% on pool spend; sign-in, hosting and logs $0.15 per paying user a month.
- A typical payer uses 25% of their pool, a heavy one 100%. Consumer AI spend is very concentrated: in a16z's 2026 panel the top 1% of payers averaged about $903 a month against a median of $25. The cap is what makes that survivable.
- An active Free user costs about $0.10 a month: about 3 quick questions a day, one careful answer, and one weekly look plus Connection questions on the quick model (about $0.02).

**1. Each plan on its own (US$ per subscriber per month)**

| Plan | Market | Revenue after tax | Net after fees and refunds | Profit, typical use | Profit, full pool |
| --- | --- | --- | --- | --- | --- |
| Plus monthly | SG | $10.53 | $9.22 | $8.28 (79%) | $5.91 (56%) |
| Plus monthly | HK | $11.26 | $9.98 | $9.03 (80%) | $6.66 (59%) |
| Plus yearly | SG | $7.59 | $6.97 | $6.03 (79%) | $3.66 (48%) |
| Plus yearly | HK | $8.19 | $7.58 | $6.64 (81%) | $4.26 (52%) |
| Own key yearly | SG | $4.06 | $3.71 | $3.56 (88%) | $3.56 (88%) |
| Founding yearly | SG | $5.83 | $5.34 | $4.40 (76%) | $2.03 (35%) |
| Top-up (one-off) | SG | $5.58 | $4.65 | — | $2.92 (52%) |
| Pro yearly (later) | SG | $19.37 | $17.85 | $15.59 (80%) | $9.26 (48%) |

Every plan stays profitable when its pool is fully spent. The weakest is Founding member at full use (35%), which is why its places are capped: early adopters use more than most.

**2. The free tier is the real cost.** Each payer carries the active Free users around them, plus the reverse trial they came through. With 75% of payers on Plus (half yearly) and 25% on Own key, a payer contributes $6.26 a month before that subsidy:

| Free to paid | Active Free users per payer | Free cost per payer | Trial cost per payer (over 12 months) | Left per payer | Payers to cover about $60 a month of fixed costs | Payers to also pay you about US$3,850 (S$5,000) a month |
| --- | --- | --- | --- | --- | --- | --- |
| 2% | 49 | $5.10 | $1.15 | about $0 | — | not reachable |
| 4% | 24 | $2.50 | $0.58 | $3.19 | 19 | 1,227 (about 31,000 active users) |
| 8% | 12 | $1.20 | $0.29 | $4.78 | 13 | 819 (about 10,000 active users) |

Fixed costs are a rough guess: the Apple Developer fee, domain and email, a small server, and macOS CI minutes for a private repository (**verify** each; sign-in and crash reporting fit free tiers at beta scale).

What this says:
- **Covering costs is easy; paying yourself is hard.** About twenty paying users cover the running costs. A salary needs over a thousand, and tens of thousands of active users at a typical conversion rate.
- **Conversion matters more than price.** At 2% conversion the free tier eats everything. Moving conversion from 2% to 4% does more than any price change, which is why the onboarding (22.8) and the conversion moments carry as much weight as the price list.
- **Free must stay cheap to serve, never generous with expensive models.** Three careful answers, not five. Quick answers on whichever of DeepSeek V4-Flash and Claude Haiku 5.5 is cheaper that month (two suppliers at about the same price is the hedge). The $0.20 internal cap per Free user is not optional.
- **A price shock hits Free first.** If quick-model prices rose ten times, the Free subsidy at 4% conversion would be about $20 per payer: a loss. Paid plans would only see a smaller gauge, because their pools are in dollars. Have the plan ready: Free slows to fewer questions a day before it costs more, and the gateway moves to the other supplier.
- **Paid acquisition doesn't pay.** LTV = profit per payer ÷ monthly churn. Assuming 7% monthly churn (an assumption, not researched; measure it), $3.67 a month is a lifetime of about $52 per payer. That leaves little room for ads, so growth has to be organic: the waitlist, Product Hunt, communities in SG and HK, word of mouth from the otter, and later a family plan that lets people invite each other.
- **Yearly plans help cash flow.** S$129 up front is about $85 in hand on day one, against costs that arrive monthly and are capped. For a business with no outside money, that up-front cash pays for the next build. Default checkout to yearly, and keep monthly as the low-commitment way in.
- **Ads would fix the free subsidy and break the brand.** ChatGPT is testing ads on Free and Go; Otty's answer is "never". Keep it.

**3. Is each tier satisfied?**

| Tier | Who's on it | What they get | Where it pinches | Verdict |
| --- | --- | --- | --- | --- |
| Free | People trying Otty, light users, people who mostly want pick up text and math | 10 quick a day, one repeating look, one Connection, every AI-free feature | A daily user asking more than ten times a day; anyone who wants a second look or Connection | Satisfying for light use. Tighter than ChatGPT's free text chat on a pure count, but Otty is at the cursor and the AI-free features are unlimited. The pinch lands on the heaviest free users, who are the best upgrade candidates |
| Plus | The persona | Quick answers that never feel counted, about 4 careful a day, all proactive features | Someone who makes Careful their default | Very satisfying if Quick is the default and Careful is chosen when it matters. Check in the beta how often people pick Careful |
| Own key | Power users | Everything, on their own bill | Nothing from Otty; their own provider's limits | Satisfying and profitable. Not for the persona, and never the default path |
| Pro (later) | Frontier-heavy users | About 320 careful a month | Compared with subsidised Claude Pro or ChatGPT Plus, it gives less frontier volume for more money | Not yet: it would disappoint the people it's for. Point them to Own key until it has more than pool to offer |

**4. Is there enough scarcity to upgrade?** Good scarcity is felt only by the people with the most reason to pay, and is invisible to everyone else. Fence the value, not the volume:

- **Free to Plus:** three fences, each aimed at a different group. The daily cap catches daily users. A second repeating look or Connection catches people Otty already works for, and users who connect their own data convert at about 3× (22.2). These are fences on how many, not on whether: every Free user has felt the feature first. Careful answers catch people who saw the difference. The reverse trial shows all three once, so losing them is felt. All three are already in the conversion moments (22.8).
- **The richer Free tier is a bet on conversion.** Its one look and one Connection add about $0.02 per active Free user. That pays for itself if conversion is about 4.75% instead of 4% (22.14), which is plausible if those features keep people from drifting away after the trial. Measure both arms in the beta if numbers allow; otherwise watch week-4 return.
- **Plus to more:** top-ups first. They're the price discovery for Pro. **Launch Pro when about 15% of Plus users buy a top-up in a month, or the same users top up three months running.** Then Pro needs more than pool: Careful as the default, more repeating looks at once (`LIMITS.series`), bigger file budgets, and more pool per dollar than Plus (the $8 pool is about 5% more on yearly plans and 14% more on monthly), so upgrading is clearly better than topping up.
- **The ladder to show at checkout:** Plus yearly in the middle and highlighted, Plus monthly on one side, Own key behind "I have my own key". Two choices for the persona, not five. 54% of AI subscribers in one survey (Bango) say AI pricing is becoming a rip-off; a short list helps.

**5. What would change the answer**

| If the beta shows | Then |
| --- | --- |
| Free to paid under 3% | Tighten Free (8 a day), make the trial recap stronger, and move Connections earlier in onboarding. Don't drop the Plus price: margin isn't the problem, conversion is |
| Median Plus user above 50% of the pool | Raise Plus to S$16.90, or make Quick models do more of the work (routing, 9.6) |
| Cache hit rate through the gateway under 60% | Quick-question cost roughly doubles: fix sticky routing before anything else (22.6) |
| Own key above 40% of payers | Fine for margin. It means the audience is more technical than the persona, so check who is signing up |
| Monthly churn above 10% | The product isn't sticky enough yet; no price fixes that. Look at week-4 return and the recap |

**Verdict.** On its own, every paid plan is healthy: about 80% margin for a typical user, and positive even when someone spends their whole pool. The risk is not the price list. It's the ratio of free to paying users, and quick-model prices that two suppliers can hedge. With the changes in 22.7, a daily Free tier, the reverse trial and Pro held back, the tiers balance satisfaction and scarcity reasonably well. Whether the business works now depends on conversion and retention, which only the beta can measure.

### 22.14 A Free tier that hooks

A Free tier that only answers questions shows the least special part of Otty: on its own, that's "ChatGPT at the cursor". The things nobody else has are the relationship, the trust, and Otty coming back to you. A free user should feel all of them. The paid tiers then sell **more**, not **access**.

The habit loop (trigger, action, reward, investment, from Nir Eyal's *Hooked*), mapped to what Otty already has:

| Step | What it is in Otty | Cost to serve | On Free? |
| --- | --- | --- | --- |
| Trigger from outside | A repeating look's result waiting on Home; the bubble's moods (sleepy, hungry, munch, D-38); the weekly recap | A weekly look on the quick model: about $0.01 a month. Moods and recap: nothing | Yes: one look, moods, recap |
| Trigger from inside | "I don't get this word", "is this email OK?" at the cursor, in any app | Quick answers: fractions of a cent | Yes: 10 a day |
| Reward that varies | Explain cards teaching a new term; the proofread card showing why; "Noted" when Otty learns something; a chart from a pasted table | Explain cards are cached (`explainCache.ts`) and run on the quick model | Yes, explain cards uncounted |
| Investment | Memories, saved chats, Pebbles, a repeating look, a Connection. Each makes Otty more yours and harder to leave (the moat, 22.3) | Nothing (local) or cents | Yes: memory in full, one look, one Connection |

So Free becomes "**the whole of Otty in small doses**": one repeating look, one Connection, memory in full, explain cards without counting, three careful answers a month, ten quick questions a day. Plus is three looks at once, every Connection, a pool of careful answers and long answers like drawings and slides.

**Show the power in the first minutes, not only in the trial.** Onboarding (22.8) already reaches a live answer in the user's own app. Add one step at the end that every Free user keeps: **set up their first repeating look**, picked from what they said they do. A student gets "every Monday, what's due this week" from Canvas; an office worker "each morning, today's meetings and anything to prepare"; someone reading in another language "a word of the day from what I read". The first time Otty comes back to them by itself is the moment it stops being a chat box, and it happens on Free.

**Why it's worth the cost.** The extra features cost about $0.02 per active Free user a month, so at 4% conversion the subsidy per payer rises from about $2.01 to $2.50. To come out even, conversion has to rise from 4% to about 4.75%. That's a modest bet: without a look running, nothing brings a Free user back after the trial ends, and a user who drifts away never converts. It also builds the moat, since every look and Connection is something they'd lose by leaving.

**Guardrails that keep it cheap:**
- Free's look runs only on the quick model, at most weekly, with a small cap on pages per run (a free-plan line in `LIMITS`).
- Connection questions count against the 10 a day; reading a Connection costs nothing.
- Explain cards stay uncounted but sit inside the $0.20 monthly cost cap, so a script can't farm them.
- When the trial ends, the user picks which look stays. Nothing is deleted.

Sources checked on 2026-11-26 (all **verify** before use): [ChatGPT SG prices](https://comparesing.com/claude-vs-chatgpt-pricing-singapore/), [ChatGPT Go by country](https://geosub.org/en/ai-pricing/chatgpt/go), [ChatGPT ads on Free and Go](https://www.marketing-interactive.com/chatgpt-go-rolls-out-globally-ads-to-be-tested-on-free-and-go-tiers), [Claude plans](https://tokenkarma.app/blog/claude-pro-max-team-pricing-september-2026/), [Claude Max](https://support.claude.com/en/articles/11049741-what-is-the-max-plan), [Google AI Plus in Singapore](https://www.techedt.com/google-launches-ai-plus-subscription-in-singapore-with-expanded-gemini-features-and-200gb-storage), [Google AI Plus price drop](https://www.techrepublic.com/article/news-google-ai-plus-price-drops/), [Google AI Pro for SG students](https://www.techedt.com/google-offers-singapore-students-free-one-year-access-to-the-ai-pro-plan), [Perplexity](https://www.finout.io/blog/perplexity-pricing-in-2026), [Raycast billing](https://manual.raycast.com/billing), [Raycast on its change](https://www.raycast.com/blog/changing-how-raycast-ai-is-priced), [Raycast backlash](https://www.ifun.de/raycast-veraergert-nutzer-mit-neuem-ki-preismodell-288857/), [Cursor pricing and apology](https://www.vantage.sh/blog/cursor-pricing-explained), [Grammarly](https://www.eesel.ai/blog/grammarly-ai-pricing), [Setapp](https://pricingsaas.com/companies/setapp), [Superwhisper](https://usevoicy.com/blog/superwhisper-pricing), [BoltAI](https://boltai.com/pricing), [TypingMind](https://www.typingmind.com/buy), [Replika](https://www.usagepricing.com/blueprint/activity/replika-2026-10-05-pricing-page-404-app-store-prices), [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing), [DeepSeek price rises](https://www.infoworld.com/article/4209439/deepseek-raises-some-v4-prices-by-more-than-10x-as-ai-demand-strains-capacity.html), [GPT-5 pricing](https://www.developersdigest.tech/models/gpt-5), [GPT-5.5 pricing](https://apidog.com/blog/gpt-5-5-pricing/), [OpenRouter fees](https://www.maximem.ai/blog/openrouter-pricing-2026), [OpenRouter sticky routing](https://openrouter.ai/docs/guides/features/prompt-caching), [OpenRouter for DeepSeek](https://openrouter.ai/blog/insights/why-openrouter-for-deepseek/), [merchant of record fees](https://alexcloudstar.com/md/blog/merchant-of-record-indie-saas-2026/), [Bank of America on AI spending](https://moneywise.com/news/top-stories/ai-subscribers-households-bank-america-2026), [Recon Analytics](https://www.reconanalytics.com/ai-revenue-paid-adoption-requires-data-not-better-models/), [Bango survey](https://bango.com/its-not-a-bubble-over-three-quarters-say-their-ai-subscriptions-are-now-essential-to-everyday-life/), [Reddit roundup](https://www.vellum.ai/blog/best-ai-assistant-reddit), [EY Singapore](https://www.ey.com/en_sg/newsroom/2026/05/autonomous-ai-is-no-longer-theoretical-as-adoption-grows-despite-ongoing-trust-concerns), [Hong Kong trust](https://www.thestandard.com.hk/finance/article/315245/Mainland-GBA-consumers-show-greater-trust-in-AI-than-Hong-Kong-peers-survey-finds), [Apple Intelligence engagement](https://tidbits.com/tag/writing-tools/), [ChartMogul conversion report](https://chartmogul.com/reports/saas-conversion-report/), [free tier limits compared](https://theaicareerlab.com/blog/ai-usage-limits-compared-2026/raw), [ChatGPT free text limits](https://tech-insider.org/chatgpt-vs-claude-vs-gemini-free-tier-2026/), [a16z spend concentration](https://fourweekmba.com/ai-a16z-top-1-percent-ai-payers-19-5-percent-observed-us-spend/), [AI cost and app margins, RevenueCat](https://www.revenuecat.com/blog/growth/ai-feature-cost-subscription-app-margins), [middle tiers and plan mix, Adapty](https://adapty.io/blog/tiered-pricing/), [Singapore GST and Paddle](https://www.paddle.com/billing/singapore), [GST shown inclusive, Stripe](https://stripe.com/resources/more/singapore-gst-rate-explained-for-businesses-selling-in-singapore). Claude prices are Anthropic's list prices as of 2026-11-03.
