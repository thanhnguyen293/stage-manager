# Đóng góp cho Stage Manager cho GNOME

[English](CONTRIBUTING.md) | **Tiếng Việt**

Cảm ơn bạn đã muốn góp sức! Mọi báo lỗi, ý tưởng và pull request đều được hoan nghênh.

## Báo lỗi

Mở một [issue](https://github.com/thanhnguyen293/stage-manager/issues) và ghi rõ:

- Bản phân phối và phiên bản GNOME Shell (`gnome-shell --version`)
- Loại phiên: Wayland hay X11 (`echo $XDG_SESSION_TYPE`)
- Phiên bản extension, là dòng `Version` khi chạy `gnome-extensions info stage-manager@local`
- Bạn đã làm gì, bạn mong đợi điều gì, và thực tế đã xảy ra gì
- App liên quan, nếu lỗi chỉ xảy ra với một app (ví dụ Android Emulator)
- Các dòng log liên quan:

  ```bash
  journalctl --user -b -o cat /usr/bin/gnome-shell | grep -iE "stage-manager|JS ERROR" | tail -50
  ```

Với một cửa sổ hoạt động bất thường, kết quả `xprop` rất hữu ích (chỉ với app X11; chạy lệnh rồi click vào cửa sổ đó):

```bash
xprop _NET_WM_WINDOW_TYPE _NET_WM_STATE WM_TRANSIENT_FOR _MOTIF_WM_HINTS WM_CLASS
```

## Đề xuất tính năng

Mở một issue mô tả bạn muốn làm gì, và tính năng đó hoạt động thế nào trên macOS (nếu có). Một đoạn quay màn hình ngắn sẽ giúp rất nhiều.

## Chuẩn bị môi trường phát triển

1. Fork repo và clone bản fork của bạn.
2. Liên kết thư mục code vào thư mục extension và biên dịch schema cài đặt:

   ```bash
   git clone https://github.com/<you>/stage-manager.git
   cd stage-manager
   glib-compile-schemas schemas
   ln -sfn "$PWD" ~/.local/share/gnome-shell/extensions/stage-manager@local
   ```

   Nếu trước đó bạn đã cài bản phát hành, hãy gỡ nó trước bằng `gnome-extensions uninstall stage-manager@local`.

3. Thử thay đổi trong một **GNOME Shell lồng (nested)**. Nó chạy trong một cửa sổ, nên code lỗi không làm sập desktop của bạn, và bạn không phải đăng xuất sau mỗi lần sửa:

   ```bash
   MUTTER_DEBUG_DUMMY_MODE_SPECS=1600x900 dbus-run-session -- gnome-shell --nested --wayland
   ```

   Bật extension bên trong phiên lồng (chạy `gnome-extensions enable stage-manager@local` từ một terminal mở trong phiên đó). Sau đó mở vài app trong đó để thử. Lỗi sẽ in ra ở terminal bạn đã dùng để khởi động phiên lồng.

   Từ GNOME Shell 47 trở lên, dùng `gnome-shell --devkit --wayland` thay cho lệnh trên.

4. Muốn thử trên phiên thật với Wayland, hãy đăng xuất rồi đăng nhập lại. GNOME Shell không nạp lại code extension khi đang chạy.

## Quy ước viết code

- Nhắm tới **GNOME Shell 46** và dùng ES module (`import ... from 'gi://...'`), giống các file hiện có.
- Theo [quy ước JavaScript của GNOME Shell](https://gjs.guide/guides/gjs/style-guide.html): thụt lề 4 dấu cách, nháy đơn, dấu phẩy cuối, dùng `const` và `let` (không dùng `var`).
- Giữ đúng vai trò từng file:
  - `stageManager.js` quyết định cửa sổ nào ở trên sân khấu.
  - `sidebar.js` chỉ vẽ dải thumbnail và báo lại các thao tác click, thả.
  - `extension.js` kết nối cài đặt, Quick Settings và phím tắt.
- Mọi signal bạn connect, mọi timeout hoặc idle bạn thêm đều phải được gỡ trong `destroy()` hoặc `disable()`. Nếu không, chúng vẫn chạy sau khi đã tắt extension.
- Không dùng `print()` và không để lại log debug. Trong lúc phát triển có thể dùng `console.debug()`, nhưng hãy xóa trước khi mở pull request.
- Comment giải thích *vì sao* làm một điều không hiển nhiên (đặc thù của Mutter, vấn đề thời điểm), không mô tả lại code *làm gì*.
- Chuỗi hiển thị cho người dùng phải đi qua `_()` để có thể dịch.
- Cài đặt mới cần thêm key vào `schemas/org.gnome.shell.extensions.stage-manager.gschema.xml`. Nếu người dùng cần tự chỉnh, thêm một dòng vào `prefs.js`.

## Pull request

1. Tạo nhánh mới từ `main` (`git checkout -b fix-emulator-toolbar`).
2. Mỗi pull request chỉ nên tập trung vào một thay đổi.
3. Kiểm tra mọi file vẫn đúng cú pháp:

   ```bash
   for f in *.js; do node --input-type=module --check < "$f" || echo "lỗi cú pháp trong $f"; done
   ```

4. Trong pull request, mô tả:
   - thay đổi gì và vì sao
   - bạn đã thử như thế nào (với app nào, trên Wayland hay X11)
   - ảnh chụp hoặc đoạn quay ngắn nếu thay đổi về giao diện
5. Nếu hành vi hoặc cách cài đặt thay đổi, cập nhật cả `README.md` lẫn `README.vi.md`. Bản dịch chưa mượt cũng không sao, có thể chỉnh lại khi review.

## Giấy phép

Khi đóng góp, bạn đồng ý rằng phần đóng góp của mình được phát hành theo giấy phép [GPL-2.0-or-later](LICENSE), như phần còn lại của dự án.
