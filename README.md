# Layout Stripe

Keyboard layout indicators for GNOME Shell:

- **Screen edge:** a configurable stripe using a country's flag colors.
- **Top panel:** a flag, another Unicode symbol, and/or the system layout indicator.

Each input source has its own colors, opacity, visibility, color order and symbol.
The stripe passes clicks through and does not reserve workspace space.

## Defaults

| Setting | Default |
| --- | --- |
| Screen edge | Bottom |
| Thickness | 3 logical pixels |
| All monitors | On |
| Show over fullscreen windows | Off |
| Unicode symbol in the top panel | On |
| System layout indicator | Off |
| Unknown-layout color | Green (`#57E389`) |

Built-in presets: English (US), English (GB), German, French, Italian, Spanish,
Russian, Belarusian, Ukrainian and Polish, in that order. US and British English
use their respective flags and one hidden green stripe segment. Other presets
are visible. Australian English and other layouts can use custom presets.
XKB variants such as `us+intl` inherit their base layout's preset. Unknown layouts
and IBus input methods use the fallback color until customized.

Flag colors are cues, not complete flag artwork. Each stripe contains 1–3 equal
segments. Colors run left to right on horizontal edges and top to bottom on side
edges; Reverse changes their order. The Unicode symbol is independent of the
stripe colors and remains visible when the stripe is hidden. Its appearance
depends on the installed fonts.

**Hide** remembers the previous opacity and restores it when unchecked.
**My presets** saves complete configurations. Applying a preset copies its
settings; subsequent changes to the saved preset do not alter other layouts.
**Reset** restores defaults and automatic preset selection without deleting
saved presets or changing the system's input sources.

## Install

Build the package as described below, then run:

```bash
gnome-extensions install --force dist/layout-stripe@evteev.ru.shell-extension.zip
```

Log out and back in, then enable the extension and open its preferences:

```bash
gnome-extensions enable layout-stripe@evteev.ru
gnome-extensions prefs layout-stripe@evteev.ru
```

Installation does not require sudo. The schema is compiled by the installer.

### Upgrade from the local prototype

The public UUID is `layout-stripe@evteev.ru`. If the old
`layout-stripe@alexander.local` is installed, disable and uninstall it before
installing the new package:

```bash
gnome-extensions disable layout-stripe@alexander.local
gnome-extensions uninstall layout-stripe@alexander.local
```

The settings schema and dconf path are unchanged, so applied settings and saved
presets are retained. Avoid running both extensions at once. Log out and back in
to load the new code and schema. Reset applies the new defaults to settings that
were explicitly saved by an older version.

Legacy global opacity and reverse settings are migrated once into per-source
profiles. Their schema keys remain only for migration. Recognizable old shared
English defaults are migrated to the appropriate US/GB symbol; customized symbols
and saved user presets are retained.

## Compatibility

Metadata enables GNOME Shell 46–50. The intended baseline is GNOME 46 on X11 or
Wayland and GNOME 50 on Wayland. Other desktop environments are not supported.
Future GNOME releases are deliberately not listed.

Automated tests use simulated Shell/GTK objects and do not certify desktop
compatibility. Before catalog submission, complete the real-desktop checks in
[REVIEW.md](REVIEW.md), especially GNOME 46 and intermediate releases.

The extension follows the local GNOME input source, not an independent layout in
a remote desktop session. The stripe is hidden on the lock screen. Disabling the
extension restores the system indicator's visibility. Avoid having another
extension control that same indicator's visibility at the same time.

## Development

Node.js 22.13+ (22.x) or 24+, Python 3 and GLib development utilities are needed
for development and packaging, not for using the installed extension.

```bash
npm ci
npm run lint
npm test
glib-compile-schemas --strict --dry-run schemas
npm run build
```

The package is written to `dist/`. It contains only runtime modules, metadata,
the schema XML and LICENSE. Tests, Node dependencies and build tooling stay in
the repository. GitHub Actions runs lint, tests, schema validation and packaging.

`extension.js` manages Shell actors and signals. `prefs.js` owns the GTK
preferences. `common.js` contains pure profile, preset, geometry and migration
logic. `panel-visibility.js` temporarily controls the system indicator without
replacing Shell methods. All objects and signals created at enable time are
cleaned up at disable time, including partial activation failures.

## Troubleshooting

```bash
gnome-extensions info layout-stripe@evteev.ru
journalctl --user -b -o cat | grep -Ei -A12 -B3 'layout-stripe|JS ERROR'
```

Report problems through [GitHub Issues](https://github.com/evteev777/gnome-layout-stripe/issues),
including the GNOME Shell version, session type and relevant journal messages.

To back up or restore settings:

```bash
dconf dump /org/gnome/shell/extensions/layout-stripe/ > layout-stripe-settings.ini
dconf load /org/gnome/shell/extensions/layout-stripe/ < layout-stripe-settings.ini
```

## License

GPL-3.0-or-later. See [LICENSE](LICENSE). Source files carry the corresponding
SPDX identifier. Contributions are accepted under the same license.
