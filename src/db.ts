import type { Area } from "./types";
import { getSession, supabaseConfig, type AuthSession } from "./auth";

export type UserRole = "admin" | "editor" | "viewer";

function headers(session: AuthSession, prefer?: string): HeadersInit {
  const { key } = supabaseConfig();
  return {
    apikey: key,
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {})
  };
}

async function check(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || body.details || `데이터 처리 오류 (${response.status})`);
  }
}

export async function getUserRole(session: AuthSession): Promise<UserRole> {
  const activeSession = await getSession() || session;
  const { url } = supabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/user_roles?select=role&user_id=eq.${encodeURIComponent(activeSession.user.id)}`,
    { headers: headers(activeSession) }
  );
  await check(response);
  const rows = await response.json();
  const role = rows?.[0]?.role;
  // 역할이 등록되지 않은 계정은 권한을 부여하지 않고 조회 전용으로 처리합니다.
  return role === "admin" || role === "editor" || role === "viewer" ? role : "viewer";
}

export async function loadAreas(session: AuthSession): Promise<Area[]> {
  const activeSession = await getSession() || session;
  const { url } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/areas?select=id,user_id,name,color,description,points,created_at&order=created_at.asc`, { headers: headers(activeSession) });
  await check(response);
  const rows = await response.json();
  return rows.map((row: any) => ({ id: row.id, userId: row.user_id, name: row.name, color: row.color, description: row.description || "", points: row.points, createdAt: Number(row.created_at) }));
}

export async function saveArea(area: Area, session: AuthSession): Promise<void> {
  const activeSession = await getSession() || session;
  const { url } = supabaseConfig();
  // 관리자 편집 시에도 기존 폴리곤 소유자를 유지합니다.
  const row = { user_id: area.userId || activeSession.user.id, id: area.id, name: area.name, color: area.color, description: area.description, points: area.points, created_at: area.createdAt };
  const response = await fetch(`${url}/rest/v1/areas?on_conflict=id`, { method: "POST", headers: headers(activeSession, "resolution=merge-duplicates,return=minimal"), body: JSON.stringify(row) });
  await check(response);
}

export async function deleteArea(id: string, session: AuthSession): Promise<void> {
  const activeSession = await getSession() || session;
  const { url } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/areas?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: headers(activeSession, "return=minimal") });
  await check(response);
}

export async function replaceAllAreas(areas: Area[], session: AuthSession): Promise<void> {
  const activeSession = await getSession() || session;
  const { url } = supabaseConfig();
  const remove = await fetch(`${url}/rest/v1/areas`, { method: "DELETE", headers: headers(activeSession, "return=minimal") });
  await check(remove);
  if (!areas.length) return;
  const rows = areas.map(area => ({ user_id: area.userId || activeSession.user.id, id: area.id, name: area.name, color: area.color, description: area.description, points: area.points, created_at: area.createdAt }));
  const insert = await fetch(`${url}/rest/v1/areas`, { method: "POST", headers: headers(activeSession, "return=minimal"), body: JSON.stringify(rows) });
  await check(insert);
}
