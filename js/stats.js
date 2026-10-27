'use strict';
// Indices, aide au diagnostic (classification 2018) et PRA (Lang & Tonetti 2003).

PC.ROMAN = ['0', 'I', 'II', 'III', 'IV'];

PC.toothInterCAL = th => {
  let m = null;
  for (const f of ['V', 'O']) for (const i of [0, 2]) {
    const c = PC.cal(th[f].pd[i], th[f].gm[i]);
    if (c != null && (m == null || c > m)) m = c;
  }
  return m;
};
PC.toothMaxPD = th => {
  let m = null;
  for (const f of ['V', 'O']) for (const v of th[f].pd) if (v != null && (m == null || v > m)) m = v;
  return m;
};
PC.furcMax = th => th.furc ? Math.max(...Object.values(th.furc)) : 0;
PC.naturalTeeth = exam => PC.ALL.filter(t => !exam.teeth[t].missing && !exam.teeth[t].implant);

// Indices calculés sur les dents naturelles (implants exclus).
PC.stats = exam => {
  const s = {
    teeth: 0, implants: 0, missing: 0, lost28: 0, sites: 0, measured: 0,
    pdSum: 0, calSum: 0, calN: 0, bop: 0, pl: 0, sup: 0,
    pd4: 0, pd5: 0, pd6: 0, maxPD: 0, maxInterCAL: 0, furcMax: 0, mobMax: 0
  };
  for (const t of PC.ALL) {
    const th = exam.teeth[t];
    if (th.missing) { s.missing++; if (!PC.isWisdom(t)) s.lost28++; continue; }
    if (th.implant) { s.implants++; if (!PC.isWisdom(t)) s.lost28++; continue; }
    s.teeth++;
    s.mobMax = Math.max(s.mobMax, th.mob || 0);
    s.furcMax = Math.max(s.furcMax, PC.furcMax(th));
    for (const f of ['V', 'O']) {
      const fc = th[f];
      for (let i = 0; i < 3; i++) {
        s.sites++;
        if (fc.bop[i]) s.bop++;
        if (fc.pl[i]) s.pl++;
        if (fc.sup[i]) s.sup++;
        const pd = fc.pd[i];
        if (pd != null) {
          s.measured++; s.pdSum += pd;
          if (pd >= 4) s.pd4++;
          if (pd >= 5) s.pd5++;
          if (pd >= 6) s.pd6++;
          s.maxPD = Math.max(s.maxPD, pd);
          const c = PC.cal(pd, fc.gm[i]);
          s.calSum += c; s.calN++;
          if (i !== 1) s.maxInterCAL = Math.max(s.maxInterCAL, c);
        }
      }
    }
  }
  s.meanPD = s.measured ? s.pdSum / s.measured : null;
  s.meanCAL = s.calN ? s.calSum / s.calN : null;
  s.bopPct = s.sites ? 100 * s.bop / s.sites : 0;
  s.plPct = s.sites ? 100 * s.pl / s.sites : 0;
  return s;
};

// ---------- Aide au diagnostic : classification AAP/EFP 2018 ----------
PC.diagnose = (exam, patient) => {
  const s = PC.stats(exam), d = exam.diag, age = PC.ageOf(patient, exam);
  const R = PC.ROMAN, G = ['A', 'B', 'C'];
  const out = { s, age, trace: [], gtrace: [], isCase: false };
  const num = v => v == null || v === '' ? null : +v;
  if (!s.measured) { out.title = 'Charting non renseigné'; return out; }

  // Définition d'un cas de parodontite
  const nat = PC.naturalTeeth(exam);
  const archIdx = t => (PC.isUpper(t) ? PC.UPPER : PC.LOWER).indexOf(t);
  const interTeeth = nat.filter(t => (PC.toothInterCAL(exam.teeth[t]) ?? 0) >= 1);
  let nonAdj = false;
  for (const a of interTeeth) for (const b of interTeeth) {
    if (a < b && (PC.isUpper(a) !== PC.isUpper(b) || Math.abs(archIdx(a) - archIdx(b)) > 1)) nonAdj = true;
  }
  const buccalTeeth = nat.filter(t => ['V', 'O'].some(f => {
    const fc = exam.teeth[t][f], pd = fc.pd[1];
    return pd != null && pd > 3 && PC.cal(pd, fc.gm[1]) >= 3;
  }));
  out.isCase = nonAdj || buccalTeeth.length >= 2;
  out.trace.push(`CAL interdentaire ≥ 1 mm sur ${interTeeth.length} dent(s)${nonAdj ? ' (dont non adjacentes)' : ''} ; CAL vestibulaire/oral ≥ 3 mm avec PD > 3 mm sur ${buccalTeeth.length} dent(s).`);
  if (!out.isCase) {
    out.title = s.bopPct >= 10 ? 'Gingivite — critères de cas de parodontite non remplis' : 'Santé parodontale clinique — critères de cas de parodontite non remplis';
    out.trace.push(`Saignement au sondage : ${PC.fmt(s.bopPct)} % (gingivite si ≥ 10 %).`);
    return out;
  }

  // Stade : sévérité
  const cal = s.maxInterCAL;
  let stage = cal >= 5 ? 3 : cal >= 3 ? 2 : 1;
  out.trace.push(`CAL interdentaire maximal ${cal} mm → stade ${cal >= 5 ? 'III/IV' : R[stage]}`);
  const rbl = num(d.rbl);
  if (rbl != null) {
    const st = rbl > 33 ? 3 : rbl >= 15 ? 2 : 1;
    out.trace.push(`Alvéolyse radiographique ${rbl} % → stade ${st === 3 ? 'III/IV' : R[st]}`);
    stage = Math.max(stage, st);
  } else out.trace.push('Alvéolyse radiographique non renseignée');
  const tl = num(d.perioLoss);
  if (tl == null) out.trace.push(`Dents perdues pour raison parodontale non renseignées (${s.lost28} absente(s)/implant(s) hors dents de sagesse)`);
  else if (tl >= 5) { stage = Math.max(stage, 4); out.trace.push(`${tl} dents perdues pour raison parodontale (≥ 5) → stade IV`); }
  else if (tl >= 1) { stage = Math.max(stage, 3); out.trace.push(`${tl} dent(s) perdue(s) pour raison parodontale (≤ 4) → stade III`); }
  else out.trace.push('Aucune dent perdue pour raison parodontale');

  // Stade : complexité
  if (s.maxPD >= 6) { stage = Math.max(stage, 3); out.trace.push(`Profondeur maximale ${s.maxPD} mm (≥ 6) → complexité stade III`); }
  else if (s.maxPD === 5) { stage = Math.max(stage, 2); out.trace.push('Profondeur maximale 5 mm → complexité stade II'); }
  else out.trace.push(`Profondeur maximale ${s.maxPD} mm (≤ 4)`);
  if (d.vertical) { stage = Math.max(stage, 3); out.trace.push('Lésion(s) angulaire(s) ≥ 3 mm → stade III'); }
  if (s.furcMax >= 2) { stage = Math.max(stage, 3); out.trace.push(`Furcation classe ${R[s.furcMax]} → stade III`); }
  if (d.ridge === 'moderate') { stage = Math.max(stage, 3); out.trace.push('Défaut de crête modéré → stade III'); }
  const iv = [];
  if (d.masticatory) iv.push('dysfonction masticatoire');
  if (d.occlTrauma) iv.push('trauma occlusal secondaire');
  else if (s.mobMax >= 2) iv.push(`mobilité ${s.mobMax} (trauma occlusal secondaire ?)`);
  if (d.ridge === 'severe') iv.push('défaut de crête sévère');
  if (d.collapse) iv.push('effondrement occlusal, migrations, égressions');
  if (s.teeth < 20) iv.push(`${s.teeth} dents restantes (< 20)`);
  if (d.fewPairs) iv.push('moins de 10 paires antagonistes');
  if (iv.length) {
    if (stage >= 3) { stage = 4; out.trace.push(`Besoin de réhabilitation complexe : ${iv.join(', ')} → stade IV`); }
    else out.trace.push(`Facteurs de stade IV présents (${iv.join(', ')}) mais sévérité < III : à apprécier cliniquement`);
  }
  out.stage = stage;

  // Étendue : dents atteintes au niveau de sévérité définissant le stade
  const thr = stage >= 3 ? 5 : stage === 2 ? 3 : 1;
  const inv = nat.filter(t => (PC.toothInterCAL(exam.teeth[t]) ?? 0) >= thr);
  const pct = nat.length ? 100 * inv.length / nat.length : 0;
  const MI = [16, 26, 36, 46, 11, 12, 21, 22, 31, 32, 41, 42];
  let extent = pct >= 30 ? 'généralisée' : 'localisée';
  if (inv.length && inv.every(t => MI.includes(t)) && inv.some(t => PC.isMolar(t))) extent = 'forme molaires/incisives';
  out.extent = extent;
  out.trace.push(`${inv.length}/${nat.length} dents (${PC.fmt(pct, 0)} %) avec CAL interdentaire ≥ ${thr} mm → ${extent}`);

  // Grade
  let g = null;
  if (d.direct && d.direct !== 'na') {
    g = { none: 0, lt2: 1, ge2: 2 }[d.direct];
    out.gtrace.push(`Preuve directe sur 5 ans (${{ none: 'aucune perte', lt2: 'perte < 2 mm', ge2: 'perte ≥ 2 mm' }[d.direct]}) → grade ${G[g]}`);
  } else if (rbl != null && age) {
    const ratio = rbl / age;
    g = ratio < 0.25 ? 0 : ratio <= 1 ? 1 : 2;
    out.gtrace.push(`% alvéolyse / âge = ${rbl} / ${age} = ${PC.fmt(ratio, 2)} → grade ${G[g]}`);
  }
  if (d.phenotype === 'high') { g = 2; out.gtrace.push('Destruction disproportionnée par rapport au biofilm → grade C'); }
  else if (d.phenotype === 'low' && g == null) { g = 0; out.gtrace.push('Biofilm abondant avec faible destruction → grade A'); }
  if (g == null) { g = 1; out.gtrace.push('Pas de preuve de progression disponible → grade B par défaut'); }
  if (d.smoking === 'lt10' && g < 1) { g = 1; out.gtrace.push('Tabac < 10 cig./j → grade B minimum'); }
  if ((d.smoking === '10to19' || d.smoking === 'ge20') && g < 2) { g = 2; out.gtrace.push('Tabac ≥ 10 cig./j → grade C'); }
  if (d.diabetes === 'lt7' && g < 1) { g = 1; out.gtrace.push('Diabète HbA1c < 7 % → grade B minimum'); }
  if (d.diabetes === 'ge7' && g < 2) { g = 2; out.gtrace.push('Diabète HbA1c ≥ 7 % → grade C'); }
  out.grade = G[g];
  out.title = `Parodontite stade ${R[stage]}, ${extent}, grade ${G[g]}`;
  return out;
};

// ---------- PRA : évaluation du risque parodontal ----------
PC.PRA_AXES = [
  { key: 'bop', label: 'Saignement (%)', ticks: [0, 4, 9, 16, 25, 36], labels: ['4', '9', '16', '25', '36'],
    level: v => v < 10 ? 'low' : v <= 25 ? 'mod' : 'high' },
  { key: 'pd5', label: 'Poches ≥ 5 mm', ticks: [0, 2, 4, 6, 8, 10], labels: ['2', '4', '6', '8', '10'],
    level: v => v <= 4 ? 'low' : v <= 8 ? 'mod' : 'high' },
  { key: 'tl', label: 'Dents perdues (/28)', ticks: [0, 2, 4, 6, 8, 10], labels: ['2', '4', '6', '8', '10'],
    level: v => v <= 4 ? 'low' : v <= 8 ? 'mod' : 'high' },
  { key: 'bla', label: 'Alvéolyse / âge', ticks: [0, 0.25, 0.5, 0.75, 1, 1.25], labels: ['0,25', '0,5', '0,75', '1', '1,25'],
    level: v => v <= 0.5 ? 'low' : v <= 1 ? 'mod' : 'high' },
  { key: 'sys', label: 'Systémique / génétique', ticks: [0, 1, 2, 3, 4, 5], labels: ['', '', '', '', 'oui'],
    level: v => v ? 'high' : 'low' },
  { key: 'env', label: 'Tabac', ticks: [0, 1, 2, 3, 4, 5], labels: ['ancien', '', '< 10', '10-19', '≥ 20'],
    level: v => v <= 1 ? 'low' : v <= 4 ? 'mod' : 'high' }
];

PC.praPos = (v, ticks) => {
  if (v == null) return null;
  if (v >= ticks[5]) return 5;
  for (let k = 0; k < 5; k++) if (v <= ticks[k + 1]) return k + (v - ticks[k]) / (ticks[k + 1] - ticks[k]);
  return 5;
};

PC.pra = (exam, patient) => {
  const s = PC.stats(exam), d = exam.diag, age = PC.ageOf(patient, exam);
  const rbl = d.rbl == null || d.rbl === '' ? null : +d.rbl;
  const sys = !!d.systemic || d.diabetes !== 'none';
  const env = { never: 0, former: 1, lt10: 3, '10to19': 4, ge20: 5 }[d.smoking] ?? 0;
  const vals = {
    bop: s.bopPct, pd5: s.pd5, tl: s.lost28,
    bla: rbl != null && age ? rbl / age : null,
    sys: sys ? 5 : 0, env
  };
  const shown = {
    bop: PC.fmt(s.bopPct, 0) + ' %', pd5: String(s.pd5), tl: String(s.lost28),
    bla: vals.bla == null ? 'non renseigné' : PC.fmt(vals.bla, 2),
    sys: sys ? 'présent' + (d.diabetes !== 'none' ? ' (diabète)' : '') : 'absent',
    env: { never: 'non-fumeur', former: 'ancien fumeur (> 5 ans)', lt10: '< 10 cig./j', '10to19': '10-19 cig./j', ge20: '≥ 20 cig./j' }[d.smoking]
  };
  const axes = PC.PRA_AXES.map(a => {
    const v = vals[a.key];
    return { ...a, value: v, display: shown[a.key], pos: PC.praPos(v, a.ticks), lvl: v == null ? null : a.level(v) };
  });
  const highs = axes.filter(a => a.lvl === 'high').length, mods = axes.filter(a => a.lvl === 'mod').length;
  const risk = highs >= 2 ? 'high' : (mods >= 2 || highs === 1) ? 'mod' : 'low';
  return { axes, risk, highs, mods };
};
