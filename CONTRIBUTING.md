# Contributing to Stage Manager for GNOME

**English** | [Tiếng Việt](CONTRIBUTING.vi.md)

Thanks for helping out! Bug reports, ideas and pull requests are all welcome.

## Reporting a bug

Open an [issue](https://github.com/thanhnguyen293/stage-manager/issues) and include:

- Your distribution and GNOME Shell version (`gnome-shell --version`)
- The session type: Wayland or X11 (`echo $XDG_SESSION_TYPE`)
- The extension version, shown as `Version` by `gnome-extensions info stage-manager@local`
- What you did, what you expected, and what happened instead
- The app involved, if the problem only happens with one app (for example the Android Emulator)
- Relevant log lines:

  ```bash
  journalctl --user -b -o cat /usr/bin/gnome-shell | grep -iE "stage-manager|JS ERROR" | tail -50
  ```

For a window that misbehaves, the output of `xprop` (X11 apps only, click the window after running it) helps a lot:

```bash
xprop _NET_WM_WINDOW_TYPE _NET_WM_STATE WM_TRANSIENT_FOR _MOTIF_WM_HINTS WM_CLASS
```

## Suggesting a feature

Open an issue describing what you want to do and how it works on macOS, if it does. Short screen recordings are great.

## Development setup

1. Fork the repository and clone your fork.
2. Link the checkout into your extensions directory and compile the settings schema:

   ```bash
   git clone https://github.com/<you>/stage-manager.git
   cd stage-manager
   glib-compile-schemas schemas
   ln -sfn "$PWD" ~/.local/share/gnome-shell/extensions/stage-manager@local
   ```

   If you installed a release before, remove it first with `gnome-extensions uninstall stage-manager@local`.

3. Test your changes in a **nested GNOME Shell**. It runs in a window, so a broken change cannot take your desktop down, and you don't have to log out after every edit:

   ```bash
   MUTTER_DEBUG_DUMMY_MODE_SPECS=1600x900 dbus-run-session -- gnome-shell --nested --wayland
   ```

   Enable the extension inside it (`gnome-extensions enable stage-manager@local` from a terminal opened in the nested session). Then start a few apps there to try your change. Errors are printed in the terminal you started it from.

   On GNOME Shell 47 and later, use `gnome-shell --devkit --wayland` instead.

4. To try your change in your real session on Wayland, log out and back in. GNOME Shell cannot reload an extension's code while it is running.

## Code guidelines

- Target **GNOME Shell 46** and ES modules (`import ... from 'gi://...'`), like the existing files.
- Follow the [GNOME Shell JavaScript style](https://gjs.guide/guides/gjs/style-guide.html): 4-space indent, single quotes, trailing commas, `const` and `let` (never `var`).
- Keep the split between files:
  - `stageManager.js` decides which windows are on stage.
  - `sidebar.js` only draws the strip and reports clicks and drops.
  - `extension.js` wires up settings, Quick Settings and the shortcut.
- Disconnect every signal and remove every timeout or idle source you add, in `destroy()` or `disable()`. Leaked handlers keep running after the extension is turned off.
- Don't use `print()` or leave debug logging in. Use `console.debug()` while developing and remove it before opening a pull request.
- Comment *why* something non-obvious is done (Mutter quirks, timing issues), not *what* the code does.
- User-visible strings go through `_()` so they can be translated.
- New settings need a key in `schemas/org.gnome.shell.extensions.stage-manager.gschema.xml` and, if users should change them, a row in `prefs.js`.

## Pull requests

1. Create a branch from `main` (`git checkout -b fix-emulator-toolbar`).
2. Keep each pull request focused on one change.
3. Check that every file still parses:

   ```bash
   for f in *.js; do node --input-type=module --check < "$f" || echo "syntax error in $f"; done
   ```

4. Describe in the pull request:
   - what changed and why
   - how you tested it (which apps, Wayland or X11)
   - a screenshot or short recording for visual changes
5. Update both `README.md` and `README.vi.md` if behavior or setup changes. A rough Vietnamese translation is fine; it can be polished in review.

## License

By contributing, you agree that your contributions are licensed under the [GPL-2.0-or-later](LICENSE), like the rest of the project.
