// 의존성 없는 SVG/HTML 차트 모듈. 색은 CSS 변수를 써서 라이트·다크 모두 읽힌다.
const CH = ["#0071e3", "#ff9500", "#34c759", "#af52de", "#ff3b30", "#5ac8fa"]; // Apple 시스템 색
const chEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const legend = (items) => `<div class="lg">${items.map((x) => `<span><i style="background:${x.color}"></i>${chEsc(x.name)}</span>`).join("")}</div>`;

// 레이더(0~100). series: [{name, color, values[]}]
function radarChart(labels, series, title) {
  const W = 480, H = 280, cx = W / 2, cy = 140, R = 90, n = labels.length;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n, r = (R * v) / 100;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const ring = (v) => labels.map((_, i) => pt(i, v).join(",")).join(" ");
  let g = [25, 50, 75, 100].map((v) => `<polygon points="${ring(v)}" class="rg"/>`).join("");
  g += labels.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, 100)[0]}" y2="${pt(i, 100)[1]}" class="rg"/>`).join("");
  g += labels.map((l, i) => {
    const [x, y] = pt(i, 122);
    const anchor = Math.abs(x - cx) < 8 ? "middle" : x > cx ? "start" : "end";
    return `<text x="${x}" y="${y + 4}" text-anchor="${anchor}" class="ax">${chEsc(l)}</text>`;
  }).join("");
  series.forEach((s) => {
    const p = s.values.map((v, i) => pt(i, clampN(v, 0, 100)).join(",")).join(" ");
    g += `<polygon points="${p}" fill="${s.color}" fill-opacity=".16" stroke="${s.color}" stroke-width="2"/>`;
    g += s.values.map((v, i) => `<circle cx="${pt(i, clampN(v, 0, 100))[0]}" cy="${pt(i, clampN(v, 0, 100))[1]}" r="3" fill="${s.color}"><title>${chEsc(s.name)} · ${chEsc(labels[i])}: ${Math.round(v * 10) / 10}</title></circle>`).join("");
  });
  return `<div class="chart">${title ? `<h4>${chEsc(title)}</h4>` : ""}<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${g}</svg>${legend(series)}</div>`;
}
function clampN(v, a, b) { return Math.min(b, Math.max(a, v)); }

// 두 후보지 막대 비교. rows: [{label, a, b, unit}] — 행마다 자체 눈금
function pairBars(rows, names, title) {
  const body = rows.map((r) => {
    const mx = Math.max(r.a ?? 0, r.b ?? 0, 1e-9);
    const bar = (v, c) => `<div class="pb"><i style="width:${v == null ? 0 : (v / mx) * 100}%;background:${c}"></i><b>${v == null ? "-" : Math.round(v * 10) / 10}${r.unit || ""}</b></div>`;
    return `<div class="pr"><span>${chEsc(r.label)}</span><div>${bar(r.a, CH[0])}${r.b === undefined ? "" : bar(r.b, CH[1])}</div></div>`;
  }).join("");
  const lg = legend(names.map((n, i) => ({ name: n, color: CH[i] })));
  return `<div class="chart">${title ? `<h4>${chEsc(title)}</h4>` : ""}${lg}<div class="pairs">${body}</div></div>`;
}

// 누적 가로 막대. rows: [{label, parts:[{name,v,color}]}], max: 눈금 최댓값
function stackBars(rows, max, title, unit) {
  const names = [];
  rows.forEach((r) => r.parts.forEach((p) => { if (!names.find((x) => x.name === p.name)) names.push({ name: p.name, color: p.color }); }));
  const body = rows.map((r) => {
    const sum = r.parts.reduce((t, p) => t + p.v, 0);
    return `<div class="sr"><span>${chEsc(r.label)}</span><div class="sb">${r.parts.map((p) => `<i style="width:${(p.v / max) * 100}%;background:${p.color}" title="${chEsc(p.name)} ${Math.round(p.v * 10) / 10}${unit || ""}">${p.v / max > 0.07 ? Math.round(p.v) : ""}</i>`).join("")}</div><b>${Math.round(sum * 10) / 10}${unit || ""}</b></div>`;
  }).join("");
  return `<div class="chart">${title ? `<h4>${chEsc(title)}</h4>` : ""}${legend(names)}<div class="stacks">${body}</div></div>`;
}

// 꺾은선: 가중치(x, 0~100)에 따른 각 안의 합계. series: [{name,color,y0,y100}] (선형이므로 양 끝점만)
function lineChart(series, mark, title, xLabel) {
  const W = 360, H = 240, L = 36, Rr = 12, T = 14, B = 34;
  const ys = series.flatMap((s) => [s.y0, s.y100]);
  let lo = Math.floor(Math.min(...ys) / 10) * 10, hi = Math.ceil(Math.max(...ys) / 10) * 10;
  if (hi - lo < 10) { lo -= 5; hi += 5; }
  const X = (x) => L + (x / 100) * (W - L - Rr), Y = (y) => T + (1 - (y - lo) / (hi - lo)) * (H - T - B);
  let g = "";
  for (let k = 0; k <= 4; k++) {
    const v = lo + ((hi - lo) * k) / 4;
    g += `<line x1="${L}" x2="${W - Rr}" y1="${Y(v)}" y2="${Y(v)}" class="rg"/><text x="${L - 5}" y="${Y(v) + 4}" text-anchor="end" class="ax">${Math.round(v)}</text>`;
  }
  [0, 25, 50, 75, 100].forEach((x) => (g += `<text x="${X(x)}" y="${H - B + 14}" text-anchor="middle" class="ax">${x}</text>`));
  g += `<text x="${(L + W - Rr) / 2}" y="${H - 4}" text-anchor="middle" class="ax">${chEsc(xLabel)}</text>`;
  series.forEach((s) => (g += `<line x1="${X(0)}" y1="${Y(s.y0)}" x2="${X(100)}" y2="${Y(s.y100)}" stroke="${s.color}" stroke-width="2.4"><title>${chEsc(s.name)}</title></line>`));
  if (mark.now != null) g += `<line x1="${X(mark.now)}" x2="${X(mark.now)}" y1="${T}" y2="${H - B}" class="mk"/><text x="${X(mark.now)}" y="${T + 10}" text-anchor="${mark.now > 70 ? "end" : "start"}" class="ax">현재 ${mark.now}</text>`;
  if (mark.flip != null) g += `<line x1="${X(mark.flip)}" x2="${X(mark.flip)}" y1="${T}" y2="${H - B}" stroke="#d9480f" stroke-width="1.6" stroke-dasharray="4 3"/><circle cx="${X(mark.flip)}" cy="${Y(mark.flipY)}" r="5" fill="#d9480f"/><text x="${X(mark.flip)}" y="${T + 24}" text-anchor="${mark.flip > 70 ? "end" : "start"}" class="ax" fill="#d9480f">역전 ${mark.flip}</text>`;
  return `<div class="chart">${title ? `<h4>${chEsc(title)}</h4>` : ""}<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${g}</svg>${legend(series)}</div>`;
}

// 진행 링
function ringChart(done, total, label) {
  const r = 44, c = 2 * Math.PI * r, p = total ? done / total : 0;
  return `<div class="chart ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${r}" class="rg" fill="none" stroke-width="10"/>
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--ok)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c * p} ${c}" transform="rotate(-90 60 60)"/>
    <text x="60" y="58" text-anchor="middle" class="big2">${done}/${total}</text><text x="60" y="76" text-anchor="middle" class="ax">${chEsc(label)}</text></svg></div>`;
}

// ---- 산출물용 차트(제목·축·단위·출처·조회일·강조 6요소를 모두 그린다) ----
// 막대(비교): spec = {title, xLabels[], series[{name,color,values[]}], xTitle, yTitle, unit, source, date, highlight:{xi, text}}
function axisBarChart(sp) {
  const compact = window.innerWidth <= 700; // 휴대전화 폭이면 좁은 비율로 다시 그려 글자 크기를 유지한다
  const W = compact ? 360 : 560, H = compact ? 380 : 330, L = compact ? 44 : 54, R = 10, T = 30, B = compact ? 112 : 84;
  const mx = Math.max(1, ...sp.series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const nice = (m) => { const p = Math.pow(10, Math.floor(Math.log10(m / 4))), f = m / 4 / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
  const step = Math.max(1, nice(mx));
  const top = Math.ceil(mx / step) * step;
  const n = sp.xLabels.length, gw = (W - L - R) / n, ns = sp.series.length, sw = Math.min(30, (gw * 0.72) / ns);
  const Y = (v) => T + (1 - v / top) * (H - T - B);
  let g = "";
  for (let v = 0; v <= top + 1e-9; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="rg"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" class="ax">${v}</text>`;
  sp.xLabels.forEach((lab, i) => {
    const cx = L + gw * i + gw / 2, hl = sp.highlight && sp.highlight.xi === i;
    sp.series.forEach((s, k) => {
      const v = s.values[i] ?? 0, x = cx - (sw * ns) / 2 + k * sw, y = Y(v);
      g += `<rect x="${x}" y="${y}" width="${sw - 2}" height="${Math.max(0, H - B - y)}" rx="4" fill="${s.color}" opacity="${sp.highlight && !hl ? 0.45 : 1}"${hl ? ' stroke="var(--fg)" stroke-width="2"' : ""}><title>${chEsc(s.name)} · ${chEsc(lab)}: ${v}${chEsc(sp.unit)}</title></rect>`;
      g += `<text x="${x + (sw - 2) / 2}" y="${y - 4}" text-anchor="middle" class="ax" ${hl ? 'font-weight="700" fill="var(--fg)"' : ""}>${v}</text>`;
    });
    g += `<text transform="translate(${cx},${H - B + 14}) rotate(${compact ? -45 : -28})" text-anchor="end" class="ax" ${hl ? 'font-weight="700" fill="var(--fg)"' : ""}>${chEsc(lab)}</text>`;
    if (hl) g += `<text x="${Math.min(Math.max(cx, L + 70), W - R - 70)}" y="${T - 12}" text-anchor="middle" class="ax" font-weight="700" fill="${CH[1]}">▼ ${chEsc(sp.highlight.text)}</text>`;
  });
  g += `<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="var(--mut)"/>`;
  g += `<text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle" class="ax">${chEsc(sp.xTitle)}</text>`;
  g += `<text transform="translate(12,${(T + H - B) / 2}) rotate(-90)" text-anchor="middle" class="ax">${chEsc(sp.yTitle)} (${chEsc(sp.unit)})</text>`;
  return `<figure class="fig"><h4 class="ct">${chEsc(sp.title)}</h4>${legend(sp.series)}<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${chEsc(sp.title)}">${g}</svg>
    <figcaption class="cap">출처: ${chEsc(sp.source)} · 조회일 ${chEsc(sp.date)}</figcaption></figure>`;
}

// 도넛(구성): spec = {title, parts[{label,value}], unit, source, date, highlightIndex}
function donutChart(sp) {
  const total = sp.parts.reduce((t, p) => t + p.value, 0);
  if (!total) return `<figure class="fig"><h4 class="ct">${chEsc(sp.title)}</h4><p class="empty">표시할 값이 없습니다(해당 지정 0건).</p><figcaption class="cap">출처: ${chEsc(sp.source)} · 조회일 ${chEsc(sp.date)}</figcaption></figure>`;
  const cx = 110, cy = 110, r = 74, w = 30;
  let a0 = -Math.PI / 2, g = "";
  sp.parts.forEach((p, i) => {
    const a1 = a0 + (p.value / total) * 2 * Math.PI, hl = i === sp.highlightIndex, mid = (a0 + a1) / 2, ox = hl ? Math.cos(mid) * 7 : 0, oy = hl ? Math.sin(mid) * 7 : 0;
    const pt = (rr, a) => [cx + ox + rr * Math.cos(a), cy + oy + rr * Math.sin(a)];
    const [x0, y0] = pt(r + w / 2, a0), [x1, y1] = pt(r + w / 2, a1 - (sp.parts.length > 1 ? 0.012 : 0.0001));
    g += `<path d="M${x0} ${y0} A${r + w / 2} ${r + w / 2} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}" fill="none" stroke="${CH[i % CH.length]}" stroke-width="${hl ? w + 6 : w}" opacity="${sp.highlightIndex != null && !hl ? 0.55 : 1}"><title>${chEsc(p.label)} ${p.value}${chEsc(sp.unit)} (${Math.round((p.value / total) * 100)}%)</title></path>`;
    a0 = a1;
  });
  g += `<text x="${cx}" y="${cy - 2}" text-anchor="middle" class="big2">${total}</text><text x="${cx}" y="${cy + 16}" text-anchor="middle" class="ax">합계 (${chEsc(sp.unit)})</text>`;
  const leg = sp.parts.map((p, i) => `<li${i === sp.highlightIndex ? ' class="hl"' : ""}><i style="background:${CH[i % CH.length]}"></i><span>${chEsc(p.label)}</span><b>${p.value}${chEsc(sp.unit)} · ${Math.round((p.value / total) * 100)}%</b></li>`).join("");
  return `<figure class="fig"><h4 class="ct">${chEsc(sp.title)}</h4><div class="donut"><svg viewBox="0 0 220 220" role="img" aria-label="${chEsc(sp.title)}">${g}</svg><ul class="dl">${leg}</ul></div>
    <figcaption class="cap">출처: ${chEsc(sp.source)} · 조회일 ${chEsc(sp.date)}</figcaption></figure>`;
}
