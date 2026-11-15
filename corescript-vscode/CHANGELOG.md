# Change Log

All notable changes to the "CoreScript" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Initial release

## [4.8.3] - 2026-11-06

- Repackaged with the regenerated `ScriptApi.Files` API reference. The editor itself is unchanged.

## [4.8.4] - 2026-11-15

- **Fixed: compile errors were printed twice in the CoreScript Output tab.** The engine already
  inlines the mapped compile diagnostics into `error_message` and also ships the same strings in
  `error_details`; the extension printed both fields, so every error appeared twice while the
  desktop app (which reads only `error_message`) showed it once. The run command now prints
  `error_message` once, followed only by the `error_details` lines that are not already in that
  message — extra server-side `ErrorLog` entries are still shown, nothing is lost.
- Repackaged at 4.8.4 with the regenerated `EXTENSION_METHODS.md` reference (one rounding rule:
  no accessor rounds unless `decimals` is passed).