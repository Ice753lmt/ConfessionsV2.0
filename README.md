# Confessions Trường THCS & THPT Ngã Sáu

## Công nghệ
- HTML, CSS, Vanilla JavaScript
- Supabase Auth + PostgreSQL + Row Level Security
- PWA; hosting tĩnh bằng GitHub Pages
- Không cần Node.js hoặc Terminal.

## 1. Tạo database
1. Tạo project tại https://supabase.com/
2. Mở **SQL Editor** → **New query**.
3. Mở `schema.sql`, sao chép toàn bộ và chạy.
4. Vào **Authentication → Providers → Email** và bật Email provider. Tùy chọn tắt Confirm email nếu muốn đăng nhập ngay sau đăng ký (cân nhắc bảo mật).

## 2. Cấu hình ứng dụng
1. Vào **Project Settings → API** trong Supabase.
2. Sao chép Project URL và anon/public key.
3. Mở `config.js`, thay hai giá trị mẫu. Không bao giờ dùng `service_role` key trong trình duyệt.

## 3. Tạo tài khoản Admin
1. Mở ứng dụng, đăng ký tài khoản bằng email Admin.
2. Trong Supabase → SQL Editor, chạy:
   `update public.profiles set role='admin' where email='EMAIL_ADMIN';`
3. Thay `EMAIL_ADMIN` bằng email vừa đăng ký. Đăng xuất rồi đăng nhập lại.
4. Chỉ tài khoản role `admin` mới thấy menu **Duyệt bài**.

## 4. Chạy trong Visual Studio Code (không dùng Terminal)
1. Giải nén ZIP.
2. Mở thư mục dự án bằng VS Code.
3. Cài tiện ích **Live Server** trong Extensions.
4. Nhấp phải `index.html` → **Open with Live Server**.

## 5. Đưa lên GitHub Pages
1. Tạo repository GitHub mới.
2. Upload toàn bộ file trong thư mục dự án lên repository (không upload file ZIP).
3. Vào Settings → Pages.
4. Chọn Deploy from a branch → `main` → `/ (root)` → Save.
5. Chờ GitHub Pages xuất bản và mở URL được cung cấp.

## Các chức năng
- Splash screen 2 giây, đăng ký/đăng nhập email + mật khẩu.
- Tên hiển thị có hướng dẫn; confession được ẩn danh trên bảng tin.
- Người dùng: Trang chủ, Bảng tin, Cài đặt.
- Admin: thêm menu Duyệt bài, xem người gửi/email/giờ gửi, duyệt hàng loạt, không duyệt, xem tất cả, xóa bài.
- Bài được duyệt chuyển trạng thái, không bị xóa khỏi danh sách kiểm duyệt; đánh số # tự động khi duyệt.
- Thích, bình luận, trả lời bình luận theo cấu trúc dữ liệu parent_id.
- Chế độ sáng/tối, đăng xuất nhanh, đổi họ tên, xóa tài khoản có xác nhận mật khẩu.

## Lưu ý trước khi sử dụng thật
- Đây là bộ mã nguồn khởi đầu đã kết nối Supabase theo cấu hình của bạn; cần điền URL/key và chạy SQL.
- Nên kiểm thử kỹ bằng ít nhất một tài khoản thường và một tài khoản Admin trước khi công khai.
- Cơ chế xóa tài khoản gọi RPC `delete_own_account`; hãy thử trên tài khoản thử nghiệm trước khi dùng dữ liệu thật.
- Với môi trường trường học, Admin cần kiểm duyệt nội dung và bảo vệ email/thông tin người gửi. Không chia sẻ thông tin nhạy cảm của học sinh trên bảng tin.


## Cập nhật V4 – duyệt hàng loạt và SQL tổng hợp

- Chỉ confession có trạng thái `pending` mới được chọn để duyệt hàng loạt.
- Nút Chọn tất cả chỉ chọn các confession đang chờ duyệt.
- Hàm `approve_confessions(uuid[])` chỉ duyệt trạng thái `pending` và gom các confession trong cùng một lần duyệt vào chung `post_number`.
- File `schema.sql` đã được thay bằng SQL tổng hợp gồm schema, RLS likes, comments/replies, sequence và quyền Admin.

**Cập nhật Supabase:** chạy toàn bộ file `schema.sql` trong Supabase SQL Editor. Trước khi chạy trên dữ liệu thật, nên sao lưu cơ sở dữ liệu. Câu lệnh không xóa dữ liệu confession/comment/like hiện có.
