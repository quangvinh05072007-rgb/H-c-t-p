// Gọi API máy chủ. Lỗi trả về luôn có câu tiếng Việt nói cách sửa.
export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, message: string, data: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export function setSessionToken(token: string | null) {
  if (token) localStorage.setItem('se_session_token', token);
  else localStorage.removeItem('se_session_token');
}

export function getSessionToken(): string | null {
  return localStorage.getItem('se_session_token');
}

export async function api<T = any>(method: string, path: string, body?: unknown, opts: { raw?: Blob | ArrayBuffer; timeoutMs?: number } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getSessionToken();
  if (token) {
    headers['authorization'] = `Bearer ${token}`;
  }
  let payload: BodyInit | undefined;
  if (opts.raw) {
    payload = opts.raw as BodyInit;
    headers['content-type'] = 'application/octet-stream';
    headers['x-smartexam'] = '1';
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['content-type'] = 'application/json';
  } else if (method !== 'GET') {
    headers['content-type'] = 'application/json';
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60000);
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: payload, credentials: 'include', signal: ctrl.signal });
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.', null);
  } finally {
    clearTimeout(timer);
  }
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/login') {
      setSessionToken(null);
      if (onUnauthorized) onUnauthorized();
    }
    throw new ApiError(res.status, data?.error ?? `Lỗi ${res.status}`, data);
  }
  if (data?.token) {
    setSessionToken(data.token);
  }
  return data as T;
}

export const get = <T = any>(p: string) => api<T>('GET', p);
export const post = <T = any>(p: string, b?: unknown) => api<T>('POST', p, b ?? {});
export const put = <T = any>(p: string, b?: unknown) => api<T>('PUT', p, b ?? {});
export const patch = <T = any>(p: string, b?: unknown) => api<T>('PATCH', p, b ?? {});
export const del = <T = any>(p: string, b?: unknown) => api<T>('DELETE', p, b);

/** Tải file (Word, CSV) qua trình duyệt. */
export async function download(path: string, fallbackName: string) {
  const headers: Record<string, string> = {};
  const token = getSessionToken();
  if (token) headers['authorization'] = `Bearer ${token}`;
  const res = await fetch(path, { headers, credentials: 'include' });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    if (res.status === 401) {
      setSessionToken(null);
      if (onUnauthorized) onUnauthorized();
    }
    throw new ApiError(res.status, d?.error ?? 'Không tải được file.', d);
  }
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') ?? '';
  const name = cd.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Tải HTML đã xác thực (như phiếu OMR A4) và mở hộp thoại in qua iframe ẩn. */
export async function printHtmlFromApi(path: string) {
  const headers: Record<string, string> = {};
  const token = getSessionToken();
  if (token) headers['authorization'] = `Bearer ${token}`;
  const res = await fetch(path, { headers, credentials: 'include' });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    if (res.status === 401) {
      setSessionToken(null);
      if (onUnauthorized) onUnauthorized();
    }
    throw new ApiError(res.status, d?.error ?? 'Không tải được phiếu in.', d);
  }
  const html = await res.text();
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.setAttribute('aria-hidden', 'true');
  const cleanup = () => {
    setTimeout(() => frame.remove(), 1500);
  };
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.addEventListener('afterprint', cleanup, { once: true });
      frame.contentWindow?.print();
      setTimeout(cleanup, 60000);
    } catch {
      cleanup();
    }
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}
