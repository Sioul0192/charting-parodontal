'use strict';
// Données de démonstration pour tester l'application (patient fictif, réévaluation simulée).

PC.demo = (() => {
  // Générateur pseudo-aléatoire reproductible
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  const addMonths = (iso, m) => { const d = new Date(iso); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10); };

  // Examen initial : parodontite généralisée, plus marquée sur les molaires.
  function initialExam(r) {
    const e = PC.newExam(null, true);
    e.date = addMonths(new Date().toISOString().slice(0, 10), -3);
    e.teeth[36].missing = true;
    e.teeth[46].implant = true;
    for (const t of PC.ALL) {
      const th = e.teeth[t];
      if (th.missing) continue;
      const molar = PC.isMolar(t), sev = molar ? 2 : (t % 10 <= 2 ? 1 : 0);
      for (const f of ['V', 'O']) {
        const fc = th[f];
        for (let i = 0; i < 3; i++) {
          const inter = i !== 1;
          let pd = (inter ? 3 : 2) + Math.floor(r() * (2 + sev)) + (inter && r() < 0.3 * sev ? 1 : 0);
          if (th.implant) pd = 3 + Math.floor(r() * 2);
          fc.pd[i] = Math.min(pd, 9);
          fc.gm[i] = r() < 0.25 + 0.1 * sev ? -(1 + Math.floor(r() * 2)) : 0;
          fc.bop[i] = r() < 0.25 + 0.12 * fc.pd[i] / 3;
          fc.sup[i] = fc.pd[i] >= 6 && r() < 0.3;
          fc.pl[i] = r() < 0.55;
        }
      }
      if (!th.implant) {
        th.mob = molar && r() < 0.3 ? 1 : (t % 10 <= 2 && r() < 0.2 ? 1 : 0);
        th.kg = 2 + Math.floor(r() * 4);
      }
      if (th.furc && !th.implant) for (const k of Object.keys(th.furc)) th.furc[k] = r() < 0.45 ? 1 + Math.floor(r() * 2) : 0;
    }
    Object.assign(e.diag, { rbl: 40, perioLoss: 1, vertical: true, smoking: '10to19', diabetes: 'none', notes: 'Examen initial de démonstration' });
    return e;
  }

  // Réévaluation : réduction des poches, gain d'attache partiel, moins de saignement et de plaque,
  // quelques sites qui ne répondent pas ou s'aggravent.
  function reevaluation(prev, r) {
    const e = JSON.parse(JSON.stringify(prev));
    e.id = PC.uid();
    e.date = addMonths(prev.date, 3);
    for (const t of PC.ALL) {
      const th = e.teeth[t];
      if (th.missing) continue;
      for (const f of ['V', 'O']) {
        const fc = th[f];
        for (let i = 0; i < 3; i++) {
          const pd = fc.pd[i];
          if (pd == null) continue;
          const x = r();
          let gain = 0;
          if (pd >= 6) gain = x < 0.1 ? 0 : x < 0.5 ? 2 : 3;
          else if (pd >= 4) gain = x < 0.15 ? 0 : x < 0.65 ? 1 : 2;
          else gain = x < 0.5 ? 0 : 1;
          if (x > 0.97) gain = -1; // site qui s'aggrave
          const newPd = Math.max(1, pd - gain);
          // Une partie de la réduction vient de la rétraction gingivale.
          const shrink = gain >= 2 && r() < 0.6 ? 1 : 0;
          fc.pd[i] = newPd;
          fc.gm[i] = (fc.gm[i] || 0) - shrink;
          fc.bop[i] = fc.bop[i] ? r() < (newPd >= 5 ? 0.6 : 0.2) : r() < 0.05;
          fc.sup[i] = fc.sup[i] && newPd >= 5 && r() < 0.3;
          fc.pl[i] = r() < 0.15;
        }
      }
      if (th.mob && r() < 0.5) th.mob--;
    }
    e.diag.smoking = prev.diag.smoking === '10to19' ? 'lt10' : prev.diag.smoking;
    e.diag.notes = 'Réévaluation simulée (test)';
    return e;
  }

  function createDemoPatient() {
    const r = rng(20261027);
    const p = PC.addPatient('Démo', 'Réévaluation', '1972-03-15');
    const e1 = initialExam(r);
    const e2 = reevaluation(e1, r);
    p.exams.push(e1, e2);
    PC.db.current = { patientId: p.id, examId: e2.id };
    PC.save();
    return p;
  }

  function simulateReevaluation(p) {
    const sorted = p.exams.slice().sort((a, b) => a.date.localeCompare(b.date));
    const e = reevaluation(sorted[sorted.length - 1], rng(Date.now()));
    p.exams.push(e);
    PC.db.current = { patientId: p.id, examId: e.id };
    PC.save();
    return e;
  }

  return { createDemoPatient, simulateReevaluation };
})();
