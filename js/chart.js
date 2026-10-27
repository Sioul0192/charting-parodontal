'use strict';
// Rendu du charting (tableaux + schéma SVG) et de l'hexagone PRA.

PC.chart = (() => {
  const CW = 64, H = 175, MM = 6;
  const SX = [14, 32, 50];
  const FURC = ['·', 'I', 'II', 'III'];

  function render(el, exam, cur) {
    el.innerHTML =
      `<div class="arch"><h3>Maxillaire</h3>${block(exam, 'U', 'V', false, cur)}${block(exam, 'U', 'O', true, cur)}</div>` +
      `<div class="arch"><h3>Mandibule</h3>${block(exam, 'L', 'O', false, cur)}${block(exam, 'L', 'V', true, cur)}</div>`;
  }

  function block(exam, arch, f, mirrored, cur) {
    const teeth = arch === 'U' ? PC.UPPER : PC.LOWER;
    const faceLabel = f === 'V' ? 'Vestibulaire' : (arch === 'U' ? 'Palatin' : 'Lingual');
    const isCur = t => cur && cur.t === t && cur.f === f;

    const row = (label, fn, cls = '', always = false) =>
      `<div class="row ${cls}"><div class="lab">${label}</div>` +
      teeth.map(t => {
        const th = exam.teeth[t];
        const c = ['cell', th.missing ? 'missing' : '', th.implant ? 'implant' : '', isCur(t) ? 'cur' : '', t === 11 || t === 41 ? 'midl' : ''].join(' ');
        return `<div class="${c}">${th.missing && !always ? '' : fn(t, th)}</div>`;
      }).join('') + '</div>';

    const tri = k => (t, th) => {
      const fc = th[f];
      return `<div class="tri">` + [0, 1, 2].map(i => {
        const v = k === 'gm' ? PC.gmShow(fc.gm[i]) : (fc[k][i] ?? '');
        const act = isCur(t) && cur.pass === 1 && cur.sub === k && cur.siteIdx === i ? ' act' : '';
        const hi = k === 'pd' && fc.pd[i] >= 4 ? ' hi' : '';
        return `<input class="v ${k}${act}${hi}" data-t="${t}" data-f="${f}" data-k="${k}" data-i="${i}" value="${v}" inputmode="numeric" autocomplete="off">`;
      }).join('') + '</div>';
    };
    const dots = k => (t, th) => `<div class="tri">` + [0, 1, 2].map(i =>
      `<button class="dot ${k}${th[f][k][i] ? ' on' : ''}${isCur(t) && cur.pass === 2 ? ' act' : ''}" data-action="dot" data-t="${t}" data-f="${f}" data-k="${k}" data-i="${i}" tabindex="-1"></button>`).join('') + '</div>';
    const calCells = (t, th) => `<div class="tri">` + [0, 1, 2].map(i => {
      const c = PC.cal(th[f].pd[i], th[f].gm[i]);
      return `<span class="calv${c >= 5 ? ' hi' : ''}" id="cal-${t}-${f}-${i}">${c ?? ''}</span>`;
    }).join('') + '</div>';
    const FURC_SITE = { V: 'vestibulaire', L: 'linguale', MP: 'mésio-palatine', DP: 'disto-palatine' };
    const furcBtn = (t, k, v) => `<button class="furc f${v}${isCur(t) && cur.furcKey === k ? ' act' : ''}" data-action="furc" data-t="${t}" data-k="${k}" title="Furcation ${FURC_SITE[k]} ${v ? PC.ROMAN[v] : '0'} (Hamp) : ${PC.FURCATION[v]}">${FURC[v]}</button>`;

    const rows = [];
    rows.push(row('Dent', t => `<button class="tnum" data-action="goto" data-t="${t}" data-f="${f}">${t}</button>`, 'r-num', true));
    if (f === 'V') {
      rows.push(row('État', (t, th) => `<button class="state" data-action="state" data-t="${t}">${th.missing ? 'absente' : th.implant ? 'implant' : '·'}</button>`, 'r-state', true));
      rows.push(row('Mobilité <span class="info" title="Classification de Miller (1950)&#10;0 : physiologique&#10;1 : horizontale ≤ 1 mm&#10;2 : horizontale > 1 mm&#10;3 : horizontale et verticale (dent dépressible)">ⓘ</span>', (t, th) =>
        `<button class="mob m${th.mob}" data-action="mob" data-t="${t}" title="Mobilité ${th.mob} (Miller) : ${PC.MOBILITY[th.mob]}">${th.mob || '·'}</button>`));
    }
    rows.push(row('Furcation <span class="info" title="Classification de Hamp (1975), molaires uniquement&#10;0 : pas d\'atteinte&#10;I : perte horizontale &lt; 3 mm&#10;II : perte horizontale ≥ 3 mm, non traversante&#10;III : lésion traversante (de part en part)">ⓘ</span>', (t, th) => {
      if (!th.furc) return '';
      if (f === 'V') return furcBtn(t, 'V', th.furc.V);
      if (arch === 'L') return furcBtn(t, 'L', th.furc.L);
      const ks = PC.distalLeft(t) ? ['DP', 'MP'] : ['MP', 'DP'];
      return `<div class="duo">${ks.map(k => furcBtn(t, k, th.furc[k])).join('')}</div>`;
    }));
    rows.push(row('Saignement', dots('bop'), 'r-dots'));
    rows.push(row('Suppuration', dots('sup'), 'r-dots'));
    rows.push(row('Plaque', dots('pl'), 'r-dots'));
    if (f === 'V') rows.push(row('Gencive kér.', (t, th) =>
      `<input class="v kg" data-t="${t}" data-f="V" data-k="kg" value="${th.kg ?? ''}" inputmode="numeric" autocomplete="off">`));
    rows.push(row(PC.gmLabel(), tri('gm'), 'r-gm'));
    rows.push(row('Profondeur', tri('pd'), 'r-pd'));
    rows.push(row('Niveau d\'attache', calCells, 'r-cal'));
    if (mirrored) rows.reverse();

    const g = `<div class="row r-svg"><div class="lab">${faceLabel}</div><div class="svgwrap" id="g-${arch}${f}">${graph(exam, arch, f, cur)}</div></div>`;
    return `<div class="block">${mirrored ? g + rows.join('') : rows.join('') + g}</div>`;
  }

  // Schéma : JEC = ligne de référence, apical vers le haut au maxillaire et vers le bas à la mandibule.
  function graph(exam, arch, f, cur) {
    const teeth = arch === 'U' ? PC.UPPER : PC.LOWER;
    const up = arch === 'U';
    const cej = up ? 105 : 70, ap = up ? -1 : 1;
    const Y = a => cej + ap * a;
    const W = CW * 16;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="graph">`;
    if (cur && cur.f === f && teeth.includes(cur.t)) s += `<rect x="${teeth.indexOf(cur.t) * CW}" y="0" width="${CW}" height="${H}" class="hl"/>`;
    teeth.forEach((t, k) => {
      const th = exam.teeth[t];
      if (!th.missing) s += toothSVG(t, k * CW + CW / 2, Y, f, th.implant);
    });
    for (let mm = -4; mm <= 14; mm++) {
      const y = Y(mm * MM).toFixed(1);
      s += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" class="${mm === 0 ? 'cej' : mm % 5 === 0 ? 'grid5' : 'grid'}"/>`;
    }
    s += `<line x1="${W / 2}" x2="${W / 2}" y1="0" y2="${H}" class="mid"/>`;

    const segs = [];
    let seg = null;
    teeth.forEach((t, k) => {
      const th = exam.teeth[t], fc = th[f];
      for (let i = 0; i < 3; i++) {
        if (th.missing || (fc.pd[i] == null && fc.gm[i] == null)) { seg = null; continue; }
        if (!seg) { seg = []; segs.push(seg); }
        seg.push({ x: k * CW + SX[i], gm: fc.gm[i] ?? 0, pd: fc.pd[i], bop: fc.bop[i] });
      }
      if (th.missing) seg = null;
    });
    const pts = a => a.map(p => `${p[0]},${p[1].toFixed(1)}`).join(' ');
    for (const sg of segs) {
      const m = sg.map(p => [p.x, Y(-p.gm * MM)]);
      const b = sg.map(p => [p.x, Y((-p.gm + (p.pd ?? 0)) * MM)]);
      s += `<polygon points="${pts(m)} ${pts(b.slice().reverse())}" class="pocket"/>`;
      s += `<polyline points="${pts(m)}" class="gmline"/>`;
      if (sg.some(p => p.pd != null)) s += `<polyline points="${pts(b)}" class="pdline"/>`;
      sg.forEach((p, j) => { if (p.bop) s += `<circle cx="${b[j][0]}" cy="${b[j][1].toFixed(1)}" r="3" class="bopdot"/>`; });
    }
    return s + '</svg>';
  }

  function toothSVG(t, cx, Y, f, implant) {
    const type = PC.toothType(t), up = PC.isUpper(t);
    const w = { molar: 50, premolar: 38, canine: 36, incisor: up ? 36 : 28 }[type];
    const h = w / 2;
    const ch = type === 'molar' ? 44 : 52;
    const P = (u, a) => `${(cx + u).toFixed(1)},${Y(a).toFixed(1)}`;
    const crown = `M ${P(-h + 3, 0)} L ${P(-h, -ch * 0.45)} Q ${P(-h + 1, -ch)} ${P(0, -ch)} Q ${P(h - 1, -ch)} ${P(h, -ch * 0.45)} L ${P(h - 3, 0)}`;
    if (implant) {
      let s = `<path d="${crown} Z" class="tooth"/>`;
      s += `<path d="M ${P(-8, 0)} L ${P(-8, 70)} L ${P(-4, 78)} L ${P(4, 78)} L ${P(8, 70)} L ${P(8, 0)} Z" class="implantbody"/>`;
      for (let a = 8; a < 72; a += 8) s += `<line x1="${cx - 8}" x2="${cx + 8}" y1="${Y(a).toFixed(1)}" y2="${Y(a + 3).toFixed(1)}" class="thread"/>`;
      return s;
    }
    let root;
    if (type === 'molar' && !(up && f === 'O')) {
      root = `L ${P(h - 4, 40)} L ${P(h - 10, 80)} L ${P(h - 18, 80)} L ${P(0, 26)} L ${P(-(h - 18), 80)} L ${P(-(h - 10), 80)} L ${P(-(h - 4), 40)} Z`;
    } else {
      const rw = type === 'molar' ? h - 2 : h * 0.6;
      root = `L ${P(rw, 40)} L ${P(3, 86)} L ${P(-3, 86)} L ${P(-rw, 40)} Z`;
    }
    return `<path d="${crown} ${root}" class="tooth"/>`;
  }

  // Mise à jour légère après saisie clavier (sans perdre le focus).
  function refreshFace(exam, t, f, cur) {
    const arch = PC.isUpper(t) ? 'U' : 'L';
    const el = document.getElementById(`g-${arch}${f}`);
    if (el) el.innerHTML = graph(exam, arch, f, cur);
    const fc = exam.teeth[t][f];
    for (let i = 0; i < 3; i++) {
      const sp = document.getElementById(`cal-${t}-${f}-${i}`);
      if (!sp) continue;
      const c = PC.cal(fc.pd[i], fc.gm[i]);
      sp.textContent = c ?? '';
      sp.classList.toggle('hi', c >= 5);
    }
  }

  function praSVG(pra) {
    const SW = 600, SH = 420, c = SW / 2, cy = SH / 2, R = 125;
    const ang = k => (-90 + k * 60) * Math.PI / 180;
    const pt = (k, r) => [c + r * Math.cos(ang(k)), cy + r * Math.sin(ang(k))];
    const poly = r => [0, 1, 2, 3, 4, 5].map(k => pt(k, r).map(v => v.toFixed(1)).join(',')).join(' ');
    let s = `<svg viewBox="0 0 ${SW} ${SH}" class="pra" role="img" aria-label="Diagramme PRA">`;
    s += `<polygon points="${poly(R)}" class="z-high"/><polygon points="${poly(R * 4 / 5)}" class="z-mod"/><polygon points="${poly(R * 2 / 5)}" class="z-low"/>`;
    for (let p = 1; p <= 5; p++) s += `<polygon points="${poly(R * p / 5)}" class="ring"/>`;
    pra.axes.forEach((a, k) => {
      const [x, y] = pt(k, R);
      s += `<line x1="${c}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="axis"/>`;
      a.labels.forEach((lb, j) => {
        if (!lb) return;
        const [tx, ty] = pt(k, R * (j + 1) / 5);
        s += `<text x="${(tx + 4).toFixed(1)}" y="${(ty - 3).toFixed(1)}" class="tick">${PC.esc(lb)}</text>`;
      });
      const [lx, ly] = pt(k, R + (k === 0 ? 48 : k === 3 ? 24 : 30));
      const anchor = Math.abs(lx - c) < 5 ? 'middle' : lx > c ? 'start' : 'end';
      s += `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${anchor}" class="alabel">${PC.esc(a.label)}</text>`;
      s += `<text x="${lx.toFixed(1)}" y="${(ly + 19).toFixed(1)}" text-anchor="${anchor}" class="avalue ${a.lvl || ''}">${PC.esc(a.display)}</text>`;
    });
    const pp = pra.axes.map((a, k) => pt(k, R * Math.max(a.pos ?? 0, 0.08) / 5));
    s += `<polygon points="${pp.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" class="patient"/>`;
    pp.forEach(p => { s += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" class="pdot"/>`; });
    return s + '</svg>';
  }

  return { render, refreshFace, praSVG };
})();
