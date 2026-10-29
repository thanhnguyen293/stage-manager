// SPDX-FileCopyrightText: 2026 Thành Nguyễn
// SPDX-License-Identifier: GPL-2.0-or-later

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import Mtk from 'gi://Mtk';
import St from 'gi://St';

import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const THUMB_WIDTH = 150;
const THUMB_HEIGHT = 100;
const ITEM_PADDING = 8;
const ITEM_SPACING = 14;
const EDGE_MARGIN = 10;
const MAX_ITEMS = 6;
const MAX_STACKED_WINDOWS = 3;
const STACK_OFFSET_X = 10;
const STACK_OFFSET_Y = 8;
const ICON_SIZE = 28;
const TILT_DEGREES = -10;
const ANIMATION_MS = 220;
const PEEK_GRACE_MS = 1000;
// A window this close to the sidebar's right edge counts as covering it.
const NEAR_MARGIN = 40;

function rectFromActor(actor) {
    const [x, y] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();
    return new Mtk.Rectangle({x, y, width, height});
}

/**
 * The strip of parked groups on the left edge. It gets out of the way when a
 * stage window overlaps it and peeks back when the pointer hits the edge.
 */
export class Sidebar {
    constructor({onActivate, onMerge, onSplit}) {
        this._onActivate = onActivate;
        this._onMerge = onMerge;
        this._onSplit = onSplit;
        this._groupCount = 0;
        this._overlapped = false;
        this._peeking = false;
        this._inOverview = Main.overview.visible;
        this._shown = false;
        this._peekTimeoutId = 0;
        this._windowDragging = false;
        this._dropZone = null;
        this._pendingGroups = null;
        this._enabled = true;

        this._box = new St.BoxLayout({
            style_class: 'stage-manager-sidebar',
            vertical: true,
            reactive: true,
            track_hover: true,
            visible: false,
        });
        this._box.set_style(`spacing: ${ITEM_SPACING}px;`);
        this._box.connect('notify::hover', () => {
            if (!this._box.hover)
                this._setPeeking(false);
        });
        this._box.connect('notify::height', () => this._reposition());
        Main.layoutManager.addChrome(this._box, {affectsInputRegion: true});

        // A thin hot edge that brings the sidebar back while it is hidden.
        this._edge = new St.Widget({reactive: true, width: 2, visible: false});
        this._edge.connect('enter-event', () => this._setPeeking(true));
        Main.layoutManager.addChrome(this._edge, {affectsInputRegion: true});

        // addChrome() stacks on top of everything; keep the sidebar under the
        // lock screen and modal dialogs, since it stays alive while locked.
        const {uiGroup, screenShieldGroup} = Main.layoutManager;
        uiGroup.set_child_below_sibling(this._box, screenShieldGroup);
        uiGroup.set_child_below_sibling(this._edge, screenShieldGroup);

        this._fullscreenId = global.display.connect('in-fullscreen-changed', () => this._sync());

        this._reposition();
    }

    destroy() {
        if (this._peekTimeoutId)
            GLib.source_remove(this._peekTimeoutId);
        global.display.disconnect(this._fullscreenId);
        this._dropZone?.destroy();
        this._box.destroy();
        this._edge.destroy();
    }

    get reservedWidth() {
        return EDGE_MARGIN * 2 + THUMB_WIDTH + ITEM_PADDING * 2;
    }

    get enabled() {
        return this._enabled;
    }

    // Left edge of the area windows can use without hiding the sidebar.
    get clearX() {
        return this._workArea().x + this.reservedWidth + NEAR_MARGIN;
    }

    setEnabled(enabled) {
        this._enabled = enabled;
        this._sync();
    }

    setInOverview(inOverview) {
        this._inOverview = inOverview;
        this._sync();
    }

    // While a window is dragged, the sidebar stays out so it can be dropped on.
    setWindowDragging(dragging) {
        this._windowDragging = dragging;
        if (dragging)
            this._box.add_style_pseudo_class('drop');
        else
            this._box.remove_style_pseudo_class('drop');
        this._sync();
    }

    containsPoint(x, y) {
        const area = this._workArea();
        return this._enabled && x >= area.x && x < area.x + this.reservedWidth &&
            y >= area.y && y < area.y + area.height;
    }

    setGroups(groups) {
        // Rebuilding would destroy the thumbnail being dragged.
        if (this._dropZone) {
            this._pendingGroups = groups;
            return;
        }
        this._box.destroy_all_children();
        const visible = groups.slice(0, this._maxItems());
        for (const group of visible)
            this._box.add_child(this._createItem(group));
        this._groupCount = visible.length;
        this._reposition();
        this._sync();
    }

    updateVisibility(stageWindows) {
        const area = this._workArea();
        const left = area.x;
        const right = this.clearX;
        const top = this._box.y;
        const bottom = this._box.y + Math.max(this._box.height, THUMB_HEIGHT);
        this._overlapped = stageWindows.some(w => {
            const f = w.get_frame_rect();
            return f.x < right && f.x + f.width > left &&
                f.y < bottom && f.y + f.height > top;
        });
        this._sync();
    }

    // Where a newly parked group will land, used to aim the minimize animation.
    slotRect(index) {
        const child = this._box.get_child_at_index(index);
        if (child && this._box.visible)
            return rectFromActor(child);
        const area = this._workArea();
        return new Mtk.Rectangle({
            x: area.x + EDGE_MARGIN,
            y: Math.round(area.y + (area.height - THUMB_HEIGHT) / 2),
            width: THUMB_WIDTH,
            height: THUMB_HEIGHT,
        });
    }

    _workArea() {
        return Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
    }

    _maxItems() {
        const itemHeight = THUMB_HEIGHT + ITEM_PADDING * 2 + ITEM_SPACING;
        return Math.max(1, Math.min(MAX_ITEMS, Math.floor(this._workArea().height / itemHeight)));
    }

    _reposition() {
        const area = this._workArea();
        this._box.set_position(
            area.x + EDGE_MARGIN,
            Math.round(area.y + (area.height - this._box.height) / 2));
        this._edge.set_position(area.x, area.y);
        this._edge.height = area.height;
    }

    _setPeeking(peeking) {
        if (this._peekTimeoutId) {
            GLib.source_remove(this._peekTimeoutId);
            this._peekTimeoutId = 0;
        }
        // Leaving the box un-peeks it, but the pointer may touch the edge and
        // turn away without ever entering the box, so give up after a moment.
        if (peeking) {
            this._peekTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, PEEK_GRACE_MS, () => {
                this._peekTimeoutId = 0;
                if (!this._box.hover)
                    this._setPeeking(false);
                return GLib.SOURCE_REMOVE;
            });
        }
        if (this._peeking === peeking)
            return;
        this._peeking = peeking;
        this._sync();
    }

    _sync() {
        const available = this._enabled && this._groupCount > 0 && !this._inOverview &&
            !global.display.get_monitor_in_fullscreen(Main.layoutManager.primaryIndex);
        if (!available)
            this._peeking = false;
        const forced = this._peeking || this._windowDragging;
        this._edge.visible = available && this._overlapped && !forced;
        this._animateShown(available && (!this._overlapped || forced));
    }

    _animateShown(shown) {
        if (this._shown === shown)
            return;
        this._shown = shown;
        const hiddenX = -this.reservedWidth;

        this._box.remove_all_transitions();
        if (shown) {
            if (!this._box.visible) {
                this._box.translation_x = hiddenX;
                this._box.opacity = 0;
                this._box.show();
            }
            this._box.ease({
                translation_x: 0,
                opacity: 255,
                duration: ANIMATION_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            this._box.ease({
                translation_x: hiddenX,
                opacity: 0,
                duration: ANIMATION_MS,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                // Hiding (not just moving away) drops it from the input region.
                onComplete: () => this._box.hide(),
            });
        }
    }

    _createItem(group) {
        const button = new St.Button({
            style_class: 'stage-manager-item',
            button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO,
            can_focus: false,
        });
        button.set_style(`padding: ${ITEM_PADDING}px;`);

        const content = new Clutter.Actor({
            width: THUMB_WIDTH,
            height: THUMB_HEIGHT,
            // Pivot on the stage-facing edge so the tilt recedes into the
            // sidebar instead of spilling over the stage.
            pivot_point: new Graphene.Point({x: 1, y: 0.5}),
            rotation_angle_y: TILT_DEGREES,
        });
        button.set_child(content);

        const windows = group.windows.slice(0, MAX_STACKED_WINDOWS);
        const depth = windows.length - 1;
        const maxW = THUMB_WIDTH - depth * STACK_OFFSET_X;
        const maxH = THUMB_HEIGHT - depth * STACK_OFFSET_Y;
        // Paint back to front: the most recently used window ends up on top.
        windows.forEach((w, i) => {
            const preview = this._createPreview(w, maxW, maxH);
            if (!preview)
                return;
            preview.set_position(
                i * STACK_OFFSET_X + Math.round((maxW - preview.width) / 2),
                (depth - i) * STACK_OFFSET_Y + Math.round((maxH - preview.height) / 2));
            if (i > 0)
                preview.opacity = 200;
            content.insert_child_at_index(preview, 0);
        });

        const icons = new St.BoxLayout({style_class: 'stage-manager-icons'});
        for (const app of group.apps.slice(0, 3))
            icons.add_child(app.create_icon_texture(ICON_SIZE));
        icons.set_position(-ITEM_PADDING / 2, THUMB_HEIGHT - ICON_SIZE + ITEM_PADDING / 2);
        content.add_child(icons);

        button.connect('notify::hover', () => {
            content.ease({
                rotation_angle_y: button.hover ? 0 : TILT_DEGREES,
                scale_x: button.hover ? 1.05 : 1,
                scale_y: button.hover ? 1.05 : 1,
                duration: 150,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        });

        button.connect('clicked', (_button, mouseButton) => {
            const state = Clutter.get_current_event()?.get_state() ?? 0;
            const addModifiers = Clutter.ModifierType.CONTROL_MASK | Clutter.ModifierType.SHIFT_MASK;
            if (mouseButton === Clutter.BUTTON_MIDDLE)
                this._onSplit(group);
            else if (state & addModifiers)
                this._onMerge(group);
            else
                this._onActivate(group, rectFromActor(button));
        });

        // Dragging a thumbnail onto the stage adds it to the current group.
        button._delegate = {
            getDragActor: () => new Clutter.Clone({source: content}),
            getDragActorSource: () => content,
        };
        const draggable = DND.makeDraggable(button, {dragActorOpacity: 220});
        draggable.connect('drag-begin', () => this._showDropZone(group));
        draggable.connect('drag-end', () => this._hideDropZone());

        return button;
    }

    // The stage itself has no actor to drop on, so cover it with a
    // transparent target for the duration of the drag.
    _showDropZone(group) {
        const area = this._workArea();
        this._dropZone = new St.Widget({
            style_class: 'stage-manager-drop-zone',
            x: area.x + this.reservedWidth,
            y: area.y,
            width: area.width - this.reservedWidth,
            height: area.height,
        });
        this._dropZone._delegate = {
            handleDragOver: () => DND.DragMotionResult.MOVE_DROP,
            acceptDrop: () => {
                this._onMerge(group);
                return true;
            },
        };
        Main.layoutManager.uiGroup.insert_child_below(this._dropZone, this._box);
    }

    _hideDropZone() {
        this._dropZone?.destroy();
        this._dropZone = null;
        if (this._pendingGroups) {
            const groups = this._pendingGroups;
            this._pendingGroups = null;
            this.setGroups(groups);
        }
    }

    _createPreview(w, maxW, maxH) {
        const actor = w.get_compositor_private();
        const frame = w.get_frame_rect();
        if (!actor || frame.width <= 0 || frame.height <= 0)
            return null;

        const buffer = w.get_buffer_rect();
        const scale = Math.min(maxW / frame.width, maxH / frame.height);
        // The window actor covers the buffer (shadows, invisible borders);
        // clip it down to the visible frame.
        const preview = new St.Widget({
            style_class: 'stage-manager-preview',
            width: Math.round(frame.width * scale),
            height: Math.round(frame.height * scale),
            clip_to_allocation: true,
        });
        preview.add_child(new Clutter.Clone({
            source: actor,
            scale_x: scale,
            scale_y: scale,
            x: Math.round((buffer.x - frame.x) * scale),
            y: Math.round((buffer.y - frame.y) * scale),
        }));
        return preview;
    }
}
