// SPDX-License-Identifier: GPL-3.0-or-later

// Temporarily hide the indicator container without replacing GNOME methods or labels.
export class PanelVisibility {
    constructor(actor) {
        this.actor = actor;
        this.savedVisible = actor.visible;
        this.hidden = false;
        this.settingVisible = false;
        this.signal = actor.connect('notify::visible', () => {
            if (!this.hidden || this.settingVisible) return;
            this.savedVisible = actor.visible;
            this._setVisible(false);
        });
    }

    _setVisible(visible) {
        this.settingVisible = true;
        try {
            this.actor.visible = visible;
        } finally {
            this.settingVisible = false;
        }
    }

    setHidden(hidden) {
        if (hidden === this.hidden) return;
        if (hidden) this.savedVisible = this.actor.visible;
        this.hidden = hidden;
        this._setVisible(hidden ? false : this.savedVisible);
    }

    destroy() {
        this.actor.disconnect(this.signal);
        if (this.hidden) this._setVisible(this.savedVisible);
        this.actor = null;
    }
}
