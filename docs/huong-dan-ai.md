# Dùng AI bên ngoài để đưa đề và tài liệu vào SmartExam

App không có AI bên trong. Bạn đưa đề/tài liệu cho một AI bất kỳ (ChatGPT, Claude, Gemini…) kèm **lời nhắc lấy ngay trong
app**, AI trả về dữ liệu theo **gói nhập chuẩn**, app kiểm tra và cho xem trước rồi mới nhập.
Đặc tả gói: [goi-nhap.md](goi-nhap.md). AI hỗ trợ "đầu ra có cấu trúc" thì gắn thêm [goi-nhap.schema.json](goi-nhap.schema.json).

## 1. Ba bước (Nhập đề → Nhập đề do AI chuyển đổi)

1. **Gửi đề cho AI.** Bấm **Lời nhắc cho AI**, chọn loại AI, bấm *Chép lời nhắc*, dán vào AI và đính kèm file đề
   (và đáp án nếu có). Lời nhắc đã có sẵn mã chuyên đề và các **dạng toán trường đang dùng**, nên tên dạng luôn thống nhất.
2. **Dán phần AI trả về** vào ô trong app. Thừa chữ, có dấu ```` ``` ````, hay AI viết `\frac` thiếu dấu `\` đều được: app tự sửa
   và ghi rõ đã sửa gì. Nếu AI trả về file (`goi.json` hoặc `goi.zip`) thì chọn file đó.
3. **Đề có hình:** đính kèm **file Word gốc**, app tự lấy hình gắn vào đúng câu. Bấm **Kiểm tra & xem trước**: xem từng câu
   kèm công thức, hình, đáp án. Hình nào còn thiếu thì chụp vùng hình (Win + Shift + S), bấm *Dán ảnh* ở dòng đó rồi Ctrl + V.
   Có lỗi thì bấm *Chép lỗi để gửi AI sửa*. Xong bấm **Nhập vào ngân hàng**.

Câu nào AI **tự giải** (đề gốc không có đáp án) được đánh dấu *AI tự giải · cần duyệt* và **luôn vào dạng nháp**, kể cả khi
chọn *Duyệt luôn*. Giáo viên kiểm tra đáp án rồi duyệt ở **Ngân hàng → Câu cần sửa**.

## 2. Hai loại lời nhắc

| Loại | Dùng khi | AI trả về | Hình |
|---|---|---|---|
| **Mọi AI** | Bản miễn phí hoặc AI không chạy được code | Khối JSON để dán | Lấy từ file Word gốc, hoặc dán ảnh chụp ở bước xem trước |
| **AI chạy được code** | ChatGPT có phân tích dữ liệu (chạy Python), Claude có tạo file | `goi.zip` có sẵn hình đã cắt | AI tự cắt. Từ Word thì lấy nguyên ảnh gốc (đúng tuyệt đối); từ PDF thì AI cắt theo mắt nhìn, nên xem lại ở bước xem trước |

## 3. Hình lấy từ đâu cho chính xác

| Đề gốc | Cách lấy hình | Độ chính xác |
|---|---|---|
| **Word (.docx)** | Đính kèm file Word ở bước 3. App ghép theo thứ tự: câu thứ *k* trong gói ↔ "Câu …" thứ *k* trong Word; trong mỗi câu, hình thứ *i* ↔ chỗ đặt hình thứ *i* (đề bài → phương án A–D → lời giải). | Đúng tuyệt đối khi AI giữ đúng thứ tự câu |
| **PDF có chữ / PDF scan / ảnh** | Dùng lời nhắc *AI chạy được code* để AI cắt hình, hoặc dán ảnh chụp từng hình ở bước xem trước | Phụ thuộc AI; luôn xem lại |

Giới hạn khi lấy từ Word: hình **vẽ bằng công cụ của Word** (Shapes, Drawing canvas) hoặc dạng **EMF/WMF** không lấy được; app
báo số hình bỏ qua để bạn dán ảnh chụp thay. Hình chỉ nhận **PNG/JPG**, mỗi hình ≤ 5 MB.

Tên chỗ đặt hình theo **id câu trong gói**: `hinh/c5.png`, phương án `hinh/c5-A.png` … `hinh/c5-D.png`. Đề chia Phần I, II, III
đánh lại "Câu 1" vẫn không sao: id chạy liên tục c1, c2, … trong toàn đề.

## 4. Dữ liệu nào nuôi tính năng nào

Điền đúng trường nào thì tính năng tương ứng mới chạy tốt. Bỏ trống trường không bắt buộc thì app vẫn nhập, chỉ thiếu tính năng.

| Trường | Bắt buộc | Dùng cho |
|---|---|---|
| `type`, `stem`, `options`, `answer` | có | Làm bài, chấm điểm, phiếu tô (OMR), xuất PDF/Word |
| `topic` (mã chuyên đề) | có | Tự học, bản đồ chuyên đề trong Hồ sơ, luyện phần yếu, độ phủ ngân hàng, ma trận đề |
| `level` (1 Biết · 2 Hiểu · 3 Vận dụng) | có | Ma trận & bản đặc tả, đề tương đương, giao bài phân hóa, dự báo điểm |
| `explanation` (lời giải) | nên có | Học sinh xem lời giải, chế độ Luyện tập kiểm tra từng câu, Sổ tay lỗi sai |
| `form` (dạng toán) | nên có | Lọc theo dạng, ghép đề tương đương đúng dạng, báo cáo câu cần sửa |
| `group` | khi có câu chùm | Đảo đề giữ các câu dùng chung một dữ kiện đi liền nhau |
| `exams[].category` | nên có | Nhóm trong mục Đề thi của học sinh (Giữa kỳ, Cuối kỳ, THPT…) |
| `lessons[]` (tóm tắt, công thức, ví dụ, bẫy sai, mục tiêu) | khi đưa tài liệu | Phần Lý thuyết của Tự học; `objectives` vào bản đặc tả đề |
| `source` | nên có | Nguồn gốc câu hỏi, lọc câu trùng |

## 5. Phân loại và sắp xếp

**Thư mục trên máy (gợi ý)**, giữ file gốc để lần sau nhập lại hay lấy hình:

```
kho-de/
  2026-2027/
    thpt/          minh-hoa-bgd-2026/       de-goc.docx · dap-an.pdf
    khao-sat/      so-ha-noi-lan-1/
    giua-ky/       12-hk1/
    cuoi-ky/
    kiem-tra/
  tai-lieu/
    T12.NGUYENHAM/ ly-thuyet.docx
```

**Nguồn (`source`):** `Đơn vị – Kỳ thi – Lần – Năm`, ví dụ `Sở GD Hà Nội – Thi thử TN THPT – Lần 1 – 2026`.

**Loại đề (`category`):** `giua-ky` · `cuoi-ky` · `thpt` (đề Bộ, minh họa) · `khao-sat` (thi thử Sở/trường) · `kiem-tra` (15–45 phút) · `on-tap`.

**Mức độ (`level`):** 1 Biết: nhắc lại định nghĩa, công thức, tính trực tiếp · 2 Hiểu: áp dụng 2–3 bước, nhận đúng dạng ·
3 Vận dụng: nhiều bước, kết hợp kiến thức, bài thực tế.

**Dạng toán (`form`):** viết **giống hệt nhau** giữa các đề. Lời nhắc trong app đã kèm danh sách dạng đang có theo từng chuyên đề,
AI sẽ chọn đúng tên cũ; chỉ đặt tên mới khi chưa có dạng phù hợp.

## 6. App tự xử lý những lỗi AI hay mắc

| Lỗi | App xử lý |
|---|---|
| Có lời dẫn, bọc JSON trong ```` ```json ```` | Tự lấy đúng khối `{ … }` |
| Viết `\frac`, `\sqrt`, `\times`, `\neq`… với **một** dấu `\` | Tự sửa trong công thức, báo số chỗ đã sửa (trước đây công thức bị hỏng âm thầm) |
| Giữ "A." trong phương án, "a)" trong ý đúng/sai | Tự bỏ nhãn thừa |
| AI tự giải khi đề không có đáp án (`[AI tự giải]` ở đầu lời giải) | Câu luôn vào nháp, gỡ dấu khỏi lời giải |
| Sai mã chuyên đề, thiếu phương án, đáp án sai định dạng, loại đề sai | Báo lỗi từng câu; *Chép lỗi để gửi AI sửa* |
| Thiếu hình | Liệt kê từng hình, dán ảnh chụp ngay tại chỗ |
| Hình WebP/GIF/HEIC | Báo "không phải PNG/JPG" |
| AI nhầm `−`/`-`, `x2`/`x^2`, bỏ sót câu khi đọc ảnh scan | **Không tự phát hiện được**: soát ở bản xem trước, so số câu với đề gốc |

**Đề dài:** một đề 22 câu có lời giải thường vừa một lần trả lời. Nếu AI dừng giữa chừng, bảo nó *"Viết lại toàn bộ, không có lời
giải"*; hoặc tách thành 2 lần, mỗi lần một nửa đề (id tiếp nối), nhập 2 lần rồi ghép đề trong **Soạn đề**.
