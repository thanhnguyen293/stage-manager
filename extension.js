// SPDX-FileCopyrightText: 2026 Thành Nguyễn
// SPDX-License-Identifier: GPL-2.0-or-later

import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {QuickMenuToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {StageManager} from './stageManager.js';

const StageManagerToggle = GObject.registerClass(
class StageManagerToggle extends QuickMenuToggle {
    _init(settings) {
        super._init({
            title: _('Stage Manager'),
            iconName: 'multitasking-symbolic',
            toggleMode: true,
        });
        settings.bind('enabled', this, 'checked', Gio.SettingsBindFlags.DEFAULT);

        this.menu.setHeader('multitasking-symbolic', _('Stage Manager'));
        const previews = new PopupMenu.PopupSwitchMenuItem(_('Show previews'),
            settings.get_boolean('show-previews'));
        previews.connect('toggled', (_item, state) => settings.set_boolean('show-previews', state));
        const changedId = settings.connect('changed::show-previews',
            () => previews.setToggleState(settings.get_boolean('show-previews')));
        this.connect('destroy', () => settings.disconnect(changedId));
        this.menu.addMenuItem(previews);
    }
});

const StageManagerIndicator = GObject.registerClass(
class StageManagerIndicator extends SystemIndicator {
    _init(settings) {
        super._init();
        this.quickSettingsItems.push(new StageManagerToggle(settings));
    }
});

export default class StageManagerExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._settingsId = this._settings.connect('changed::enabled', () => this._sync());

        this._indicator = new StageManagerIndicator(this._settings);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);

        Main.wm.addKeybinding('toggle-shortcut', this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._settings.set_boolean('enabled', !this._settings.get_boolean('enabled')));

        this._sync();
    }

    disable() {
        Main.wm.removeKeybinding('toggle-shortcut');
        this._settings.disconnect(this._settingsId);
        this._indicator.quickSettingsItems.forEach(item => item.destroy());
        this._indicator.destroy();
        this._manager?.destroy();
        this._manager = null;
        this._indicator = null;
        this._settings = null;
    }

    _sync() {
        const enabled = this._settings.get_boolean('enabled');
        if (enabled && !this._manager) {
            this._manager = new StageManager(this._settings);
        } else if (!enabled && this._manager) {
            this._manager.destroy();
            this._manager = null;
        }
    }
}
