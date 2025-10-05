# Security Policy

## Reporting a Vulnerability

If you discover a security issue in `rest-shape`, please **do not create a public GitHub issue**. Instead, report it **via a direct message to the repository owner on GitHub** (GitHub inbox).

Include the following information to help us resolve the issue quickly:

- Affected version(s) of `rest-shape`
- Steps to reproduce the issue
- Expected vs actual behavior
- Potential impact of the vulnerability

We aim to respond within **48 hours** of receiving a report.

---

## Supported Versions

`rest-shape` follows a **version 2.x release**:

- Only the latest **major version (v2.x)** is actively maintained and receives security updates.
- Previous major versions (v1.x) may not receive patches for new vulnerabilities.

---

## Coordinated Disclosure

We follow **responsible disclosure** practices:

- Security reports are handled confidentially.
- Fixes will be released in a timely manner.
- Contributors who report valid security issues will be **credited** in release notes if they consent.

---

## Best Practices

To reduce risk when using `rest-shape`:

- Always validate untrusted input if using dynamic expressions in queries.
- Keep your `rest-shape` dependency up-to-date.
- Review any computed or inline JS expressions used in queries.

---

## Acknowledgments

We appreciate security researchers and contributors who help keep `rest-shape` safe for everyone.
