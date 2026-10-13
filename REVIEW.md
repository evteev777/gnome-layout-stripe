# Pre-publication review

## Changes made

- Replaced the prototype UUID with `layout-stripe@evteev.ru`; preserved the
  settings identity and documented the prototype uninstall procedure.
- Limited metadata to GNOME 46–50 and added the repository URL.
- Added GPL-3.0-or-later notices, English documentation and schema summaries.
- Removed unused flag-orientation state and the unused legacy palette accessor.
- Retained legacy schema keys only where required to migrate saved settings.
- Added versioned US/GB migration without rewriting saved user presets.
- Made explicit Custom selection persist instead of being a no-op.
- Stopped Unicode typing from rewriting the entry and moving its caret.
- Limited Unicode symbols to 32 code points and removed control characters.
- Avoided stripe reconstruction for changes that only affect saved presets or
  migration state.
- Kept activation failure cleanup and visibility restoration; ensured the
  visibility guard is released even if a property assignment fails.
- Removed a synthetic test that demonstrated obsolete code rather than testing
  the extension; retained actual partial-attachment regression coverage.
- Added the native GTK emoji chooser beside the Unicode entry and set the
  default stripe thickness to 6 logical pixels. Saved thickness values are retained.
- Added ESLint, a dependency lockfile, automated checks and reproducible packaging.

## Runtime design

No Shell objects are created during module initialization. Runtime actors and
signal connections are owned by the extension and released in `disable()`.
Activation failures call the same cleanup path. Shell modules and GTK preferences
remain in separate processes. No polling, subprocesses, network access or
telemetry is used at runtime. Color input is restricted to safe RGB hex values.

The extension necessarily uses Shell's internal input source manager and system
indicator container. These APIs may change between major GNOME releases. Unit
tests simulate their behavior; they do not establish compatibility with a real
Shell release. The compatibility controls in preferences remain useful across
GTK/libadwaita versions used by different distributions.

## Desktop verification

For beta 1, the maintainer reported successful testing on GNOME Shell 50.1 / Wayland,
including the native emoji chooser. This is confirmation on one system; the
individual matrix below still needs results for other supported releases.

## Desktop checks still required

For every release listed in metadata, record the actual result before submitting
it to extensions.gnome.org. Remove versions that cannot be tested or supported.

- [ ] Fresh installation, preferences opening and all default values.
- [ ] Upgrade from the prototype with existing profiles and saved presets.
- [ ] US, GB, layout variants, unknown sources and available IBus input methods.
- [ ] Repeated enable/disable; no orphan actors or journal errors.
- [ ] Changing Unicode/system indicator switches and visibility restoration.
- [ ] Four screen edges, segment counts, reverse, opacity and Hide restoration.
- [ ] Two monitors, primary-monitor changes, disconnect/reconnect and scaling.
- [ ] Fullscreen windows on one monitor while the other remains usable.
- [ ] Lock/unlock, Overview and suspend/resume.
- [ ] Reset, per-layout restore and saving/removing custom presets.
- [ ] Preferences typing, focus and Unicode rendering on the target desktop.
- [ ] Left/right click menus, neighboring icons, keyboard navigation and source activation.
- [ ] System layout viewer and keyboard settings while the system indicator is hidden.
- [ ] Next/previous shortcuts, modifier-only switches, conflicts and cancellation.
- [ ] System shortcuts persist after extension disable and remain intact after Reset.

## Catalog submission

Use the runtime ZIP from `npm run build`. Attach representative screenshots and
review the current [GNOME review guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html).
The maintainer must understand and be able to explain submitted code, including
code developed with AI assistance. Catalog review is not a substitute for runtime
validation. Beta 2 menus and the manual native GNOME Alt+Shift binding were confirmed by the
maintainer. The dropdown now uses that native route for Alt+Shift/Ctrl+Shift; the
revised dropdown and Ctrl+Shift still require desktop verification.

The beta release workflow publishes a GitHub prerelease after the version is
merged into master. Catalog submission remains a separate step.
