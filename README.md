# Stage Manager for GNOME

**English** | [Tiếng Việt](README.vi.md)

[![GNOME Shell 46](https://img.shields.io/badge/GNOME%20Shell-46-4A86CF?logo=gnome&logoColor=white)](https://www.gnome.org/)
[![License: GPL-2.0-or-later](https://img.shields.io/github/license/thanhnguyen293/stage-manager)](LICENSE)
[![Stars](https://img.shields.io/github/stars/thanhnguyen293/stage-manager?style=flat)](https://github.com/thanhnguyen293/stage-manager/stargazers)
[![Forks](https://img.shields.io/github/forks/thanhnguyen293/stage-manager?style=flat)](https://github.com/thanhnguyen293/stage-manager/forks)
[![Issues](https://img.shields.io/github/issues/thanhnguyen293/stage-manager)](https://github.com/thanhnguyen293/stage-manager/issues)
[![Last commit](https://img.shields.io/github/last-commit/thanhnguyen293/stage-manager)](https://github.com/thanhnguyen293/stage-manager/commits/main)
[![Views](https://hits.sh/github.com/thanhnguyen293/stage-manager.svg?label=views&color=4c1)](https://hits.sh/github.com/thanhnguyen293/stage-manager/)

A GNOME Shell extension that brings macOS-style **Stage Manager** to the Linux desktop.
The window group you are working with stays in the middle of the screen. Every other group is parked as a live thumbnail in a strip on the left edge, one click away.

![Stage Manager demo: switching stages, grouping by drag and drop, moving a window to another stage mid-drag, Alt+Tab](media/demo.gif)

*Click a thumbnail to switch stages, drag one onto the stage to group it, drag a window over a thumbnail to switch stages and drop it there, and Alt+Tab brings a whole group back.*

## Features

- **One stage at a time.** Focusing a window by any means (click, Alt+Tab, the dock, the overview) puts its group on stage and parks the rest. Parked windows fly into the strip.
- **Per-window groups, like macOS.** Groups are made of windows, not apps, so two windows of the same app can be in different groups.
- **Drag and drop grouping.**
  - Drag a thumbnail onto the stage to add its windows to the current group.
  - Drag a window onto another stage's thumbnail to move it there, or onto an empty part of the strip to give it a stage of its own. The strip appears while you drag, even with previews turned off.
- **Out of the way.** The strip hides while a window covers it or comes close to it. Touch the left screen edge with the pointer to bring it back.
- **Room for new windows.** Newly opened windows are placed beside the strip instead of under it. Windows you moved yourself are never moved.
- **Desktop icons out of sight (optional).** Hide the desktop icons while windows are on stage, like macOS. They come back when the stage is empty.
- **Optional previews.** Turn the strip off and keep only the window parking, from Quick Settings or the extension settings.
- **Works with stubborn windows.** Some windows refuse to be minimized, such as the Android Emulator, which removes the minimize function through `_MOTIF_WM_HINTS`. These are hidden instead, together with their tool windows (like the emulator's side toolbar), so they don't show up on every stage.
- Turning Stage Manager off brings every parked window back.

## Usage

| Action | How |
| --- | --- |
| Bring a group on stage | Click its thumbnail, or focus any of its windows (Alt+Tab, dock, overview) |
| Add a group to the current stage | Drag its thumbnail onto the stage, or **Shift+click** / **Ctrl+click** it |
| Move a window to another stage | Drag the window onto that stage's thumbnail (Super+drag also works) |
| Give a window a stage of its own | Drag the window onto an empty part of the strip |
| Switch stages in the middle of a drag | While dragging a window, hover over a thumbnail for a moment, or **tap Alt** to cycle through stages. Drop the window anywhere to leave it in the stage on screen. |
| Split a group into single windows | **Middle-click** its thumbnail |
| Show the strip while it is hidden | Push the pointer against the left screen edge |
| Turn Stage Manager on/off | **Super+Ctrl+S**, or the *Stage Manager* toggle in Quick Settings |
| Show/hide the previews | Quick Settings → arrow next to *Stage Manager* → *Show previews* |
| Hide desktop icons while windows are on stage | Quick Settings → arrow next to *Stage Manager* → *Hide desktop icons* |

A window you opened from the app that is on stage (for example with Ctrl+N) joins the stage. A window from any other app starts a group of its own. When Stage Manager is first turned on, the windows of each app start out in one group, like the "All at Once" default on macOS.

![Calculator and Characters share the stage; a Text Editor + Clocks group and Fonts are parked on the left](media/screenshot.png)

## Requirements

- GNOME Shell **46** (tested on Ubuntu 24.04 LTS, Wayland session)
- `git` and the `gnome-extensions` tool, which ships with GNOME Shell

## Installation

### From a release (easiest)

Download `stage-manager@local.shell-extension.zip` from the [latest release](https://github.com/thanhnguyen293/stage-manager/releases/latest), then run:

```bash
gnome-extensions install --force stage-manager@local.shell-extension.zip
```

### From source

```bash
git clone https://github.com/thanhnguyen293/stage-manager.git
cd stage-manager
gnome-extensions pack --force \
  --extra-source=stageManager.js \
  --extra-source=sidebar.js \
  --extra-source=prefs.js
gnome-extensions install --force stage-manager@local.shell-extension.zip
```

GNOME Shell only picks up newly installed extensions when it starts.

- **Wayland** (the default on Ubuntu): log out and log back in.
- **X11**: press Alt+F2, type `r`, and press Enter.

Then enable the extension:

```bash
gnome-extensions enable stage-manager@local
```

You can also enable it from the **Extensions** app or **Extension Manager**.

### Updating

Install the zip from the newest release the same way, or, from a source checkout:

```bash
cd stage-manager
git pull
gnome-extensions pack --force --extra-source=stageManager.js --extra-source=sidebar.js --extra-source=prefs.js
gnome-extensions install --force stage-manager@local.shell-extension.zip
```

Then log out and back in to load the new version.

### Uninstalling

```bash
gnome-extensions uninstall stage-manager@local
```

## Settings

Open the settings window from the **Extensions** app, or run:

```bash
gnome-extensions prefs stage-manager@local
```

To change the on/off shortcut, which defaults to Super+Ctrl+S:

```bash
gsettings --schemadir ~/.local/share/gnome-shell/extensions/stage-manager@local/schemas \
  set org.gnome.shell.extensions.stage-manager toggle-shortcut "['<Super><Alt>m']"
```

## Limitations

- Only windows on the primary monitor are managed. Windows on other monitors, windows shown on all workspaces, and always-on-top windows such as picture-in-picture are left alone.
- Groups are kept in memory. After logging out, or turning Stage Manager off and on again, windows are grouped by app again.
- Alt+Tab itself does not work while a window is being dragged: Mutter ignores keyboard shortcuts during a drag. Tap Alt alone instead (see Usage).
- Thumbnails come from the windows' last drawn frame. Many apps stop redrawing while minimized, so a thumbnail may not update live.

## Project layout

| File | Purpose |
| --- | --- |
| `extension.js` | Entry point: Quick Settings toggle and keyboard shortcut |
| `stageManager.js` | Stage logic: which windows are on stage, grouping, parking |
| `sidebar.js` | The strip of thumbnails, drag and drop, auto-hide |
| `prefs.js` | Settings window |
| `schemas/` | GSettings schema (`enabled`, `show-previews`, `hide-desktop-icons`, `toggle-shortcut`) |
| `media/` | Demo GIF and screenshot used in this README |

## Roadmap

| Feature | State |
| --- | --- |
| Park windows into a strip of live thumbnails | ✅ |
| Per-window groups, grouping by drag and drop | ✅ |
| Move a window to another stage by dropping it on its thumbnail, also with previews off | ✅ |
| Switch stages while dragging a window (hover a thumbnail, or tap Alt) | ✅ |
| Whole group follows Alt+Tab, the dock and the overview | ✅ |
| Minimize animation into the strip | ✅ |
| Strip auto-hides near windows, peeks at the screen edge | ✅ |
| Separate stages per workspace | ✅ |
| Restore every window when turned off | ✅ |
| Windows that refuse to be minimized (Android Emulator and its toolbar) | ✅ |
| Hide desktop icons while windows are on stage | ✅ |
| Quick Settings toggle, keyboard shortcut and settings window | ✅ |
| Multi-monitor support | ⬜ |
| Remember groups across sessions | ⬜ |
| GNOME Shell 47 and newer | ⬜ |
| Translations of the settings and menu texts | ⬜ |
| Publish on extensions.gnome.org | ⬜ |

## Contributing

Bug reports, ideas and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to report a bug, set up a development environment and open a pull request. Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Stage Manager for GNOME is free software, licensed under the
[GNU General Public License v2.0 or later](LICENSE) (`GPL-2.0-or-later`),
the same license as GNOME Shell.
