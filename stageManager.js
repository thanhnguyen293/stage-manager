// SPDX-FileCopyrightText: 2026 Thành Nguyễn
// SPDX-License-Identifier: GPL-2.0-or-later

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Sidebar} from './sidebar.js';

// Window types an app uses for tool palettes next to its main window.
const HELPER_TYPES = [
    Meta.WindowType.UTILITY,
    Meta.WindowType.TOOLBAR,
];

/**
 * Keeps one group of windows "on stage" per workspace (primary monitor only)
 * and minimizes the rest, which the sidebar shows as live thumbnails.
 * Groups are sets of windows, so windows of one app can live in different
 * groups, as on macOS.
 *
 * Which group is on stage is never stored: it is derived from the window
 * state itself (focused window + which windows are parked), so alt-tab,
 * the dock and the overview all keep working without extra bookkeeping.
 */
export class StageManager {
    constructor(settings) {
        this._settings = settings;
        this._tracker = Shell.WindowTracker.get_default();
        // MetaWindow -> group id. Dialogs are not listed; they follow the
        // window they belong to.
        this._groupOf = new Map();
        this._nextGroupId = 0;
        // Windows we parked, so turning Stage Manager off can restore them.
        this._parked = new Set();
        // Parked windows that refuse to be minimized, hidden by hand instead.
        this._hidden = new Set();
        // Parked window -> Map(actor -> signal ids) of every actor we hid
        // for it: its own (if hidden by hand) and its helper windows.
        this._hiddenActors = new Map();
        // groupId -> sequence number of when it last left the stage. Mutter
        // pushes minimized windows to the back of its MRU list, so the
        // sidebar order (most recently parked on top) has to be kept here.
        this._parkedAt = new Map();
        this._parkSeq = 0;
        this._windowSignals = new Map();
        this._signals = [];
        this._focusIdleId = 0;
        this._refreshIdleId = 0;

        this._sidebar = new Sidebar({
            onActivate: (group, rect) => this._activateGroup(group, rect),
            onMerge: group => this._mergeIntoStage(group),
            onSplit: group => this._splitGroup(group),
        });
        this._sidebar.setEnabled(settings.get_boolean('show-previews'));
        this._connect(settings, 'changed::show-previews', () => {
            this._sidebar.setEnabled(settings.get_boolean('show-previews'));
            this._refresh();
        });

        this._connect(global.display, 'notify::focus-window', () => this._queueFocusChanged());
        this._connect(global.display, 'window-created', (_d, w) => {
            this._assignNewWindow(w);
            this._trackWindow(w, true);
            this._queueRefresh();
        });
        this._connect(global.display, 'workareas-changed', () => this._queueRefresh());
        this._connect(global.display, 'restacked', () => this._sidebar.updateVisibility(this._stageWindows()));
        this._connect(global.workspace_manager, 'active-workspace-changed', () => this._queueRefresh());
        this._connect(global.display, 'grab-op-begin', (_d, w, op) => {
            if (this._isMoveOp(op) && this._isCandidate(w))
                this._sidebar.setWindowDragging(true);
        });
        this._connect(global.display, 'grab-op-end', (_d, w, op) => this._onGrabEnd(w, op));
        this._connect(Main.overview, 'showing', () => this._sidebar.setInOverview(true));
        this._connect(Main.overview, 'hidden', () => this._sidebar.setInOverview(false));

        for (const actor of global.get_window_actors())
            this._trackWindow(actor.meta_window);

        this._onFocusChanged();
    }

    destroy() {
        if (this._focusIdleId)
            GLib.source_remove(this._focusIdleId);
        if (this._refreshIdleId)
            GLib.source_remove(this._refreshIdleId);

        for (const [obj, id] of this._signals)
            obj.disconnect(id);
        for (const [w, ids] of this._windowSignals)
            ids.forEach(id => w.disconnect(id));

        // Like macOS: turning Stage Manager off puts every parked window back.
        for (const w of [...this._parked])
            this._unpark(w);

        this._sidebar.destroy();
        this._signals = [];
        this._windowSignals.clear();
        this._parked.clear();
        this._groupOf.clear();
    }

    _connect(obj, signal, handler) {
        this._signals.push([obj, obj.connect(signal, handler)]);
    }

    _trackWindow(w, isNew = false) {
        if (this._windowSignals.has(w))
            return;
        const relayout = () => this._sidebar.updateVisibility(this._stageWindows());
        const ids = [
            w.connect('notify::minimized', () => this._queueRefresh()),
            w.connect('position-changed', relayout),
            // Parked windows can report a 0x0 frame for a moment, so their
            // thumbnails are rebuilt once the real size arrives.
            w.connect('size-changed', () => this._isParked(w) ? this._queueRefresh() : relayout()),
            w.connect('workspace-changed', () => this._queueRefresh()),
            w.connect('unmanaged', () => {
                ids.forEach(id => w.disconnect(id));
                this._windowSignals.delete(w);
                this._forgetParked(w);
                this._groupOf.delete(w);
                this._queueRefresh();
            }),
        ];
        if (isNew) {
            const shownId = w.connect('shown', () => {
                w.disconnect(shownId);
                ids.splice(ids.indexOf(shownId), 1);
                this._makeRoomFor(w);
                // It may be a helper window of a parked window.
                this._queueRefresh();
            });
            ids.push(shownId);
        }
        this._windowSignals.set(w, ids);
    }

    // Focus notifications can fire in the middle of Mutter's own window
    // handling (e.g. while a window is unmanaged), so act on them from idle.
    _queueFocusChanged() {
        if (this._focusIdleId)
            return;
        this._focusIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._focusIdleId = 0;
            this._onFocusChanged();
            return GLib.SOURCE_REMOVE;
        });
    }

    _queueRefresh() {
        if (this._refreshIdleId)
            return;
        this._refreshIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._refreshIdleId = 0;
            this._refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    // The window whose group is on stage: the focused window, or the one a
    // focused dialog belongs to. Null for windows Stage Manager leaves alone.
    _focusedStageWindow() {
        const root = global.display.focus_window?.find_root_ancestor();
        return root && this._isCandidate(root) ? root : null;
    }

    _onFocusChanged() {
        const focused = this._focusedStageWindow();
        if (focused)
            this._putOnStage(focused);
        this._refresh();
    }

    _putOnStage(focused) {
        const groupId = this._groupIdOf(focused);
        this._unpark(focused);

        // Alt+Tab, the dock and the overview only bring back the window they
        // activate; the rest of its group has to follow. Windows the user
        // minimized themselves are not in _parked and stay minimized.
        let restored = false;
        for (const w of this._candidateWindows()) {
            if (!this._isParked(w) || !this._parked.has(w) || this._groupIdOf(w) !== groupId)
                continue;
            this._unpark(w);
            restored = true;
        }
        if (restored)
            focused.raise();

        const target = this._sidebar.slotRect(0);
        for (const w of this._candidateWindows()) {
            const id = this._groupIdOf(w);
            if (this._isParked(w) || id === groupId)
                continue;
            this._parkedAt.set(id, ++this._parkSeq);
            this._park(w, target);
        }
    }

    _isParked(w) {
        return w.minimized || this._hidden.has(w);
    }

    _park(w, target) {
        this._parked.add(w);
        if (w.can_minimize()) {
            // Makes the minimize animation fly into the sidebar.
            w.set_icon_geometry(target);
            w.minimize();
        } else {
            // Some windows (e.g. the Android emulator) drop the minimize
            // function through _MOTIF_WM_HINTS, and Mutter refuses to
            // minimize them. Hide their actors instead; hidden actors also
            // take no input.
            this._hidden.add(w);
            this._queueRefresh();
        }
        this._hideAttached(w);
    }

    // A parked window went away: drop it without restoring or animating it,
    // but bring back the helper windows we hid on its behalf.
    _forgetParked(w) {
        this._parked.delete(w);
        this._hidden.delete(w);
        const own = w.get_compositor_private();
        const watched = this._hiddenActors.get(w);
        if (own && watched?.has(own)) {
            watched.get(own).forEach(id => own.disconnect(id));
            watched.delete(own);
        }
        this._showAttached(w);
    }

    _unpark(w) {
        this._parked.delete(w);
        this._showAttached(w);
        if (this._hidden.delete(w))
            this._queueRefresh();
        else if (w.minimized)
            w.unminimize();
    }

    // Windows that have to disappear along with a parked window. Mutter
    // hides real transients of minimized windows itself, but not helper
    // windows whose WM_TRANSIENT_FOR it rejected: the emulator's side
    // toolbar is one ("Invalid WM_TRANSIENT_FOR window ... specified").
    _attachedWindows(w) {
        const hiddenByHand = this._hidden.has(w);
        const pid = w.get_pid();
        const app = this._appOf(w);
        const sameClient = other => pid > 0 ? other.get_pid() === pid : this._appOf(other) === app;
        // Helpers stay with the app's window that is on stage, if any.
        const helpersElsewhere = this._stageWindows().some(sameClient);
        return global.display.list_all_windows().filter(other => {
            if (other === w)
                return hiddenByHand;
            if (other.find_root_ancestor() === w)
                return hiddenByHand;
            return !helpersElsewhere && sameClient(other) &&
                HELPER_TYPES.includes(other.get_window_type()) &&
                !other.get_transient_for() && !other.is_above() &&
                !other.is_on_all_workspaces();
        });
    }

    // GNOME shows window actors again on its own (e.g. after a workspace
    // switch), so each one is watched and hidden again before it is drawn.
    // Helper windows can also be re-created while parked; _refresh() calls
    // this again to catch them.
    _hideAttached(w) {
        const watched = this._hiddenActors.get(w) ?? new Map();
        for (const win of this._attachedWindows(w)) {
            const actor = win.get_compositor_private();
            if (!actor || watched.has(actor))
                continue;
            actor.hide();
            watched.set(actor, [
                actor.connect('notify::visible', () => {
                    if (!actor.visible)
                        return;
                    global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
                        if (this._hiddenActors.get(w)?.has(actor))
                            actor.hide();
                        return GLib.SOURCE_REMOVE;
                    });
                }),
                actor.connect('destroy', () => watched.delete(actor)),
            ]);
        }
        this._hiddenActors.set(w, watched);
    }

    _showAttached(w) {
        for (const [actor, ids] of this._hiddenActors.get(w) ?? []) {
            ids.forEach(id => actor.disconnect(id));
            actor.show();
        }
        this._hiddenActors.delete(w);
    }

    // Like macOS, new windows open beside the sidebar rather than under it.
    // Only new windows are nudged: ones the user placed are left alone.
    _makeRoomFor(w) {
        if (!this._sidebar.enabled || !this._isCandidate(w) ||
            w.get_maximized() || w.is_fullscreen())
            return;
        const area = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        const stageLeft = this._sidebar.clearX;
        const frame = w.get_frame_rect();
        if (frame.x >= stageLeft || stageLeft + frame.width > area.x + area.width)
            return;
        w.move_frame(true, stageLeft, frame.y);
    }

    _refresh() {
        for (const w of this._parked)
            this._hideAttached(w);
        this._sidebar.setGroups(this._parkedGroups());
        this._sidebar.updateVisibility(this._stageWindows());
    }

    _activateGroup(group, sourceRect = null) {
        const windows = [...group.windows].reverse(); // least recent first
        for (const w of windows) {
            if (sourceRect)
                w.set_icon_geometry(sourceRect);
            this._unpark(w);
        }
        const top = windows.at(-1);
        if (top)
            Main.activateWindow(top);
    }

    _mergeIntoStage(group) {
        const focused = this._focusedStageWindow();
        if (focused) {
            const stageId = this._groupIdOf(focused);
            group.windows.forEach(w => this._groupOf.set(w, stageId));
        }
        this._activateGroup(group);
    }

    _isMoveOp(op) {
        return op === Meta.GrabOp.MOVING || op === Meta.GrabOp.MOVING_UNCONSTRAINED;
    }

    // Dropping a stage window on the sidebar takes it out of the stage group
    // and parks it on its own, like dragging a window to the strip on macOS.
    _onGrabEnd(w, op) {
        if (!this._isMoveOp(op))
            return;
        this._sidebar.setWindowDragging(false);
        const [x, y] = global.get_pointer();
        if (!w || !this._isCandidate(w) || !this._sidebar.containsPoint(x, y))
            return;

        const id = this._nextGroupId++;
        this._groupOf.set(w, id);
        this._parkedAt.set(id, ++this._parkSeq);
        this._park(w, this._sidebar.slotRect(0));
    }

    _splitGroup(group) {
        // The pieces keep the group's place in the sidebar.
        const parkedAt = this._parkedAt.get(group.id) ?? 0;
        for (const w of group.windows) {
            const id = this._nextGroupId++;
            this._groupOf.set(w, id);
            this._parkedAt.set(id, parkedAt);
        }
        this._refresh();
    }

    // A window opened from the app on stage (e.g. Ctrl+N) joins the stage;
    // anything else starts a group of its own.
    _assignNewWindow(w) {
        if (w.get_window_type() !== Meta.WindowType.NORMAL || w.get_transient_for())
            return;
        const opener = this._focusedStageWindow();
        const sameApp = opener && this._appOf(opener) === this._appOf(w);
        this._groupOf.set(w, sameApp ? this._groupIdOf(opener) : this._nextGroupId++);
    }

    _appOf(w) {
        return this._tracker.get_window_app(w);
    }

    // Windows that existed before Stage Manager was turned on (or that were
    // dialogs and became normal windows) are grouped by app, like the
    // "All at Once" default on macOS.
    _groupIdOf(w) {
        let id = this._groupOf.get(w);
        if (id === undefined) {
            const app = this._appOf(w);
            const sibling = [...this._groupOf.keys()].find(other =>
                other.get_workspace() === w.get_workspace() && this._appOf(other) === app);
            id = sibling ? this._groupOf.get(sibling) : this._nextGroupId++;
            this._groupOf.set(w, id);
        }
        return id;
    }

    // Windows Stage Manager is allowed to park. Dialogs follow their parent,
    // and sticky / always-on-top windows (e.g. picture-in-picture) stay put.
    _isCandidate(w) {
        return w.get_window_type() === Meta.WindowType.NORMAL &&
            !w.is_skip_taskbar() &&
            !w.get_transient_for() &&
            !w.is_on_all_workspaces() &&
            !w.is_above() &&
            w.get_monitor() === Main.layoutManager.primaryIndex;
    }

    // Most-recently-used first, so sidebar order follows usage.
    _candidateWindows() {
        const ws = global.workspace_manager.get_active_workspace();
        return global.display.get_tab_list(Meta.TabList.NORMAL, ws)
            .filter(w => this._isCandidate(w));
    }

    _stageWindows() {
        return this._candidateWindows().filter(w => !this._isParked(w));
    }

    // A group belongs in the sidebar when it has windows here and none of
    // them is showing; a group with any visible window is on stage.
    _parkedGroups() {
        const groups = new Map();
        for (const w of this._candidateWindows()) {
            const id = this._groupIdOf(w);
            if (!groups.has(id))
                groups.set(id, {id, windows: [], apps: [], onStage: false});
            const group = groups.get(id);
            group.windows.push(w);
            group.onStage ||= !this._isParked(w);
            const app = this._appOf(w);
            if (app && !group.apps.includes(app))
                group.apps.push(app);
        }
        const parkedAt = g => this._parkedAt.get(g.id) ?? 0;
        return [...groups.values()]
            .filter(g => !g.onStage)
            .sort((a, b) => parkedAt(b) - parkedAt(a));
    }
}
