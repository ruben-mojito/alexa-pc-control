# Contributing

Thank you for considering contributing to **Alexa PC Control**! All contributions are welcome.

---

## Getting started

1. **Fork** the repository and clone your fork locally.
2. Create a feature branch: `git checkout -b feat/your-feature`.
3. Install dependencies for the component you are working on:

   ```bash
   cd server && npm install
   # or
   cd agent && npm install
   # or
   cd wol-service && npm install
   ```

4. Make your changes, following the code style described below.
5. Write or update tests as needed.
6. Run the tests: `npm test`.
7. Commit your changes with a clear, descriptive message.
8. Push to your fork and open a Pull Request against `main`.

---

## Code style

* **Language**: Node.js (ES modules are fine, CommonJS is the default).
* **Formatting**: use 2-space indentation and single quotes.
* **Linting**: run `npm run lint` before opening a PR.
* **Comments**: prefer self-documenting code; add comments only when the intent is not obvious.

---

## Pull Request guidelines

* Keep PRs focused – one feature or bug fix per PR.
* Include a clear description of what changed and why.
* For large changes, open an issue first to discuss the approach.
* All tests must pass before merging.
* Update documentation (`docs/`) if your changes affect the API or setup.

---

## Reporting bugs

Please open a [GitHub Issue](https://github.com/ruben-mojito/alexa-pc-control/issues) with:

* A clear title.
* Steps to reproduce.
* Expected vs actual behaviour.
* Your environment (OS, Node.js version, etc.).

---

## Security vulnerabilities

Please **do not** open a public issue for security vulnerabilities. Instead, contact the maintainer directly via email (see the repository profile).

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
