// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import {addShortcutPreferences} from './shortcut-preferences.js';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {PRESETS, profileFor, presetFor, normalizeProfile, migrateSettings, matchingPreset,
    toggleHidden, resetSettings, parseObject, sourceKey, userPresets, normalizeSymbol} from './common.js';

export default class LayoutStripePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const inputSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.input-sources'});
        const getSources = () => inputSettings.get_value('sources').deep_unpack();
        migrateSettings(settings, getSources());
        window.set_default_size(820, 780);
        const general = new Adw.PreferencesPage({title: 'Stripe', icon_name: 'preferences-desktop-display-symbolic'});
        const layouts = new Adw.PreferencesPage({title: 'Layouts and presets', icon_name: 'input-keyboard-symbolic'});
        window.add(general);
        window.add(layouts);

        const appearance = new Adw.PreferencesGroup({title: 'Appearance',
            description: 'Changes apply immediately. Clicks pass through the stripe.'});
        general.add(appearance);
        const edges = ['bottom', 'top', 'left', 'right'];
        const edge = new Adw.ComboRow({title: 'Screen edge',
            model: Gtk.StringList.new(['Bottom', 'Top', 'Left', 'Right']),
            selected: Math.max(0, edges.indexOf(settings.get_string('edge')))});
        edge.connect('notify::selected', () => settings.set_string('edge', edges[edge.selected]));
        appearance.add(edge);
        this._spin(appearance, settings, 'thickness', 'Stripe thickness',
            'Logical pixels; follows the display scale.', 1, 100);

        const behavior = new Adw.PreferencesGroup({title: 'Display'});
        general.add(behavior);
        this._switch(behavior, settings, 'all-monitors', 'Show on all monitors',
            'Otherwise, show only on the primary monitor.');
        this._switch(behavior, settings, 'show-fullscreen', 'Show over fullscreen applications',
            'Otherwise, hide on monitors with a fullscreen window.');
        behavior.add(new Adw.ActionRow({title: 'Lock screen', subtitle: 'The stripe is always hidden on the lock screen.'}));

        const fallback = new Adw.PreferencesGroup({title: 'Unknown layout',
            description: 'Default color for input sources without a built-in or assigned preset.'});
        general.add(fallback);
        const fallbackWidget = this._colorRow(fallback, 'Fallback color', settings.get_strv('fallback-colors')[0],
            hex => settings.set_strv('fallback-colors', [hex]));

        const panelGroup = new Adw.PreferencesGroup({title: 'Top panel'});
        general.add(panelGroup);
        this._switch(panelGroup, settings, 'show-panel-symbol', 'Show Unicode layout symbol',
            'Use the symbol from the active layout preset, even when its stripe is hidden.');
        this._switch(panelGroup, settings, 'show-system-label', 'Show system layout label',
            'Keep GNOME’s standard layout indicator, such as en or ru.');
        const cleanupShortcuts = addShortcutPreferences(general, window);
        const resetGroup = new Adw.PreferencesGroup({title: 'Defaults'});
        general.add(resetGroup);
        const resetRow = new Adw.ActionRow({title: 'Reset settings to defaults',
            subtitle: 'Restores standard presets and display settings. Keeps My presets.'});
        const resetButton = new Gtk.Button({label: 'Reset', valign: Gtk.Align.CENTER});
        resetButton.add_css_class('destructive-action');
        resetButton.connect('clicked', () => {
            resetSettings(settings);
            window.add_toast(new Adw.Toast({title: 'Defaults restored. My presets were kept.'}));
        });
        resetRow.add_suffix(resetButton);
        resetGroup.add(resetRow);

        const sourceGroup = new Adw.PreferencesGroup({title: 'Configured input sources',
            description: 'Each layout has its own colors, opacity, order and Unicode symbol.'});
        const savedGroup = new Adw.PreferencesGroup({title: 'My presets',
            description: 'Save a preset from any layout. Removing it leaves applied settings unchanged.'});
        layouts.add(sourceGroup);
        layouts.add(savedGroup);
        let editors = [];
        let sourceRows = [];
        let savedRows = [];
        const buildSources = () => {
            for (const row of sourceRows) sourceGroup.remove(row);
            sourceRows = [];
            editors = [];
            for (const [type, id] of getSources()) {
                const editor = this._layoutEditor(settings, {type, id}, window);
                sourceGroup.add(editor.row);
                sourceRows.push(editor.row);
                editors.push(editor);
            }
            if (!sourceRows.length) {
                const row = new Adw.ActionRow({title: 'No input sources',
                    subtitle: 'Add layouts in the system keyboard settings.'});
                sourceGroup.add(row);
                sourceRows.push(row);
            }
        };
        const refreshPresets = () => {
            for (const editor of editors) editor.refresh();
            for (const row of savedRows) savedGroup.remove(row);
            savedRows = [];
            for (const preset of userPresets(settings.get_string('user-presets'))) {
                const row = new Adw.ActionRow({title: preset.name,
                    subtitle: this._profileSummary(preset), use_markup: false});
                row.add_prefix(this._preview(preset));
                const remove = new Gtk.Button({icon_name: 'user-trash-symbolic',
                    tooltip_text: 'Delete preset', valign: Gtk.Align.CENTER});
                remove.connect('clicked', () => {
                    const current = userPresets(settings.get_string('user-presets'));
                    settings.set_string('user-presets', JSON.stringify(current.filter(p => p.name !== preset.name)));
                });
                row.add_suffix(remove);
                savedGroup.add(row);
                savedRows.push(row);
            }
            if (!savedRows.length) {
                const row = new Adw.ActionRow({title: 'No saved presets yet'});
                savedGroup.add(row);
                savedRows.push(row);
            }
        };
        buildSources();
        refreshPresets();
        const signals = [
            [inputSettings, inputSettings.connect('changed::sources', buildSources)],
            [settings, settings.connect('changed::user-presets', refreshPresets)],
            [settings, settings.connect('changed::layout-profiles', () => editors.forEach(e => e.reload()))],
            [settings, settings.connect('changed::fallback-colors', () => {
                fallbackWidget.button.rgba = this._rgba(settings.get_strv('fallback-colors')[0]);
                editors.forEach(e => e.reload());
            })],
            [settings, settings.connect('changed::edge', () => {
                edge.selected = Math.max(0, edges.indexOf(settings.get_string('edge')));
            })],
        ];
        window.connect('close-request', () => {
            cleanupShortcuts();
            for (const [object, id] of signals) object.disconnect(id);
            return false;
        });
        window._stripeSettings = settings;
        window._stripeInputSettings = inputSettings;
    }

    _switch(group, settings, key, title, subtitle) {
        const row = Adw.SwitchRow ? new Adw.SwitchRow({title, subtitle}) :
            new Adw.ActionRow({title, subtitle});
        const control = Adw.SwitchRow ? row : new Gtk.Switch({valign: Gtk.Align.CENTER});
        if (control !== row) {
            row.add_suffix(control);
            row.activatable_widget = control;
        }
        settings.bind(key, control, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(row);
    }

    _spin(group, settings, key, title, subtitle, min, max) {
        const adjustment = new Gtk.Adjustment({lower: min, upper: max, step_increment: 1, page_increment: 5});
        const row = Adw.SpinRow ? new Adw.SpinRow({title, subtitle, adjustment}) :
            new Adw.ActionRow({title, subtitle});
        const control = Adw.SpinRow ? row : new Gtk.SpinButton({adjustment,
            numeric: true, digits: 0, valign: Gtk.Align.CENTER});
        if (control !== row) {
            row.add_suffix(control);
            row.activatable_widget = control;
        }
        settings.bind(key, control, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(row);
    }

    _rgba(hex) {
        const rgba = new Gdk.RGBA();
        rgba.parse(hex);
        return rgba;
    }

    _hex(rgba) {
        return `#${[rgba.red, rgba.green, rgba.blue].map(c =>
            Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;
    }

    _colorRow(parent, title, hex, onChange) {
        const row = new Adw.ActionRow({title, subtitle: hex.toUpperCase()});
        const button = Gtk.ColorDialogButton && Gtk.ColorDialog ?
            new Gtk.ColorDialogButton({dialog: new Gtk.ColorDialog({with_alpha: false}),
                rgba: this._rgba(hex), valign: Gtk.Align.CENTER}) :
            new Gtk.ColorButton({use_alpha: false, rgba: this._rgba(hex), valign: Gtk.Align.CENTER});
        button.connect('notify::rgba', () => {
            const color = this._hex(button.rgba);
            row.subtitle = color.toUpperCase();
            onChange(color);
        });
        row.add_suffix(button);
        if (parent instanceof Adw.ExpanderRow)
            parent.add_row(row);
        else
            parent.add(row);
        return {row, button};
    }

    _profileSummary(profile) {
        return `${profile.colors.length} segment${profile.colors.length === 1 ? '' : 's'} · ` +
            (profile.hidden ? 'Hidden' : `${profile.opacity}% opacity`) +
            (profile.reverse ? ' · Reversed' : '');
    }

    _preview(profile) {
        const preview = new Gtk.Label({label: profile.symbol || '—',
            width_chars: 3, valign: Gtk.Align.CENTER, use_markup: false,
            tooltip_text: 'Layout Unicode symbol'});
        preview.add_css_class('title-2');
        return preview;
    }

    _layoutEditor(settings, source, window) {
        const key = sourceKey(source);
        const read = () => profileFor(source, parseObject(settings.get_string('layout-profiles')),
            settings.get_strv('fallback-colors'));
        let profile = read();
        let updating = false;
        let choices = [];
        const language = presetFor(source)?.name;
        const row = new Adw.ExpanderRow({title: language ?? source.id, use_markup: false});
        const preview = this._preview(profile);
        row.add_prefix(preview);
        const store = () => {
            const assignments = parseObject(settings.get_string('layout-profiles'));
            assignments[key] = normalizeProfile(profile);
            settings.set_string('layout-profiles', JSON.stringify(assignments));
        };
        const presetRow = new Adw.ComboRow({title: 'Preset'});
        row.add_row(presetRow);
        const count = new Adw.ComboRow({title: 'Number of segments',
            model: Gtk.StringList.new(['1', '2', '3'])});
        row.add_row(count);
        const colorWidgets = [];
        for (let i = 0; i < 3; i++) {
            colorWidgets.push(this._colorRow(row, `Segment ${i + 1}`, profile.colors[i] ?? '#FFFFFF', hex => {
                if (updating || i >= profile.colors.length) return;
                profile.colors[i] = hex;
                store();
                display();
            }));
        }

        const symbolRow = new Adw.ActionRow({title: 'Unicode symbol',
            subtitle: 'Flag, emoji or text for the preview and top panel. Leave empty to hide the symbol.'});
        const symbol = new Gtk.Entry({text: profile.symbol, max_length: 32,
            width_chars: 8, valign: Gtk.Align.CENTER});
        const emojiChooser = new Gtk.EmojiChooser();
        const chooseEmoji = new Gtk.MenuButton({icon_name: 'face-smile-symbolic',
            tooltip_text: 'Choose emoji', valign: Gtk.Align.CENTER, popover: emojiChooser});
        emojiChooser.connect('emoji-picked', (_chooser, emoji) => {
            symbol.text = emoji;
            emojiChooser.popdown();
        });
        const resetSymbol = new Gtk.Button({icon_name: 'edit-undo-symbolic',
            tooltip_text: 'Restore standard layout symbol', valign: Gtk.Align.CENTER});
        symbolRow.add_suffix(symbol);
        symbolRow.add_suffix(chooseEmoji);
        symbolRow.add_suffix(resetSymbol);
        row.add_row(symbolRow);

        const opacityRow = new Adw.ActionRow({title: 'Opacity',
            subtitle: 'Hide remembers the previous value.'});
        const controls = new Gtk.Box({spacing: 10, valign: Gtk.Align.CENTER});
        const opacity = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 100, 1);
        opacity.set_size_request(160, -1);
        opacity.set_draw_value(false);
        opacity.set_digits(0);
        opacity.set_tooltip_text('Opacity, from 0% to 100%');
        const opacityLabel = new Gtk.Label({width_chars: 4, xalign: 1});
        const hide = new Gtk.CheckButton({label: 'Hide'});
        controls.append(opacity);
        controls.append(opacityLabel);
        controls.append(hide);
        opacityRow.add_suffix(controls);
        row.add_row(opacityRow);
        const reverseRow = new Adw.ActionRow({title: 'Reverse color order',
            subtitle: 'Normal order: left to right, or top to bottom on side edges.'});
        const reverse = new Gtk.Switch({valign: Gtk.Align.CENTER});
        reverseRow.add_suffix(reverse);
        reverseRow.activatable_widget = reverse;
        row.add_row(reverseRow);

        const updateSelection = () => { presetRow.selected = matchingPreset(profile, choices) + 1; };
        const display = () => {
            updating = true;
            count.selected = profile.colors.length - 1;
            colorWidgets.forEach(({row: colorRow, button}, i) => {
                colorRow.visible = i < profile.colors.length;
                const hex = profile.colors[i] ?? '#FFFFFF';
                button.rgba = this._rgba(hex);
                colorRow.subtitle = hex.toUpperCase();
            });
            opacity.set_value(profile.opacity);
            opacity.sensitive = !profile.hidden;
            opacityLabel.label = `${profile.opacity}%`;
            hide.active = profile.hidden;
            reverse.active = profile.reverse;
            row.subtitle = `${source.id} · ${this._profileSummary(profile)}`;
            updateSelection();
            symbol.text = profile.symbol;
            preview.label = profile.symbol || '—';
            updating = false;
        };
        const refresh = () => {
            updating = true;
            choices = [...PRESETS, ...userPresets(settings.get_string('user-presets'))];
            presetRow.model = Gtk.StringList.new(['Custom', ...choices.map((p, i) =>
                i < PRESETS.length ? p.name : `My: ${p.name}`)]);
            updating = false;
            display();
        };
        refresh();
        count.connect('notify::selected', () => {
            if (updating) return;
            profile.colors = Array.from({length: count.selected + 1}, (_, i) => profile.colors[i] ?? '#FFFFFF');
            store();
            display();
        });
        presetRow.connect('notify::selected', () => {
            if (updating) return;
            if (presetRow.selected === 0) {
                profile.presetId = null;
                store();
                return;
            }
            const preset = choices[presetRow.selected - 1];
            if (!preset) return;
            profile = normalizeProfile({...preset, presetId: preset.id});
            store();
            display();
        });
        symbol.connect('changed', () => {
            if (updating) return;
            profile.symbol = normalizeSymbol(symbol.text);
            updating = true;
            try {
                store();
                preview.label = profile.symbol || '—';
                updateSelection();
            } finally {
                updating = false;
            }
        });
        resetSymbol.connect('clicked', () => {
            profile.symbol = presetFor(source)?.symbol ?? '🌐';
            store();
            display();
        });
        opacity.connect('value-changed', () => {
            if (updating || profile.hidden) return;
            profile.opacity = Math.round(opacity.get_value());
            profile.restoreOpacity = profile.opacity;
            store();
            display();
        });
        hide.connect('toggled', () => {
            if (updating) return;
            profile = toggleHidden(profile, hide.active);
            store();
            display();
        });
        reverse.connect('notify::active', () => {
            if (updating) return;
            profile.reverse = reverse.active;
            store();
            display();
        });

        const saveRow = new Adw.ActionRow({title: 'Save as my preset',
            subtitle: 'Saves colors, opacity, Hide, reverse and Unicode symbol. An existing name updates that preset.'});
        const name = new Gtk.Entry({placeholder_text: 'Preset name', max_length: 80,
            valign: Gtk.Align.CENTER, width_chars: 18});
        const save = new Gtk.Button({icon_name: 'document-save-symbolic', sensitive: false,
            tooltip_text: 'Save preset', valign: Gtk.Align.CENTER});
        name.connect('changed', () => { save.sensitive = name.text.trim().length > 0; });
        const savePreset = () => {
            const title = name.text.trim();
            if (!title) return;
            const presets = userPresets(settings.get_string('user-presets'));
            const index = presets.findIndex(p => p.name === title);
            profile.presetId = `user:${title}`;
            const preset = {name: title, ...normalizeProfile(profile)};
            if (index === -1) presets.push(preset);
            else presets[index] = preset;
            settings.set_string('user-presets', JSON.stringify(presets));
            store();
            refresh();
            name.text = '';
            window.add_toast(new Adw.Toast({title: `Preset “${title}” saved`}));
        };
        save.connect('clicked', savePreset);
        name.connect('activate', savePreset);
        saveRow.add_suffix(name);
        saveRow.add_suffix(save);
        row.add_row(saveRow);
        const resetRow = new Adw.ActionRow({title: 'Restore layout defaults',
            subtitle: 'Use the built-in preset for this keyboard layout.'});
        const reset = new Gtk.Button({icon_name: 'edit-undo-symbolic',
            tooltip_text: 'Restore defaults', valign: Gtk.Align.CENTER});
        reset.connect('clicked', () => {
            const assignments = parseObject(settings.get_string('layout-profiles'));
            delete assignments[key];
            settings.set_string('layout-profiles', JSON.stringify(assignments));
            profile = read();
            display();
        });
        resetRow.add_suffix(reset);
        row.add_row(resetRow);
        return {row, refresh, reload: () => {
            if (!updating) {
                profile = read();
                display();
            }
        }};
    }
}
