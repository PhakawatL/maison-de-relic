// fetch wrapper กลาง — ทุกหน้าเรียก API ผ่านไฟล์นี้เท่านั้น ห้ามเรียก fetch() ตรง ๆ
//
//   import { api, ApiError } from './api.js';
//
//   const { data } = await api.get('/products', { q: 'gundam', category: 3 });
//   const { data } = await api.post('/wishlist', { product_id: 12 });
//
//   try { ... } catch (err) {
//     if (err instanceof ApiError && err.code === 'PRODUCT_NOT_FOUND') { ... }
//     showError(err.message);   // ข้อความภาษาไทยจาก backend
//   }
import { API_BASE } from './config.js';

const TOKEN_KEY = 'mdr_token';

/** error ที่ได้จาก API — มี status, code, message, details ตามรูปแบบ error กลางของ backend */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ---------- token (ระบบ auth ของ R2 ใช้ส่วนนี้) ----------
export const auth = {
  getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  setToken(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* โหมดส่วนตัวบางเบราว์เซอร์เขียนไม่ได้ */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

function buildUrl(path, params) {
  const url = new URL(API_BASE + path);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    }
  }
  return url;
}

async function request(method, path, { params, body } = {}) {
  const headers = { Accept: 'application/json' };
  const token = auth.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const isForm = body instanceof FormData; // อัปโหลดไฟล์ (รูปสินค้า) ให้เบราว์เซอร์ตั้ง Content-Type เอง
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(buildUrl(path, params), {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    // เน็ตหลุด, server ปิด หรือโดน CORS บล็อก
    throw new ApiError(0, 'NETWORK_ERROR', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง');
  }

  if (res.status === 204) return null;

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* response ไม่ใช่ JSON */
  }

  if (!res.ok) {
    const err = payload && payload.error;
    if (res.status === 401) auth.clear(); // token หมดอายุ/ไม่ถูกต้อง
    throw new ApiError(
      res.status,
      (err && err.code) || 'HTTP_ERROR',
      (err && err.message) || `เกิดข้อผิดพลาด (${res.status})`,
      err && err.details
    );
  }

  return payload;
}

export const api = {
  get: (path, params) => request('GET', path, { params }),
  post: (path, body) => request('POST', path, { body }),
  put: (path, body) => request('PUT', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
  delete: (path) => request('DELETE', path),
};
