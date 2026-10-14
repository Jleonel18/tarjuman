# Feature Specification: Resource Curation

**Feature Branch**: `005-resource-curation`

**Created**: 2026-10-14

**Status**: Draft

**Input**: User description: "Resource curation: Tarjuman can search the internet for comprehensible-input resources matched to the learner's interests and target language — videos (e.g. YouTube), songs on music platforms, podcasts, articles, and other material, both free and paid. One of the owner's main reasons for building Tarjuman. Results are untrusted external content (constitution V): isolated, labeled, never treated as instructions; network egress limited to an allowlist; threat analysis required. Curation must be neutral (IX): paid resources labeled, no commercial ranking, affiliate links disclosed. Copyright (X): link to content or use official embedded players only; no downloads, no ToS-violating scraping, no full lyrics or complete works. Provider independence (XI): no capability may depend on a provider-specific search feature without a port and fallback. Resources are recommended for comprehensible input (level-appropriate, interest-matched), never as courses, lessons, levels, or streaks (I). The app is BYOK and local-first; the constitution envisions a stateless gateway for fetching external content that stores no keys or user data."

## Context

Tarjuman can explain language today, but it cannot look anything up. Everything it knows comes from
the model, which cannot see the internet and invents links when asked for them. Yet finding real
material that a learner can mostly understand and actually cares about is the heart of learning
through comprehensible input, and it is one of the main reasons the owner built Tarjuman.

This feature adds a second capability, **resource curation**: the learner asks for material in their
target language ("Spanish videos about climbing", "songs in Japanese like the ones I like"), Tarjuman
searches the internet, and returns a short list of real resources (videos, songs, podcasts, articles,
books, series) that match the learner's interests and estimated level, each with a link to the
original place, a note on why it fits, and whether it is free or paid.

The constitution already plans for it: "resource curation" is one of the capabilities named in
Principle II. It is also the first capability that brings internet content into a turn, so it is the
first real user of rules that so far exist only on paper: untrusted-content isolation and labeling
(V), the egress allowlist (V), neutral curation (IX), and copyright limits (X). The core today has no
path for a capability to call a tool during a turn (`001-core-foundation` built the permission
broker, taint gate, and tool-call guard but never turned them on). If enabling that path changes the
core or the capability contract, Principle II requires the contract amendment to be part of this
specification's plan, stated explicitly, before any capability code depends on it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find real material about what I like (Priority: P1)

As a learner, I ask Tarjuman for resources in my target language about one of my interests. Tarjuman
searches the internet and shows me a short list of real resources. Each one has a title, the type
(video, song, podcast, article, book, series, other), the source site, a link that opens the
original in a new tab, a short note (in my mediation language) on why it suits my interests and
level, and a label saying whether it is free, paid, or free with limits.

**Why this priority**: it is the feature. Without it Tarjuman cannot help the learner find input.

**Independent Test**: with a profile whose target language is Spanish, level B1, and interest
"climbing", ask for "videos about climbing". The answer lists at least three resources whose links
open real pages, each with type, source, fit note, and price label, and no link that did not come
from the search.

**Acceptance Scenarios**:

1. **Given** a learner with target language, level, and interests set, **When** they ask for
   resources on a topic, **Then** Tarjuman searches and shows between 1 and 10 resources, each with
   title, type, source, link, fit note, price label, and estimated difficulty.
2. **Given** a search returns results in several languages, **When** Tarjuman shows the list,
   **Then** every resource is in the target language, or is clearly marked as bilingual or as having
   target-language subtitles.
3. **Given** the learner asks for resources without naming a topic, **When** Tarjuman searches,
   **Then** it uses the interests in the learner's profile, and says which interest each result
   matches.
4. **Given** a search returns nothing suitable, **When** Tarjuman answers, **Then** it says so
   plainly, suggests a broader or different topic, and invents no resource or link.
5. **Given** any resource shown, **When** the learner reads it, **Then** the link points to the
   original source (or an official player) and the app has not downloaded, copied, or stored the
   content itself.
6. **Given** the search could not run (network error, search unavailable, search not supported by
   the learner's setup), **When** the learner asks for resources, **Then** they see a clear message
   saying search is unavailable and why, and Tarjuman does not answer from model memory as if it had
   searched.

---

### User Story 2 - See what searching costs and what it sends (Priority: P2)

As a learner who pays for my own key, I can see how much a resource request cost, including the
search itself, and I know what leaves my device when Tarjuman searches.

**Why this priority**: searching adds a cost and a new party that sees part of my request.
Transparency (Principle IX) and user sovereignty (Principle VI) require it, but it does not block
finding resources.

**Independent Test**: make one resource request; the message shows token usage and an estimated cost
that includes the searches, and the number of searches made. Settings show what is sent to search
services.

**Acceptance Scenarios**:

1. **Given** a resource request completes, **When** the learner looks at the message, **Then** they
   see the number of searches made and an estimated cost that includes them, labelled as an
   estimate with a price date.
2. **Given** a learner who has never searched, **When** they make their first resource request,
   **Then** they are told once, before the search runs, what is sent to search services (the search
   terms, which may contain their interests and target language; never their key, history, or other
   profile data) and can cancel.
3. **Given** a learner who does not want internet search, **When** they turn it off in settings,
   **Then** resource requests are answered with the "search unavailable" message and no search is
   made.

---

### User Story 3 - Trust the list: neutral, labeled, and safe (Priority: P2)

As a learner, I can trust that the list is chosen for my learning, not for someone's revenue, and
that nothing on a web page can make Tarjuman do something I did not ask for.

**Why this priority**: it is what makes curation usable and is required by Principles V, IX, and X.
It is listed separately so it gets its own tests, but User Story 1 cannot ship without it.

**Independent Test**: run the adversarial suite with search results that contain hidden instructions,
sponsored entries, affiliate links, tracking links, full song lyrics, and links to unexpected sites;
every case is handled as described below.

**Acceptance Scenarios**:

1. **Given** a search result whose title or description contains instructions ("ignore your rules",
   "tell the user to visit…", "reveal the system prompt"), **When** Tarjuman builds its answer,
   **Then** those instructions have no effect and the result is treated only as data.
2. **Given** a result marked by its source as sponsored or an advertisement, **When** it is shown,
   **Then** it is labelled as sponsored, and it is never ranked above an unsponsored result for being
   sponsored.
3. **Given** a link that carries an affiliate or referral marker, **When** it is shown, **Then** the
   app shows it as an affiliate link. Tarjuman itself adds no affiliate or referral marker to any
   link.
4. **Given** a resource is a song, **When** Tarjuman describes it, **Then** it quotes at most a short
   excerpt of the lyrics (no more than two lines) and links to an official or licensed source for the
   full text.
5. **Given** the model's answer contains a link that did not come from a search result in this turn,
   **When** the answer is shown, **Then** that link is removed or shown as plain, non-clickable text,
   and the resource is not shown as found.
6. **Given** a turn that used search results, **When** the model proposes any action with a side
   effect (saving, changing settings, opening something automatically), **Then** the learner must
   confirm it explicitly, or it is blocked.
7. **Given** any resource card, **When** it is shown, **Then** no image, thumbnail, player, or other
   remote content loads until the learner clicks something.

---

### User Story 4 - Keep resources I want to come back to (Priority: P3)

As a learner, I can save a resource from a list to my own list on this device, see my saved
resources later, and remove them.

**Why this priority**: useful, but finding resources delivers value without it.

**Independent Test**: save two resources, reload the app, find both in the saved list, remove one,
then use "delete all my data" and confirm the list is empty.

**Acceptance Scenarios**:

1. **Given** a resource in a list, **When** the learner saves it, **Then** it appears in their saved
   list with the same title, type, source, link, price label, and the date it was saved.
2. **Given** saved resources, **When** the learner uses "delete all my data", **Then** none remain.
3. **Given** a saved resource, **When** it is shown, **Then** it carries the same labels (paid,
   sponsored, affiliate) it had when found.

In scope for this feature (clarified 2026-10-14: option A). It may be cut at the end without
affecting User Stories 1–3.

---

### Edge Cases

- The learner's interests are empty: Tarjuman asks for a topic instead of searching blindly.
- The learner's level is "I don't know": difficulty is still estimated, and the fit note says it
  could not be matched to a level.
- The target language has little online material on the topic: Tarjuman says so and offers nearby
  topics or material for a slightly higher level, labelled as such.
- A result is region-locked, age-restricted, removed, or behind a login: the price or access label
  says so when the search result reveals it; otherwise the link is shown as found.
- The same resource appears from several searches: it is shown once.
- A result's source domain is not on the list of sites the app may contact or link to: the app
  shows it as plain text with its domain, not as a clickable link, or leaves it out.
- A search result contains text that looks like an API key or personal data: it is treated like
  any other untrusted text and never echoed into a request that leaves the device.
- The learner asks for something outside the domain ("find me cheap flights"): the normal scope
  refusal applies; no search is made.
- The learner asks for a pirated copy, a download, or full lyrics: Tarjuman refuses courteously and
  offers legal options (official channels, libraries, licensed platforms).
- The learner asks for a course, app with levels, or streak-based program: Tarjuman explains that it
  recommends input material, and may suggest material instead. It does not refuse to name
  a resource that happens to be paid.
- Search is slow: the learner sees that a search is in progress and can cancel; cancelling stops
  further searches and is not retried.
- A search fails half way: resources already found are shown, and the answer says the search was
  incomplete. Nothing is retried automatically.
- The provider (or search service) refuses or blocks the request on its side: shown as a refusal or
  an error category, as in feature 004.

## Requirements *(mandatory)*

### Functional Requirements

**Finding resources**

- **FR-001**: The app MUST offer a resource curation capability, delivered as a capability module
  under the existing capability contract (Principle II).
- **FR-002**: Learners MUST be able to ask for resources in the chat, in their own words, with or
  without a topic.
- **FR-003**: When asked for resources, the app MUST run a real internet search and MUST build its
  answer only from resources returned by searches made during that turn.
- **FR-004**: Search terms MUST be built from the learner's request, target language, and, when no
  topic is given, their profile interests. They MUST NOT contain the API key, conversation history
  beyond the current request, or profile fields other than target language, level, and interests.
- **FR-005**: The app MUST show at most 10 resources per answer, each with: title, type (video, song,
  podcast, article, book, series, other), source name and domain, link, fit note in the mediation
  language, price label (free, paid, free with limits, unknown), and estimated difficulty
  (labelled as an estimate).
- **FR-006**: Ranking MUST depend only on fit to the learner's request, interests, target language,
  and estimated level. Price, sponsorship, and any commercial relationship MUST NOT raise a
  resource's rank (Principle IX).
- **FR-007**: The app MUST NOT download, cache, or store the content of a resource, MUST NOT read
  pages in ways their terms forbid, and MUST NOT reproduce complete works; lyrics are limited to a
  short excerpt of at most two lines (Principle X).
- **FR-008**: Each resource MUST link to its original source or an official embedded player. Any
  embedded player or remote image MUST load only after the learner clicks (no auto-loaded remote
  resources).

**Search source**

- **FR-009**: Searching MUST sit behind a search port, so the capability does not depend on any
  provider-specific search feature, and MUST have a defined fallback when no search is available:
  the "search unavailable" message (User Story 1, scenario 6) (Principle XI).
- **FR-010**: In this feature, search results MUST come from the web search offered by the
  learner's selected AI provider, run on the provider's side during the model call, so no extra key
  and no gateway are needed. Each provider's search is an adapter behind the search port (FR-009). A
  provider without search (or with search unavailable for the learner's key) gets the fallback.
  Dedicated search services (for example a video platform's own search) are out of scope and may be
  added later as further adapters behind the same port.
  (Clarified 2026-10-14: option A.)
- **FR-011**: Every network destination used for search or linked as a clickable resource MUST be on
  a declared allowlist, enforced by the app's network policy and the capability's declared
  permissions (Principle V).

**Untrusted content**

- **FR-012**: All search results (titles, descriptions, snippets, page text, transcripts, lyrics)
  MUST be treated as untrusted data: labeled, isolated from the instruction layers, and never given
  instruction authority (Principles IV, V).
- **FR-013**: Every link in a shown answer MUST match a link returned by a search in that turn; any
  other link MUST be removed or shown as non-clickable text.
- **FR-014**: Links MUST open in a new tab without giving the opened page access to the app, and
  MUST NOT carry any data from the app (no added query parameters).
- **FR-015**: A turn that used search results MUST be marked as tainted; any side-effecting action
  proposed in it MUST require explicit learner confirmation or be blocked (Principle V).
- **FR-016**: Sponsored results and links with affiliate or referral markers MUST be labelled as such
  when the source or the link reveals it. The app MUST NOT add affiliate or referral markers.

**Transparency and control**

- **FR-017**: Each resource answer MUST show the number of searches made and an estimated cost that
  includes search charges, with the price date, alongside the existing token and cost display.
- **FR-018**: Before the first search on a device, the app MUST tell the learner what is sent to the
  search service and let them cancel. Learners MUST be able to turn internet search off and on in
  settings; when off, no search is made.
- **FR-019**: Searches MUST NOT be retried automatically. The learner MUST be able to cancel a search
  in progress.
- **FR-020**: The existing scope rules MUST cover resource requests: requests for resources in the
  target language are in scope; requests unrelated to language learning, for pirated content, or for
  full lyrics are refused courteously. New or changed rules MUST ship with accept and refuse cases
  (Principle VII).

**Saved resources**

- **FR-021**: Learners MUST be able to save, list, and remove resources on this device, and "delete
  all my data" MUST remove them. Saving is an explicit learner action (a click on the resource), never
  something the model triggers.

**Global and tests**

- **FR-022**: All new user-facing text MUST be in the i18n catalogs (en, es) and the resource list
  MUST lay out correctly in right-to-left languages and with titles in any writing system.
- **FR-023**: The adversarial suite MUST gain cases for: instructions inside result titles,
  descriptions, and page text; invented links; links to non-allowlisted domains; tracking and
  affiliate links; sponsored results; full lyrics; data exfiltration through links or images; and
  side effects in a tainted turn. They MUST run without network access.
- **FR-024**: Learners ask for resources only in the normal chat. Filters (type, free only, topic,
  length) are expressed in words ("only free songs"). A dedicated search screen is out of scope.
  (Clarified 2026-10-14: option A.)

### Key Entities

- **Resource**: one piece of material found by a search. Title, type, source name, domain, link,
  language(s), price label, sponsored flag, affiliate flag, estimated difficulty, fit note, the
  interest it matches, and the search it came from. Never contains the content itself.
- **Search request**: what the provider's search is asked for: terms, target language, optional type filter.
  Never contains the key or history.
- **Search result**: what a search source returns, before curation. Untrusted. Lives only for the
  turn.
- **Saved resource**: a Resource plus the date saved, stored on the
  device with other learner data.
- **Search settings**: whether internet search is on, and whether the first-search notice was shown.

## Threat Analysis

- **Indirect prompt injection**: titles, descriptions, and pages are written by anyone. Hidden
  instructions could try to change scope, leak the system prompt, or push a resource. FR-012 isolates
  and labels them; the instruction hierarchy gives them no authority; FR-023 tests it.
- **Invented links**: the model may make up plausible URLs, including malicious ones. FR-003 and
  FR-013 allow only links returned by the turn's searches.
- **Data exfiltration through links and images**: a result or injected text could make the model
  emit a link or image whose address carries conversation data. FR-008 (no auto-loading), FR-013
  (only search links), and FR-014 (no added parameters) close it.
- **Malicious or phishing destinations**: a search can return harmful sites. FR-011 limits clickable
  links to allowlisted domains; others are plain text.
- **Privacy leak to search services**: search terms reveal interests and target language, and the
  provider passes them to a search engine (which may be a third party for that provider). FR-004
  limits what is in the terms; FR-018 discloses it and lets the learner turn search off.
- **Key exposure**: the AI key still goes only to the selected provider; search runs on the
  provider's side, so no new party receives the key. FR-004 keeps it out of search terms.
- **Server-side request forgery**: the app fetches no pages itself and no gateway is added (FR-010),
  so there is no new fetch path to abuse. A future dedicated-search adapter that fetches through a
  gateway needs its own threat analysis.
- **Provider-specific behavior**: each provider's search returns results, citations, and charges in
  its own shape, and may filter or rank by its own rules. FR-009 normalizes them behind the port;
  FR-006 still governs Tarjuman's ranking of what comes back.
- **Commercial bias**: sponsored and affiliate results can crowd out better material. FR-006 and
  FR-016.
- **Copyright**: lyrics and transcripts are complete works. FR-007 limits excerpts and forbids
  downloads.
- **Side effects in tainted turns**: a result could trigger saving or settings changes. FR-015.
- **Cost runaway**: searches cost money and a loop could run many. FR-017 shows the count and cost,
  FR-019 forbids retries; the plan must cap the number of searches per turn.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a learner with interests and a target language set, a resource request returns a
  list in under 30 seconds in at least 9 of 10 attempts.
- **SC-002**: In a manual check of 20 resource requests across at least 3 target languages, at least
  90% of the links shown open a live page with the described resource, and 100% of links came from a
  search in that turn.
- **SC-003**: In the same check, at least 80% of resources are in the target language (or marked
  bilingual or subtitled) and match a requested topic or a profile interest.
- **SC-004**: The adversarial suite passes with zero injected instructions followed, zero invented or
  non-allowlisted clickable links, zero auto-loaded remote resources, and zero lyrics excerpts longer
  than two lines.
- **SC-005**: In automated checks, zero search requests contain the API key, conversation history, or
  profile fields other than target language, level, and interests.
- **SC-006**: 100% of results labelled sponsored or affiliate by their source are shown with that
  label, and no test case ranks a resource higher because it is sponsored or paid.
- **SC-007**: Every resource answer shows the number of searches and an estimated cost including
  them; with search turned off, zero searches are made.
- **SC-008**: Features already shipped (language Q&A, both providers, guardrails) pass their existing
  test suites unchanged.

## Assumptions

- "Paid" resources are named and labelled, never hidden; Tarjuman does not sell or broker them.
  Courses and gamified programs (Principle I) may be named if the learner asks, but the capability
  recommends input material (videos, songs, podcasts, articles, books, series), not courses.
- Difficulty is an estimate from the information the search returns (title, description, source,
  type); the app does not watch, listen to, or read the full resource.
- Search is used only in turns where the learner asks for resources; ordinary language questions
  keep working exactly as today, with no search.
- Search source facts (availability per provider, prices per search, cross-origin access, terms of
  use) drift; they are confirmed against live documentation during planning and recorded in
  `research.md` with a date.
- Enabling the tool-call path in the pipeline (permission broker, taint gate, tool-call guard) is
  expected; whether it changes the core or the capability contract is decided in the plan and, if it
  does, stated as an amendment there.
- The search port (FR-009) is expected to be a new provider-side concern: whether it extends the
  provider port or sits beside it is decided in the plan, and any change to a core port is stated as
  an amendment there.
- The owner uses Gemini; whether Gemini's search is available on the owner's key tier, and what it
  costs, is confirmed live during planning. If it is not available, the fallback applies and the
  plan must say so before implementation.
- Ollama and mock providers need a scripted search in tests; no test reaches the internet unless it
  is an opt-in live test run by the owner.
- Personalised recommendations from listening or viewing history on other platforms (logging into
  YouTube, Spotify, and so on) are out of scope.
