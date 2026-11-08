export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string; email?: string };
}

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const STORAGE_KEY = "map-area-manager-auth";

export const isAuthConfigured = Boolean(URL && KEY);

function config() {
  if (!URL || !KEY) throw new Error("Supabase 설정이 없습니다. 배포 환경변수를 확인해 주세요.");
  return { url: URL.replace(/\/$/, ""), key: KEY };
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  const { url, key } = config();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({ email, password })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.msg || body.message || body.error_description || "로그인에 실패했습니다.");
  const session: AuthSession = { ...body, expires_at: Math.floor(Date.now() / 1000) + (body.expires_in || 3600) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export async function getSession(): Promise<AuthSession | null> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as AuthSession;
    if (session.expires_at > Math.floor(Date.now() / 1000) + 60) return session;
    const { url, key } = config();
    const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    const body = await response.json();
    if (!response.ok) throw new Error("세션이 만료되었습니다. 다시 로그인해 주세요.");
    const renewed: AuthSession = { ...body, expires_at: Math.floor(Date.now() / 1000) + (body.expires_in || 3600) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(renewed));
    return renewed;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export async function signOut(session: AuthSession): Promise<void> {
  try {
    const { url, key } = config();
    await fetch(`${url}/auth/v1/logout`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${session.access_token}` } });
  } finally {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function supabaseConfig() {
  return config();
}
