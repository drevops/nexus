# Security policy

Follow this page to report a security vulnerability in Nexus or to check that a release came from this repository.

## Supported versions

Security fixes go into the latest release only, which https://nexus.drevops.com serves. Upgrade a self-hosted copy to the [latest release](https://github.com/drevops/nexus/releases/latest).

## Report a vulnerability

Report the vulnerability privately, because a public issue exposes it before a fix ships. Use 1 of these channels:

- On the repository's **Security** tab, click **Report a vulnerability**.
- Email the details to [alex@drevops.com](mailto:alex@drevops.com).

Include these details in your report:

- The version, from the app's **About** dialog.
- The steps or the file that reproduce the problem, such as a `.nexus.json` document or a config folder.
- What an attacker gains, such as running script on the page.

You get a reply within 3 business days. After the report is confirmed, the fix ships in a new release. The report is then published as a security advisory that credits you, unless you ask to stay anonymous.

## Verify a release

Every release attaches 2 files:

- `nexus-<version>.tar.gz` holds the site exactly as GitHub Pages serves it.
- `checksums.txt` lists the SHA-256 checksum of every file in the site.

The release workflow signs a provenance attestation for both files. To check that a file was built from this repository by that workflow, run the GitHub CLI in the folder that holds it:

```bash
gh attestation verify nexus-1.2.3.tar.gz --repo drevops/nexus --signer-workflow drevops/nexus/.github/workflows/release.yml
```

Replace `1.2.3` with the release version.

To check a file that https://nexus.drevops.com serves, download it and compare it with `checksums.txt`. The paths in `checksums.txt` are relative to the site root:

```bash
curl -sSO https://nexus.drevops.com/src/app.js
grep '  src/app.js$' checksums.txt
shasum -a 256 app.js
```

The 2 checksums match when the served file is the released one.
