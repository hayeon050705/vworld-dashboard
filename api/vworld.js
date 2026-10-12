// Vercel 서버리스 함수: 인증키(VWORLD_KEY)를 서버에만 두고 브이월드 API를 대신 호출한다.
// 브라우저 외 환경이므로 등록한 서비스 URL을 domain 으로 함께 보낸다(VWORLD_DOMAIN).

const DATA = "https://api.vworld.kr/req/data";
const ADDRESS = "https://api.vworld.kr/req/address";
const NUM = /^-?\d+(\.\d+)?$/;

function buildUrl(q, key, domain) {
  const p = new URLSearchParams();
  if (q.kind === "data") {
    if (!/^[A-Z0-9_]+$/.test(q.layer || "")) throw new Error("layer 형식 오류");
    const box = String(q.bbox || "").split(",");
    if (box.length !== 4 || !box.every((v) => NUM.test(v))) throw new Error("bbox 형식 오류");
    const size = Math.min(parseInt(q.size || "1000", 10) || 1000, 1000);
    const page = Math.max(parseInt(q.page || "1", 10) || 1, 1);
    Object.entries({
      service: "data", request: "GetFeature", data: q.layer, key,
      geomFilter: `BOX(${q.bbox})`, crs: "EPSG:4326", size, page, format: "json", domain,
    }).forEach(([k, v]) => p.set(k, v));
    return `${DATA}?${p}`;
  }
  if (q.kind === "geocode") {
    const type = q.type === "PARCEL" ? "PARCEL" : "ROAD";
    if (!q.address || q.address.length > 200) throw new Error("address 오류");
    Object.entries({
      service: "address", request: "getCoord", version: "2.0", crs: "epsg:4326",
      address: q.address, refine: "true", simple: "false", format: "json", type, key, domain,
    }).forEach(([k, v]) => p.set(k, v));
    return `${ADDRESS}?${p}`;
  }
  throw new Error("kind 는 data 또는 geocode");
}

export default async function handler(req, res) {
  const key = process.env.VWORLD_KEY;
  if (!key) return res.status(500).json({ error: "서버에 VWORLD_KEY 가 설정되지 않았습니다." });
  try {
    const url = buildUrl(req.query, key, process.env.VWORLD_DOMAIN || "");
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    res.setHeader("Cache-Control", "no-store"); // 지오코더 결과 저장 금지 조건
    return res.status(200).json(await r.json());
  } catch (e) {
    return res.status(400).json({ error: String(e.message).replace(key, "***") });
  }
}
