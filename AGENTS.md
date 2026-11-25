# Azimuth: agent notes

## Kadarla platform

- Product slug: `azimuth` (kadarla.com/apps/azimuth). Public repo, run from source (no hosted builds yet), so
  nothing is tracked today.
- Telemetry (not added yet): when there's a distributed build, add the JS SDK to the Electron main process
  (copy `kadarla-platform/sdk/js/index.js` to `electron/kadarla-telemetry.js`;
  `init({ app: "azimuth", version: app.getVersion(), requireConsent: true })`, ask once with
  `dialog.showMessageBox`, add a "Share Anonymous Usage Stats" menu checkbox). Opt-in only; never send
  subscription, resource, queue or message names.
- Builds: `kp release azimuth <mac|windows|linux> <files…> --version x.y.z` hosts them on dl.kadarla.com with counted
  downloads; link `https://dl.kadarla.com/azimuth/<platform>` from the README and store listing.
- For installs, downloads, traffic, reviews, uptime or releases use the kadarla skill:
  /Users/saichandankadarla/Code/active/kadarla-platform/skills/kadarla/SKILL.md (CLI: `kp`).
