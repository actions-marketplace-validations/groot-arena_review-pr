# Caller Onboarding & Integration Guide

Welcome to the **Enterprise Multi-Language PR Verification Workflow**. This guide provides ready-to-use, copy-paste workflow configurations for consumer repositories across all major engineering stacks.

---

## Table of Contents

1. [Quick Start (5-Minute Onboarding)](#quick-start-5-minute-onboarding)
2. [Language Templates](#language-templates)
   * [Node.js / TypeScript](#nodejs--typescript)
   * [Python](#python)
   * [Go](#go)
   * [Java (Maven & Gradle)](#java-maven--gradle)
3. [Monorepo & Polyglot Configurations](#monorepo--polyglot-configurations)
4. [Customizing Blast-Radius & Impact Rules](#customizing-blast-radius--impact-rules)
5. [Configuring Branch Protection & Required Checks](#configuring-branch-protection--required-checks)
6. [Input & Parameter Reference](#input--parameter-reference)

---

## Quick Start (5-Minute Onboarding)

1. Create `.github/workflows/verify.yml` in your repository.
2. Grant minimum required permissions:
   ```yaml
   permissions:
     contents: read
     pull-requests: write
     security-events: write
   ```
3. Call `your-org/ci-pr-verification/.github/workflows/pr-verification.yml@v1` with your language and test commands.

---

## Language Templates

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
    uses: your-org/ci-pr-verification/.github/workflows/pr-verification.yml@v1
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
    uses: your-org/ci-pr-verification/.github/workflows/pr-verification.yml@v1
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
    uses: your-org/ci-pr-verification/.github/workflows/pr-verification.yml@v1
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
    uses: your-org/ci-pr-verification/.github/workflows/pr-verification.yml@v1
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

## Monorepo & Polyglot Configurations

Monorepos can invoke the verification workflow multiple times within the same PR by setting distinct `report-id` and `working-directory` inputs. Each verification run maintains its own sticky PR summary comment without collision.

```yaml
name: Monorepo Verification
on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write
  security-events: write

jobs:
  verify-frontend:
    uses: your-org/ci-pr-verification/.github/workflows/pr-verification.yml@v1
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
    uses: your-org/ci-pr-verification/.github/workflows/pr-verification.yml@v1
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

## Customizing Blast-Radius & Impact Rules

The workflow comes with pre-configured blast-radius detection rules for Docker/Infra, CI/CD, Authentication, Database Migrations, and Core Dependencies.

To define domain-specific rules or override default checklists, create `.github/impact-rules.json` in your repository:

```json
{
  "rules": [
    {
      "id": "payments-crypto",
      "name": "Payments & Financial Transactions",
      "description": "Changes to Stripe, ledger, and billing logic",
      "patterns": [
        "src/billing/**",
        "src/payments/**",
        "**/stripe/**"
      ],
      "checklist": [
        "Verify idempotency key handling on API mutation endpoints",
        "Ensure no PCI-sensitive data (card numbers, CVV) is logged",
        "Verify webhook signature validation"
      ]
    }
  ]
}
```

Pass the path in your workflow call:
```yaml
    with:
      impact-rules-path: '.github/impact-rules.json'
```

---

## Configuring Branch Protection & Required Checks

To enforce that PRs cannot merge without passing all quality and coverage gates:

1. Go to repository **Settings** → **Branches** → **Branch protection rules**.
2. Select your main/target branch.
3. Check **Require status checks to pass before merging**.
4. Search for and select:
   * `PR Verification Report` (the summary gate that asserts all sub-gates, diff coverage thresholds, and critical SAST findings).

---

## Input & Parameter Reference

| Input | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `language` | `string` | *(required)* | Target runtime: `node`, `python`, `go`, `java`, or `custom` |
| `runtime-version` | `string` | `''` | Target runtime version (e.g. `'22'`, `'3.12'`, `'1.23'`, `'21'`) |
| `working-directory` | `string` | `'.'` | Subdirectory for monorepos |
| `report-id` | `string` | `'default'` | Unique ID isolating sticky PR comments in polyglot repos |
| `setup-command` | `string` | `''` | Custom setup command for tools or custom runtimes |
| `install-command` | `string` | `''` | Dependency installation command |
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
