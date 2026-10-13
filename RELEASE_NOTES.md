# Layout Stripe 1.0 Beta 2

This beta adds an additional layout shortcut selector and separates the panel
indicator's left-click source list from its right-click settings menu.

## New in beta 2

- Left-click: input sources with Unicode symbols, names and an active-source check.
- Right-click: Layout Stripe Settings, Show Keyboard Layout and Keyboard Settings.
- Centered, independently managed popup to avoid neighboring menu hover switches.
- One additional layout shortcut selector; standard next/previous editing remains
  in GNOME Keyboard Settings. There is no selectable Custom item.
- Native GNOME Alt+Shift/Ctrl+Shift bindings and an XKB Caps Lock switch,
  preserving unrelated shortcuts and keyboard options.
- Recognition of manually configured modifier shortcuts; None removes only the
  additional switch while keeping standard shortcuts.
- Reload input sources after live XKB option changes to restore Caps Lock switching
  on GNOME 50.1 without replacing GNOME methods.

System shortcut edits persist independently of the extension. Resetting Layout
Stripe does not reset those shortcuts.

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

Beta 1 was confirmed by the maintainer on **GNOME Shell 50.1 / Wayland**.
The maintainer confirmed the beta 2 menus and Alt+Shift/Ctrl+Shift/None selections.
The Caps Lock reload fix still needs desktop testing. GNOME 46–49 are
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
