'use strict';
// Modèle de données, stockage local et utilitaires communs.
const PC = window.PC = {};

// Ordre d'affichage (gauche = droite du patient), comme sur le charting de Berne.
PC.UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
PC.LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
PC.ALL = PC.UPPER.concat(PC.LOWER);

PC.isUpper = t => t < 30;
PC.isMolar = t => t % 10 >= 6;
PC.isWisdom = t => t % 10 === 8;
PC.isValidTooth = n => { const q = Math.floor(n / 10), u = n % 10; return q >= 1 && q <= 4 && u >= 1 && u <= 8; };
PC.toothType = t => { const u = t % 10; return u >= 6 ? 'molar' : u >= 4 ? 'premolar' : u === 3 ? 'canine' : 'incisor'; };
// Quadrants 1 et 4 : la face distale est à gauche à l'écran.
PC.distalLeft = t => { const q = Math.floor(t / 10); return q === 1 || q === 4; };
PC.faceName = (t, f) => f === 'V' ? 'vestibulaire' : (PC.isUpper(t) ? 'palatin' : 'lingual');
PC.faceShort = (t, f) => f === 'V' ? 'V' : (PC.isUpper(t) ? 'P' : 'L');
// Lettres des 3 sites dans l'ordre d'affichage (index 0, 1, 2).
PC.siteLetters = t => PC.distalLeft(t) ? ['D', 'C', 'M'] : ['M', 'C', 'D'];
PC.siteIndex = (t, letter) => letter === 'C' ? 1 : ((letter === 'D') === PC.distalLeft(t) ? 0 : 2);

PC.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
PC.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
PC.fmt = (n, d = 1) => n == null || isNaN(n) ? '–' : Number(n).toFixed(d).replace('.', ',');
PC.fmtDate = iso => iso ? iso.split('-').reverse().join('/') : '';

// Mobilité dentaire : classification de Miller (1950), comme sur le charting de Berne.
PC.MOBILITY = [
  'physiologique',
  'mobilité horizontale augmentée, ≤ 1 mm',
  'mobilité horizontale > 1 mm',
  'mobilité horizontale et verticale (dent dépressible)'
];

// Atteinte de furcation : classification de Hamp (1975).
PC.FURCATION = [
  'pas d\'atteinte',
  'perte horizontale < 3 mm',
  'perte horizontale ≥ 3 mm, non traversante',
  'lésion traversante (de part en part)'
];

PC.newFace = () => ({
  pd: [null, null, null], gm: [null, null, null],
  bop: [false, false, false], sup: [false, false, false], pl: [false, false, false]
});

// Furcations : molaires uniquement. Maxillaire : V, mésio-palatine, disto-palatine. Mandibule : V, L.
PC.newTooth = t => ({
  missing: false, implant: false, mob: 0, kg: null,
  furc: PC.isMolar(t) ? (PC.isUpper(t) ? { V: 0, MP: 0, DP: 0 } : { V: 0, L: 0 }) : null,
  V: PC.newFace(), O: PC.newFace()
});

PC.newDiag = () => ({
  age: null, rbl: null, perioLoss: null,
  vertical: false, ridge: 'none', masticatory: false, occlTrauma: false, collapse: false, fewPairs: false,
  direct: 'na', phenotype: 'normal', smoking: 'never', diabetes: 'none', systemic: false, notes: ''
});

PC.newExam = (prev, wisdomMissing) => {
  const e = { id: PC.uid(), date: new Date().toISOString().slice(0, 10), teeth: {}, diag: PC.newDiag() };
  for (const t of PC.ALL) {
    const th = PC.newTooth(t);
    if (prev) { th.missing = prev.teeth[t].missing; th.implant = prev.teeth[t].implant; }
    else if (wisdomMissing && PC.isWisdom(t)) th.missing = true;
    e.teeth[t] = th;
  }
  if (prev) for (const k of ['smoking', 'diabetes', 'systemic']) e.diag[k] = prev.diag[k];
  return e;
};

// ---------- Stockage (localStorage, uniquement sur cet appareil) ----------
PC.KEY = 'charting-parodontal-v1';
PC.DEFAULT_SETTINGS = {
  order: 'arcadeA',     // arcadeA | arcadeB | dent
  valueOrder: 'travel', // travel (sens du déplacement) | dcm (toujours D-C-M)
  gmConv: 'bern',       // bern (négatif = récession) | recession (récession positive)
  gmMode: 'dictate',    // dictate | skip (marge à 0 par défaut)
  askFurc: true,        // demander la furcation des molaires au passage 1
  autoPass2: true,      // enchaîner sur le passage 2 à la fin du passage 1
  speak: true,
  beep: true
};
PC.db = { patients: [], settings: Object.assign({}, PC.DEFAULT_SETTINGS), current: { patientId: null, examId: null } };

PC.load = () => {
  try {
    const raw = localStorage.getItem(PC.KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    PC.db.patients = d.patients || [];
    Object.assign(PC.db.settings, d.settings || {});
    PC.db.current = d.current || PC.db.current;
  } catch (e) { console.warn('Lecture impossible', e); }
};
PC.save = () => {
  try { localStorage.setItem(PC.KEY, JSON.stringify(PC.db)); } catch (e) { console.warn('Sauvegarde impossible', e); }
};

PC.patient = () => PC.db.patients.find(p => p.id === PC.db.current.patientId) || null;
PC.exam = () => { const p = PC.patient(); return p ? p.exams.find(e => e.id === PC.db.current.examId) || null : null; };

PC.addPatient = (nom, prenom, birth) => {
  const p = { id: PC.uid(), nom, prenom, birth, exams: [] };
  PC.db.patients.push(p);
  return p;
};
PC.addExam = (p, wisdomMissing) => {
  const sorted = p.exams.slice().sort((a, b) => a.date.localeCompare(b.date));
  const e = PC.newExam(sorted[sorted.length - 1], wisdomMissing);
  p.exams.push(e);
  PC.db.current = { patientId: p.id, examId: e.id };
  PC.save();
  return e;
};

PC.ageOf = (p, exam) => {
  if (exam.diag.age != null && exam.diag.age !== '') return +exam.diag.age;
  if (!p || !p.birth) return null;
  const b = new Date(p.birth), d = new Date(exam.date);
  let a = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) a--;
  return a;
};

// Convention de Berne : marge = distance JEC → bord gingival, négative en cas de récession. CAL = PD − marge.
PC.cal = (pd, gm) => pd == null ? null : pd - (gm || 0);
PC.gmShow = v => v == null ? '' : (PC.db.settings.gmConv === 'recession' ? (v === 0 ? 0 : -v) : v);
PC.gmStore = v => v == null ? null : (PC.db.settings.gmConv === 'recession' ? (v === 0 ? 0 : -v) : v);
PC.gmLabel = () => PC.db.settings.gmConv === 'recession' ? 'Récession' : 'Marge gingivale';
