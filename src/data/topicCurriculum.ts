// Nội dung học theo chuyên đề cho trang Tự học (TopicStudyWorkspace).
// Khóa = mã chủ đề Toán, khớp shared/topics.mjs.
// Công thức viết dạng "Tiêu đề: nội dung", công thức toán đặt trong $...$ (KaTeX qua MathText).
// Tiêu đề trước dấu ":" nên ngắn (< 56 ký tự) và không chứa "$" để được tách thành dòng đề mục.

export type CurriculumExample = { title: string; problem: string; solution: string };

export type TopicCurriculumEntry = {
  summary: string;
  objectives?: string[];
  formulas: string[];
  keyExamTips: string;
  commonTraps: string[];
  examples?: CurriculumExample[];
};

const r = String.raw;

export const TOPIC_CURRICULUM: Record<string, TopicCurriculumEntry> = {
  // ───────────────────────── TOÁN LỚP 10 ─────────────────────────
  'T10.MENHDE': {
    summary: 'Mệnh đề, phủ định, mệnh đề kéo theo – tương đương; tập hợp và các phép toán giao, hợp, hiệu, phần bù.',
    objectives: ['Xác định tính đúng sai và phủ định mệnh đề có lượng từ', 'Thực hiện phép toán trên tập hợp và khoảng, đoạn'],
    formulas: [
      r`Phủ định lượng từ: $\overline{\forall x, P(x)} \Leftrightarrow \exists x, \overline{P(x)}$ và $\overline{\exists x, P(x)} \Leftrightarrow \forall x, \overline{P(x)}$`,
      r`Kéo theo: $P \Rightarrow Q$ chỉ sai khi $P$ đúng và $Q$ sai`,
      r`Giao, hợp: $A \cap B = \{x \mid x \in A \text{ và } x \in B\}$, $A \cup B = \{x \mid x \in A \text{ hoặc } x \in B\}$`,
      r`Hiệu và phần bù: $A \setminus B = \{x \in A \mid x \notin B\}$, $C_E A = E \setminus A$ khi $A \subset E$`,
      r`Số tập con: tập có $n$ phần tử có $2^n$ tập con`,
    ],
    keyExamTips: r`Biểu diễn khoảng, đoạn lên trục số rồi đọc kết quả giao/hợp. Chú ý đầu mút: ngoặc tròn là không lấy, ngoặc vuông là lấy.`,
    commonTraps: [
      r`Phủ định của "$x > 2$" là "$x \le 2$", không phải "$x < 2$".`,
      r`Quên tập rỗng $\varnothing$ và chính tập đó khi đếm tập con.`,
      r`Nhầm đầu mút khi lấy giao: $[1;3) \cap (3;5] = \varnothing$.`,
    ],
    examples: [
      {
        title: 'Giao và hiệu của khoảng',
        problem: r`Cho $A = [-1; 4)$, $B = (2; 6]$. Tìm $A \cap B$ và $A \setminus B$.`,
        solution: r`Trên trục số: $A \cap B = (2; 4)$; $A \setminus B = [-1; 2]$ (lấy $2$ vì $2 \notin B$).`,
      },
    ],
  },
  'T10.BPT2AN': {
    summary: 'Bất phương trình và hệ bất phương trình bậc nhất hai ẩn, biểu diễn miền nghiệm, bài toán tối ưu trên miền đa giác.',
    objectives: ['Xác định miền nghiệm trên mặt phẳng tọa độ', 'Tìm giá trị lớn nhất, nhỏ nhất của F = ax + by trên miền nghiệm'],
    formulas: [
      r`Dạng tổng quát: $ax + by + c > 0$ (hoặc $<, \ge, \le$), với $a^2 + b^2 \neq 0$`,
      r`Xác định miền nghiệm: vẽ đường $ax + by + c = 0$, thay một điểm không thuộc đường (thường $O(0;0)$) để chọn nửa mặt phẳng`,
      r`Bài toán tối ưu: $F = ax + by$ đạt max/min tại một đỉnh của miền nghiệm đa giác`,
    ],
    keyExamTips: r`Liệt kê tọa độ các đỉnh của miền đa giác, thay vào $F$ rồi so sánh. Với dấu $\ge, \le$ đường bờ thuộc miền nghiệm.`,
    commonTraps: [
      'Thay điểm O khi đường thẳng đi qua gốc tọa độ — phải chọn điểm khác.',
      'Bỏ sót đỉnh là giao với trục tọa độ khi có điều kiện x ≥ 0, y ≥ 0.',
    ],
    examples: [
      {
        title: 'Tối ưu trên miền nghiệm',
        problem: r`Tìm giá trị lớn nhất của $F = x + 2y$ với $x \ge 0$, $y \ge 0$, $x + y \le 4$.`,
        solution: r`Các đỉnh: $(0;0)$, $(4;0)$, $(0;4)$. $F$ lần lượt bằng $0$, $4$, $8$. Vậy $\max F = 8$ tại $(0;4)$.`,
      },
    ],
  },
  'T10.HTL': {
    summary: 'Giá trị lượng giác của góc từ 0° đến 180°, định lí côsin, định lí sin, công thức diện tích và giải tam giác.',
    objectives: ['Áp dụng định lí côsin, sin để tính cạnh và góc', 'Tính diện tích, bán kính đường tròn nội, ngoại tiếp'],
    formulas: [
      r`Định lí côsin: $a^2 = b^2 + c^2 - 2bc\cos A$`,
      r`Định lí sin: $\dfrac{a}{\sin A} = \dfrac{b}{\sin B} = \dfrac{c}{\sin C} = 2R$`,
      r`Diện tích: $S = \dfrac12 bc\sin A = \dfrac{abc}{4R} = pr$`,
      r`Công thức Heron: $S = \sqrt{p(p-a)(p-b)(p-c)}$, với $p = \dfrac{a+b+c}{2}$`,
      r`Độ dài trung tuyến: $m_a^2 = \dfrac{2(b^2+c^2) - a^2}{4}$`,
    ],
    keyExamTips: r`Biết hai cạnh và góc xen giữa → dùng định lí côsin. Biết một cạnh và hai góc → dùng định lí sin. $\cos A < 0$ thì $A$ là góc tù.`,
    commonTraps: [
      r`Nhầm $\sin(180^\circ - \alpha) = \sin\alpha$ nhưng $\cos(180^\circ - \alpha) = -\cos\alpha$.`,
      r`Quên chia đôi chu vi khi dùng $p$ trong công thức Heron và $S = pr$.`,
    ],
    examples: [
      {
        title: 'Tính cạnh bằng định lí côsin',
        problem: r`Tam giác $ABC$ có $b = 5$, $c = 8$, $A = 60^\circ$. Tính $a$ và diện tích.`,
        solution: r`$a^2 = 25 + 64 - 2\cdot5\cdot8\cdot\tfrac12 = 49 \Rightarrow a = 7$. $S = \tfrac12\cdot5\cdot8\cdot\sin60^\circ = 10\sqrt3$.`,
      },
    ],
  },
  'T10.VECTO': {
    summary: 'Vectơ, phép cộng trừ, nhân với một số, tích vô hướng; trung điểm, trọng tâm và ứng dụng chứng minh hệ thức.',
    objectives: ['Sử dụng quy tắc ba điểm, hình bình hành', 'Tính tích vô hướng và góc giữa hai vectơ'],
    formulas: [
      r`Quy tắc ba điểm: $\overrightarrow{AB} + \overrightarrow{BC} = \overrightarrow{AC}$`,
      r`Quy tắc hình bình hành: $\overrightarrow{AB} + \overrightarrow{AD} = \overrightarrow{AC}$ với $ABCD$ là hình bình hành`,
      r`Trung điểm: $I$ là trung điểm $AB \Leftrightarrow \overrightarrow{IA} + \overrightarrow{IB} = \vec 0$`,
      r`Trọng tâm: $G$ là trọng tâm $\triangle ABC \Leftrightarrow \overrightarrow{GA} + \overrightarrow{GB} + \overrightarrow{GC} = \vec 0$`,
      r`Tích vô hướng: $\vec a \cdot \vec b = |\vec a|\,|\vec b|\cos(\vec a, \vec b) = x_1x_2 + y_1y_2$`,
      r`Vuông góc: $\vec a \perp \vec b \Leftrightarrow \vec a \cdot \vec b = 0$`,
    ],
    keyExamTips: r`Với điểm $M$ bất kỳ: $\overrightarrow{MA} + \overrightarrow{MB} = 2\overrightarrow{MI}$ và $\overrightarrow{MA} + \overrightarrow{MB} + \overrightarrow{MC} = 3\overrightarrow{MG}$ — dùng để rút gọn nhanh.`,
    commonTraps: [
      r`Góc giữa $\overrightarrow{AB}$ và $\overrightarrow{BC}$ không phải góc $\widehat{ABC}$ mà là $180^\circ - \widehat{ABC}$.`,
      r`Nhầm $\overrightarrow{AB} - \overrightarrow{AC} = \overrightarrow{CB}$ (không phải $\overrightarrow{BC}$).`,
    ],
  },
  'T10.HAMBAC2': {
    summary: 'Hàm số bậc hai, đồ thị parabol, sự biến thiên; dấu tam thức bậc hai và bất phương trình bậc hai.',
    objectives: ['Xác định đỉnh, trục đối xứng, chiều biến thiên', 'Xét dấu tam thức và giải bất phương trình bậc hai'],
    formulas: [
      r`Đỉnh parabol: $I\left(-\dfrac{b}{2a}; -\dfrac{\Delta}{4a}\right)$, trục đối xứng $x = -\dfrac{b}{2a}$`,
      r`Biến thiên: $a > 0$ nghịch biến trên $\left(-\infty; -\tfrac{b}{2a}\right)$, đồng biến trên $\left(-\tfrac{b}{2a}; +\infty\right)$`,
      r`Dấu tam thức khi $\Delta < 0$: $f(x)$ cùng dấu $a$ với mọi $x$`,
      r`Dấu tam thức khi $\Delta > 0$: "trong trái, ngoài cùng" — trái dấu $a$ giữa hai nghiệm`,
      r`Luôn dương: $ax^2 + bx + c > 0\ \forall x \Leftrightarrow a > 0,\ \Delta < 0$ (khi $a \ne 0$)`,
    ],
    keyExamTips: r`Bài có tham số với "đúng với mọi $x$": luôn xét riêng trường hợp $a = 0$ trước.`,
    commonTraps: [
      r`Quên trường hợp hệ số $a = 0$ khi có tham số.`,
      r`Nhầm tung độ đỉnh là $\dfrac{\Delta}{4a}$ (đúng là $-\dfrac{\Delta}{4a}$).`,
    ],
    examples: [
      {
        title: 'Bất phương trình bậc hai',
        problem: r`Giải $x^2 - 5x + 6 \le 0$.`,
        solution: r`Nghiệm $x = 2$, $x = 3$; $a = 1 > 0$ nên tam thức không dương giữa hai nghiệm: $S = [2; 3]$.`,
      },
    ],
  },
  'T10.TOADOOXY': {
    summary: 'Tọa độ điểm, vectơ trong mặt phẳng; phương trình đường thẳng, đường tròn, ba đường conic.',
    objectives: ['Viết phương trình đường thẳng, đường tròn', 'Tính khoảng cách, góc giữa hai đường thẳng'],
    formulas: [
      r`Phương trình tổng quát: $a(x - x_0) + b(y - y_0) = 0$ với VTPT $\vec n = (a; b)$`,
      r`Khoảng cách điểm đến đường: $d(M, \Delta) = \dfrac{|ax_0 + by_0 + c|}{\sqrt{a^2 + b^2}}$`,
      r`Góc hai đường thẳng: $\cos\varphi = \dfrac{|a_1a_2 + b_1b_2|}{\sqrt{a_1^2+b_1^2}\sqrt{a_2^2+b_2^2}}$`,
      r`Đường tròn: $(x - a)^2 + (y - b)^2 = R^2$; dạng $x^2 + y^2 - 2ax - 2by + c = 0$ cần $a^2 + b^2 - c > 0$`,
      r`Tiếp tuyến: đường thẳng $\Delta$ tiếp xúc đường tròn $\Leftrightarrow d(I, \Delta) = R$`,
      r`Elip: $\dfrac{x^2}{a^2} + \dfrac{y^2}{b^2} = 1$, $c^2 = a^2 - b^2$, tiêu cự $2c$`,
    ],
    keyExamTips: r`VTCP $\vec u = (u_1; u_2)$ suy ra VTPT $\vec n = (u_2; -u_1)$. Hai đường song song có cùng VTPT.`,
    commonTraps: [
      r`Quên giá trị tuyệt đối ở tử số công thức khoảng cách.`,
      r`Elip: nhầm $c^2 = a^2 + b^2$ (đó là của hypebol).`,
    ],
  },
  'T10.TOHOP': {
    summary: 'Quy tắc cộng, quy tắc nhân, hoán vị, chỉnh hợp, tổ hợp và nhị thức Newton.',
    objectives: ['Phân biệt bài toán có thứ tự (chỉnh hợp) và không thứ tự (tổ hợp)', 'Khai triển nhị thức Newton với số mũ nhỏ'],
    formulas: [
      r`Hoán vị: $P_n = n!$`,
      r`Chỉnh hợp: $A_n^k = \dfrac{n!}{(n-k)!}$ — chọn $k$ phần tử có sắp thứ tự`,
      r`Tổ hợp: $C_n^k = \dfrac{n!}{k!(n-k)!}$ — chọn $k$ phần tử không thứ tự`,
      r`Tính chất: $C_n^k = C_n^{n-k}$, $C_{n}^{k} + C_{n}^{k+1} = C_{n+1}^{k+1}$`,
      r`Nhị thức Newton: $(a + b)^n = \sum_{k=0}^{n} C_n^k a^{n-k} b^k$`,
    ],
    keyExamTips: 'Đặt câu hỏi: đổi chỗ các phần tử đã chọn có tạo kết quả mới không? Có → chỉnh hợp; không → tổ hợp. Bài "ít nhất" thường dùng phần bù.',
    commonTraps: [
      'Lập số có chữ số 0: quên loại trường hợp chữ số 0 đứng đầu.',
      'Cộng khi phải nhân: các bước liên tiếp dùng quy tắc nhân, các phương án loại trừ nhau dùng quy tắc cộng.',
    ],
    examples: [
      {
        title: 'Chọn ban cán sự',
        problem: 'Lớp có 30 học sinh. Có bao nhiêu cách chọn 1 lớp trưởng, 1 lớp phó và 1 thủ quỹ?',
        solution: r`Ba chức vụ khác nhau nên có thứ tự: $A_{30}^3 = 30\cdot29\cdot28 = 24360$ cách.`,
      },
    ],
  },
  'T10.THONGKE': {
    summary: 'Số liệu không ghép nhóm: số trung bình, trung vị, tứ phân vị, mốt, khoảng biến thiên, phương sai và độ lệch chuẩn.',
    formulas: [
      r`Số trung bình: $\bar x = \dfrac{x_1 + x_2 + \dots + x_n}{n}$`,
      r`Trung vị: sắp xếp tăng dần, lấy số ở giữa (hoặc trung bình hai số giữa khi $n$ chẵn)`,
      r`Phương sai: $s^2 = \dfrac{1}{n}\sum (x_i - \bar x)^2 = \overline{x^2} - \bar x^2$`,
      r`Khoảng tứ phân vị: $\Delta_Q = Q_3 - Q_1$; giá trị ngoại lai nếu $x > Q_3 + 1{,}5\Delta_Q$ hoặc $x < Q_1 - 1{,}5\Delta_Q$`,
    ],
    keyExamTips: 'Luôn sắp xếp dãy số trước khi tìm trung vị và tứ phân vị. Độ lệch chuẩn là căn bậc hai của phương sai.',
    commonTraps: [
      'Tìm trung vị khi chưa sắp xếp dãy số liệu.',
      'Nhầm phương sai và độ lệch chuẩn khi đề hỏi đơn vị đo.',
    ],
  },

  // ───────────────────────── TOÁN LỚP 11 ─────────────────────────
  'T11.LUONGGIAC': {
    summary: 'Góc lượng giác, công thức lượng giác, hàm số lượng giác và phương trình lượng giác cơ bản.',
    objectives: ['Áp dụng công thức cộng, nhân đôi, biến đổi', 'Giải phương trình lượng giác cơ bản và đưa về cơ bản'],
    formulas: [
      r`Công thức cộng: $\cos(a \pm b) = \cos a\cos b \mp \sin a\sin b$, $\sin(a \pm b) = \sin a\cos b \pm \cos a\sin b$`,
      r`Nhân đôi: $\sin 2a = 2\sin a\cos a$, $\cos 2a = \cos^2 a - \sin^2 a = 1 - 2\sin^2 a$`,
      r`Phương trình sin: $\sin x = \sin\alpha \Leftrightarrow x = \alpha + k2\pi$ hoặc $x = \pi - \alpha + k2\pi$`,
      r`Phương trình cos: $\cos x = \cos\alpha \Leftrightarrow x = \pm\alpha + k2\pi$`,
      r`Phương trình tan: $\tan x = \tan\alpha \Leftrightarrow x = \alpha + k\pi$`,
      r`Chu kì: $\sin, \cos$ có chu kì $2\pi$; $\tan, \cot$ có chu kì $\pi$`,
    ],
    keyExamTips: r`Đếm nghiệm trên một đoạn: viết nghiệm tổng quát, giải bất phương trình theo $k \in \mathbb{Z}$. Với $\tan, \cot$ nhớ đặt điều kiện xác định.`,
    commonTraps: [
      r`Phương trình $\sin x = m$ vô nghiệm khi $|m| > 1$.`,
      r`Quên điều kiện $\cos x \ne 0$ khi có $\tan x$.`,
      r`Dùng chu kì $k2\pi$ cho $\tan x$ làm mất nghiệm.`,
    ],
    examples: [
      {
        title: 'Phương trình cơ bản',
        problem: r`Giải $2\sin x - 1 = 0$.`,
        solution: r`$\sin x = \tfrac12 = \sin\tfrac{\pi}{6} \Rightarrow x = \tfrac{\pi}{6} + k2\pi$ hoặc $x = \tfrac{5\pi}{6} + k2\pi$, $k \in \mathbb{Z}$.`,
      },
    ],
  },
  'T11.DAYSO': {
    summary: 'Dãy số, tính tăng giảm, bị chặn; cấp số cộng và cấp số nhân: số hạng tổng quát và tổng $n$ số hạng đầu.',
    formulas: [
      r`Cấp số cộng: $u_n = u_1 + (n-1)d$`,
      r`Tổng cấp số cộng: $S_n = \dfrac{n(u_1 + u_n)}{2} = \dfrac{n\left[2u_1 + (n-1)d\right]}{2}$`,
      r`Cấp số nhân: $u_n = u_1 q^{n-1}$`,
      r`Tổng cấp số nhân: $S_n = u_1\dfrac{1 - q^n}{1 - q}$ với $q \ne 1$`,
      r`Tính chất ba số liên tiếp: CSC có $2b = a + c$; CSN có $b^2 = ac$`,
    ],
    keyExamTips: 'Bài thực tế (lãi suất, dân số, chiều cao nảy bóng) thường là cấp số nhân. Xác định rõ số hạng đầu và số số hạng.',
    commonTraps: [
      r`Lũy thừa $q^{n-1}$ chứ không phải $q^n$ trong công thức số hạng tổng quát.`,
      'Đếm sai số số hạng: từ năm thứ 1 đến năm thứ 10 là 10 số hạng.',
    ],
    examples: [
      {
        title: 'Tổng cấp số cộng',
        problem: r`Cho CSC có $u_1 = 3$, $d = 4$. Tính $S_{10}$.`,
        solution: r`$S_{10} = \dfrac{10(2\cdot3 + 9\cdot4)}{2} = 5\cdot42 = 210$.`,
      },
    ],
  },
  'T11.GHEPNHOM': {
    summary: 'Mẫu số liệu ghép nhóm: số trung bình, trung vị, tứ phân vị, mốt.',
    formulas: [
      r`Số trung bình: $\bar x = \dfrac{\sum n_i c_i}{n}$ với $c_i$ là giá trị đại diện (trung điểm nhóm)`,
      r`Trung vị: $M_e = u_m + \dfrac{\frac n2 - C}{n_m}(u_{m+1} - u_m)$`,
      r`Mốt: $M_o = u_m + \dfrac{n_m - n_{m-1}}{(n_m - n_{m-1}) + (n_m - n_{m+1})}(u_{m+1} - u_m)$`,
      r`Tứ phân vị: $Q_1$ ứng với vị trí $\tfrac n4$, $Q_3$ ứng với vị trí $\tfrac{3n}{4}$, tính như trung vị`,
    ],
    keyExamTips: r`Lập bảng tần số tích lũy trước. $C$ là tổng tần số các nhóm đứng trước nhóm chứa trung vị.`,
    commonTraps: [
      'Dùng đầu mút nhóm thay cho giá trị đại diện khi tính số trung bình.',
      'Nhóm chứa mốt là nhóm có tần số lớn nhất, không phải nhóm ở giữa.',
    ],
  },
  'T11.SONGSONG': {
    summary: 'Đường thẳng và mặt phẳng trong không gian, quan hệ song song, giao tuyến, thiết diện, phép chiếu song song.',
    formulas: [
      r`Giao tuyến: điểm chung thứ nhất + điểm chung thứ hai, hoặc qua điểm chung và song song với đường đã biết`,
      r`Đường song song mặt: $a \not\subset (P)$, $a \parallel b$, $b \subset (P) \Rightarrow a \parallel (P)$`,
      r`Hai mặt song song: $(P)$ chứa hai đường cắt nhau cùng song song $(Q)$ thì $(P) \parallel (Q)$`,
      r`Định lí ba giao tuyến: ba giao tuyến của ba mặt phẳng hoặc đồng quy hoặc đôi một song song`,
    ],
    keyExamTips: 'Tìm giao điểm của đường thẳng với mặt phẳng: chọn mặt phụ chứa đường thẳng, tìm giao tuyến với mặt phẳng đã cho rồi lấy giao điểm.',
    commonTraps: [
      'Hai đường thẳng không cắt nhau chưa chắc song song — có thể chéo nhau.',
      'Kẻ giao điểm của hai đường không đồng phẳng.',
    ],
  },
  'T11.GIOIHAN': {
    summary: 'Giới hạn dãy số, giới hạn hàm số, các dạng vô định và hàm số liên tục.',
    formulas: [
      r`Giới hạn đặc biệt: $\lim \dfrac{1}{n^k} = 0$, $\lim q^n = 0$ khi $|q| < 1$`,
      r`Cấp số nhân lùi vô hạn: $S = \dfrac{u_1}{1 - q}$ với $|q| < 1$`,
      r`Dạng $\frac{0}{0}$: phân tích nhân tử hoặc nhân liên hợp để khử`,
      r`Dạng $\frac{\infty}{\infty}$: chia cả tử và mẫu cho lũy thừa cao nhất`,
      r`Liên tục tại $x_0$: $\lim_{x \to x_0} f(x) = f(x_0)$`,
    ],
    keyExamTips: 'Hàm phân thức bậc tử bằng bậc mẫu: giới hạn ở vô cực bằng tỉ số hệ số bậc cao nhất. Bậc tử nhỏ hơn: giới hạn bằng 0.',
    commonTraps: [
      r`Quên đổi dấu khi $x \to -\infty$ và đưa $x$ ra khỏi căn: $\sqrt{x^2} = |x| = -x$.`,
      'Hàm số liên tục tại điểm cần giới hạn trái bằng giới hạn phải và bằng giá trị hàm số.',
    ],
    examples: [
      {
        title: 'Khử dạng 0/0',
        problem: r`Tính $\lim_{x \to 2} \dfrac{x^2 - 4}{x - 2}$.`,
        solution: r`$\dfrac{(x-2)(x+2)}{x-2} = x + 2 \to 4$. Vậy giới hạn bằng $4$.`,
      },
    ],
  },
  'T11.MULOG': {
    summary: 'Lũy thừa, lôgarit, hàm số mũ, hàm số lôgarit; phương trình và bất phương trình mũ, lôgarit.',
    objectives: ['Biến đổi biểu thức lôgarit', 'Giải phương trình, bất phương trình mũ và lôgarit cơ bản'],
    formulas: [
      r`Định nghĩa: $\log_a b = \alpha \Leftrightarrow a^\alpha = b$ ($0 < a \ne 1$, $b > 0$)`,
      r`Tích, thương: $\log_a(bc) = \log_a b + \log_a c$, $\log_a\dfrac bc = \log_a b - \log_a c$`,
      r`Lũy thừa: $\log_a b^\alpha = \alpha\log_a b$, $\log_{a^\beta} b = \dfrac1\beta\log_a b$`,
      r`Đổi cơ số: $\log_a b = \dfrac{\log_c b}{\log_c a}$`,
      r`Bất phương trình mũ: $a > 1$ thì $a^{f} > a^{g} \Leftrightarrow f > g$; $0 < a < 1$ thì đổi chiều`,
    ],
    keyExamTips: 'Luôn đặt điều kiện xác định trước khi giải phương trình lôgarit; đối chiếu nghiệm với điều kiện ở bước cuối.',
    commonTraps: [
      r`Quên đổi chiều bất phương trình khi cơ số $0 < a < 1$.`,
      r`$\log_a(b + c) \ne \log_a b + \log_a c$.`,
      r`$\log_a x^2 = 2\log_a |x|$, không phải $2\log_a x$ khi $x$ có thể âm.`,
    ],
    examples: [
      {
        title: 'Phương trình lôgarit',
        problem: r`Giải $\log_2(x - 1) = 3$.`,
        solution: r`Điều kiện $x > 1$. Phương trình $\Leftrightarrow x - 1 = 2^3 = 8 \Leftrightarrow x = 9$ (thỏa mãn).`,
      },
    ],
  },
  'T11.VUONGGOC': {
    summary: 'Góc giữa hai đường thẳng, đường thẳng vuông góc mặt phẳng, hai mặt phẳng vuông góc, khoảng cách và góc trong không gian.',
    formulas: [
      r`Đường vuông góc mặt: $d$ vuông góc hai đường cắt nhau trong $(P)$ thì $d \perp (P)$`,
      r`Góc đường – mặt: góc giữa đường thẳng và hình chiếu của nó trên mặt phẳng`,
      r`Góc nhị diện: góc giữa hai đường cùng vuông góc giao tuyến tại một điểm, mỗi đường nằm trong một mặt`,
      r`Định lí ba đường vuông góc: $a \subset (P)$, $a \perp b' \Leftrightarrow a \perp b$ ($b'$ là hình chiếu của $b$)`,
      r`Thể tích: chóp $V = \dfrac13 Bh$, lăng trụ $V = Bh$`,
    ],
    keyExamTips: 'Khoảng cách từ chân đường cao đến mặt bên: dựng đường vuông góc xuống giao tuyến, rồi hạ vuông góc tiếp. Dùng tỉ số khoảng cách để chuyển điểm.',
    commonTraps: [
      'Lấy góc giữa đường thẳng và một đường bất kỳ trong mặt phẳng thay vì hình chiếu.',
      'Quên hệ số 1/3 khi tính thể tích khối chóp.',
    ],
  },
  'T11.XACSUAT': {
    summary: 'Biến cố hợp, giao, độc lập; quy tắc cộng và nhân xác suất.',
    formulas: [
      r`Định nghĩa cổ điển: $P(A) = \dfrac{n(A)}{n(\Omega)}$`,
      r`Biến cố đối: $P(\overline A) = 1 - P(A)$`,
      r`Quy tắc cộng: $P(A \cup B) = P(A) + P(B) - P(A \cap B)$`,
      r`Biến cố độc lập: $P(A \cap B) = P(A)\cdot P(B)$`,
    ],
    keyExamTips: 'Bài có chữ "ít nhất một" gần như luôn nhanh hơn khi tính qua biến cố đối.',
    commonTraps: [
      'Dùng quy tắc nhân cho hai biến cố không độc lập.',
      'Cộng xác suất của hai biến cố không xung khắc mà quên trừ phần giao.',
    ],
    examples: [
      {
        title: 'Ít nhất một lần',
        problem: r`Bắn 2 viên độc lập, mỗi viên trúng với xác suất $0{,}7$. Tính xác suất có ít nhất một viên trúng.`,
        solution: r`$P = 1 - 0{,}3^2 = 1 - 0{,}09 = 0{,}91$.`,
      },
    ],
  },
  'T11.DAOHAM': {
    summary: 'Định nghĩa đạo hàm, quy tắc tính, đạo hàm hàm hợp, đạo hàm cấp hai, ý nghĩa hình học và vật lí.',
    formulas: [
      r`Quy tắc: $(uv)' = u'v + uv'$, $\left(\dfrac uv\right)' = \dfrac{u'v - uv'}{v^2}$`,
      r`Hàm hợp: $\left[f(u)\right]' = f'(u)\cdot u'$`,
      r`Cơ bản: $(x^n)' = nx^{n-1}$, $(\sqrt x)' = \dfrac{1}{2\sqrt x}$`,
      r`Lượng giác: $(\sin x)' = \cos x$, $(\cos x)' = -\sin x$, $(\tan x)' = \dfrac{1}{\cos^2 x}$`,
      r`Mũ, lôgarit: $(e^x)' = e^x$, $(a^x)' = a^x\ln a$, $(\ln x)' = \dfrac1x$`,
      r`Tiếp tuyến tại $M(x_0; y_0)$: $y = f'(x_0)(x - x_0) + y_0$`,
    ],
    keyExamTips: r`Vận tốc là đạo hàm của quãng đường theo thời gian, gia tốc là đạo hàm của vận tốc: $v(t) = s'(t)$, $a(t) = v'(t)$.`,
    commonTraps: [
      r`Quên nhân $u'$ khi đạo hàm hàm hợp, ví dụ $(\sin 3x)' = 3\cos 3x$.`,
      r`Sai dấu: $(\cos x)' = -\sin x$.`,
    ],
  },

  // ───────────────────────── TOÁN LỚP 12 ─────────────────────────
  'T12.KHAOSAT': {
    summary: 'Tính đơn điệu, cực trị, giá trị lớn nhất – nhỏ nhất, tiệm cận và khảo sát đồ thị hàm số; bài toán thực tế tối ưu.',
    objectives: ['Đọc bảng biến thiên và đồ thị', 'Tìm GTLN, GTNN trên đoạn', 'Xác định tiệm cận đứng, ngang, xiên'],
    formulas: [
      r`Đơn điệu: $f'(x) \ge 0$ trên $K$ (dấu bằng tại hữu hạn điểm) thì $f$ đồng biến trên $K$`,
      r`Cực trị: $f'$ đổi dấu khi qua $x_0$ thì $x_0$ là điểm cực trị`,
      r`Điều kiện đủ: $f'(x_0) = 0$, $f''(x_0) > 0 \Rightarrow$ cực tiểu; $f''(x_0) < 0 \Rightarrow$ cực đại`,
      r`GTLN, GTNN trên đoạn: so sánh $f$ tại các điểm tới hạn trong $(a;b)$ và tại $a$, $b$`,
      r`Tiệm cận đứng: $x = x_0$ nếu $\lim_{x \to x_0^\pm} f(x) = \pm\infty$`,
      r`Tiệm cận ngang: $y = y_0$ nếu $\lim_{x \to \pm\infty} f(x) = y_0$`,
      r`Tiệm cận xiên: $y = ax + b$ với $a = \lim \dfrac{f(x)}{x}$, $b = \lim\left[f(x) - ax\right]$`,
    ],
    keyExamTips: r`Hàm bậc ba có hai cực trị $\Leftrightarrow y' = 0$ có hai nghiệm phân biệt. Hàm $y = \dfrac{ax+b}{cx+d}$ có tiệm cận đứng $x = -\dfrac dc$, tiệm cận ngang $y = \dfrac ac$.`,
    commonTraps: [
      r`$f'(x_0) = 0$ chưa chắc $x_0$ là cực trị (ví dụ $y = x^3$ tại $x = 0$).`,
      'Nhầm giá trị cực trị (y) với điểm cực trị (x).',
      'Tìm GTLN trên đoạn nhưng quên tính giá trị tại hai đầu mút.',
    ],
    examples: [
      {
        title: 'GTLN, GTNN trên đoạn',
        problem: r`Tìm GTLN, GTNN của $f(x) = x^3 - 3x + 1$ trên $[0; 2]$.`,
        solution: r`$f'(x) = 3x^2 - 3 = 0 \Rightarrow x = 1 \in [0;2]$. $f(0) = 1$, $f(1) = -1$, $f(2) = 3$. Vậy $\max = 3$, $\min = -1$.`,
      },
    ],
  },
  'T12.VECTOKG': {
    summary: 'Vectơ trong không gian, hệ trục tọa độ Oxyz, tọa độ vectơ, tích vô hướng và ứng dụng.',
    formulas: [
      r`Tọa độ vectơ: $\overrightarrow{AB} = (x_B - x_A; y_B - y_A; z_B - z_A)$`,
      r`Độ dài: $|\vec a| = \sqrt{a_1^2 + a_2^2 + a_3^2}$`,
      r`Tích vô hướng: $\vec a\cdot\vec b = a_1b_1 + a_2b_2 + a_3b_3$`,
      r`Góc: $\cos(\vec a, \vec b) = \dfrac{\vec a\cdot\vec b}{|\vec a|\,|\vec b|}$`,
      r`Trung điểm, trọng tâm: $I = \tfrac{A + B}{2}$, $G = \tfrac{A + B + C}{3}$ (theo từng tọa độ)`,
    ],
    keyExamTips: 'Bài thực tế (khung thép, drone, đèn chiếu): gắn hệ trục tại một góc của vật để các tọa độ đơn giản.',
    commonTraps: [
      r`Lấy tọa độ điểm đầu trừ điểm cuối khi tính $\overrightarrow{AB}$.`,
      'Quên căn bậc hai khi tính độ dài vectơ.',
    ],
  },
  'T12.PHANTAN': {
    summary: 'Khoảng biến thiên, khoảng tứ phân vị, phương sai và độ lệch chuẩn của mẫu số liệu ghép nhóm.',
    formulas: [
      r`Khoảng biến thiên: $R = $ đầu mút phải nhóm cuối $-$ đầu mút trái nhóm đầu`,
      r`Khoảng tứ phân vị: $\Delta_Q = Q_3 - Q_1$`,
      r`Phương sai: $s^2 = \dfrac1n\sum n_i(c_i - \bar x)^2 = \dfrac1n\sum n_ic_i^2 - \bar x^2$`,
      r`Độ lệch chuẩn: $s = \sqrt{s^2}$`,
    ],
    keyExamTips: 'So sánh độ phân tán của hai mẫu: mẫu có độ lệch chuẩn (hoặc khoảng tứ phân vị) nhỏ hơn thì đồng đều hơn.',
    commonTraps: [
      'Dùng tần số tương đối nhưng lại chia thêm cho n.',
      'Làm tròn số trung bình quá sớm khiến phương sai lệch.',
    ],
  },
  'T12.NGUYENHAM': {
    summary: 'Nguyên hàm, tích phân, phương pháp đổi biến, từng phần; ứng dụng tính diện tích hình phẳng và thể tích vật thể tròn xoay.',
    objectives: ['Tìm nguyên hàm cơ bản', 'Tính tích phân bằng đổi biến và từng phần', 'Tính diện tích, thể tích bằng tích phân'],
    formulas: [
      r`Lũy thừa: $\int x^\alpha\,dx = \dfrac{x^{\alpha+1}}{\alpha+1} + C$ ($\alpha \ne -1$), $\int \dfrac1x\,dx = \ln|x| + C$`,
      r`Mũ, lượng giác: $\int e^x\,dx = e^x + C$, $\int \cos x\,dx = \sin x + C$, $\int \sin x\,dx = -\cos x + C$`,
      r`Newton – Leibniz: $\int_a^b f(x)\,dx = F(b) - F(a)$`,
      r`Từng phần: $\int_a^b u\,dv = \left.uv\right|_a^b - \int_a^b v\,du$`,
      r`Diện tích: $S = \int_a^b |f(x) - g(x)|\,dx$`,
      r`Thể tích tròn xoay: $V = \pi\int_a^b f^2(x)\,dx$ (quay quanh $Ox$)`,
    ],
    keyExamTips: r`Diện tích: tìm hoành độ giao điểm để chia đoạn, trên mỗi đoạn hiệu không đổi dấu thì đưa trị tuyệt đối ra ngoài. Từng phần: ưu tiên đặt $u$ theo thứ tự "lốc – đa – lượng – mũ".`,
    commonTraps: [
      r`Quên trị tuyệt đối khi tính diện tích, khiến các phần âm triệt tiêu phần dương.`,
      r`Quên $\pi$ hoặc quên bình phương $f(x)$ trong công thức thể tích.`,
      r`Đổi biến nhưng không đổi cận.`,
    ],
    examples: [
      {
        title: 'Diện tích hình phẳng',
        problem: r`Tính diện tích hình phẳng giới hạn bởi $y = x^2$ và $y = x$.`,
        solution: r`Giao điểm $x = 0$, $x = 1$; trên $[0;1]$ có $x \ge x^2$. $S = \int_0^1 (x - x^2)\,dx = \tfrac12 - \tfrac13 = \tfrac16$.`,
      },
      {
        title: 'Tích phân từng phần',
        problem: r`Tính $I = \int_0^1 xe^x\,dx$.`,
        solution: r`Đặt $u = x$, $dv = e^x dx$: $I = \left.xe^x\right|_0^1 - \int_0^1 e^x dx = e - (e - 1) = 1$.`,
      },
    ],
  },
  'T12.OXYZ': {
    summary: 'Phương trình mặt phẳng, đường thẳng, mặt cầu trong không gian Oxyz; góc và khoảng cách.',
    objectives: ['Viết phương trình mặt phẳng, đường thẳng, mặt cầu', 'Tính góc và khoảng cách bằng tọa độ'],
    formulas: [
      r`Mặt phẳng: $a(x - x_0) + b(y - y_0) + c(z - z_0) = 0$ với VTPT $\vec n = (a;b;c)$`,
      r`Khoảng cách điểm – mặt: $d = \dfrac{|ax_0 + by_0 + cz_0 + d|}{\sqrt{a^2+b^2+c^2}}$`,
      r`Đường thẳng tham số: $x = x_0 + u_1t$, $y = y_0 + u_2t$, $z = z_0 + u_3t$`,
      r`Mặt cầu: $(x-a)^2 + (y-b)^2 + (z-c)^2 = R^2$`,
      r`Góc hai mặt phẳng: $\cos\varphi = \dfrac{|\vec n_1\cdot\vec n_2|}{|\vec n_1|\,|\vec n_2|}$`,
      r`Góc đường – mặt: $\sin\varphi = \dfrac{|\vec u\cdot\vec n|}{|\vec u|\,|\vec n|}$`,
    ],
    keyExamTips: 'Mặt phẳng tiếp xúc mặt cầu ⇔ khoảng cách từ tâm đến mặt phẳng bằng bán kính. Ba điểm không thẳng hàng: VTPT là tích có hướng của hai vectơ.',
    commonTraps: [
      'Góc giữa đường thẳng và mặt phẳng dùng sin, không phải cos.',
      'Đọc nhầm dấu tọa độ tâm mặt cầu từ phương trình.',
    ],
  },
  'T12.XSDK': {
    summary: 'Xác suất có điều kiện, công thức nhân xác suất, công thức xác suất toàn phần và công thức Bayes.',
    formulas: [
      r`Có điều kiện: $P(A \mid B) = \dfrac{P(A \cap B)}{P(B)}$ với $P(B) > 0$`,
      r`Nhân xác suất: $P(A \cap B) = P(B)\cdot P(A \mid B)$`,
      r`Toàn phần: $P(A) = P(B)P(A \mid B) + P(\overline B)P(A \mid \overline B)$`,
      r`Bayes: $P(B \mid A) = \dfrac{P(B)\,P(A \mid B)}{P(A)}$`,
    ],
    keyExamTips: 'Vẽ sơ đồ cây: nhánh đầu là biến cố điều kiện (B, B̄), nhánh sau là A. Bayes = nhánh cần tìm chia tổng các nhánh dẫn tới A.',
    commonTraps: [
      r`Nhầm $P(A \mid B)$ với $P(B \mid A)$.`,
      'Quên nhánh B̄ khi áp dụng công thức xác suất toàn phần.',
    ],
    examples: [
      {
        title: 'Xét nghiệm và Bayes',
        problem: r`Tỉ lệ mắc bệnh $1\%$. Xét nghiệm đúng dương tính với người bệnh $95\%$, dương tính nhầm với người khỏe $5\%$. Một người dương tính, xác suất người đó mắc bệnh?`,
        solution: r`$P(+) = 0{,}01\cdot0{,}95 + 0{,}99\cdot0{,}05 = 0{,}059$. $P(\text{bệnh} \mid +) = \dfrac{0{,}0095}{0{,}059} \approx 0{,}161$.`,
      },
    ],
  },
};
