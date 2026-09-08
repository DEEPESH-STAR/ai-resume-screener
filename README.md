# Matchline — AI-Powered Resume Screener

A privacy-first, browser-based resume evidence reviewer by **Deepesh Pandey**.

Compare job-related skills with resume evidence, inspect explicit mentions and optional AI suggestions, and export a human-reviewed report. The app does not rank candidates or make hiring decisions.

## Features

- Upload PDF, DOCX or TXT resumes, or paste resume text.
- Review up to 10 resumes against up to 12 job-related skills.
- Extract suggested skills from a job description using a keyword dictionary.
- Inspect exact source evidence, aliases and missing mentions.
- Enable optional on-device sentence-embedding AI, with no API key.
- Mark evidence as human-reviewed and export a JSON report.
- Responsive light/dark interface with anonymous labels for file imports.
- No application backend, tracking or local-storage persistence.

## Run locally

Download or clone this repository, then serve the project folder:

```sh
git clone https://github.com/DEEPESH-STAR/ai-resume-screener.git
cd ai-resume-screener
python3 -m http.server 8080
```

On Windows, use `py -m http.server 8080` instead. Open **http://localhost:8080**, then click **Try sample review**.

Alternatively, open the folder in VS Code and use the Live Server extension on `index.html`.

Do not open `index.html` directly with `file://`: JavaScript modules and the AI worker need HTTP or HTTPS. The app has no build step. Internet is needed for the initial AI-model and PDF/DOCX-reader downloads.

## Hosting with GitHub Pages

The source is published at https://github.com/DEEPESH-STAR/ai-resume-screener. Publishing source does not automatically enable website hosting.

To enable hosting, open the repository's **Settings → Pages**, choose **Deploy from a branch**, select **main** and **/ (root)**, then **Save**. GitHub will display the website URL when deployment is ready. The project uses relative asset paths and requires no build command.

## Tests

Requirements: Node.js 24, npm, and Python 3 (`python3`) for document fixtures.

```sh
npm install
npx playwright install chromium
npm test
```

On Linux CI, install browser system dependencies with `npx playwright install --with-deps chromium`. If using an existing Chromium executable:

```sh
CHROMIUM_PATH=/path/to/chromium npm test
```

The suite automatically serves the app on a loopback port and shuts down afterward.

| Command | Coverage |
| --- | --- |
| `npm test` | 40 regression tests: 11 unit and 29 browser functional tests |
| `npm run test:unit` | Matching, aliases, boundaries, validation, chunking and cosine similarity |
| `npm run test:functional` | Uploads, screening, exports, validation, privacy regressions, mobile layout and mocked AI contracts |
| `npm run test:live` | 7 network-enabled tests using real PDF/DOCX readers and actual AI inference |

The live suite generates five fictional fixtures using the Python standard library: a text PDF, DOCX, textless PDF, 31-page PDF and malformed PDF. It writes JUnit results to `test-results/live-results.xml`. It does not replace live failures with mocked success.

For other installed browser engines:

```sh
npx playwright install --with-deps firefox webkit
TEST_BROWSER=firefox npm test
TEST_BROWSER=webkit npm run test:live
```

The environment-variable examples above use POSIX shell syntax; on Windows set `TEST_BROWSER` using your shell's environment-variable syntax.

### GitHub Actions

Two workflows are included:

- **Functional tests:** unit and Chromium functional tests on pushes, pull requests and manual runs.
- **Live integrations and browser compatibility:** regression tests and real integrations in Chromium, Firefox and WebKit on pushes to `main` and manual runs.

Check the repository's **Actions** tab for the actual outcome of each run. Workflow configuration is not proof that a run passed.

### Verification status and test boundaries

- All **40 regression tests passed locally in Chromium** before publication.
- The project owner also reported that the app worked in their local testing; that report does not establish coverage of every feature or browser.
- Mocked AI tests verify UI contracts, not the real model or inference quality.
- Real integration tests are included, but were not confirmed passing in the original network-restricted build environment. Consult GitHub Actions results for subsequent verification.
- Generated PDF/DOCX fixtures were checked with independent parsers; that is not equivalent to passing the app's document-reader integration tests.
- Mobile tests use viewport emulation, not physical devices. Browser matrices are configured; do not assume Firefox or WebKit passed without checking their results.
- No comprehensive accessibility, security, fairness, employment-law or production-readiness audit is claimed.

## Privacy and responsible use

Resume data remains in JavaScript memory for the current tab; the app does not write it to local/session storage or intentionally transmit it to a server. Reloading clears review data. Exported JSON contains resume excerpts and should be handled as confidential.

AI uses Transformers.js 3.5.2 from jsDelivr and the quantized `Xenova/all-MiniLM-L6-v2` model from Hugging Face. PDF import loads pdfjs-dist 4.10.38; DOCX import loads Mammoth 1.9.0 from jsDelivr. Download hosts receive ordinary connection metadata, and model/runtime files may remain in browser caches. Third-party dependencies are part of the trust boundary; review and maintain them before production use.

Use anonymous labels and job-related skills. The protected-criteria keyword guard is a basic safeguard, not a guarantee against biased or unlawful use. Explicit skill mentions do not establish qualifications; quick matching does not understand negation or experience duration. AI similarities are uncalibrated suggestions, not hiring suitability scores. Missing evidence does not mean a candidate lacks a skill.

Always verify source evidence and context through a consistent human-led process. Never automatically reject candidates using this app.

## Known limitations

- Scanned PDFs/OCR are not supported; paste extracted text instead.
- Password-protected, malformed and complex multi-column documents may fail or extract imperfectly.
- Large model downloads, browser memory limits, network availability and cache behavior can affect AI.
- Limits: 5 MB per file, 30 PDF pages, 40,000 characters per resume, 10 resumes and 12 skills per review.
- No accounts, shared database or server-side persistence. Export reports before clearing the workspace.
