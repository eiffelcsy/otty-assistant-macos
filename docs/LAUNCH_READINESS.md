# Otty — Launch readiness

A first look, on 2026-11-15, at what Otty has today and what has to happen before it can go to people outside the project: first a **closed beta**, then a **paid public beta**, then **1.0**. It covers the big picture (business model, positioning) and the small details (a fallback in `settings.ts`, a fuse in the build).

This is a starting point, not a plan of record. Facts about the code were checked against `feat/next-five` (v0.5.0). Facts about the outside world (prices, laws, store rules, provider terms) change often and are marked **verify**: check them at the source before relying on them. None of this is legal or tax advice.

Sizes use the same scale as the DEVLOG: S (≤ 1 day), M (2–4 days), L (a week or more).

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

**Add these before taking money:** the hosted AI service, accounts, payments through a merchant of record, a website and a support channel.

---

## Decisions so far (2026-11-16)

| Question | Decision | What it means for the work |
| --- | --- | --- |
| Business model (§2.1) | **C, hybrid.** A free tier and paid plans on hosted AI. "Use my own key" stays, as a cheaper paid plan | Build the hosted service (§9) and accounts (§8) for the paid beta. The own-key plan still needs a licence or account check (8.1) |
| AI-free features (§3.2) | **Free forever**: pick up text, typed math, saved chats and search, find in chat, copying tables, the otter | Never behind a paid plan or a usage limit. Everyone signs in (see the next row) |
| Sign-in (§8) | **Every user signs in**, on every plan | Sign in once at onboarding. After that, **never lock anyone out of what runs on their Mac**: an expired session, no internet or a server outage pauses only the AI features, while pick up text, math and saved chats keep working, and the otter asks them to sign in again in friendly words. Sign-in also gives the free tier one allowance per account (3.5) |
| Default model (§2.2) | **DeepSeek stays the default** | Disclose clearly where questions are processed, and plan the cross-border transfer wording under Singapore's and Hong Kong's laws (§11.3) |
| First markets (§2.4) | **Singapore and Hong Kong** | Laws: Singapore's PDPA and Hong Kong's PDPO first. Prices in SGD and HKD. English plus zh-HK, so translating the interface (15.6) moves up. **Provider regions:** OpenAI and Anthropic have not listed Hong Kong as a supported region (**verify** both). That affects the own-key plan for Hong Kong users who pick Claude or OpenAI, and any hosted fallback to those providers for Hong Kong users. DeepSeek as the default avoids it |
| Repository (§2.6) | **Private before the beta** | Two follow-ons. (1) CI cost: move typecheck and unit tests to Linux runners and keep macOS for builds (7.2 becomes P0). (2) Updates: electron-updater can't read a private repo's releases without a token, which must never ship in the app. Publish update files to public storage (Cloudflare R2, S3) or a separate public releases repository (6.1). Add a `LICENSE` stating all rights reserved anyway |
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
| Tests | 54 test files, 746 tests, a search contract test, a cache byte-for-byte test, a real-model eval (104/106 baseline) with injection cases | Strong base for a release gate |
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

**Risks to the position:**
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
| 5.3 | Hardened runtime and entitlements review | S | electron-builder enables the hardened runtime by default for signing. Review `build/entitlements.mac.plist`: `allow-unsigned-executable-memory` may no longer be needed by Electron 45 (**verify**, remove if not); keep `allow-jit` and `automation.apple-events` |
| 5.4 | Sign the OCR helper | S | `otty-ocr` ships in `extraResources`. Check that it's signed with the hardened runtime in the final app (`codesign -dv --verbose=4` on it and `spctl -a -vv` on the app). An unsigned helper fails notarization |
| 5.5 | Notarize and staple | S–M | electron-builder's `notarize` option with an App Store Connect API key (preferred over an app-specific password). Staple the ticket so first launch works offline |
| 5.6 | Signing in CI | M | Store the certificate (base64 `.p12`) and the API key as GitHub secrets, used only in a release job that runs on tags, in a protected GitHub **environment** that needs your approval. Never on PRs from forks |
| 5.7 | Electron fuses | S | Not configured. Otty holds Accessibility, Screen Recording and Automation grants, and an attacker who can run the app binary with `ELECTRON_RUN_AS_NODE` or `--inspect` inherits them. Turn off `RunAsNode`, `EnableNodeOptionsEnvironmentVariable` and `EnableNodeCliInspectArguments`; turn on `EnableEmbeddedAsarIntegrityValidation`, `OnlyLoadAppFromAsar` and `EnableCookieEncryption` (electron-builder's `electronFuses`, **verify** the option name for your version) |
| 5.8 | Bundle identifier | S | `com.otty.assistant` implies you own `otty.com`. Use a reverse domain you own (§17). **Change it before the first public build**: macOS ties permissions, Keychain items and `userData` to it, so changing it later loses every user's grants and saved key |
| 5.9 | Usage descriptions | S | Only `NSAppleEventsUsageDescription` is set. Check whether Screen Recording, and anything else you prompt for, needs its own string, and keep each one in friendly words |
| 5.10 | DMG polish | S | A background with "drag Otty to Applications", a signed DMG, a sensible volume name. Consider a check that moves the app to `/Applications` on first launch, because permissions and updates break when it runs from the DMG or Downloads |
| 5.11 | Size | S | Each DMG is about 145 MB. Normal for Electron, but check what's in `out/` and `node_modules` that ships (for example whether mermaid, katex or mathjs pull in more than they need). Keep two DMGs (arm64 and x64) and pick the right one on the download page, rather than one large universal build |

---

## 6. Updates and releases

| # | Item | Size | Notes |
| --- | --- | --- | --- |
| 6.1 | Auto-update with `electron-updater` | M | On macOS it needs a signed app and a **`zip` target** next to the DMG (Squirrel.Mac installs from the zip). The feed can be GitHub Releases (the repo is public) or your own storage (S3, Cloudflare R2) if you go private |
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
| 7.7 | An end-to-end smoke | M–L | BRAINSTORM's "Otty test harness". Playwright can launch Electron apps (`_electron`, **verify**) and drive the panel and quick view. Hotkeys and macOS permissions can't run on CI, but launching, onboarding, sending a question to a stubbed provider and reopening a saved chat can. It catches "the packaged app doesn't start", which unit tests can't |
| 7.8 | Test the packaged app | S | After build, launch the `.app` headless for a few seconds and check it didn't crash (an asar or fuse mistake shows up here) |
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
| 10.1 | Electron fuses | S | See 5.7. The most important item here, because of the permissions Otty holds |
| 10.2 | No plain-text key fallback | S | `settings.ts` saves the key base64-encoded but **unencrypted** when `safeStorage` isn't available. On a signed Mac build that should essentially never happen; when it does, refuse to save and say so in friendly words rather than writing the key to `settings.json` |
| 10.3 | Ignore `DEEPSEEK_API_KEY` in the packaged app | S | `envKey` reads it in every build. Limit it to `!app.isPackaged` so a production build's key source is only the Keychain |
| 10.4 | Encrypt `otty.db` | M | BRAINSTORM lists it. Memories and saved chats are a record of someone's life, readable by any process running as the user. SQLite encryption with a key in the Keychain (**verify** what `node:sqlite` supports, or encrypt sensitive columns). At least make sure FileVault is mentioned in the privacy page |
| 10.5 | Check IPC inputs | S–M | Main already checks some renderer input (`cleanCap`, `validExport`, `runStep` looking actions up). Audit every `ipcMain.handle` for type and range checks, since a compromised renderer is the threat the sandbox is there for. Planned as **D-44**, which adds sender checks |
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
| 12.7 | The otter art | S | The art is generated (`tools/otty-art/prepare.py`). Check the generator's terms allow commercial use. In several countries, including the US, purely AI-generated images may not be protected by copyright (**verify**), so others could copy Otty's look. Protect the character with a trademark, and consider having an artist redraw or substantially rework the final mascot so you own it clearly |
| 12.8 | Accessibility law | S | The European Accessibility Act applies to some digital products and services sold to consumers in the EU, with exemptions for very small businesses (**verify** whether it covers Otty). NFR-6 already targets 4.5:1 contrast and keyboard use; an audit before 1.0 is good practice anyway |
| 12.9 | Export rules | S | Otty uses standard encryption (HTTPS, Keychain). For direct distribution there's usually nothing to file, but check if you'll sell to restricted countries; most merchants of record block them for you (**verify**) |

---

## 13. Quality and testing

| # | Item | Size | Notes |
| --- | --- | --- | --- |
| 13.1 | Land the stack | M | Merge PRs 51 → 52 → 53 (in order), run smoke steps 107–127 on a Mac, fix what turns up. Nothing after this until it's green |
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
| 14.1 | Log files | S | `electron-log` or a small writer to `~/Library/Logs/Otty/`, rotated, with **no content**: errors, timings, provider status codes, feature names. Run every line through `maskSecrets` too |
| 14.2 | "Copy diagnostics" / "Send to Otty's team" | S–M | In Settings → Help: version, macOS, architecture, permissions state (`permissions.ts`), provider kind (not the key), the last log lines. The user sees exactly what's sent before sending — consistent with "What left the Mac", and it should appear there |
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
| P0 | Merge PRs 51–53, run the smoke test, feature freeze | 13.1, 13.2 | M |
| P0 | Make the repo private: CI split (Linux for typecheck and tests), public storage for update files | 2.6, 7.2, 6.1 | S–M |
| P0 | Change the bundle id to a domain you own | 5.8 | S |
| P0 | Apple Developer account, Developer ID, notarization, sign the OCR helper | 5.1–5.5 | M |
| P0 | Electron fuses | 5.7 | S |
| P0 | Auto-update with a beta channel | 6.1–6.3 | M |
| P0 | Log files and "Copy diagnostics" | 14.1, 14.2 | S–M |
| P0 | A short privacy notice and beta terms (18+, "answers can be wrong", it's a beta) | 11.1, 12.2 | S |
| P0 | A `LICENSE` stating all rights reserved | 2.6 | S |
| P1 | Signed out, offline or server down: AI-free features keep working, never locked out | Decisions | S–M |
| P0 | Permissions on a signed build, launch at login | 13.4, 13.5 | S |
| P1 | Release workflow with signing in CI | 7.1, 5.6 | M |
| P1 | Opt-in crash reports | 14.3 | M |
| P1 | In-app feedback and a beta channel for testers | 14.5, 14.7 | S |
| P1 | No plain-text key fallback, env key only in dev | 10.2, 10.3 | S |
| P1 | Hide local models from onboarding | 2.5 | S |
| P1 | Opt-in, counts-only analytics of onboarding and weekly use | 14.4 | M |
| P1 | Key provision for non-technical testers (a capped key from your account) | 2.1 | S |

### Stage 2 — Paid public beta

Goal: prove people will pay, and what it costs to serve them.

| Priority | Item | Section | Size |
| --- | --- | --- | --- |
| P0 | Unit economics from the closed beta, then prices | 3.3, 3.1 | S |
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
- How big is the free tier's hosted allowance, and what do the paid and own-key plans cost in SGD and HKD? (Needs the closed beta's numbers, §3.3.)
- Does the own-key plan include every feature, or leave some for the full plan?
- What revenue or risk level makes you form a company?
- Which merchant of record accepts an individual seller in your country and pays out there?
- Should the hosted service ever route Hong Kong users to Claude or OpenAI, given their supported regions?
- Students: when, if ever, does Otty serve under-18s?
- Does the mascot need redrawing by an artist before the brand is filed?
