# Product Requirements Document (PRD): review-pr Enterprise Workflow

| Metadata | Details |
| :--- | :--- |
| **Document Status** | Draft / Ready for Review |
| **Target Release** | v1.0.0 |
| **Repository** | `groot-arena/review-pr` |
| **Implementation Stack** | Strict TypeScript (ESM), Zod, `esbuild`, GitHub Actions (Node & Composite) |
| **Primary Stakeholders** | Platform Engineering, Security/AppSec, Application Engineering Teams |

## 1. Executive Summary & Problem Statement

### Problem

Engineering teams across the organization currently maintain fragmented, copy-pasted GitHub Actions workflows for Pull Request validation. This leads to:

* **Inconsistent Quality Gates:** Varying standards for test coverage, linting, and static analysis across repositories.
* **High Maintenance Overhead:** Updating CI scripts, action versions, or security policies requires manual PRs across dozens of repos.
* **Noisy & Low-Signal PR Reviews:** Reviewers lack immediate visibility into PR blast radius, changed-line (diff) coverage, and gate durations, while raw linter dumps and duplicate bot comments clutter PR threads and cause alert fatigue.

### Objective

Build a centralized, versioned, and language-agnostic **Reusable GitHub Actions Workflow** (`pr-verification.yml`) backed by a strictly typed **TypeScript** review and summary engine compiled into self-contained `dist/` bundles via `esbuild`. Consumer repositories will onboard in under 10 minutes by adding a minimal caller workflow and passing their language and verification commands, automatically receiving enterprise-grade inline code reviews and a single actionable PR summary with zero runtime dependency installation overhead.

## 2. Target Personas & User Stories

| Persona | Goal | Key User Story |
| :--- | :--- | :--- |
| **Application Developer (PR Author)** | Get fast, actionable feedback on PRs without fighting CI boilerplate or bot spam. | *"As a developer, I want clear inline comments only on the lines I changed—with one-click fix suggestions where possible—auto-resolved once I fix them, and a single summary telling me exactly what broke if a gate fails."* |
| **Code Reviewer / Tech Lead** | Assess PR risk and quality in seconds before diving into the diff. | *"As a reviewer, I want to immediately see if all gates passed, what high-risk areas (Docker, CI, DB, Auth) were touched with a quick review checklist, and whether new code is covered by tests."* |
| **Platform / DevOps Engineer** | Enforce org-wide CI/CD security and quality standards from one place. | *"As a platform engineer, I want to maintain one versioned, strictly typed workflow codebase with compile-time safety and runtime schema validation that works across Node.js, Python, Go, Java, and monorepos."* |

## 3. Scope

### In-Scope

* Centralized reusable GitHub Actions workflow (`workflow_call`) supporting `node`, `python`, `go`, `java`, and `custom` runtimes.
* Strictly typed TypeScript codebase with **Zod** runtime schema validation for all external artifacts, environment variables, and consumer configs.
* Standardized, language-agnostic parsing for **JUnit XML** (tests), **LCOV / Cobertura XML** (coverage & diff coverage), and **SARIF / RDJSON** (lint/SAST).
* Pre-bundled native Node GitHub Actions (`dist/*.js` via `esbuild`) for sub-second startup and zero `npm install` overhead on consumer PRs.
* Enterprise-formatted inline PR review comments on modified lines with SARIF-to-suggestion conversion, severity enforcement, inline capping, deduplication, and automatic thread resolution on fix.
* SARIF upload to GitHub Security (Code Scanning Alerts).
* Rule-based blast-radius / impact detection paired with contextual reviewer guidance, with default org rules and consumer-level overrides.
* Idempotent, sticky PR summary comment upserted on every push, with failure-first callouts and monorepo/polyglot isolation (`report-id`).

### Out-of-Scope (v1.0)

* Continuous Deployment (CD), release publishing, or environment promotion.
* Provisioning or managing self-hosted GitHub Actions runners.
* Maintaining language-specific linter rule sets (consumers own their `.eslintrc`, `ruff.toml`, etc.).
* AI/LLM-generated code reviews (may be evaluated as an optional v2.0 add-on).

## 4. Functional Requirements

### FR-1: Reusable Multi-Language Interface

* **FR-1.1:** The workflow MUST be consumable via `workflow_call` using Semantic Versioning (`@v1.0.0`, `@v1`).
* **FR-1.2:** A central `setup-runtime` composite action MUST provision the requested `language` (`node`, `python`, `go`, `java`, `custom`) and `runtime-version` with built-in dependency caching.
* **FR-1.3:** The workflow MUST support a `working-directory` input and a `report-id` input so monorepos can invoke the workflow multiple times per PR without overwriting each other's comments.

### FR-2: Configurable Verification Gates

* **FR-2.1:** Consumers MUST be able to supply custom commands for `install-command`, `typecheck-command`, `lint-command`, `test-command`, `coverage-command` (optional separate coverage/conversion step), and `build-command`.
* **FR-2.2:** Any gate whose command input is left empty (`''`) MUST be gracefully bypassed and reported as `⏭️ Skipped` in the PR summary.
* **FR-2.3:** The `test-and-coverage` job MUST execute `test-command` and, if provided, `coverage-command` sequentially within the same workspace so generated coverage artifacts are shared.
* **FR-2.4:** The workflow MUST support optional SonarQube PR analysis via `enable-sonar: true` and a `SONAR_TOKEN` secret.

### FR-3: Enterprise Inline Static Analysis & Review Lifecycle

* **FR-3.1 (Diff-Only Enforcement):** Inline comments MUST ONLY be posted on lines added or modified in the PR diff. Pre-existing issues on untouched lines MUST be suppressed from inline reviews.
* **FR-3.2 (Structured 3-Part Anatomy):** Every inline review comment generated by `src/formatters/sarif-to-review.ts` (bundled to `dist/post-inline-review.js`) MUST follow a consistent, professional structure:
  1. **Header:** Severity badge, category, rule ID linked to its SARIF `helpUri` documentation, and source tool.
  2. **Impact & Context:** Concise, objective explanation of *why* the issue matters (security, reliability, maintainability) using neutral, peer-like tone.
  3. **Actionable Remediation:** Concrete fix guidance—and a native GitHub suggestion block whenever SARIF `fixes` (`artifactChanges`) are available so developers can commit the fix in one click.
* **FR-3.3 (Severity Enforcement):** Findings MUST be mapped to the standardized Severity & Enforcement Matrix (Section 5), ensuring `Critical` and `Error` findings block merge while `Info`/nit findings are routed to the summary only.
* **FR-3.4 (Anti-Noise Capping & Overflow):** Inline review comments MUST be capped at a configurable maximum (default: **15 per PR**), prioritized by `Critical` → `Error` → `Warning`. Any findings exceeding the cap MUST be listed in a collapsible `<details>` overflow table inside the sticky PR summary comment.
* **FR-3.5 (Deduplication & Auto-Resolution):** `src/github/review-sync.ts` MUST match new findings against existing bot review comments by `(file_path, line, rule_id)` to prevent duplicate comments on re-push, and MUST automatically resolve previously opened bot review threads via GitHub's GraphQL `resolveReviewThread` mutation once a subsequent push fixes the finding.
* **FR-3.6 (GitHub Security Integration):** Security findings in SARIF format MUST be uploaded to the GitHub Security tab via `github/codeql-action/upload-sarif`.

### FR-4: Branch Diff & Impact Analysis

* **FR-4.1:** The summary job MUST check out the repository with `fetch-depth: 0` to compute accurate `git diff origin/$BASE_REF...HEAD` statistics, commit history, and added line numbers.
* **FR-4.2:** The impact engine (`src/impact-engine.ts`) MUST classify PR size (`XS`–`XL`) based on total lines changed and evaluate modified file paths against `config/default-impact-rules.json` (Docker/Infra, CI/CD, Auth/Security, Migrations, Tests).
* **FR-4.3:** Every detected impact category MUST pair the affected paths with a concise, actionable reviewer checklist item (e.g., *"verify base image security and build context exclusions"*).
* **FR-4.4:** Consumers MUST be able to extend or override default impact rules via an optional `impact-rules-path` JSON file in their repository, validated at runtime against a strict **Zod** schema with clear diagnostic errors if malformed.

### FR-5: Actionable Test, Coverage & Sticky PR Summary Report

* **FR-5.1:** The `pr-summary` Node action (`dist/pr-summary.js`, built from `src/entrypoints/pr-summary.ts`) MUST parse JUnit XML for pass/fail/skip counts and failing test details, and LCOV/Cobertura XML for overall coverage, directory-level coverage, and **changed-line (diff) coverage**.
* **FR-5.2:** All parsed external artifacts (JUnit, LCOV/Cobertura, SARIF, gate reports) and action inputs MUST be validated using **Zod** schemas before rendering.
* **FR-5.3:** The workflow MUST enforce configurable `coverage-threshold` and `diff-coverage-threshold` gates.
* **FR-5.4:** `src/github/comment-sync.ts` MUST upsert a single sticky PR comment identified by `<!-- pr-verification-report:<report-id> -->` (updating in-place on subsequent pushes rather than creating duplicate comments).
* **FR-5.5 (Verdict-First & Failure-Actionable Layout):** The comment MUST be scannable in under 5 seconds when passing and immediately diagnostic when failing:
  1. **Header & Verdict:** Overall status badge (`✅`/`❌`/`⚠️`), branch diff (`head → base`), file/line stats, PR size, commit link, and workflow run link.
  2. **Action Required Callout (On Failure Only):** A prominent GitHub `[!CAUTION]` alert block immediately under the header listing exact merge blockers (failing test names, coverage deficit, critical SAST locations).
  3. **Quality Gates & Static Analysis Table:** Gate name, command/tool, status, key metrics (e.g., inline comment counts, diff coverage), duration, plus a collapsed `<details>` snippet of the top 3–5 failing tests/errors when applicable, and any inline-comment overflow findings.
  4. **Impact & Blast Radius:** Rule-based risk alerts with reviewer guidance.
  5. **Test Results & Coverage:** Suite stats, overall coverage vs. threshold, diff coverage, exact uncovered diff line ranges (e.g., `src/services/http.service.ts: L42-L49`) when below threshold, a focused table of directories below threshold or modified in the PR, and a collapsed `<details>` block for the full directory breakdown.
  6. **Changed Files & Recent Commits:** Compact category summary table + collapsed `<details>` blocks for file-by-file diffs and commit history.
* **FR-5.6:** The full report MUST also be written to `$GITHUB_STEP_SUMMARY`.

## 5. Standardized Severity & Enforcement Matrix

All language linters and SAST tools MUST normalize findings into the following enforcement tiers:

| Severity | Badge | Inline Comment | Blocks Merge? | GitHub Security Tab (SARIF) |
| :--- | :--- | :--- | :--- | :--- |
| **Critical / High (Security)** | `🛑 Critical` | Always | Yes | Yes (Code Scanning Alert) |
| **Error (Correctness / Type)** | `🔴 Error` | Always | Yes | Optional |
| **Warning (Code Smell / Complexity)** | `🟡 Warning` | Up to PR cap (15) | No (Configurable) | No |
| **Info / Style / Nit** | `🔵 Info` | Summary only (no inline spam) | No | No |

## 6. Non-Functional Requirements (NFRs)

| Category | Requirement |
| :--- | :--- |
| **Code Quality — Strict TypeScript** | All source code in `src/` and `tests/` MUST be written in TypeScript (ESM `NodeNext`) with `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitReturns: true`, `noFallthroughCasesInSwitch: true`, `noImplicitOverride: true`, and `verbatimModuleSyntax: true`. Static analysis MUST enforce `typescript-eslint` (`strictTypeChecked`) with zero `any` leaks. |
| **Runtime Safety — Schema Validation** | All external inputs (SARIF JSON, JUnit/Cobertura XML structures, consumer `impact-rules.json`, and GitHub Action inputs/env vars) MUST be validated at runtime using **Zod**, producing clear, actionable error messages on schema violations. |
| **Execution Performance — `esbuild` Bundling** | `post-inline-review` and `pr-summary` MUST be implemented as native Node GitHub Actions (`using: 'node20'` / `'node24'`) executing self-contained `esbuild` bundles in `dist/`. Consumer PR runs MUST NOT invoke `npm install` or `tsc` for central tooling. |
| **Artifact Integrity — `dist/` Freshness** | The central repo's `self-test.yml` CI workflow MUST verify that committed `dist/` bundles match `src/` via `npm run build && git diff --exit-code dist/`, blocking merges if compiled artifacts are stale. |
| **Security — Action Pinning** | All third-party GitHub Actions MUST be pinned to full 40-character commit SHAs with version comments and managed via Dependabot/Renovate. |
| **Security — Injection Prevention** | Consumer command inputs MUST be passed via `env:` variables inside a `run-gate` composite action and NEVER interpolated directly into `run:` blocks. |
| **Security — Least Privilege** | Root workflow `permissions` MUST be `{}`. Elevated permissions (`pull-requests: write`, `security-events: write`) MUST be scoped strictly to the jobs that require them. |
| **Security — Fork Safety** | Consumer workflows MUST trigger on `pull_request` (never `pull_request_target`) when executing PR code. |
| **Tone & UX Quality** | All automated comments MUST use neutral, objective, peer-like phrasing (no accusatory language) and link directly to authoritative rule documentation. |
| **Performance & Concurrency** | Independent gates (`typecheck`, `lint-and-sast`, `test-and-coverage`, `build`) MUST run in parallel. `concurrency` MUST cancel stale in-progress runs on new pushes. |
| **Reliability** | Every job MUST define `timeout-minutes` (default: 20 minutes). The `pr-summary` job MUST run with `if: always()` so failures are always surfaced clearly on the PR. |
| **Maintainability** | The central repository MUST include a `self-test.yml` workflow running `actionlint`, `tsc --noEmit`, `eslint`, `vitest` (≥ 90% coverage), and the `dist/` freshness check on every PR. |

## 7. Success Metrics (KPIs)

* **Onboarding Time:** A new repository (Node, Python, Go, or Java) can integrate the workflow in **under 10 minutes**.
* **Central Tooling Overhead:** Pre-bundled `dist/*.js` Node actions start and complete in **under 5 seconds** with zero external package downloads.
* **Comment Hygiene:** **100%** of PRs maintain exactly one sticky verification comment per `report-id` and **0** duplicate inline comments across unlimited pushes.
* **Auto-Resolution Accuracy:** **100%** of fixed inline bot findings are automatically resolved on the next push.
* **Inline Review Precision:** **0** inline linter comments posted on untouched legacy code lines; **≤ 15** inline comments per PR.
* **Adoption:** Target **80%+** of active organization repositories migrated to `@v1` within 2 quarters of release.

## 8. Dependencies & Assumptions

* Consumer repositories use GitHub Actions and have `GITHUB_TOKEN` permissions enabled for PR reviews/comments (`pull-requests: write`) and Security events (`security-events: write`).
* Consumer test/lint tools are configured to emit standard JUnit XML, LCOV/Cobertura XML, and/or SARIF files.
* For SonarQube integration, consumers must have an active SonarQube/SonarCloud project and configure `SONAR_TOKEN` in repository/org secrets.

## 9. Release Milestones

| Phase | Deliverable | Exit Criteria |
| :--- | :--- | :--- |
| **Phase 1** | Strict TypeScript scaffold, Zod schemas (`src/types/`), `esbuild` pipeline, & universal parsers (`src/parsers/`) | `tsc --noEmit`, `eslint` (`strictTypeChecked`), and Vitest unit tests passing with fixture JUnit, LCOV, Cobertura, SARIF, and git diffs. |
| **Phase 2** | Enterprise review formatter & sync (`sarif-to-review.ts`, `review-sync.ts`, `pr-summary-renderer.ts`, `comment-sync.ts`) | 3-part inline formatting, 15-comment cap, deduplication, GraphQL auto-resolve, and `[!CAUTION]` failure callouts verified. |
| **Phase 3** | Composite & Native Node Actions (`setup-runtime`, `run-gate`, `post-inline-review`, `pr-summary`) + `self-test.yml` | Bundled `dist/*.js` actions, `dist/` freshness CI check, safe command execution, and timing capture verified. |
| **Phase 4** | Reusable `pr-verification.yml` + Multi-language pilot (1 Node/TS + 1 Python/Go repo) | Validated parallel gates, fork safety, permissions, `report-id` isolation, and SHA pinning. |
| **Phase 5** | GA Release (`v1.0.0` / `v1`) & `CALLER_GUIDE.md` | Published to org with branch protection required-check documentation. |
