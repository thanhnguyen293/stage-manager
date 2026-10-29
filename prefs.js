// SPDX-FileCopyrightText: 2026 Thành Nguyễn
// SPDX-License-Identifier: GPL-2.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class StageManagerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({title: _('Sidebar')});

        const previews = new Adw.SwitchRow({
            title: _('Show previews'),
            subtitle: _('Thumbnails of parked windows on the left. They hide while a window is close to them and come back when the pointer touches the left edge.'),
        });
        settings.bind('show-previews', previews, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(previews);

        const desktop = new Adw.PreferencesGroup({title: _('Desktop')});
        const icons = new Adw.SwitchRow({
            title: _('Hide desktop icons'),
            subtitle: _('Keep the desktop clear while windows are on stage. The icons come back when no window is showing.'),
        });
        settings.bind('hide-desktop-icons', icons, 'active', Gio.SettingsBindFlags.DEFAULT);
        desktop.add(icons);

        page.add(group);
        page.add(desktop);
        window.add(page);
    }
}
