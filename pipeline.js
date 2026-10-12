// 과제 파이프라인 6단계: ① 입지인자 4축 표 ② 지표 6 ③ 배분 3안 ④ 비교 매트릭스 ⑤ 가중치 역전점 ⑥ 제출.
// 수업 슬라이드에는 항목명만 있어, 4축의 내용·지표 6개·점수식은 아래에 "가정"으로 정의했다(수정 가능).
const DEADLINE = new Date("2026-10-18T23:59:00+09:00");
const STORE_KEY = "vw_pipeline_v1";
const RESTR = /개발제한|경관지구|고도지구|도시자연공원|절대보호|개발행위허가제한|토지거래계약/;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);

const DEF = {
  thr: [5, 10, 15], // 경사 임계값 3개(°) — 가정값
  dem: { A: { slope: "", src: "국토지리정보원 DEM", res: "5m", date: "" }, B: { slope: "", src: "국토지리정보원 DEM", res: "5m", date: "" } },
  green: { value: 30, locked: false },
  alts: [
    { name: "안1 주거 중심", R: 40, C: 10, P: 20 },
    { name: "안2 복합", R: 25, C: 25, P: 20 },
    { name: "안3 기반·공공 중심", R: 20, C: 10, P: 40 },
  ],
  weights: [25, 15, 20, 15, 10, 15],
  approved: null,
  sub: { phoneOk: true, prod: "https://vworld-dashboard.vercel.app", repo: "", checks: [0, 1, 2, 3, 4].map(() => ({ who: "", line: "" })), reason: { type: "없음", note: "" } },
};
let st = JSON.parse(JSON.stringify(DEF));
const done = { pdf: false, xlsx: false, csv: false };
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(st)); } catch (e) { /* 저장 불가 환경은 무시 */ } }
function load() {
  try { const j = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); if (j) st = Object.assign(JSON.parse(JSON.stringify(DEF)), j); } catch (e) { /* 무시 */ }
}

// ---------- 지표 6 정의 ----------
const IND = [
  { name: "법규 적합도", def: "용도지역·지구 제한을 반영한 유형 점수(시행령 제30조, 국토계획법 제37조, 개제법 제12조)를 배분 비율로 가중" },
  { name: "허용 밀도", def: "용적률 상한(시행령 제85조) ÷ 5 × 개발면적 중 주거·상업 비율" },
  { name: "규제 리스크", def: "100 − 15 × 제한 지정 수 × 개발면적 중 주거·상업 비율 (높을수록 안전)" },
  { name: "기반시설 확보", def: "공공·기반 배분 ÷ 30% × 100 (도로·보행·상하수 확보 여력)" },
  { name: "녹지·생태", def: "녹지 배분 ÷ 40% × 100 (녹지는 먼저 확정되므로 3안 동일)" },
  { name: "경사 적합도(DEM)", def: "경사 임계값 3개로 등급화 후 개발 강도(주거 1.0·상업 1.2·기반 0.6)로 감점" },
];

function slopeBase(v, thr) { return v <= thr[0] ? 100 : v <= thr[1] ? 75 : v <= thr[2] ? 45 : 15; }
function slopeGrade(v, thr) { return v <= thr[0] ? "완경사" : v <= thr[1] ? "보통" : v <= thr[2] ? "경사" : "급경사"; }

function metrics(L) {
  const s = sites[L];
  if (!s) return null;
  const zones = ZONES.filter((z) => s.names.includes(z[0]));
  const norm = {};
  s.law.ranked.forEach((t) => (norm[t.key] = clamp(50 + 6 * t.score, 0, 100)));
  return {
    s, zones, norm,
    farMax: zones.length ? Math.max(...zones.map((z) => z[3][1])) : 0,
    restr: s.names.filter((n) => RESTR.test(n)),
    parcels: s.layers["LP_PA_CBND_BUBUN"].n ?? 0,
    green: zones.some((z) => z[4].E >= 3),
    slope: num(st.dem[L].slope),
    admin: ((s.layers["LT_C_ADSIGG_INFO"].admin || []).join("·") || (s.layers["LT_C_ADSIDO_INFO"].admin || []).join("·") || ""), // 반경이 여러 구에 걸치면 모두 표기
  };
}

const allocOk = (a) => a.R + a.C + a.P + st.green.value === 100;
const allocAllOk = () => st.green.locked && st.alts.every(allocOk);

// 배분안 하나의 지표별 점수(0~100)
function scoreAlt(m, a) {
  const G = st.green.value, built = Math.max(1, 100 - G), rc = (a.R + a.C) / built;
  const n = m.norm;
  const s1 = (G * n.E + a.R * (n.A + n.B) / 2 + a.C * n.C + a.P * n.A) / 100;
  const s2 = Math.min(100, m.farMax / 5) * rc;
  const s3 = 100 - Math.min(100, 15 * m.restr.length * rc);
  const s4 = Math.min(100, a.P / 30 * 100);
  const s5 = Math.min(100, G / 40 * 100);
  const intensity = (a.R + 1.2 * a.C + 0.6 * a.P) / Math.max(1, a.R + a.C + a.P) / 1.2;
  const s6 = m.slope == null ? 50 : 100 - (100 - slopeBase(m.slope, st.thr)) * intensity;
  return [s1, s2, s3, s4, s5, s6].map((v) => Math.round(v * 10) / 10);
}

// 승인된 가중치로 비교 매트릭스 계산
function computeMatrix(L) {
  const m = metrics(L);
  if (!m || !st.approved || !allocAllOk()) return null;
  const w = st.approved.weights;
  const alts = st.alts.map((a) => {
    const scores = scoreAlt(m, a);
    return { name: a.name, scores, total: Math.round(scores.reduce((t, v, i) => t + v * w[i], 0) / 100 * 10) / 10 };
  });
  const order = alts.map((_, i) => i).sort((x, y) => alts[y].total - alts[x].total);
  alts.forEach((a, i) => (a.rank = order.indexOf(i) + 1));
  return { alts, order, w, m };
}

// 가중치 역전점: 한 지표의 가중치를 바꾸고 나머지는 비율 유지로 재조정할 때 1위가 바뀌는 값
function computeFlips(mx) {
  const { alts, order, w } = mx;
  const a = alts[order[0]];
  return IND.map((ind, j) => {
    const wj = w[j];
    let best = null;
    if (wj < 100) {
      alts.forEach((b, bi) => {
        if (bi === order[0]) return;
        const O = (k) => w.reduce((t, wi, i) => (i === j ? t : t + wi * k.scores[i]), 0) / (100 - wj);
        const dO = O(a) - O(b), dS = a.scores[j] - b.scores[j];
        const den = dO - dS;
        if (Math.abs(den) < 1e-9) return;
        const x = 100 * dO / den;
        // x가 100이면 그 지표만 남아 모든 안이 동점이 되는 경우이므로 역전으로 보지 않는다
        if (x >= 0 && x < 100 - 1e-6 && Math.abs(x - wj) > 1e-6 && (!best || Math.abs(x - wj) < Math.abs(best.x - wj))) best = { x, vs: b.name };
      });
    }
    return { name: ind.name, w: wj, x: best ? Math.round(best.x * 10) / 10 : null, vs: best ? best.vs : "" };
  });
}

// ---------- 근거 번호 ----------
const LAWEV = [
  { id: "L-1", name: "국토계획법 시행령 제30·84·85조", src: "용도지역 세분·건폐율·용적률 상한", date: LAW_CHECKED },
  { id: "L-2", name: "국토계획법 제37조", src: "용도지구의 지정(경관·고도·취락 등)", date: LAW_CHECKED },
  { id: "L-3", name: "개발제한구역법 제12조제1항", src: "개발제한구역 행위제한", date: LAW_CHECKED },
  { id: "L-4", name: "국토계획법 시행령 제71조·별표 2~22", src: "용도지역별 건축제한(건축 가능 건축물)", date: LAW_CHECKED },
];
function layerIds(rowName) { return ROWS.find((r) => r.name === rowName).layers.map((x) => x[0]); }
function evidence(L) {
  const s = sites[L];
  if (!s) return [];
  const urls = (rowName) => layerIds(rowName).map((id) => displayUrl("data", { layer: id, bbox: s.bbox })).join("\n");
  const d = st.dem[L];
  return [
    { id: `${L}-1`, name: "주소→좌표", src: "브이월드 지오코더 2.0 getCoord", date: s.date, url: displayUrl("geocode", { address: s.address, type: s.geo.type }) },
    { id: `${L}-2`, name: "용도지역", src: "2D 데이터 API 2.0 " + layerIds("용도지역").join("·"), date: s.date, url: urls("용도지역") },
    { id: `${L}-3`, name: "용도지구·구역", src: "2D 데이터 API 2.0 " + layerIds("용도지구·구역").join("·"), date: s.date, url: urls("용도지구·구역") },
    { id: `${L}-4`, name: "연속지적도", src: "2D 데이터 API 2.0 LP_PA_CBND_BUBUN", date: s.date, url: urls("필지 경계") },
    { id: `${L}-5`, name: "행정경계", src: "2D 데이터 API 2.0 " + layerIds("행정경계").join("·"), date: s.date, url: urls("행정경계") },
    { id: `${L}-6`, name: "DEM(경사)", src: `${d.src || "(출처 미입력)"} ${d.res}`, date: d.date || "(미입력)", url: "수동 입력: dem_slope_aspect.py 계산 결과" },
  ];
}
const ev = (ids) => ids.map((id) => `<span class="ev" title="${esc(evidenceTitle(id))}">[${id}]</span>`).join("");
function evidenceTitle(id) {
  const all = [...LAWEV, ...evidence("A"), ...evidence("B")];
  const e = all.find((x) => x.id === id);
  return e ? `${e.name} · ${e.src} · ${e.date}` : id;
}

// ---------- ① 입지인자 4축 ----------
function axes(L) {
  const m = metrics(L);
  if (!m) return null;
  const d = st.dem[L], g = slopeGrade;
  return [
    { axis: "법규·용도", ev: ["L-1", "L-4", `${L}-2`],
      text: m.zones.length ? m.zones.map((z) => `${z[0]}: 건폐율 ${z[2]}% 이하, 용적률 ${z[3][0]}~${z[3][1]}% 이하`).join(" / ") + " (상한 범위, 조례로 더 낮게 정함)" : "조회 범위에서 용도지역을 확인하지 못함" },
    { axis: "규제·제한", ev: ["L-2", "L-3", `${L}-3`],
      text: m.restr.length ? `제한 지정 ${m.restr.length}건: ${m.restr.join(", ")}` : "개발제한·경관·고도 등 강한 제한 지정 없음" },
    { axis: "지형·경사", ev: [`${L}-6`],
      text: m.slope == null ? "DEM 평균 경사 미입력 — ② 지표 6 탭에서 입력" : `평균 경사 ${m.slope}° (임계 ${st.thr.join("/")}° 기준 ${g(m.slope, st.thr)}), ${d.src} ${d.res}, 조회일 ${d.date || "미입력"}` },
    { axis: "토지·필지", ev: [`${L}-4`, `${L}-5`],
      text: `반경 ${m.s.radiusText} 내 필지 ${m.parcels}건${m.admin ? " · 반경이 걸친 행정구역: " + m.admin : ""}` },
  ];
}
function renderP4() {
  const A = axes("A"), B = axes("B");
  const cell = (a, i) => (a ? `${esc(a[i].text)} ${ev(a[i].ev)}` : '<span class="tag">미조회</span>');
  $("p4").innerHTML = `<div class="stack"><h2>① 입지인자 4축 표 <span class="tag">후보지별 요건 문장 · 근거 번호</span></h2>
    <div class="split"><div class="l"><table class="t"><thead><tr><th style="width:9%">축</th><th>후보지 A: ${esc(sites.A ? sites.A.address : "-")}</th><th>후보지 B: ${esc(sites.B ? sites.B.address : "-")}</th></tr></thead><tbody>` +
    ["법규·용도", "규제·제한", "지형·경사", "토지·필지"].map((ax, i) => `<tr><td><b>${ax}</b></td><td>${cell(A, i)}</td><td>${cell(B, i)}</td></tr>`).join("") +
    `</tbody></table></div><div class="r">${p4chart()}</div></div>
    <p class="foot">근거 번호에 마우스를 올리면 출처와 조회일이 보입니다. L-1 시행령 제30·84·85조 · L-2 국토계획법 제37조 · L-3 개발제한구역법 제12조 · L-4 시행령 제71조·별표 ·
    A/B-1 지오코더 · -2 용도지역 · -3 지구·구역 · -4 지적도 · -5 행정경계 · -6 DEM. 전체 목록은 ⑥ 제출. <b>가정:</b> 4축의 구분은 조회 가능한 자료 기준으로 정했으며, 수업 기준이 다르면 알려주세요.</p></div>`;
}

// ---------- ② 지표 6 ----------
function raw(i, L) {
  const m = metrics(L);
  if (!m) return "-";
  const t = m.s.law.ranked[0];
  return [
    m.s.law.hasZone ? `상위 유형 ${t.name} ${t.score}점` : "용도지역 미확인",
    `용적률 상한 ${m.farMax}%`,
    `제한 지정 ${m.restr.length}건`,
    `필지 ${m.parcels}건`,
    m.green ? "녹지계 용도지역 포함" : "녹지계 없음",
    m.slope == null ? "미입력(중립 50점)" : `${m.slope}° → ${slopeGrade(m.slope, st.thr)}`,
  ][i];
}
function renderP5() {
  const demRow = (L) => {
    const d = st.dem[L];
    return `<tr><td><b>후보지 ${L}</b></td><td><input type="number" step="0.1" min="0" class="inp" data-act="dem" data-l="${L}" data-f="slope" value="${esc(d.slope)}" placeholder="°"></td>
      <td><input class="inp wide" data-act="dem" data-l="${L}" data-f="src" value="${esc(d.src)}"></td>
      <td><select class="inp" data-act="dem" data-l="${L}" data-f="res">${["90m", "5m", "1m"].map((r) => `<option${d.res === r ? " selected" : ""}>${r}</option>`).join("")}</select></td>
      <td><input type="date" class="inp" data-act="dem" data-l="${L}" data-f="date" value="${esc(d.date)}"></td></tr>`;
  };
  $("p5").innerHTML = `<div class="stack"><h2>② 지표 6 <span class="tag">경사 임계값 3개 · DEM 출처 · 조회일 저장</span></h2>
    <table class="t"><thead><tr><th style="width:4%">#</th><th style="width:15%">지표</th><th>정의(점수식)</th><th style="width:17%">후보지 A 원자료</th><th style="width:17%">후보지 B 원자료</th></tr></thead><tbody>` +
    IND.map((x, i) => `<tr><td>${i + 1}</td><td><b>${x.name}</b></td><td>${esc(x.def)}</td><td>${esc(raw(i, "A"))}</td><td>${esc(raw(i, "B"))}</td></tr>`).join("") +
    `</tbody></table>
    <div class="split"><div class="l"><div class="box"><h3>⑥ DEM 입력 (자동 조회 불가 — 국토정보플랫폼에서 받은 DEM을 dem_slope_aspect.py로 계산한 평균 경사를 입력)</h3>
    <table class="t sm"><thead><tr><th></th><th>평균 경사(°)</th><th>DEM 출처</th><th>해상도</th><th>DEM 조회일</th></tr></thead><tbody>${demRow("A")}${demRow("B")}</tbody></table>
    <p>경사 임계값(°): ${st.thr.map((v, i) => `<input type="number" step="0.5" min="0" class="inp s" data-act="thr" data-i="${i}" value="${v}">`).join(" ≤ ")}
      <span class="tag">완경사 ≤ 1번째 &lt; 보통 ≤ 2번째 &lt; 경사 ≤ 3번째 &lt; 급경사. 입력값은 이 브라우저에 자동 저장됩니다.</span></p></div></div><div class="r">${p5chart()}</div></div>
    <p class="foot"><b>가정:</b> 지표 6개와 점수식, 임계값 5/10/15°는 임시값입니다. 수업 기준이 있으면 알려주세요.</p></div>`;
}

// ---------- ③ 배분 3안 ----------
function renderP6() {
  const G = st.green, lock = G.locked;
  $("p6").innerHTML = `<div class="stack"><h2>③ 배분 대안 3안 <span class="tag">녹지를 먼저 확정한 뒤 배분만 변경</span></h2>
    <div class="box"><h3>1단계 · 녹지 확정 (모든 안 공통)</h3>
      <p>녹지 비율 <input type="number" min="0" max="80" class="inp s" data-act="green" value="${G.value}" ${lock ? "disabled" : ""}> %
      <button data-act="gLock" class="mini">${lock ? "확정 해제" : "녹지 확정"}</button>
      <span class="${lock ? "st ok" : "st warn"}">${lock ? "확정됨 — 아래 배분만 변경할 수 있습니다" : "확정 전 — 배분 입력이 잠겨 있습니다"}</span></p></div>
    <table class="t"><thead><tr><th>안</th><th>녹지(고정)</th><th>주거 %</th><th>상업·업무 %</th><th>공공·기반 %</th><th>합계</th></tr></thead><tbody>` +
    st.alts.map((a, i) => {
      const sum = a.R + a.C + a.P + G.value, ok = sum === 100;
      const f = (k) => `<input type="number" min="0" max="100" class="inp s" data-act="alt" data-i="${i}" data-f="${k}" value="${a[k]}" ${lock ? "" : "disabled"}>`;
      return `<tr><td><input class="inp wide" data-act="alt" data-i="${i}" data-f="name" value="${esc(a.name)}" ${lock ? "" : "disabled"}></td><td>${G.value}%</td><td>${f("R")}</td><td>${f("C")}</td><td>${f("P")}</td>
        <td class="${ok ? "st ok" : "st err"}">${sum}% ${ok ? "✓" : "(100이 되도록 조정)"}</td></tr>`;
    }).join("") +
    `</tbody></table>${p6chart()}
    <p class="foot">배분 대상은 녹지 외 면적(주거·상업·공공기반)이며, 도로·상하수 등 기반시설은 "공공·기반"에 포함됩니다. <b>가정:</b> 안 이름과 기본 비율은 임시값입니다.</p></div>`;
}

// ---------- ④ 비교 매트릭스 ----------
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
function renderP7() {
  const ap = st.approved, w = ap ? ap.weights : st.weights, sum = w.reduce((t, v) => t + v, 0);
  const mx = computeMatrix(sel);
  const need = !sites[sel] ? `후보지 ${sel}가 조회되지 않았습니다.` : !allocAllOk() ? "③ 탭에서 녹지를 확정하고 3안의 합계를 100%로 맞추세요." : !ap ? "가중치를 승인하면 채점됩니다(사전 승인 후 채점)." : "";
  const wcell = (i) => ap ? `<b>${w[i]}</b>` : `<input type="number" min="0" max="100" class="inp s" data-act="w" data-i="${i}" value="${w[i]}">`;
  $("p7").innerHTML = `<div class="stack"><h2>④ 대안 비교 매트릭스 <span class="tag">후보지 ${sel} · 지표·가중치 사전 승인 후 채점</span></h2>
    <div class="box"><p>가중치 합계 <b class="${sum === 100 ? "st ok" : "st err"}">${sum}</b> / 100 ·
      ${ap ? `<span class="st ok">승인됨 ${esc(ap.at)}</span> <button data-act="unapprove" class="mini">승인 취소·수정</button>` : `<button data-act="approve" class="mini" ${sum === 100 ? "" : "disabled"}>가중치 승인(잠금)</button> <span class="st warn">승인 전에는 채점하지 않습니다</span>`}
      ${need ? `<span class="tag">· ${esc(need)}</span>` : ""}</p></div>
    <div class="split"><div class="l"><table class="t"><thead><tr><th>지표</th><th style="width:9%">가중치</th>${st.alts.map((a) => `<th>${esc(a.name)}</th>`).join("")}</tr></thead><tbody>` +
    IND.map((x, i) => `<tr><td><b>${i + 1}. ${x.name}</b></td><td>${wcell(i)}</td>${st.alts.map((_, k) => `<td>${mx ? f1(mx.alts[k].scores[i]) : "—"}</td>`).join("")}</tr>`).join("") +
    `<tr class="tot"><td><b>가중 합계</b></td><td>${sum}</td>${st.alts.map((_, k) => `<td>${mx ? `<b>${f1(mx.alts[k].total)}</b>` : "—"}</td>`).join("")}</tr>
     <tr class="tot"><td><b>순위</b></td><td></td>${st.alts.map((_, k) => `<td>${mx ? `<b class="${mx.alts[k].rank === 1 ? "st ok" : ""}">${mx.alts[k].rank}위</b>` : "—"}</td>`).join("")}</tr>
    </tbody></table></div><div class="r">${p7chart(mx)}</div></div>
    <p class="foot">점수는 0~100, 높을수록 유리합니다. 경사 미입력 시 ⑥ 지표는 중립 50점입니다. 후보지를 바꾸려면 위쪽 후보지 A/B 버튼을 누르세요.</p></div>`;
}

// ---------- ⑤ 가중치 역전점 ----------
function renderP8() {
  const mx = computeMatrix(sel);
  if (!mx) { $("p8").innerHTML = `<div class="stack"><h2>⑤ 가중치 역전점</h2><p class="empty">④ 탭에서 가중치를 승인하고 ③ 배분을 확정해야 계산됩니다(후보지 ${sel}).</p></div>`; return; }
  const top = mx.alts[mx.order[0]], second = mx.alts[mx.order[1]];
  const fl = computeFlips(mx);
  const sensitive = fl.filter((r) => r.x != null).sort((a, b) => Math.abs(a.x - a.w) - Math.abs(b.x - b.w))[0];
  $("p8").innerHTML = `<div class="stack"><h2>⑤ 가중치 역전점 <span class="tag">후보지 ${sel} · 1·2위가 바뀌는 가중치 값 기록</span></h2>
    <div class="box"><p>현재 1위 <b>${esc(top.name)}</b> (${f1(top.total)}점), 2위 <b>${esc(second.name)}</b> (${f1(second.total)}점), 격차 ${f1(top.total - second.total)}점 ·
    ${sensitive ? `가장 민감한 지표: <b>${esc(sensitive.name)}</b> (${sensitive.w} → ${sensitive.x}에서 역전)` : "어떤 지표 가중치를 0~100으로 바꿔도 순위가 바뀌지 않습니다(안정적)"}</p></div>
    <div class="split"><div class="l"><table class="t"><thead><tr><th>지표</th><th>현재 가중치</th><th>역전 가중치</th><th>변화폭</th><th>역전되는 상대 안</th></tr></thead><tbody>` +
    fl.map((r) => `<tr><td><b>${esc(r.name)}</b></td><td>${r.w}</td><td>${r.x == null ? "없음" : r.x}</td><td>${r.x == null ? "-" : (r.x - r.w > 0 ? "+" : "") + f1(r.x - r.w)}</td><td>${esc(r.vs || "-")}</td></tr>`).join("") +
    `</tbody></table></div><div class="r">${p8chart(mx, fl)}</div></div>
    <p class="foot">한 지표의 가중치를 바꾸고 나머지 지표는 기존 비율을 유지해 합계를 100으로 재조정하며, 1위가 처음 바뀌는 값을 구했습니다.</p></div>`;
}

// ---------- ⑥ 제출 ----------
function exportData() {
  const wb = { sheets: [] };
  const ax = { A: axes("A"), B: axes("B") };
  const add = (name, rows) => wb.sheets.push({ name, rows });
  add("입지인자4축", [["축", "후보지A 요건", "A 근거", "후보지B 요건", "B 근거"],
    ...[0, 1, 2, 3].map((i) => [ax.A ? ax.A[i].axis : ax.B[i].axis, ax.A ? ax.A[i].text : "미조회", ax.A ? ax.A[i].ev.join(" ") : "", ax.B ? ax.B[i].text : "미조회", ax.B ? ax.B[i].ev.join(" ") : ""])]);
  add("지표6", [["#", "지표", "정의", "후보지A 원자료", "후보지B 원자료"], ...IND.map((x, i) => [i + 1, x.name, x.def, raw(i, "A"), raw(i, "B")]),
    [], ["경사 임계값(°)", st.thr.join(" / ")],
    ...["A", "B"].map((L) => [`후보지${L} DEM`, `평균경사 ${st.dem[L].slope || "미입력"}°`, st.dem[L].src, st.dem[L].res, st.dem[L].date || "미입력"])]);
  add("배분3안", [["안", "녹지(고정)", "주거", "상업·업무", "공공·기반", "합계"], ...st.alts.map((a) => [a.name, st.green.value, a.R, a.C, a.P, a.R + a.C + a.P + st.green.value])]);
  const mrows = [["승인", st.approved ? st.approved.at : "미승인"], []], frows = [];
  ["A", "B"].filter((L) => sites[L]).forEach((L) => {
    const mx = computeMatrix(L);
    mrows.push([`후보지 ${L}`, "가중치", ...st.alts.map((a) => a.name)]);
    if (!mx) { mrows.push(["(미채점: 가중치 승인·배분 확정 필요)"], []); return; }
    IND.forEach((x, i) => mrows.push([x.name, mx.w[i], ...mx.alts.map((a) => a.scores[i])]));
    mrows.push(["가중 합계", 100, ...mx.alts.map((a) => a.total)], ["순위", "", ...mx.alts.map((a) => a.rank)], []);
    frows.push([`후보지 ${L}`], ["지표", "현재 가중치", "역전 가중치", "역전 상대 안"]);
    computeFlips(mx).forEach((r) => frows.push([r.name, r.w, r.x == null ? "없음" : r.x, r.vs]));
    frows.push([]);
  });
  add("비교매트릭스", mrows);
  add("가중치역전점", frows.length ? frows : [["미계산"]]);
  add("근거목록", [["번호", "자료", "출처", "조회·확인일", "요청 URL(키 제외)"],
    ...[...LAWEV, ...evidence("A"), ...evidence("B")].map((e) => [e.id, e.name, e.src, e.date, e.url || ""])]);
  return wb;
}
function renderP9() {
  const dem = ["A", "B"].filter((L) => sites[L]).every((L) => num(st.dem[L].slope) != null && st.dem[L].src && st.dem[L].date) && sites.A;
  const thrOk = st.thr[0] < st.thr[1] && st.thr[1] < st.thr[2];
  const matrixOk = ["A", "B"].filter((L) => sites[L]).every((L) => computeMatrix(L));
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((midnight(DEADLINE) - midnight(new Date())) / 86400000); // 달력 기준 남은 일수
  const items = [
    ["① 입지인자 4축 표 (후보지 2곳)", !!(sites.A && sites.B), sites.A && sites.B ? "A·B 모두 조회됨" : "후보지 A·B를 모두 검색하세요"],
    ["② 지표 6 (임계값 3개 · DEM 출처 · 조회일)", !!(dem && thrOk), dem && thrOk ? "저장됨" : "② 탭에서 평균 경사·출처·조회일을 입력하세요"],
    ["③ 배분 3안 (녹지 먼저 확정)", allocAllOk(), allocAllOk() ? `녹지 ${st.green.value}% 확정, 3안 합계 100%` : "③ 탭에서 녹지 확정 후 합계를 100%로"],
    ["④ 비교 매트릭스 (가중치 사전 승인)", !!st.approved && matrixOk, st.approved ? `승인 ${st.approved.at}` : "④ 탭에서 가중치를 승인하세요"],
    ["⑤ 가중치 역전점", matrixOk, matrixOk ? "계산됨" : "④ 승인 후 자동 계산"],
    ["⑥ 제출 파일 (PDF + 매트릭스 xlsx/csv)", done.pdf && (done.xlsx || done.csv), `PDF ${done.pdf ? "✓" : "–"} · xlsx ${done.xlsx ? "✓" : "–"} · csv ${done.csv ? "✓" : "–"}`],
  ];
  $("p9").innerHTML = `<div class="stack"><h2>⑥ 제출 <span class="tag">LMS &gt; 6주차 과제 · PDF + 매트릭스 원본(xlsx 또는 csv) · 2026.10.18 23:59 (D${days >= 0 ? "-" + days : "+" + (-days)})</span></h2>
    <div class="split"><div class="l"><table class="t sm"><tbody>${items.map((r) => `<tr><td style="width:42%"><b>${r[0]}</b></td><td class="${r[1] ? "st ok" : "st warn"}" style="width:6%">${r[1] ? "완료" : "미완료"}</td><td>${esc(r[2])}</td></tr>`).join("")}</tbody></table>
    <div class="actions"><button data-act="pdf">PDF로 저장(인쇄 → PDF)</button><button data-act="xlsx">매트릭스 xlsx 받기</button><button data-act="csvm">매트릭스 csv 받기</button></div></div><div class="r">${ringChart(items.filter((r) => r[1]).length, items.length, "항목 완료")}</div></div>
    <p class="foot">PDF는 인쇄 창에서 "PDF로 저장"을 선택하세요(모든 탭이 이어서 출력됩니다). xlsx는 시트 6개(4축·지표·배분·매트릭스·역전점·근거목록)입니다.</p></div>`;
}


// ---------- 차트 ----------
const INDS = IND.map((x) => x.name.replace("(DEM)", ""));
function avgAltScores(L) {
  const m = metrics(L);
  if (!m) return null;
  const sc = st.alts.map((a) => scoreAlt(m, a));
  return IND.map((_, i) => sc.reduce((t, v) => t + v[i], 0) / sc.length);
}
function p4chart() {
  const g = (L, f) => { const m = metrics(L); return m ? f(m) : (L === "A" ? null : undefined); };
  const rows = [
    ["건폐율 상한 최대", (m) => Math.max(0, ...m.zones.map((z) => z[2])), "%"],
    ["용적률 상한 최대", (m) => m.farMax, "%"],
    ["제한 지정 수", (m) => m.restr.length, "건"],
    ["필지 수", (m) => m.parcels, "건"],
    ["평균 경사", (m) => m.slope, "°"],
  ].map(([label, f, unit]) => ({ label, unit, a: g("A", f), b: g("B", f) }));
  return pairBars(rows, ["후보지 A", ...(sites.B ? ["후보지 B"] : [])], "후보지 비교 (행마다 자체 눈금)");
}
function p5chart() {
  const series = ["A", "B"].filter((L) => sites[L]).map((L, i) => ({ name: `후보지 ${L}`, color: CH[i], values: avgAltScores(L) }));
  return series.length ? radarChart(INDS, series, "지표 6 프로필 (3안 평균 점수, 가중치 미적용)") : '<p class="empty">후보지를 조회하면 표시됩니다.</p>';
}
function p6chart() {
  const col = [CH[2], CH[0], CH[1], CH[4]];
  const rows = st.alts.map((a) => ({ label: a.name, parts: [
    { name: "녹지(확정)", v: st.green.value, color: col[0] }, { name: "주거", v: a.R, color: col[1] },
    { name: "상업·업무", v: a.C, color: col[2] }, { name: "공공·기반", v: a.P, color: col[3] }] }));
  return stackBars(rows, 100, "배분 비율 비교 (녹지는 모든 안에서 동일)", "%");
}
function p7chart(mx) {
  if (!mx) return '<p class="empty">가중치를 승인하고 ③ 배분을 확정하면 차트가 표시됩니다.</p>';
  const radar = radarChart(INDS, mx.alts.map((a, k) => ({ name: a.name, color: CH[k], values: a.scores })), "안별 지표 프로필");
  const rows = mx.alts.map((a) => ({ label: `${a.rank}위 ${a.name}`, parts: a.scores.map((v, i) => ({ name: INDS[i], v: v * mx.w[i] / 100, color: CH[i] })) }));
  return radar + stackBars(rows, 100, "가중 합계 구성 (지표별 기여 점수)", "");
}
let flipJ = null;
function p8chart(mx, fl) {
  const w = mx.w, top = mx.order[0];
  let j = flipJ;
  if (j == null) { const cand = fl.map((r, i) => [r, i]).filter(([r]) => r.x != null).sort((a, b) => Math.abs(a[0].x - a[0].w) - Math.abs(b[0].x - b[0].w)); j = cand.length ? cand[0][1] : 0; }
  const O = (k) => (w[j] >= 100 ? 0 : w.reduce((t, wi, i) => (i === j ? t : t + wi * k.scores[i]), 0) / (100 - w[j]));
  const series = mx.alts.map((a, k) => ({ name: a.name, color: CH[k], y0: O(a), y100: a.scores[j] }));
  const flip = fl[j].x, ta = series[top];
  const mark = { now: w[j], flip, flipY: flip == null ? 0 : (flip * ta.y100 + (100 - flip) * ta.y0) / 100 };
  const sel = `<label class="sel">지표 선택 <select class="inp" data-act="flipSel">${IND.map((x, i) => `<option value="${i}"${i === j ? " selected" : ""}>${i + 1}. ${esc(x.name)}</option>`).join("")}</select></label>`;
  return sel + lineChart(series, mark, `"${IND[j].name}" 가중치에 따른 안별 합계 (선이 만나는 곳이 역전점)`, "가중치(%) — 나머지 지표는 비율 유지");
}


// ---------- A·B 비교 (한 화면) ----------
function typeRadar() {
  const keys = ["A", "B", "C", "D", "E"];
  const series = ["A", "B"].filter((l) => sites[l]).map((l, i) => ({
    name: `후보지 ${l}`, color: CH[i], values: keys.map((k) => 50 + 5 * sites[l].law.ranked.find((t) => t.key === k).score) }));
  return radarChart(keys.map((k) => TYPES[k].name), series, "도시 유형 적합도 (법령 기반, 50 = 0점)");
}
function renderP10() {
  const ls = ["A", "B"].filter((l) => sites[l]);
  if (!ls.length) { $("p10").innerHTML = '<div class="empty">표지에서 후보지 A·B 주소를 입력하고 분석을 시작하면, 두 후보지를 한 화면에서 비교합니다.</div>'; return; }
  const M = { A: metrics("A"), B: metrics("B") }, MX = { A: computeMatrix("A"), B: computeMatrix("B") };
  const avg = (l) => { const v = avgAltScores(l); return v ? v.reduce((t, x) => t + x, 0) / v.length : null; };
  const best = (l) => (MX[l] ? MX[l].alts[MX[l].order[0]] : null);
  const rows = [
    ["용도지역", (l) => ({ t: M[l].zones.map((z) => z[0]).join(", ") || "미확인" })],
    ["제한·지구 지정", (l) => ({ t: `${M[l].restr.length}건`, v: M[l].restr.length, dir: "low" })],
    ["개발 여력 (용적률 상한)", (l) => ({ t: `${M[l].farMax}%`, v: M[l].farMax, dir: "high" })],
    ["건폐율 상한", (l) => ({ t: `${Math.max(0, ...M[l].zones.map((z) => z[2]))}%` })],
    ["필지 수", (l) => ({ t: `${M[l].parcels}건` })],
    ["평균 경사", (l) => (M[l].slope == null ? { t: "미입력" } : { t: `${M[l].slope}° (${slopeGrade(M[l].slope, st.thr)})`, v: M[l].slope, dir: "low" })],
    ["추천 도시 유형", (l) => { const t = M[l].s.law.ranked[0]; return { t: M[l].s.law.hasZone ? `${t.name} (${t.score}점)` : "판단 불가", v: M[l].s.law.hasZone ? t.score : null, dir: "high" }; }],
    ["지표 6 평균 점수", (l) => ({ t: f1(avg(l)), v: avg(l), dir: "high" })],
    ["최고 배분안 (승인 시)", (l) => { const b = best(l); return b ? { t: `${b.name} · ${f1(b.total)}점`, v: b.total, dir: "high" } : { t: "가중치 승인 전" }; }],
  ];
  const wins = { A: 0, B: 0 };
  let compared = 0;
  const body = rows.map(([label, f]) => {
    const r = {}; ls.forEach((l) => (r[l] = f(l)));
    let win = null;
    if (ls.length === 2 && r.A.v != null && r.B.v != null && r.A.dir) {
      compared++;
      if (Math.abs(r.A.v - r.B.v) > 1e-9) { win = (r.A.v > r.B.v) === (r.A.dir === "high") ? "A" : "B"; wins[win]++; }
    }
    const td = (l) => `<td${win === l ? ' class="w"' : ""}>${r[l] ? esc(r[l].t) : "—"}</td>`;
    return `<tr><td><b>${label}</b></td>${td("A")}${td("B")}</tr>`;
  }).join("");
  const lead = wins.A === wins.B ? null : wins.A > wins.B ? "A" : "B";
  const card = (l) => !sites[l] ? `<div class="vcard"><div class="who">후보지 ${l}</div><div class="addr">미조회</div></div>` :
    `<div class="vcard${lead === l ? " win" : ""}"><div class="who"><span class="chip">${l}</span>${lead === l ? '<span class="st ok">종합 우위</span>' : ""}</div>
      <div class="addr">${esc(sites[l].address)}</div><div class="score">${ls.length === 2 ? wins[l] : "-"}<span class="tag"> 항목 우위</span></div></div>`;
  $("p10").innerHTML = `<div class="stack"><h2>A·B 비교 <span class="tag">한 화면 요약 · 초록 ● = 해당 항목 우위</span></h2>
    <div class="vs">${card("A")}<div class="vmid">${ls.length === 2 ? `<b>${wins.A} : ${wins.B}</b>비교 ${compared}항목` : "후보지 B를 입력하면<br>비교됩니다"}</div>${card("B")}</div>
    <div class="split"><div class="l"><table class="t vtbl"><thead><tr><th>항목</th><th>후보지 A</th><th>후보지 B</th></tr></thead><tbody>${body}</tbody></table></div>
    <div class="r">${p5chart()}${typeRadar()}</div></div>
    <p class="foot">우위 기준: 제한·지정과 경사는 낮을수록, 개발 여력·유형 점수·지표·배분안 점수는 높을수록 유리로 봅니다(수업 기준이 있으면 조정 가능). 건폐율·필지 수·용도지역은 우열 없이 병기합니다.</p></div>`;
}

// ---------- 오늘 과제: 산출물 차트 2종(막대·도넛) + 점검·제출 1쪽 ----------
const BAR_LAYERS = [["LT_C_UQ111", "용도지역(도시)"], ["LT_C_UQ121", "자연경관지구"], ["LT_C_UQ123", "고도지구"], ["LT_C_UQ128", "집단취락지구"],
  ["LT_C_UD801", "개발제한구역"], ["LT_C_UQ141", "지구단위·허가제한"], ["LT_C_UO101", "교육환경보호"]];
const SRC_TEXT = "브이월드 오픈API 2D 데이터 2.0 (요청 URL은 카탈로그 행에 기록)";

// 카탈로그 행: 후보지 × 레이어. 차트 값은 반드시 이 행에서 읽는다.
function catRows() {
  const rows = [];
  ["A", "B"].filter((l) => sites[l]).forEach((l) => {
    const s = sites[l];
    ROWS.filter((r) => r.layers).forEach((r) => r.layers.forEach(([id, label]) => {
      const o = s.layers[id];
      rows.push({ cid: `${l}-${id}`, site: l, group: r.name, label, layer: id, count: o.n ?? null, date: s.date, url: displayUrl("data", { layer: id, bbox: s.bbox }) });
    }));
  });
  return rows;
}
function chartSpecs() {
  const ls = ["A", "B"].filter((l) => sites[l]);
  if (!ls.length) return null;
  const rows = catRows();
  const val = (l, id) => { const r = rows.find((x) => x.cid === `${l}-${id}`); return r && r.count != null ? r.count : 0; };
  const date = sites[ls[0]].date;
  // 차트 1: 비교(막대)
  const labels = BAR_LAYERS.map((x) => x[1]);
  const series = ls.map((l, i) => ({ name: `후보지 ${l}`, color: CH[i], values: BAR_LAYERS.map(([id]) => val(l, id)) }));
  let xi = 0, best = -1;
  labels.forEach((_, i) => {
    const vs = series.map((s) => s.values[i]);
    const d = vs.length > 1 ? Math.abs(vs[0] - vs[1]) : vs[0];
    if (d > best) { best = d; xi = i; }
  });
  const two = series.length > 1;
  const bar = { id: "C1", kind: "막대(비교·필수)",
    title: two ? `후보지별 용도지구·구역 지정 건수 — ${labels[xi]}에서 격차가 가장 큼` : `용도지구·구역 지정 건수 — ${labels[xi]}가 가장 많음`,
    xLabels: labels, series, xTitle: "레이어(용도지역·지구·구역)", yTitle: "지정 건수", unit: "건", source: SRC_TEXT, date,
    highlight: { xi, text: two ? `${labels[xi]} 격차 ${best}건` : `${labels[xi]} ${best}건` },
    rowIds: ls.flatMap((l) => BAR_LAYERS.map(([id]) => `${l}-${id}`)) };
  // 차트 2: 구성(도넛), 선택한 후보지
  const dl = sites[sel] ? sel : ls[0];
  const parts = ROWS.find((r) => r.name === "용도지구·구역").layers.map(([id, label]) => ({ label, value: val(dl, id), id })).filter((q) => q.value > 0);
  const hi = parts.reduce((b, q, i) => (q.value > (parts[b] ? parts[b].value : -1) ? i : b), 0);
  const donut = { id: "C2", kind: "도넛(구성·선택)",
    title: `후보지 ${dl} 용도지구·구역 지정 구성비${parts[hi] ? ` — ${parts[hi].label} 비중이 가장 큼` : ""}`,
    parts, unit: "건", source: SRC_TEXT, date, highlightIndex: parts.length ? hi : null, xTitle: "조각 = 레이어", yTitle: "건수 비중",
    highlight: { text: parts[hi] ? `${parts[hi].label} 조각 확대·굵게` : "" }, rowIds: parts.map((q) => `${dl}-${q.id}`) };
  return { rows, bar, donut };
}
function sixElements(c) {
  return { 제목: c.title, 축: `${c.xTitle} / ${c.yTitle}`, 단위: c.unit, 출처: c.source, 조회일: c.date, 강조: c.highlight.text || "-" };
}
function renderP12() {
  const cs = chartSpecs();
  if (!cs) { $("p12").innerHTML = '<div class="stack"><h2>⑦ 산출물 차트 2종</h2><p class="empty">표지에서 후보지를 분석하면 차트 2종이 만들어집니다.</p></div>'; return; }
  const e1 = sixElements(cs.bar), e2 = sixElements(cs.donut);
  const keys = ["제목", "축", "단위", "출처", "조회일", "강조"];
  $("p12").innerHTML = `<div class="stack"><h2>⑦ 산출물 차트 2종 <span class="tag">비교(막대) 필수 + 구성(도넛) 선택 · 값은 카탈로그 행 기반 · 6요소 구비</span></h2>
    <div class="split"><div class="l figcard">${axisBarChart(cs.bar)}</div><div class="r">${donutChart(cs.donut)}</div></div>
    <table class="t sm els"><thead><tr><th>차트(카탈로그 행)</th>${keys.map((k) => `<th>${k}</th>`).join("")}</tr></thead><tbody>
      <tr><td><b>C1 ${cs.bar.kind}</b><br><span class="tag">행 ${cs.bar.rowIds.length}개</span></td>${keys.map((k) => `<td>${esc(e1[k])}</td>`).join("")}</tr>
      <tr><td><b>C2 ${cs.donut.kind}</b><br><span class="tag">행 ${cs.donut.rowIds.length}개</span></td>${keys.map((k) => `<td>${esc(e2[k])}</td>`).join("")}</tr></tbody></table>
    <div class="actions"><button data-act="chartCsv">차트 카탈로그 CSV 받기</button></div></div>`;
}

// ---- ⑧ 점검 기록 + 제출 1쪽 ----
const shots = [null, null];
const CHECKS = ["제목이 비교·구성의 핵심 메시지를 말한다", "축과 단위가 표기돼 있다", "출처와 조회일이 표기돼 있다", "차트 값이 카탈로그 행과 일치한다", "휴대전화 폭에서 읽힌다(배포 화면)"];
function checkAuto(i, cs) {
  if (!cs) return ["대기", "warn"];
  const specs = [cs.bar, cs.donut];
  if (i === 0) return specs.every((s) => s.title) ? ["자동 통과", "ok"] : ["미흡", "err"];
  if (i === 1) return specs.every((s) => s.xTitle && s.yTitle && s.unit) ? ["자동 통과", "ok"] : ["미흡", "err"];
  if (i === 2) return specs.every((s) => s.source && s.date) ? ["자동 통과", "ok"] : ["미흡", "err"];
  if (i === 3) {
    const bad = cs.bar.series.some((s) => s.values.some((v, j) => {
      const r = cs.rows.find((x) => x.cid === `${s.name.slice(-1)}-${BAR_LAYERS[j][0]}`);
      return !r || (r.count ?? 0) !== v;
    }));
    return bad ? ["불일치", "err"] : [`일치(${cs.rows.length}행)`, "ok"];
  }
  return st.sub.phoneOk ? ["확인됨", "ok"] : ["팀원 확인 필요", "warn"];
}
function renderP13() {
  const cs = chartSpecs(), sb = st.sub;
  const now = new Date();
  const days = Math.round((new Date(2026, 9, 18) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  const slot = (i) => `<label class="shot${shots[i] ? " has" : ""}">${shots[i] ? `<img src="${shots[i]}" alt="배포 화면 갈무리 ${i + 1}">` :
    `<span>배포 화면 갈무리 ${i + 1}<br><small>${i === 0 ? "production 주소, 휴대전화 폭" : "차트 2종이 보이는 화면"}</small><br>클릭해서 이미지 선택</span>`}<input type="file" accept="image/*" data-act="shot" data-i="${i}"></label>`;
  const rowsHtml = CHECKS.map((c, i) => {
    const [t, k] = checkAuto(i, cs);
    return `<tr><td>${i + 1}</td><td>${esc(c)}</td><td class="st ${k}">${t}${i === 4 ? ` <button class="mini" data-act="phoneOk">${st.sub.phoneOk ? "취소" : "확인됨으로"}</button>` : ""}</td>
      <td><input class="inp" data-act="chk" data-i="${i}" data-f="who" value="${esc(sb.checks[i].who)}" placeholder="이름"></td>
      <td><input class="inp wide" data-act="chk" data-i="${i}" data-f="line" value="${esc(sb.checks[i].line)}" placeholder="점검 결과를 한 줄로"></td></tr>`;
  }).join("");
  $("p13").innerHTML = `<div class="stack"><h2>⑧ 점검 기록 · 제출 1쪽 <span class="tag">LMS 6주차 비교과 · PDF 1쪽(갈무리 2장 + 점검 기록) · 2026.10.18 23:59 (D-${days})</span></h2>
    <div class="sheet">
      <div class="urls"><label>배포 주소 (production)<input class="inp wide" data-act="sub" data-k="prod" value="${esc(sb.prod)}"></label>
        <label>저장소 주소 (GitHub)<input class="inp wide" data-act="sub" data-k="repo" value="${esc(sb.repo)}" placeholder="https://github.com/…"></label></div>
      <div class="shots">${slot(0)}${slot(1)}</div>
      <table class="t sm"><thead><tr><th>#</th><th>점검 항목</th><th>자동 판정</th><th>점검 팀원</th><th>한 줄 기록</th></tr></thead><tbody>${rowsHtml}</tbody></table>
      <div class="reason">카탈로그 불일치 사유 <select class="inp" data-act="reason" data-f="type">${["없음", "형식", "행 선택", "조회일"].map((t) => `<option${sb.reason.type === t ? " selected" : ""}>${t}</option>`).join("")}</select>
        <input class="inp wide" data-act="reason" data-f="note" value="${esc(sb.reason.note)}" placeholder="불일치가 있으면 원인을 한 줄로 (없으면 비워 두세요)"></div>
    </div>
    <div class="actions"><button data-act="sheetPdf">제출 PDF 1쪽 만들기(인쇄 → PDF)</button></div></div>`;
}
function chartCatalogCsv() {
  const cs = chartSpecs();
  if (!cs) return setMsg("차트 카탈로그는 후보지를 분석한 뒤 받을 수 있습니다.", true);
  const head = ["차트ID", "종류", "제목", "축", "단위", "출처", "조회일", "강조", "카탈로그 행 ID"];
  const row = (c) => { const e = sixElements(c); return [c.id, c.kind, e.제목, e.축, e.단위, e.출처, e.조회일, e.강조, c.rowIds.join(" ")]; };
  const rows = [head, row(cs.bar), row(cs.donut), [], ["행ID", "후보지", "구분", "레이어", "서비스ID", "건수", "조회일", "요청URL(키 제외)"],
    ...cs.rows.map((r) => [r.cid, r.site, r.group, r.label, r.layer, r.count ?? "", r.date, r.url])];
  downloadText("chart_catalog.csv", toCsv(rows));
}

// ---------- 이벤트 ----------
const ACTS = {
  thr: (el) => { st.thr[+el.dataset.i] = num(el.value) ?? DEF.thr[+el.dataset.i]; },
  dem: (el) => { st.dem[el.dataset.l][el.dataset.f] = el.value; },
  green: (el) => { st.green.value = clamp(num(el.value) ?? 30, 0, 80); },
  gLock: () => { st.green.locked = !st.green.locked; },
  alt: (el) => { const a = st.alts[+el.dataset.i]; a[el.dataset.f] = el.dataset.f === "name" ? el.value : clamp(num(el.value) ?? 0, 0, 100); },
  w: (el) => { st.weights[+el.dataset.i] = clamp(num(el.value) ?? 0, 0, 100); },
  approve: () => {
    if (st.weights.reduce((t, v) => t + v, 0) !== 100) return;
    st.approved = { at: new Date().toLocaleString("ko-KR"), weights: [...st.weights] };
  },
  unapprove: () => { st.approved = null; },
  flipSel: (el) => { flipJ = +el.value; },
  sub: (el) => { st.sub[el.dataset.k] = el.value.trim(); },
  chk: (el) => { st.sub.checks[+el.dataset.i][el.dataset.f] = el.value; },
  reason: (el) => { st.sub.reason[el.dataset.f] = el.value; },
  shot: (el) => {
    const f = el.files && el.files[0], i = +el.dataset.i;
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { shots[i] = rd.result; renderP13(); };
    rd.readAsDataURL(f);
  },
  phoneOk: () => { st.sub.phoneOk = !st.sub.phoneOk; },
  chartCsv: () => chartCatalogCsv(),
  sheetPdf: () => {
    document.body.classList.add("print-sheet");
    window.addEventListener("afterprint", () => document.body.classList.remove("print-sheet"), { once: true });
    window.print();
  },
  pdf: () => { done.pdf = true; renderP9(); window.print(); },
  xlsx: () => {
    if (!window.XLSX) return setMsg("xlsx 라이브러리를 불러오지 못했습니다(인터넷 연결 확인). csv를 대신 사용하세요.", true);
    const wb = XLSX.utils.book_new();
    exportData().sheets.forEach((s) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name));
    XLSX.writeFile(wb, "입지분석_매트릭스.xlsx");
    done.xlsx = true;
  },
  csvm: () => {
    const rows = [];
    exportData().sheets.forEach((s) => { rows.push([`## ${s.name}`], ...s.rows, []); });
    downloadText("입지분석_매트릭스.csv", toCsv(rows));
    done.csv = true;
  },
};
function onAct(e) {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  if (e.type === "click" && !(el.tagName === "BUTTON")) return;
  if (e.type === "change" && el.tagName === "BUTTON") return;
  if (ACTS[el.dataset.act]) { ACTS[el.dataset.act](el); save(); renderPipeline(); }
}

function renderPipeline() { renderP12(); renderP13(); renderP10(); renderP4(); renderP5(); renderP6(); renderP7(); renderP8(); renderP9(); }
function initPipeline() {
  load();
  ["p4", "p5", "p6", "p7", "p8", "p9"].forEach((id) => { $(id).addEventListener("change", onAct); $(id).addEventListener("click", onAct); });
  window.renderPipeline = renderPipeline;
  let wasMobile = innerWidth <= 700;
  addEventListener("resize", () => { const m = innerWidth <= 700; if (m !== wasMobile) { wasMobile = m; renderPipeline(); } });
  renderPipeline();
}
