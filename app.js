// 대상지 검색 -> 지오코딩 -> 같은 구역으로 레이어 조회 -> 4개 탭(스크롤 없음)으로 정리.
// 인증키는 서버(/api/vworld)에만 있다. 법령 근거 데이터는 law.js.
const ROWS = [
  { name: "필지 경계", tag: "API 수집", src: "2D 데이터 API 2.0 · 토지(연속지적도)",
    how: "GetFeature · geomFilter(BOX) · size ≤ 1,000 · page", rule: "URL·조회일 기록, 인증키 제외 요청 URL을 카탈로그 행에 저장",
    layers: [["LP_PA_CBND_BUBUN", "연속지적도"]], draw: true },
  { name: "용도지역", tag: "API 수집", src: "2D 데이터 API 2.0 · 용도지역(도시·관리지역)",
    how: "GetFeature (브라우저 외 호출 시 domain)", rule: "현행 지정만 수신, 3주차 지표와 대조",
    layers: [["LT_C_UQ111", "도시지역"], ["LT_C_UQ112", "관리지역"]], draw: true },
  { name: "용도지구·구역", tag: "API 수집", src: "2D 데이터 API 2.0 · 경관·고도·취락지구, 개발제한구역, 지구단위계획, 교육환경보호구역",
    how: "GetFeature · 레이어별 호출, 지정명(uname) 수집", rule: "현행 지정만 수신, 행위제한 세부는 토지이음·조례로 확인",
    layers: [["LT_C_UQ121", "자연경관지구"], ["LT_C_UQ123", "고도지구"], ["LT_C_UQ128", "집단취락지구"], ["LT_C_UD801", "개발제한구역"],
             ["LT_C_UQ141", "지구단위·허가제한 등"], ["LT_C_UO101", "교육환경보호구역"]], draw: true },
  { name: "행정경계", tag: "API 수집", src: "2D 데이터 API 2.0 · LT_C_ADSIDO_INFO(시·도), LT_C_ADSIGG_INFO(시·군·구)",
    how: "GetFeature · crs EPSG:4326 · format json", rule: "대상지 경계 안팎 판정 기준",
    layers: [["LT_C_ADSIDO_INFO", "시·도"], ["LT_C_ADSIGG_INFO", "시·군·구"]], draw: false },
  { name: "경사·향", tag: "DEM 계산", src: "국토지리정보원 DEM (90m·5m·1m)",
    how: "내려받은 뒤 계산 (국토정보플랫폼 → QGIS 등)", rule: "계산 조건 기록: 셀 크기·구간 경계·향 기준 (90m 셀 = 0.81ha)",
    manual: "수동 필요 — DEM을 받아 dem_slope_aspect.py 로 계산" },
  { name: "주소 → 좌표", tag: "지오코더 호출", src: "지오코더 2.0 · /req/address",
    how: "getCoord · type PARCEL·ROAD", rule: "결과 저장 금지 (일 40,000건 · 실시간 사용만), 주소·요청 조건만 기록",
    geocode: true },
];
const COLORS = ["#ff9500", "#0071e3", "#34c759", "#af52de", "#ff3b30", "#5ac8fa", "#ffcc00", "#5856d6"]; // Apple 시스템 색
const ENDPOINT = { data: "https://api.vworld.kr/req/data", geocode: "https://api.vworld.kr/req/address" };

// 지정명(uname) -> 분류 · 의미 · 활용 추천 · 확인할 점. 규칙 기반 참고 의견이며 법적 판단이 아니다.
const RECS = [
  [/전용주거/, "용도지역", "저층 주거 보호 지역", "보행·통학 안전, 생활SOC, 조용한 가로 중심의 스마트 서비스(방범 CCTV·스마트 가로등)", "건축·영업 행위 제한이 가장 엄격함"],
  [/일반주거|준주거/, "용도지역", "주거 중심 지역", "주거환경 개선, 보행로·공유 모빌리티, 생활 서비스 시설", "층수·밀도 상한은 종(1·2·3종)에 따라 다름"],
  [/상업/, "용도지역", "상업·업무 지역", "가로 활성화, 유동인구 기반 서비스, 스마트 사이니지·주차 안내", "소음·광고물 규제 확인"],
  [/공업/, "용도지역", "산업 지역", "물류·스마트 제조, 화물차 동선, 환경 모니터링", "주거 인접 시 완충 필요"],
  [/녹지/, "용도지역", "녹지 보전 지역", "경량 시설 중심 보전형 활용, 생태·휴식 연계", "개발 가능 행위가 크게 제한됨"],
  [/자연경관지구/, "용도지구", "경관 보호 지구", "경관을 해치지 않는 경량·저층 시설, 조망 확보형 보행 프로그램", "건축물 높이·형태·색채 제한 확인"],
  [/고도지구/, "용도지구", "건축물 높이 제한 지구", "높이가 큰 구조물(스마트폴·타워형 시설)은 제한 범위 내로 계획", "최고·최저 고도 기준 확인"],
  [/집단취락/, "용도지구", "개발제한구역 내 취락 정비 지구", "기존 주거지의 기반시설(도로·상하수·보행) 정비 대상 후보", "정비 가능 행위의 범위 확인"],
  [/개발제한구역/, "용도구역", "개발 행위가 원칙적으로 제한되는 구역", "신규 건축보다 기존 도로·보행 개선, 환경·생태 모니터링", "개발행위 허가 필요 여부 우선 검토"],
  [/지구단위/, "용도구역", "지구단위계획이 적용되는 구역", "계획 지침(가로·공공공간·용도)에 맞춰 스마트 요소를 반영하기 유리", "지침의 건폐율·높이·가로 계획 확인"],
  [/개발행위허가제한/, "규제", "일정 기간 개발행위 허가가 제한됨", "사업 시기 조정, 제한 기간 이후 착수 계획", "제한 기간과 해제 일정 확인"],
  [/토지거래계약/, "규제", "토지 거래 시 허가가 필요한 구역", "부지 확보·매입 계획에 일정 리스크로 반영", "허가 대상 면적 기준 확인"],
  [/도시자연공원/, "용도구역", "도시 자연공원 보전 구역", "경량 휴게·안내 시설, 생태 연계 프로그램", "공원 조성 외 개발 제한 확인"],
  [/절대보호/, "규제", "학교 경계 인근 교육환경 보호 구역(절대)", "통학로 안전, 스쿨존 스마트 안전 서비스", "유해시설 설치가 사실상 금지됨"],
  [/상대보호/, "규제", "학교 인근 교육환경 보호 구역(상대)", "통학로 안전, 보행 환경 개선", "유해시설은 심의를 거쳐야 함"],
];

const $ = (id) => document.getElementById(id);
// 후보지 A·B 지도를 나란히 둔다
const maps = { A: L.map("mapA").setView([37.5665, 126.978], 11), B: L.map("mapB").setView([37.5665, 126.978], 11) };
const overlays = {};
["A", "B"].forEach((l) => {
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(maps[l]);
  overlays[l] = L.layerGroup().addTo(maps[l]);
});
const sites = { A: null, B: null }; // 후보지별 조회 결과
let sel = "A";

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function setMsg(t, err) { ["msg", "coverMsg"].forEach((id) => { const m = $(id); if (m) { m.textContent = t; m.classList.toggle("err", !!err); } }); }

// ---- 탭(페이지) ----
const ORDER = [11, 10, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13]; // 탭 표시 순서(페이지 번호)
let cur = 11;
function showPage(i) {
  cur = i;
  document.querySelectorAll("#tabs button[data-p]").forEach((b) => b.classList.toggle("on", +b.dataset.p === cur));
  document.querySelectorAll(".page").forEach((p, k) => p.classList.toggle("on", k === cur));
  if (cur === 0) fitMaps();
}
document.querySelectorAll("#tabs button[data-p]").forEach((b) => b.addEventListener("click", () => showPage(+b.dataset.p)));
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  const k = ORDER.indexOf(cur);
  if (e.key === "ArrowRight") showPage(ORDER[(k + 1) % ORDER.length]);
  if (e.key === "ArrowLeft") showPage(ORDER[(k + ORDER.length - 1) % ORDER.length]);
});

// ---- 카드 목록 페이지 나누기(스크롤 대신) ----
function mountPager(el, { title, summary, items, perPage, cols, rows, renderItem }) {
  let pg = 0;
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  function draw() {
    const slice = items.slice(pg * perPage, (pg + 1) * perPage);
    el.innerHTML = `<div class="pager"><div class="head"><b>${esc(title)}</b><p class="sum">${summary || ""}</p>` +
      (pages > 1 ? `<button data-d="-1">◀</button><span>${pg + 1} / ${pages}</span><button data-d="1">▶</button>` : "") +
      `</div><div class="cards" style="${cols ? `grid-template-columns:repeat(${cols},minmax(0,1fr));` : ""}${rows ? `grid-template-rows:repeat(${rows},minmax(0,1fr))` : ""}">${slice.map(renderItem).join("")}</div></div>`;
    el.querySelectorAll("button[data-d]").forEach((b) => b.addEventListener("click", () => { pg = (pg + +b.dataset.d + pages) % pages; draw(); }));
  }
  draw();
}

async function api(params) {
  const r = await fetch("/api/vworld?" + new URLSearchParams(params));
  const j = await r.json();
  if (j.error && !j.response) throw new Error(typeof j.error === "string" ? j.error : JSON.stringify(j.error));
  return j.response;
}
function displayUrl(kind, p) { // 인증키 제외 요청 URL
  const q = kind === "data"
    ? { service: "data", request: "GetFeature", data: p.layer, key: "***", geomFilter: "BOX(" + p.bbox + ")", crs: "EPSG:4326", size: 1000, page: 1, format: "json" }
    : { service: "address", request: "getCoord", version: "2.0", crs: "epsg:4326", address: p.address, type: p.type, key: "***", format: "json" };
  return ENDPOINT[kind] + "?" + new URLSearchParams(q);
}
async function geocode(address) {
  for (const type of ["ROAD", "PARCEL"]) {
    const b = await api({ kind: "geocode", address, type });
    if (b.status === "OK") return { x: +b.result.point.x, y: +b.result.point.y, type };
  }
  return null;
}
async function fetchLayer(layer, bbox) {
  const feats = [];
  let page = 1, total = 1;
  while (page <= total && page <= 5) {
    const b = await api({ kind: "data", layer, bbox, size: 1000, page });
    if (b.status === "NOT_FOUND") break;
    if (b.status !== "OK") throw new Error(b.error ? b.error.text || b.error.code : b.status);
    total = +b.page.total;
    feats.push(...b.result.featureCollection.features);
    page++;
  }
  return feats;
}

// ---- 자료 표 (선택한 후보지) ----
const today = () => new Date().toISOString().slice(0, 10);

// 후보지 하나의 자료 카탈로그 행(키 제외 요청 URL 포함)
function siteCatalog(s) {
  const rows = [];
  ROWS.forEach((r) => {
    if (r.manual) return;
    if (r.geocode) {
      rows.push([s.label, r.name, "getCoord", s.date, displayUrl("geocode", { address: s.address, type: s.geo.type }), "", "OK", "API 호출(저장 금지)"]);
    } else {
      r.layers.forEach(([id, label]) => {
        const o = s.layers[id];
        rows.push([s.label, r.name + "(" + label + ")", id, s.date, displayUrl("data", { layer: id, bbox: s.bbox }), o.n ?? "",
          o.error ? "오류" : o.n ? "OK" : "결과 없음", "API 수집값"]);
      });
    }
  });
  return rows;
}

function renderTable(s) {
  $("tbl").querySelector("tbody").innerHTML = ROWS.map((r) => {
    let result;
    if (r.manual) {
      result = `<span class="st warn">대기</span> ${esc(r.manual)}`;
    } else if (r.geocode) {
      result = `<span class="st ok">OK</span> (${s.geo.type}) <span class="tag">좌표는 화면 표시에만 사용, 저장 안 함</span>`;
    } else {
      result = r.layers.map(([id, label]) => {
        const o = s.layers[id];
        const cls = o.error ? "err" : o.n ? "ok" : "warn";
        const names = o.names && o.names.length ? " · " + o.names.map(esc).join(", ") : "";
        const txt = o.error ? "오류: " + esc(o.error) : o.n ? o.n + "건" + names : "결과 없음";
        return `<div title="${esc(displayUrl("data", { layer: id, bbox: s.bbox }))}"><span class="st ${cls}">${esc(label)}: ${txt}</span></div>`;
      }).join("");
    }
    return `<tr><td class="name"><b>${esc(r.name)}</b><span class="tag">${esc(r.tag)}</span></td><td>${esc(r.src)}</td><td>${esc(r.how)}</td><td>${esc(r.rule)}</td><td>${result}</td></tr>`;
  }).join("");
  $("foot").textContent = `후보지 ${s.label} · 조회일 ${s.date} · 결과 줄에 마우스를 올리면 요청 URL(키 제외)이 보입니다 · 수집값(API)과 계산값(DEM)을 구분해 기록합니다`;
  // 레이어별 조회 건수 비교 차트
  const ls = ROWS.filter((r) => r.layers).flatMap((r) => r.layers);
  const other = sites[s.label === "A" ? "B" : "A"];
  const rows = ls.filter(([id]) => id !== "LT_C_ADSIDO_INFO" && id !== "LT_C_ADSIGG_INFO").map(([id, label]) => ({
    label, a: sites.A ? sites.A.layers[id].n ?? 0 : null, b: sites.B ? sites.B.layers[id].n ?? 0 : undefined }));
  $("p1chart").innerHTML = pairBars(rows, ["후보지 A", ...(sites.B ? ["후보지 B"] : [])], "레이어별 조회 건수 (후보지 A vs B, 막대는 행마다 자체 눈금)");
}

// ---- 용도지구 활용 추천 ----
function collectNames(layers) {
  const set = new Set();
  Object.values(layers).forEach((o) => (o.names || []).forEach((n) => set.add(n)));
  return [...set];
}
function buildRecs(names) {
  const items = names.map((name) => {
    const h = RECS.find(([re]) => re.test(name));
    return h ? { name, kind: h[1], meaning: h[2], use: h[3], check: h[4] }
      : { name, kind: "기타", meaning: "", use: "해당 지정명에 대한 추천 규칙이 없습니다. 토지이음에서 지정 목적을 확인하세요.", check: "" };
  });
  const order = ["용도지역", "용도지구", "용도구역", "규제", "기타"];
  items.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return items;
}
const PRIORITY = ["개발제한", "경관", "고도", "절대보호"];
function renderRecs(s) {
  const pr = s.items.filter((i) => PRIORITY.some((k) => i.name.includes(k)));
  const summary = pr.length ? `<b>우선 검토:</b> ${pr.map((i) => esc(i.name)).join(", ")} (행위·높이 제한)` : "강한 제한 지정(개발제한·경관·고도)은 발견되지 않았습니다";
  $("p2").innerHTML = `<div class="split"><div class="l" id="p2L"></div><div class="r" id="p2R"></div></div>`;
  const kinds = ["용도지역", "용도지구", "용도구역", "규제", "기타"];
  const cnt = (site, k) => (site ? site.items.filter((i) => i.kind === k).length : undefined);
  $("p2R").innerHTML = pairBars(kinds.map((k) => ({ label: k, a: cnt(sites.A, k) ?? null, b: cnt(sites.B, k) })), ["후보지 A", ...(sites.B ? ["후보지 B"] : [])], "지정 종류별 개수") +
    `<p class="foot">개수가 많을수록 확인해야 할 제한·지정이 많다는 뜻입니다.</p>`;
  mountPager($("p2L"), { title: `후보지 ${s.label} 용도지구 활용 추천`, summary, items: s.items, perPage: 6, cols: 2, rows: 3,
    renderItem: (i) => `<div class="card"><span class="tag">${esc(i.kind)}</span><b>${esc(i.name)}</b>` +
      (i.meaning ? `<p>${esc(i.meaning)}</p>` : "") + `<p><em>활용 추천</em>${esc(i.use)}</p>` +
      (i.check ? `<p><em>확인할 점</em>${esc(i.check)}</p>` : "") + `</div>` });
}

// ---- 도시 유형 추천(법령) ----
function renderLaw(s) {
  const a = s.law, top = a.ranked[0], second = a.ranked[1];
  const max = Math.max(top.score, 1);
  // 유형별 점수 레이더(후보지 A·B 겹쳐 비교). 점수 0을 50에 두고 1점당 5 이동
  const keys = ["A", "B", "C", "D", "E"];
  const radarSeries = ["A", "B"].filter((l) => sites[l]).map((l, i) => ({
    name: `후보지 ${l}`, color: CH[i], values: keys.map((k) => 50 + 5 * sites[l].law.ranked.find((t) => t.key === k).score) }));
  const bars = radarChart(keys.map((k) => TYPES[k].name), radarSeries, "도시 유형별 적합도 (50 = 0점, 바깥쪽일수록 적합)");
  const verdict = !a.hasZone
    ? `<p>조회 범위에서 용도지역을 확인하지 못해 점수 산정이 제한됩니다.</p>`
    : top.score <= 0 ? `<p>제한 지정이 겹쳐 적합한 유형을 판단하기 어렵습니다. 개별 필지 단위로 확인하세요.</p>`
    : `<p class="big">${esc(top.name)}</p><p><em>스마트 서비스</em>${esc(top.smart)}</p>` +
      (second.score > 0 ? `<p>보조 유형: <b>${esc(second.name)}</b> (${second.score}점)</p>` : "");
  $("p3").innerHTML = `<div class="rank"><div class="box grow">${bars}</div><div class="box"><h3>후보지 ${s.label} 종합 의견 (법령 기반 점수)</h3>${verdict}</div>` +
    `<p class="foot">점수 = 용도지역(시행령 제30조) 유형 가중치 + 지구·구역 제한에 의한 가감. 법령 확인일 ${LAW_CHECKED}. 참고용이며 법률 자문이 아닙니다.</p></div>`;
  const right = document.createElement("div");
  right.className = "lawlist";
  $("p3").appendChild(right);
  mountPager(right, { title: "법령 근거", summary: "조문 · 적용 지정명", items: a.basis, perPage: 4, cols: 2,
    renderItem: (b) => `<div class="card"><span class="tag">${esc(b.cite)}</span><span class="badge ${b.basis === "법령" ? "law" : ""}">${b.basis === "법령" ? "조문 확인" : "일반 지침"}</span>` +
      `<b>${esc(b.title)}</b><p>${esc(b.text)}</p></div>` });
}

// ---- 개요: 후보지별 요약 카드 + 지도 ----
function renderMapInfo(l) {
  const s = sites[l], el = $("info" + l);
  if (!s) { el.innerHTML = `<div class="who"><span class="chip">${l}</span> 후보지 ${l}</div><p class="tag">표지에서 주소를 입력하면 이곳에 표시됩니다.</p>`; return; }
  const zones = s.names.filter((n) => /지역$/.test(n));
  const pr = s.items.filter((i) => PRIORITY.some((k) => i.name.includes(k)));
  const top = s.law.ranked[0];
  const chips = (arr, none) => arr.length ? arr.map((z) => `<span class="chip">${esc(z)}</span>`).join("") : `<span class="tag">${none}</span>`;
  el.innerHTML = `<div class="who"><span class="chip">${l}</span><b>${esc(s.address)}</b></div>
    <div class="row"><span class="k">용도지역</span><span>${chips(zones, "없음")}</span></div>
    <div class="row"><span class="k">우선 검토</span><span>${chips(pr.map((i) => i.name), "강한 제한 없음")}</span></div>
    <div class="row"><span class="k">추천 유형</span><span class="big2t">${s.law.hasZone && top.score > 0 ? esc(top.name) : "판단 정보 부족"}</span><span class="tag"> · 필지 ${s.layers["LP_PA_CBND_BUBUN"].n ?? 0}건</span></div>`;
}
function drawSite(l) {
  const s = sites[l], ov = overlays[l];
  ov.clearLayers();
  $("mapbox" + l).classList.toggle("empty-map", !s);
  if (!s) return;
  L.marker([s.geo.y, s.geo.x]).addTo(ov);
  s.draws.forEach((d) => L.geoJSON({ type: "FeatureCollection", features: d.features }, { style: { color: d.color, weight: 1, fillOpacity: 0.08 } }).addTo(ov));
}
function fitMaps() {
  ["A", "B"].forEach((l) => { maps[l].invalidateSize(); if (sites[l]) maps[l].fitBounds(sites[l].bounds); });
}

// ---- 후보지 하나 조회 ----
async function runSite(label, address, d) {
  const geo = await geocode(address);
  if (!geo) throw new Error(`후보지 ${label}: 주소를 찾지 못했습니다. 지번 또는 도로명 전체 주소로 입력해 보세요.`);
  const bbox = [geo.x - d, geo.y - d, geo.x + d, geo.y + d].map((v) => v.toFixed(6)).join(",");
  const targets = ROWS.filter((r) => r.layers).flatMap((r) => r.layers.map(([id]) => [id, r]));
  const layers = {}, draws = [];
  await Promise.all(targets.map(async ([id, row], i) => {
    try {
      const f = await fetchLayer(id, bbox);
      layers[id] = { n: f.length, names: [...new Set(f.map((x) => x.properties.uname).filter(Boolean))],
        admin: [...new Set(f.map((x) => x.properties.sig_kor_nm || x.properties.ctp_kor_nm).filter(Boolean))] };
      if (row.draw && f.length && id !== "LT_C_UO101") draws.push({ features: f, color: COLORS[i % COLORS.length] });
    } catch (e) {
      layers[id] = { error: e.message };
    }
  }));
  const names = collectNames(layers);
  const radiusText = $("radius").selectedOptions[0].textContent.replace("반경 ", "");
  return { label, address, geo, bbox, layers, draws, names, items: buildRecs(names), law: analyzeLaw(names), date: today(), radiusText,
    bounds: [[geo.y - d, geo.x - d], [geo.y + d, geo.x + d]] };
}

// ---- 선택한 후보지로 조사 탭 갱신 ----
function selectSite(l) {
  if (!sites[l]) return;
  sel = l;
  document.querySelectorAll("#sitesw button").forEach((b) => b.classList.toggle("on", b.dataset.s === l));
  const s = sites[l];
  renderTable(s); renderRecs(s); renderLaw(s);
  if (window.renderPipeline) renderPipeline();
}
document.querySelectorAll("#sitesw button").forEach((b) => b.addEventListener("click", () => {
  if (!sites[b.dataset.s]) return setMsg(`후보지 ${b.dataset.s}가 아직 조회되지 않았습니다.`, true);
  selectSite(b.dataset.s);
}));

async function run() {
  const inputs = { A: $("addrA").value.trim(), B: $("addrB").value.trim() };
  if (!inputs.A && !inputs.B) return setMsg("후보지 주소를 입력하세요.", true);
  $("coverGo").disabled = true;
  $("csv").disabled = true;
  try {
    const d = +$("radius").value;
    setMsg("후보지를 조회하는 중... (레이어 14개 × 후보지 수, 최대 30초)");
    const labels = ["A", "B"].filter((l) => inputs[l]);
    const results = await Promise.all(labels.map((l) => runSite(l, inputs[l], d)));
    sites.A = sites.B = null;
    results.forEach((s) => (sites[s.label] = s));
    ["A", "B"].forEach((l) => { drawSite(l); renderMapInfo(l); });
    selectSite(labels[0]);
    showPage(10);
    $("csv").disabled = false;
    setMsg("완료: " + labels.map((l) => `${l}=${inputs[l]}`).join(" / ") + "  (← → 키로 탭 이동)");
  } catch (e) {
    setMsg(e.message, true);
  } finally {
    $("coverGo").disabled = false;
  }
}

["addrA", "addrB"].forEach((id) => $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") run(); }));

function downloadText(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: type || "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
}
function toCsv(rows) {
  const q = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  return rows.map((r) => r.map(q).join(",")).join("\n");
}
$("csv").addEventListener("click", () => {
  const head = ["후보지", "자료", "서비스ID", "조회일", "요청URL(키 제외)", "건수", "상태", "구분"];
  const rows = ["A", "B"].filter((l) => sites[l]).flatMap((l) => siteCatalog(sites[l]));
  downloadText("catalog.csv", toCsv([head, ...rows]));
});

["A", "B"].forEach(renderMapInfo); // 검색 전 빈 상태 표시
$("homeBtn").addEventListener("click", () => showPage(11));
$("coverGo").addEventListener("click", run);
$("coverEx").addEventListener("click", () => { $("addrA").value = "서울특별시 종로구 홍지문2길 20"; $("addrB").value = "서울특별시 중구 세종대로 110"; });
