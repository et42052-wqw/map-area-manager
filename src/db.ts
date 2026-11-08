import type { Area } from "./types";
import { getSession, supabaseConfig, type AuthSession } from "./auth";

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
    throw new Error(body.message || body.details || `데이터 저장 오류 (${response.status})`);
  }
}

export async function loadAreas(session: AuthSession): Promise<Area[]> {
  const activeSession = await getSession() || session;
  const { url } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/areas?select=id,name,color,description,points,created_at&order=created_at.asc`, { headers: headers(activeSession) });
  await check(response);
  const rows = await response.json();
  return rows.map((row: any) => ({ id: row.id, name: row.name, color: row.color, description: row.description || "", points: row.points, createdAt: Number(row.created_at) }));
}

export async function saveArea(area: Area, session: AuthSession): Promise<void> {
  const activeSession = await getSession() || session;
  const { url } = supabaseConfig();
  const row = { user_id: activeSession.user.id, id: area.id, name: area.name, color: area.color, description: area.description, points: area.points, created_at: area.createdAt };
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
  const rows = areas.map(area => ({ user_id: activeSession.user.id, id: area.id, name: area.name, color: area.color, description: area.description, points: area.points, created_at: area.createdAt }));
  const insert = await fetch(`${url}/rest/v1/areas`, { method: "POST", headers: headers(activeSession, "return=minimal"), body: JSON.stringify(rows) });
  await check(insert);
}
