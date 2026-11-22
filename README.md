# review-pr: Enterprise PR Verification Workflow

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-review--pr-blue?logo=github)](https://github.com/marketplace/actions/review-pr)
[![Self-Test & Quality Gates](https://github.com/groot-arena/review-pr/actions/workflows/self-test.yml/badge.svg)](https://github.com/groot-arena/review-pr/actions/workflows/self-test.yml)
[![Version](https://img.shields.io/badge/version-v1-blue.svg)](https://github.com/groot-arena/review-pr/releases)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict%20NodeNext-blue)](tsconfig.json)

An enterprise-grade, reusable GitHub Action and Workflow (`@v1`) published in the GitHub Marketplace that provides automated quality gates, diff coverage verification, high-signal inline static analysis reviews on changed lines, blast-radius detection, and a single idempotent sticky Pull Request summary report.

---

## Table of Contents

* [Key Features & Architecture](#key-features--architecture)
* [Integration Modes (Action vs Reusable Workflow)](#integration-modes-action-vs-reusable-workflow)
  * [Option A: Drop-in Step (GitHub Marketplace Action)](#option-a-drop-in-step-github-marketplace-action)
  * [Option B: Complete Parallel Pipeline (Reusable Workflow)](#option-b-complete-parallel-pipeline-reusable-workflow)
* [Universal Output Contracts](#universal-output-contracts)
* [Quick Start (5-Minute Onboarding)](#quick-start-5-minute-onboarding)
* [Caller Templates by Language](#caller-templates-by-language)
  * [Node.js / TypeScript](#nodejs--typescript)
  * [Python](#python)
  * [Go](#go)
  * [Java (Maven & Gradle)](#java-maven--gradle)
  * [Monorepo & Polyglot Setups](#monorepo--polyglot-setups)
* [Blast Radius & Reviewer Checklists](#blast-radius--reviewer-checklists)
  * [Default Impact Rules](#default-impact-rules)
  * [Customizing Impact Rules](#customizing-impact-rules)
* [Configuring Branch Protection & Required Checks](#configuring-branch-protection--required-checks)
* [Reference Guide: Inputs, Outputs & Secrets](#reference-guide-inputs-outputs--secrets)
  * [Marketplace Action (action.yml) Reference](#marketplace-action-actionyml-reference)
  * [Reusable Workflow (pr-verification.yml) Reference](#reusable-workflow-pr-verificationyml-reference)
* [Publishing to GitHub Marketplace](#publishing-to-github-marketplace)
* [Releases & Tag Versioning](#releases--tag-versioning)
* [Local Development & Testing](#local-development--testing)

---

## Key Features & Architecture

* **Dual-Consumption Model:** Available both as a drop-in **GitHub Marketplace composite action** (`uses: groot-arena/review-pr@v1`) for existing pipelines, and as a **turnkey reusable workflow** (`.github/workflows/pr-verification.yml@v1`) for complete parallel CI gate orchestration.
* **Universal Language-Agnostic Engine:** Consumer repositories emit industry-standard formats (**JUnit XML**, **LCOV / Cobertura XML**, **SARIF / RDJSON**), enabling a single verified workflow to support Node.js, Python, Go, Java, and custom stacks.
* **Strict TypeScript + Runtime Schema Validation:** All central logic is written in strict TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`) paired with **Zod** runtime schemas to safely validate untrusted external XML/JSON reports.
* **Pre-Bundled Native Actions (`esbuild`):** TypeScript entrypoints are compiled into self-contained `dist/*.js` bundles and run via native Node actions (`using: 'node20'`), delivering sub-second startup with **zero `npm install` overhead** on consumer PRs.
* **High-Signal, Zero-Spam UX:** Inline reviews follow a structured 3-part anatomy (Header, Impact, Remediation) with one-click fix suggestion blocks, strict diff-only filtering (ignoring untouched legacy code), a 15-comment cap, deduplication on re-push, and automatic GraphQL thread resolution once fixed.
* **Monorepo & Polyglot Ready:** Supports multiple independent workflow calls in the same PR via a `report-id` input (e.g., `backend`, `frontend`), isolating sticky PR comments via unique HTML markers.
* **Enterprise Security & Hygiene:** Enforces least-privilege `permissions`, SHA-pinned third-party actions, safe `env:`-based command execution (preventing shell injection), concurrency cancellation, and job timeouts.

---

## Integration Modes (Action vs Reusable Workflow)

Choose the integration mode that matches your repository's workflow:

### Option A: Drop-in Step (GitHub Marketplace Action)

If your repository already runs builds and tests in its own custom jobs, use the action as a final step in your job. It parses the generated reports, runs diff coverage, posts inline reviews, and creates the sticky PR comment:

```yaml
name: CI
on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write
  security-events: write

jobs:
  test-and-verify:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Full fetch required for git diff coverage

      # ... Run your project's tests, coverage, and linting here ...

      - name: PR Verification & Sticky Report
        uses: groot-arena/review-pr@v1
        with:
          junit-path: 'reports/junit.xml'
          coverage-path: 'reports/lcov.info'
          sarif-path: 'reports/eslint.sarif'
          coverage-threshold: '80'
          diff-coverage-threshold: '80'
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Option B: Complete Parallel Pipeline (Reusable Workflow)

If you want an end-to-end, out-of-the-box parallel gate matrix (`typecheck`, `lint-and-sast`, `test-and-coverage`, `build`, `sonar`, `pr-summary`), call the reusable workflow directly:

```yaml
name: PR Verification
on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write
  security-events: write

jobs:
  verify:
    uses: groot-arena/review-pr/.github/workflows/pr-verification.yml@v1
    with:
      language: 'node'
      runtime-version: '22'
      typecheck-command: 'npm run typecheck'
      lint-command: 'npm run lint -- -f @microsoft/eslint-formatter-sarif -o eslint.sarif'
      test-command: 'npm run test:coverage -- --reporter=junit --outputFile=junit.xml'
      build-command: 'npm run build'
      junit-path: 'junit.xml'
      coverage-path: 'coverage/lcov.info'
      sarif-path: 'eslint.sarif'
      coverage-threshold: 80
      diff-coverage-threshold: 80
```

---

## Universal Output Contracts

To integrate any language stack, configure your build/test commands to emit standardized report files:

| Signal | Standard Format | Node.js / TS | Python | Go | Java |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Test Results** | **JUnit XML** | `vitest --reporter=junit` | `pytest --junitxml=...` | `gotestsum --junitfile=...` | Maven Surefire / Gradle XML |
| **Coverage** | **LCOV** or **Cobertura** | `lcov.info` | `pytest --cov-report=xml` | `gocover-cobertura` | JaCoCo XML |
| **Static Analysis / SAST** | **SARIF** or **RDJSON** | ESLint SARIF formatter | Ruff `--output-format=sarif` | `golangci-lint --out-format=sarif` | SpotBugs / Checkstyle SARIF |

---

## Quick Start (5-Minute Onboarding)

1. Create `.github/workflows/verify.yml` in your repository.
2. Grant the required permissions:
   ```yaml
   permissions:
     contents: read
     pull-requests: write
     security-events: write
   ```
3. Call `groot-arena/review-pr/.github/workflows/pr-verification.yml@v1` with your language and verification commands.

---

## Caller Templates by Language

### Node.js / TypeScript

Uses Vitest (or Jest) for single-pass test and coverage execution, and ESLint with SARIF output for inline PR review comments:

```yaml
name: PR Verification
on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write
  security-events: write

jobs:
  verify:
    uses: groot-arena/review-pr/.github/workflows/pr-verification.yml@v1
    with:
      language: 'node'
      runtime-version: '22'
      install-command: 'npm ci'
      typecheck-command: 'npm run typecheck'
      lint-command: 'npx eslint . --format @microsoft/eslint-formatter-sarif -o lint.sarif'
      test-command: 'npx vitest run --reporter=junit --outputFile=junit.xml --coverage'
      build-command: 'npm run build'
      junit-path: 'junit.xml'
      coverage-path: 'coverage/lcov.info'
      sarif-path: 'lint.sarif'
      coverage-threshold: 80
      diff-coverage-threshold: 80
```

---

### Python

Uses Ruff for high-speed SARIF linting and Pytest with XML coverage:

```yaml
name: PR Verification
on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write
  security-events: write

jobs:
  verify:
    uses: groot-arena/review-pr/.github/workflows/pr-verification.yml@v1
    with:
      language: 'python'
      runtime-version: '3.12'
      install-command: 'pip install -r requirements-dev.txt'
      typecheck-command: 'mypy src/'
      lint-command: 'ruff check . --output-format=sarif --output-file=lint.sarif || true'
      test-command: 'pytest --junitxml=junit.xml --cov=src --cov-report=xml:coverage.xml tests/'
      junit-path: 'junit.xml'
      coverage-path: 'coverage.xml'
      sarif-path: 'lint.sarif'
      coverage-threshold: 80
      diff-coverage-threshold: 85
```

---

### Go

Uses `golangci-lint` (SARIF), `gotestsum` (JUnit), and `gocover-cobertura`:

```yaml
name: PR Verification
on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write
  security-events: write

jobs:
  verify:
    uses: groot-arena/review-pr/.github/workflows/pr-verification.yml@v1
    with:
      language: 'go'
      runtime-version: '1.23'
      setup-command: |
        go install gotest.tools/gotestsum@latest
        go install github.com/boumenot/gocover-cobertura@latest
      lint-command: 'golangci-lint run --out-format=sarif > lint.sarif || true'
      test-command: 'gotestsum --junitfile junit.xml -- -coverprofile=coverage.out ./...'
      coverage-command: 'gocover-cobertura < coverage.out > coverage.xml'
      build-command: 'go build ./...'
      junit-path: 'junit.xml'
      coverage-path: 'coverage.xml'
      sarif-path: 'lint.sarif'
      coverage-threshold: 75
      diff-coverage-threshold: 80
```

---

### Java (Maven & Gradle)

Uses Maven Surefire / JaCoCo and SpotBugs / Checkstyle:

```yaml
name: PR Verification
on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write
  security-events: write

jobs:
  verify:
    uses: groot-arena/review-pr/.github/workflows/pr-verification.yml@v1
    with:
      language: 'java'
      runtime-version: '21'
      install-command: './mvnw clean install -DskipTests'
      lint-command: './mvnw spotbugs:check checkstyle:check || true'
      test-command: './mvnw test jacoco:report'
      build-command: './mvnw package -DskipTests'
      junit-path: 'target/surefire-reports'
      coverage-path: 'target/site/jacoco/jacoco.xml'
      coverage-threshold: 80
```

---

### Monorepo & Polyglot Setups

Monorepos can invoke the verification workflow multiple times within the same PR by providing unique `report-id` and `working-directory` values. Each invocation maintains its own sticky PR summary comment without collision.

```yaml
name: Monorepo PR Verification
on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write
  security-events: write

jobs:
  verify-frontend:
    uses: groot-arena/review-pr/.github/workflows/pr-verification.yml@v1
    with:
      language: 'node'
      runtime-version: '22'
      working-directory: 'frontend'
      report-id: 'frontend'
      install-command: 'npm ci'
      typecheck-command: 'npm run typecheck'
      lint-command: 'npx eslint . --format @microsoft/eslint-formatter-sarif -o lint.sarif'
      test-command: 'npm test -- --reporter=junit --outputFile=junit.xml --coverage'
      junit-path: 'frontend/junit.xml'
      coverage-path: 'frontend/coverage/lcov.info'
      sarif-path: 'frontend/lint.sarif'

  verify-backend:
    uses: groot-arena/review-pr/.github/workflows/pr-verification.yml@v1
    with:
      language: 'go'
      runtime-version: '1.23'
      working-directory: 'backend'
      report-id: 'backend'
      test-command: 'gotestsum --junitfile junit.xml -- -coverprofile=coverage.out ./...'
      coverage-command: 'gocover-cobertura < coverage.out > coverage.xml'
      junit-path: 'backend/junit.xml'
      coverage-path: 'backend/coverage.xml'
```

---

## Blast Radius & Reviewer Checklists

### Default Impact Rules

The workflow automatically matches modified file paths against predefined blast-radius rules in [config/default-impact-rules.json](config/default-impact-rules.json):

* **Docker & Infrastructure:** `Dockerfile*`, `docker-compose*`, `compose*.{yml,yaml}`, `*compose*.{yml,yaml}`, `terraform/**`, `k8s/**`, `helm/**`
* **CI/CD & Workflows:** `.github/**`, `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci/**`
* **Authentication & Security:** `**/auth/**`, `**/security/**`, `**/oauth/**`, `**/jwt/**`, `**/rbac/**`
* **Database & Migrations:** `**/migrations/**`, `**/schema/**`, `**/models/**`, `*.sql`, `prisma/**`
* **Core Dependencies:** `package.json`, `pnpm-lock.yaml`, `requirements*.txt`, `go.mod`, `pom.xml`
* **Test Suites:** `tests/**`, `**/*.spec.*`, `**/*.test.*`

### Customizing Impact Rules

To extend or override the default blast-radius rules, add an `impact-rules.json` file to your repository and pass its path via `impact-rules-path`:

```json
{
  "rules": [
    {
      "id": "payments",
      "name": "Payments & Billing",
      "patterns": ["src/billing/**", "src/payments/**", "**/stripe/**"],
      "checklist": [
        "Verify idempotency key handling on mutation endpoints",
        "Ensure no PCI-sensitive data is logged",
        "Verify webhook signature validation"
      ]
    }
  ]
}
```

```yaml
    with:
      impact-rules-path: '.github/impact-rules.json'
```

---

## Configuring Branch Protection & Required Checks

To enforce that PRs cannot merge without passing all quality, test, and coverage gates:

1. In your GitHub repository, navigate to **Settings** → **Branches** → **Branch protection rules**.
2. Edit or create a protection rule for your target branch (e.g., `main`).
3. Enable **Require status checks to pass before merging**.
4. In the search box, select:
   * **`PR Verification Report`**: The authoritative summary gate that verifies all sub-gates, diff coverage thresholds, and static analysis blockers.

---

## Reference Guide: Inputs, Outputs & Secrets

### Marketplace Action (`action.yml`) Reference

Used when consuming the repository as a step via `uses: groot-arena/review-pr@v1`:

#### Inputs

| Input | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `junit-path` | `string` | `''` | Path to JUnit XML test results file |
| `coverage-path` | `string` | `''` | Path to LCOV or Cobertura XML coverage file |
| `sarif-path` | `string` | `''` | Path to SARIF static analysis / lint findings file |
| `gate-results-path` | `string` | `''` | Path to gate-results.json report |
| `coverage-threshold` | `string` | `'80'` | Minimum overall codebase line coverage percentage (0-100) |
| `diff-coverage-threshold` | `string` | `'80'` | Minimum line coverage percentage on PR modified diff lines (0-100) |
| `max-inline-comments` | `string` | `'15'` | Maximum inline review comments to post on PR diff |
| `impact-rules-path` | `string` | `''` | Path to custom blast-radius impact analysis rules JSON |
| `report-id` | `string` | `'default'` | Unique report identifier (useful for monorepos) |
| `github-token` | `string` | `''` | GitHub token for PR inline reviews and sticky comment upserts |
| `base-ref` | `string` | `'origin/main'` | Base Git ref for diff calculation |
| `head-ref` | `string` | `'HEAD'` | Head Git ref for diff calculation |
| `working-directory` | `string` | `'.'` | Working directory for paths and git diff |

#### Outputs

| Output | Type | Description |
| :--- | :--- | :--- |
| `verdict` | `string` | Overall verification gate verdict (`PASSED` or `FAILED`) |
| `diff-coverage` | `string` | Calculated diff coverage percentage on modified lines |
| `total-coverage` | `string` | Calculated overall codebase coverage percentage |
| `tests-passed` | `string` | Number of passing unit/integration tests |
| `tests-failed` | `string` | Number of failing unit/integration tests |
| `total-findings` | `string` | Total static analysis findings count |
| `critical-findings` | `string` | Critical severity static analysis findings count |
| `error-findings` | `string` | Error severity static analysis findings count |
| `warning-findings` | `string` | Warning severity static analysis findings count |
| `inline-comments-posted`| `string` | Number of inline comments posted to the PR |
| `overflow-count` | `string` | Number of findings exceeding the inline comment cap |

---

### Reusable Workflow (`pr-verification.yml`) Reference

Used when calling the workflow via `uses: groot-arena/review-pr/.github/workflows/pr-verification.yml@v1`:

#### Inputs

| Input | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `language` | `string` | *(required)* | Target runtime: `node`, `python`, `go`, `java`, or `custom` |
| `runtime-version` | `string` | `''` | Target runtime version (e.g. `'22'`, `'3.12'`, `'1.23'`, `'21'`) |
| `working-directory` | `string` | `'.'` | Subdirectory for monorepos |
| `report-id` | `string` | `'default'` | Unique ID isolating sticky PR comments in polyglot repos |
| `setup-command` | `string` | `''` | Custom setup command for tools or custom runtimes |
| `install-command` | `string` | `''` | Dependency installation command (e.g., `npm ci`, `pip install -r ...`) |
| `typecheck-command` | `string` | `''` | Static typecheck command (skipped if empty) |
| `lint-command` | `string` | `''` | Lint / SAST command emitting SARIF or RDJSON |
| `test-command` | `string` | `''` | Unit/integration test execution command |
| `coverage-command` | `string` | `''` | Optional separate coverage conversion command |
| `build-command` | `string` | `''` | Production build verification command |
| `junit-path` | `string` | `''` | Relative path to JUnit XML test report |
| `coverage-path` | `string` | `''` | Relative path to LCOV or Cobertura XML report |
| `sarif-path` | `string` | `''` | Relative path to SARIF report for inline review comments |
| `max-inline-comments` | `number` | `15` | Cap on inline PR review comments (overflow routes to summary) |
| `coverage-threshold` | `number` | `80` | Minimum overall line coverage percentage |
| `diff-coverage-threshold` | `number` | `80` | Minimum line coverage percentage on newly added/modified lines |
| `enable-sonar` | `boolean` | `false` | Enables SonarQube analysis when `SONAR_TOKEN` is passed |
| `impact-rules-path` | `string` | `''` | Relative path to custom impact rules JSON file |

#### Secrets

| Secret | Required | Description |
| :--- | :--- | :--- |
| `SONAR_TOKEN` | No | Token for SonarQube / SonarCloud PR analysis (used when `enable-sonar: true`) |
| `GITHUB_TOKEN` | Implicit | Provided automatically by GitHub Actions |

---

## Publishing to GitHub Marketplace

This repository satisfies all [GitHub Marketplace Actions requirements](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/publish-in-github-marketplace):
1. **Root Action Metadata:** The unified [action.yml](action.yml) resides at the root of the repository with valid name, description (< 125 chars), and branding (`icon: 'shield'`, `color: 'blue'`).
2. **Pre-Bundled Execution:** Standalone runtime code is packaged in `dist/` and committed to release tags, ensuring fast zero-dependency runs.
3. **Public Repository:** Marketplace listing requires public repository visibility.
4. **Initial Publication:**
   - Go to **Releases** → **Draft a new release**.
   - Check **"Publish this Action to the GitHub Marketplace"**.
   - Select primary and secondary categories (e.g., *Code quality*, *Continuous integration*).
   - Accept the GitHub Marketplace Developer Agreement and publish the release.
5. **Subsequent Releases:** Trigger `.github/workflows/release.yml` with the new version tag (e.g. `v1.1.0`), which tags the release and automatically syncs the update to the Marketplace listing.

---

## Releases & Tag Versioning

The workflow uses Semantic Versioning (`@v1.0.0`, `@v1`):

* **Consumer Usage:** Consumers reference `@v1` to automatically receive backward-compatible updates and security patches.
* **Release Publishing Workflow ([.github/workflows/release.yml](.github/workflows/release.yml)):**
  1. Triggered manually via **Actions** → **Publish Versioned Release** (`workflow_dispatch`).
  2. Protectable via GitHub Environment Protection Rules (requiring designated manual approvals).
  3. Automatically runs all quality gates and tests, bundles standalone `dist/` actions with `esbuild`, creates the version tag (`v1.0.0`), updates the moving major tag (`v1`), and publishes the GitHub Release.

---

## Local Development & Testing

```bash
# Install dependencies
npm ci

# Compile standalone esbuild bundles to dist/
npm run build

# Strict TypeScript typechecking
npm run typecheck

# ESLint static analysis
npm run lint

# Run all 36 unit and E2E tests with coverage report
npm run test:coverage
```
