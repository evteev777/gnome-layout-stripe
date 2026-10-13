# Layout Stripe 1.0 Beta 1

The first public prerelease of Layout Stripe, a keyboard layout indicator for
GNOME Shell.

## Features

- Screen-edge stripe with 1–3 colors, four edge positions and 6 logical pixel
  default thickness.
- Per-layout opacity, Hide with opacity restoration, reverse order and Unicode
  symbols.
- Independent Unicode and system layout indicators in the top panel.
- Native GTK emoji chooser with categories and search; manual symbol entry.
- Automatic presets for US/GB English, German, French, Italian, Spanish, Russian,
  Belarusian, Ukrainian and Polish.
- Saved custom presets, reset without deleting presets, multiple monitors and
  optional fullscreen visibility.

## Compatibility

Confirmed by the maintainer on **GNOME Shell 50.1 / Wayland**. GNOME 46–49 are
listed for beta testing but have not yet been validated on real desktops.
Other desktop environments are not supported. Please report issues with the
GNOME Shell version, session type and relevant journal messages.

## Install

Download `layout-stripe@evteev.ru.shell-extension.zip`, then run:

```bash
gnome-extensions install --force ./layout-stripe@evteev.ru.shell-extension.zip
```

Log out and back in, then run:

```bash
gnome-extensions enable layout-stripe@evteev.ru
gnome-extensions prefs layout-stripe@evteev.ru
```

Existing settings and custom presets are preserved. Explicitly saved thickness
values remain unchanged; set the thickness to 6 manually if preferred.

If upgrading from `layout-stripe@alexander.local`, disable and uninstall that
prototype first, as described in README.md. Both UUIDs use the same settings path.

This prerelease has not yet been submitted to extensions.gnome.org.
