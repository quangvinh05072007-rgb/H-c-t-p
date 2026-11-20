# Gói nhập chuẩn SmartExam

App không dùng AI và không tự đọc ảnh hay PDF scan. Đề và tài liệu được xử lý **bên ngoài** (gõ tay, chuyển đổi bằng công cụ
riêng, hay dùng AI ở máy của bạn) rồi đưa vào app bằng một **gói nhập chuẩn**.

- Chỉ có chữ và công thức → một file **`.json`**.
- Có hình → một file **`.zip`** chứa `goi.json` và các file hình **`.png` hoặc `.jpg`** (mỗi hình ≤ 5 MB). Hình WebP, GIF, HEIC không được nhận vì không in ra PDF/Word được — hãy lưu lại dạng PNG/JPG.
- Cả gói tối đa 50 MB, 2000 câu, 100 đề, 200 bài học.
- **Đề gốc** (Word hoặc PDF) đặt trong thư mục `goc/` của `.zip`: app lưu cùng đề để tải lại và đối chiếu (tối đa 30 MB, cùng file thì không lưu hai lần). File Word gốc còn được dùng để tự lấy hình.

Dùng AI để tạo gói: xem quy trình và lời nhắc mẫu ở [huong-dan-ai.md](huong-dan-ai.md).

Nhập ở **Nhập đề → Gói nhập chuẩn**. App **kiểm tra trước** (không ghi gì), báo lỗi theo từng mục; mục lỗi bị bỏ qua, mục
đúng vẫn nhập được. Tải gói mẫu ở cùng chỗ (nút *Tải gói mẫu*).

## Cấu trúc

```json
{
  "format": "smartexam-package",
  "version": 1,
  "source": "Đề khảo sát Toán 12 – lần 1",
  "questions": [ ... ],
  "exams": [ ... ],
  "lessons": [ ... ]
}
```

`format` và `version` bắt buộc đúng như trên. `source` là tên nguồn, ghi vào nguồn gốc câu hỏi.

## Bản 2 (khuyên dùng): một gói = một đề

```json
{
  "format": "smartexam-package",
  "version": 2,
  "source": "Sở GD&ĐT Hà Nội – Khảo sát – Lần 1 – 2026",
  "exam": {
    "title": "Khảo sát chất lượng lớp 12 – Lần 1",
    "category": "khao-sat", "schoolYear": "2025-2026", "grade": 12, "term": "HK2",
    "session": "Lần 1", "source": "Sở GD&ĐT Hà Nội", "date": "2026-03-15",
    "durationMin": 90, "variants": 4, "shareWithSchool": true,
    "sections": [
      { "part": "I", "questions": ["c1", "c2"] },
      { "part": "II", "questions": ["c3"] },
      { "part": "III", "questions": ["c4"] }
    ]
  },
  "questions": [ { "id": "c1", "sourceNo": "Phần I – Câu 1", "...": "..." } ]
}
```

- `exam` thay cho `exams`: thông tin đề dùng để xếp đề trong **Kho đề** (Năm học → Khối → Loại đề). Thiếu trường nào thì bỏ trống,
  app tự suy ra năm học và học kỳ theo ngày, khối theo chuyên đề các câu.
- `schoolYear` dạng `2025-2026`; `grade` 10/11/12; `term` `HK1`, `HK2` hoặc `CN`; `date` dạng `2026-03-15`; `tags` danh sách thẻ.
- `sections`: thứ tự câu theo từng phần như đề gốc. Không có `sections` thì dùng `exam.questions`.
- `sourceNo` ở mỗi câu: vị trí câu trong đề gốc (vd `"Phần II – Câu 1"`).
- Bản 1 (`exams` là danh sách) vẫn nhập được; các trường thông tin đề ở trên cũng dùng được trong từng mục của `exams`.

## Câu hỏi — `questions`

| Trường | Bắt buộc | Ý nghĩa |
|---|---|---|
| `id` | nên có | Mã câu trong gói (vd `"c1"`), dùng để ghép đề. |
| `type` | có | `"mcq"` trắc nghiệm 4 phương án, `"tf"` đúng/sai 4 ý, `"short"` trả lời ngắn. |
| `topic` | có | Mã chuyên đề, vd `"T12.NGUYENHAM"` — xem bảng cuối trang. |
| `level` | có | `1` Biết, `2` Hiểu, `3` Vận dụng. |
| `stem` | có | Đề bài. |
| `options` | mcq, tf | Đúng 4 chuỗi: phương án A–D hoặc ý a)–d). |
| `answer` | có | mcq: `"A"`…`"D"`; tf: `"ĐĐSS"` (hoặc `"DDSS"`, `[true,true,false,false]`); short: số hoặc chuỗi như `"1,5"`. |
| `explanation` | không | Lời giải. |
| `group` | không | Các câu cùng `group` luôn đi cùng nhau khi đảo đề (câu chùm). |
| `form` | không | **Dạng toán**, chi tiết hơn chuyên đề (vd `"Đổi biến số"`, `"Tích phân từng phần"`) — dùng để lọc và ghép đề. |

**Công thức** viết LaTeX giữa hai dấu `$`, vd `$\int_0^1 2x\,dx$`. Trong JSON phải nhân đôi dấu `\`: `"$\\int_0^1 2x\\,dx$"`.

**Hình**: chèn `[[image:hinh/c3.png]]` vào `stem`, `options` hoặc `explanation`; đường dẫn tính từ chỗ đặt `goi.json` trong `.zip`.

**Bảng**: mỗi dòng dạng `| a | b | c |`.

Câu trùng hệt (cùng loại, cùng đề bài) với câu đã có trong ngân hàng sẽ được bỏ qua, không tạo bản sao. Khi kiểm tra gói, app còn liệt kê các câu **giống từ 75%** với câu đã có để bạn xem lại.

## Đề thi — `exams`

```json
{ "title": "Đề khảo sát lần 1", "category": "khao-sat", "durationMin": 90, "variants": 4, "questions": ["c1", "c2", "c3"], "shareWithSchool": true }
```

- `questions`: các `id` câu **trong cùng gói**, đúng thứ tự trên đề.
- `durationMin` 5–240 (mặc định 90); `variants` 1–24 mã đề (mặc định 4).
- `shareWithSchool: false` để đề chỉ mình bạn thấy.
- `category` (không bắt buộc): loại đề để học sinh tìm theo nhóm — `"giua-ky"` Giữa kỳ, `"cuoi-ky"` Cuối kỳ,
  `"thpt"` Thi tốt nghiệp THPT, `"khao-sat"` Khảo sát · Thi thử, `"kiem-tra"` Kiểm tra ngắn, `"on-tap"` Ôn tập chuyên đề.
  Bỏ trống thì app đoán theo tên đề.
- Đề chỉ được tạo khi mọi câu của nó **đã duyệt**: chọn *Duyệt luôn các câu hợp lệ* khi nhập (trường dùng chính sách hai
  người duyệt thì câu luôn vào dạng nháp, duyệt xong mới ghép đề).

## Bài học Tự học — `lessons`

Mỗi chuyên đề một bài. **Chỉ chủ web (tài khoản Quản lý) nhập được bài học**; gói do giáo viên nhập thì phần `lessons` bị bỏ qua (có cảnh báo ở bước kiểm tra).
Nhập lại một chuyên đề thì bài mới được dùng ngay, bài cũ được cất vào lịch sử. Xem, khôi phục hoặc đưa về bài mặc định ở trang **Bài tự học** (menu tài khoản của Quản lý).

```json
{
  "topic": "T12.NGUYENHAM",
  "summary": "Tóm tắt một đoạn.",
  "objectives": ["Mục tiêu 1", "Mục tiêu 2"],
  "formulas": ["Lũy thừa: $\\int x^\\alpha dx = \\dfrac{x^{\\alpha+1}}{\\alpha+1} + C$"],
  "tips": "Mẹo làm bài.",
  "traps": ["Bẫy sai 1", "Bẫy sai 2"],
  "examples": [{ "title": "Ví dụ 1", "problem": "Đề…", "solution": "Lời giải…" }]
}
```

Mỗi công thức nên viết `Tiêu đề: nội dung` để app tách thành dòng đề mục. Cần ít nhất `summary`, `formulas` hoặc `examples`.

## Mã chuyên đề

| Lớp 10 | Lớp 11 | Lớp 12 |
|---|---|---|
| `T10.MENHDE` Mệnh đề, tập hợp | `T11.LUONGGIAC` Lượng giác | `T12.KHAOSAT` Khảo sát hàm số |
| `T10.BPT2AN` BPT bậc nhất hai ẩn | `T11.DAYSO` Dãy số, CSC, CSN | `T12.VECTOKG` Vectơ trong không gian |
| `T10.HTL` Hệ thức lượng | `T11.GHEPNHOM` Số liệu ghép nhóm | `T12.PHANTAN` Độ phân tán |
| `T10.VECTO` Vectơ | `T11.SONGSONG` Quan hệ song song | `T12.NGUYENHAM` Nguyên hàm, tích phân |
| `T10.HAMBAC2` Hàm số bậc hai | `T11.GIOIHAN` Giới hạn, liên tục | `T12.OXYZ` Tọa độ Oxyz |
| `T10.TOADOOXY` Tọa độ Oxy | `T11.MULOG` Mũ, lôgarit | `T12.XSDK` Xác suất có điều kiện |
| `T10.TOHOP` Tổ hợp | `T11.VUONGGOC` Quan hệ vuông góc | |
| `T10.THONGKE` Thống kê | `T11.XACSUAT` Quy tắc xác suất | |
| | `T11.DAOHAM` Đạo hàm | |
