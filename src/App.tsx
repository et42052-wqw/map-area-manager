import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Plus, Search, Trash2, Pencil, Check, X, Download, Upload, LocateFixed, Layers, MousePointer2, Undo2 } from "lucide-react";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { featureCollection, point, polygon } from "@turf/helpers";
import { deleteArea, loadAreas, replaceAllAreas, saveArea } from "./db";
import type { Area, Point, SearchResult } from "./types";
import { getSession, isAuthConfigured, signIn, signOut, type AuthSession } from "./auth";

const COLORS = ["#2878D0", "#16A085", "#D97706", "#8B5CF6", "#E05252", "#0F9D8A"];
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.9780 };

function MapWorkspace({ session, onSignOut }: { session: AuthSession; onSignOut: () => void }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<Map<string, any>>(new Map());
  const markerRef = useRef<any>(null);
  const draftOverlayRef = useRef<any>(null);
  const draftPointsRef = useRef<Point[]>([]);
  const drawModeRef = useRef(false);
  const geocoderRef = useRef<any>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [areaName, setAreaName] = useState("");
  const [areaColor, setAreaColor] = useState(COLORS[0]);
  const [areaDescription, setAreaDescription] = useState("");
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [matchedAreas, setMatchedAreas] = useState<Area[]>([]);
  const [notice, setNotice] = useState("지도를 불러오는 중입니다.");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const selectedArea = areas.find(a => a.id === selectedId) ?? null;

  const paintArea = useCallback((area: Area) => {
    if (!mapRef.current || !window.kakao) return;
    const kakao = window.kakao;
    const path = area.points.map(([lng, lat]) => new kakao.maps.LatLng(lat, lng));
    const old = overlaysRef.current.get(area.id);
    if (old) old.setMap(null);
    const polygonOverlay = new kakao.maps.Polygon({
      map: mapRef.current,
      path,
      strokeWeight: 3,
      strokeColor: area.color,
      strokeOpacity: 0.9,
      strokeStyle: "solid",
      fillColor: area.color,
      fillOpacity: area.id === selectedId ? 0.32 : 0.18
    });
    overlaysRef.current.set(area.id, polygonOverlay);
  }, [selectedId]);

  const redrawAll = useCallback((list: Area[]) => {
    overlaysRef.current.forEach(overlay => overlay.setMap(null));
    overlaysRef.current.clear();
    list.forEach(paintArea);
  }, [paintArea]);

  useEffect(() => {
    let cancelled = false;
    const key = import.meta.env.VITE_KAKAO_MAP_KEY;
    if (!key || key.includes("여기에_")) {
      setNotice("카카오 JavaScript 키를 .env 파일에 입력한 뒤 실행해 주세요.");
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>("#kakao-map-sdk");
    const init = async () => {
      if (cancelled || !mapEl.current || !window.kakao?.maps) return;
      window.kakao.maps.load(async () => {
        if (cancelled || !mapEl.current) return;
        const kakao = window.kakao;
        const map = new kakao.maps.Map(mapEl.current, {
          center: new kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
          level: 7
        });
        mapRef.current = map;
        geocoderRef.current = new kakao.maps.services.Geocoder();
        const saved = await loadAreas(session);
        if (cancelled) return;
        setAreas(saved);
        setSdkReady(true);
        setNotice("지도 준비 완료 · 영역을 그리거나 주소를 검색하세요.");
        saved.forEach(paintArea);
        kakao.maps.event.addListener(map, "click", (mouseEvent: any) => {
          if (!drawModeRef.current) return;
          const latlng = mouseEvent.latLng;
          const next: Point = [latlng.getLng(), latlng.getLat()];
          draftPointsRef.current = [...draftPointsRef.current, next];
          setDraftPoints([...draftPointsRef.current]);
          if (draftOverlayRef.current) draftOverlayRef.current.setMap(null);
          if (draftPointsRef.current.length >= 2) {
            draftOverlayRef.current = new kakao.maps.Polygon({
              map,
              path: draftPointsRef.current.map(([lng, lat]) => new kakao.maps.LatLng(lat, lng)),
              strokeWeight: 3, strokeColor: areaColor, strokeOpacity: 1,
              fillColor: areaColor, fillOpacity: 0.2
            });
          }
        });
      });
    };
    if (window.kakao?.maps) {
      init();
    } else if (existing) {
      existing.addEventListener("load", init, { once: true });
    } else {
      const script = document.createElement("script");
      script.id = "kakao-map-sdk";
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false&libraries=services`;
      script.async = true;
      script.onload = init;
      script.onerror = () => setNotice("카카오맵 SDK를 불러오지 못했습니다. 키와 등록 도메인을 확인해 주세요.");
      document.head.appendChild(script);
    }
    return () => { cancelled = true; };
  }, [session]); // SDK bootstrap once

  useEffect(() => {
    if (sdkReady) redrawAll(areas);
  }, [areas, selectedId, sdkReady, redrawAll]);

  useEffect(() => {
    if (mapRef.current && window.kakao) {
      mapRef.current.setDraggable(!drawMode);
      mapRef.current.setZoomable(!drawMode);
    }
  }, [drawMode]);

  const startDrawing = () => {
    draftPointsRef.current = [];
    setDraftPoints([]);
    setAreaName("");
    setAreaDescription("");
    drawModeRef.current = true;
    setDrawMode(true);
    if (draftOverlayRef.current) draftOverlayRef.current.setMap(null);
    setNotice("지도에서 꼭짓점을 차례로 클릭하세요. 최소 3개가 필요합니다.");
  };

  const undoPoint = () => {
    draftPointsRef.current = draftPointsRef.current.slice(0, -1);
    setDraftPoints([...draftPointsRef.current]);
    if (draftOverlayRef.current) draftOverlayRef.current.setMap(null);
    if (draftPointsRef.current.length >= 2 && window.kakao && mapRef.current) {
      const pts = draftPointsRef.current.map(([lng, lat]) => new window.kakao.maps.LatLng(lat, lng));
      draftOverlayRef.current = new window.kakao.maps.Polygon({
        map: mapRef.current, path: pts, strokeWeight: 3, strokeColor: areaColor,
        fillColor: areaColor, fillOpacity: 0.2
      });
    }
  };

  const cancelDrawing = () => {
    drawModeRef.current = false;
    setDrawMode(false);
    draftPointsRef.current = [];
    setDraftPoints([]);
    if (draftOverlayRef.current) draftOverlayRef.current.setMap(null);
    setNotice("그리기를 취소했습니다.");
  };

  const finishDrawing = async () => {
    const pts = draftPointsRef.current;
    if (pts.length < 3) { setNotice("폴리곤은 꼭짓점이 최소 3개 필요합니다."); return; }
    const name = areaName.trim() || `새 영역 ${areas.length + 1}`;
    const area: Area = {
      id: crypto.randomUUID(), name, color: areaColor,
      description: areaDescription.trim(), points: pts, createdAt: Date.now()
    };
    await saveArea(area, session);
    const next = [...areas, area];
    setAreas(next);
    setSelectedId(area.id);
    drawModeRef.current = false;
    setDrawMode(false);
    setDraftPoints([]);
    draftPointsRef.current = [];
    if (draftOverlayRef.current) draftOverlayRef.current.setMap(null);
    setNotice(`'${name}' 영역을 저장했습니다.`);
  };

  const searchAddress = () => {
    if (!query.trim()) { setNotice("검색할 주소를 입력해 주세요."); return; }
    if (!geocoderRef.current) { setNotice("지도 서비스가 아직 준비되지 않았습니다."); return; }
    geocoderRef.current.addressSearch(query.trim(), (result: any[], status: string) => {
      if (status !== window.kakao.maps.services.Status.OK || !result.length) {
        setSearchResult(null); setMatchedAreas([]);
        setNotice("주소를 찾지 못했습니다. 도로명 또는 지번 주소를 확인해 주세요.");
        return;
      }
      const item = result[0];
      const found: SearchResult = {
        address: item.road_address?.address_name || item.address?.address_name || query,
        x: Number(item.x), y: Number(item.y)
      };
      setSearchResult(found);
      const pt = point([found.x, found.y]);
      const matches = areas.filter(area => {
        try {
          const ring = [...area.points, area.points[0]];
          return booleanPointInPolygon(pt, polygon([ring]));
        } catch { return false; }
      });
      setMatchedAreas(matches);
      if (markerRef.current) markerRef.current.setMap(null);
      markerRef.current = new window.kakao.maps.Marker({
        map: mapRef.current, position: new window.kakao.maps.LatLng(found.y, found.x)
      });
      mapRef.current.setCenter(new window.kakao.maps.LatLng(found.y, found.x));
      mapRef.current.setLevel(3);
      setNotice(matches.length
        ? `검색 위치가 ${matches.length}개 영역에 포함됩니다.`
        : "검색 위치는 저장된 폴리곤 외부에 있습니다.");
    });
  };

  const removeArea = async (area: Area) => {
    if (!window.confirm(`'${area.name}' 영역을 삭제할까요?`)) return;
    await deleteArea(area.id, session);
    setAreas(prev => prev.filter(a => a.id !== area.id));
    if (selectedId === area.id) setSelectedId(null);
    setNotice(`'${area.name}' 영역을 삭제했습니다.`);
  };

  const renameArea = async (area: Area) => {
    const name = editName.trim();
    if (!name) return;
    const updated = { ...area, name };
    await saveArea(updated, session);
    setAreas(prev => prev.map(a => a.id === area.id ? updated : a));
    setEditingId(null);
    setNotice("영역 이름을 변경했습니다.");
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), areas }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `map-areas-${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = Array.isArray(parsed) ? parsed : parsed.areas;
      if (!Array.isArray(incoming) || !incoming.every((a: any) =>
        a && typeof a.id === "string" && typeof a.name === "string" &&
        Array.isArray(a.points) && a.points.length >= 3 &&
        a.points.every((p: any) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
      )) throw new Error("invalid");
      if (!window.confirm(`${incoming.length}개 영역으로 현재 데이터를 교체할까요?`)) return;
      await replaceAllAreas(incoming, session);
      setAreas(incoming); setSelectedId(null);
      setNotice(`${incoming.length}개 영역을 불러왔습니다.`);
    } catch { setNotice("올바른 백업 JSON 파일이 아닙니다."); }
  };

  const focusArea = (area: Area) => {
    setSelectedId(area.id);
    if (mapRef.current && window.kakao) {
      const bounds = new window.kakao.maps.LatLngBounds();
      area.points.forEach(([lng, lat]) => bounds.extend(new window.kakao.maps.LatLng(lat, lng)));
      mapRef.current.setBounds(bounds);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-icon"><Layers size={20}/></div><div><strong>Map Area Manager</strong><small>개인용 지도 영역 관리</small></div></div>
        <div className="top-actions">
          <span className="signed-in">{session.user.email}</span>
          <button className="button subtle" onClick={onSignOut}>로그아웃</button>
          <button className="button subtle" onClick={exportJson}><Download size={16}/> 백업</button>
          <label className="button subtle file-button"><Upload size={16}/> 불러오기<input type="file" accept=".json,application/json" onChange={e => importJson(e.target.files?.[0])}/></label>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <section className="search-section">
            <div className="section-heading"><h2>주소 검색</h2><MapPin size={17}/></div>
            <div className="search-box">
              <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && searchAddress()} placeholder="도로명 또는 지번 주소"/>
              <button aria-label="주소 검색" onClick={searchAddress}><Search size={18}/></button>
            </div>
            {searchResult && <div className="result-card">
              <div className="result-title"><LocateFixed size={16}/> 검색 결과</div>
              <div className="result-address">{searchResult.address}</div>
              {matchedAreas.length ? <div className="match-list"><span className="status good">폴리곤 내부</span>{matchedAreas.map(a => <button key={a.id} className="match-item" onClick={() => focusArea(a)}><i style={{background:a.color}}/>{a.name}</button>)}</div>
              : <div className="status neutral">저장된 영역에 포함되지 않음</div>}
            </div>}
          </section>

          <section className="areas-section">
            <div className="section-heading"><h2>저장된 영역 <span className="count">{areas.length}</span></h2><button className="icon-button" onClick={startDrawing} title="새 영역 그리기"><Plus size={19}/></button></div>
            <button className="button primary full" onClick={startDrawing}><Plus size={17}/> 새 폴리곤 그리기</button>
            {drawMode && <div className="draw-panel">
              <div className="draw-title"><MousePointer2 size={16}/> 영역 그리는 중</div>
              <p>지도에서 꼭짓점을 클릭하세요. {draftPoints.length}개 입력됨</p>
              <label>영역 이름<input value={areaName} onChange={e => setAreaName(e.target.value)} placeholder="예: 강남 A구역"/></label>
              <label>설명 (선택)<input value={areaDescription} onChange={e => setAreaDescription(e.target.value)} placeholder="영역 메모"/></label>
              <div className="color-row">{COLORS.map(c => <button key={c} className={`color-dot ${areaColor===c?"chosen":""}`} style={{background:c}} onClick={() => setAreaColor(c)} aria-label={`색상 ${c}`}/>)}</div>
              <div className="draw-actions">
                <button className="button subtle" onClick={undoPoint} disabled={!draftPoints.length}><Undo2 size={15}/> 되돌리기</button>
                <button className="button subtle" onClick={cancelDrawing}><X size={15}/> 취소</button>
                <button className="button primary" onClick={finishDrawing} disabled={draftPoints.length<3}><Check size={15}/> 저장</button>
              </div>
            </div>}
            <div className="area-list">
              {!areas.length && <div className="empty-state"><div className="empty-icon"><Layers size={24}/></div><strong>저장된 영역이 없습니다</strong><span>새 폴리곤 그리기로 첫 영역을 만들어 보세요.</span></div>}
              {areas.map(area => <div key={area.id} className={`area-card ${selectedId===area.id?"active":""}`}>
                <button className="area-main" onClick={() => focusArea(area)}>
                  <i className="area-swatch" style={{background:area.color}}/>
                  <span className="area-text"><strong>{area.name}</strong><small>{area.points.length}개 꼭짓점{area.description ? ` · ${area.description}` : ""}</small></span>
                </button>
                <div className="area-actions">
                  <button className="icon-button small" title="이름 변경" onClick={() => {setEditingId(area.id);setEditName(area.name);}}><Pencil size={14}/></button>
                  <button className="icon-button small danger" title="삭제" onClick={() => removeArea(area)}><Trash2 size={14}/></button>
                </div>
                {editingId===area.id && <div className="rename-row"><input value={editName} onChange={e=>setEditName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&renameArea(area)}/><button onClick={()=>renameArea(area)}><Check size={15}/></button><button onClick={()=>setEditingId(null)}><X size={15}/></button></div>}
              </div>)}
            </div>
          </section>
          <div className="sidebar-footer"><span className={`connection-dot ${sdkReady?"online":""}`}/>{notice}</div>
        </aside>
        <section className="map-panel">
          <div className="map-toolbar">
            <div><strong>지도</strong><span>서울 중심으로 시작합니다</span></div>
            {drawMode && <span className="drawing-indicator"><span/> 그리기 모드 · 지도 클릭으로 꼭짓점 추가</span>}
          </div>
          <div ref={mapEl} id="map" />
          {!sdkReady && <div className="map-loading"><div className="spinner"/><strong>카카오맵 연결 준비</strong><span>API 키와 도메인 설정을 확인하고 있습니다.</span></div>}
          <div className="map-legend"><span><i className="legend-area"/> 저장된 폴리곤</span><span><i className="legend-pin"/> 검색 위치</span></div>
        </section>
      </div>
    </main>
  );
}


export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSession().then(setSession).finally(() => setChecking(false));
  }, []);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { setSession(await signIn(email.trim(), password)); }
    catch (err) { setError(err instanceof Error ? err.message : "로그인에 실패했습니다."); }
    finally { setBusy(false); }
  };

  const handleLogout = async () => {
    if (session) await signOut(session);
    setSession(null);
  };

  if (checking) return <div className="auth-screen"><div className="auth-card">로그인 상태 확인 중...</div></div>;
  if (!isAuthConfigured) return <div className="auth-screen"><div className="auth-card"><h1>Supabase 설정 필요</h1><p>배포 환경변수에 Supabase URL과 anon key를 등록해야 합니다.</p><p>설정 방법은 프로젝트의 README.md를 확인하세요.</p></div></div>;
  if (!session) return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleLogin}>
        <div className="auth-mark"><Layers size={23}/></div>
        <h1>Map Area Manager</h1>
        <p>등록된 계정으로 로그인하세요.</p>
        <label>이메일<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label>비밀번호<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
        {error && <div className="auth-error">{error}</div>}
        <button className="button primary full" type="submit" disabled={busy}>{busy ? "로그인 중..." : "로그인"}</button>
      </form>
    </div>
  );
  return <MapWorkspace session={session} onSignOut={handleLogout}/>;
}
