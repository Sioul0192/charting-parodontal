'use strict';
// Interface : vues, événements et liaison avec le modèle.
(() => {
  const $ = s => document.querySelector(s);
  const VOICE = PC.voice;
  let view = 'chart';

  function init() {
    PC.load();
    if (!PC.db.patients.length) { const p = PC.addPatient('Test', 'Patient', '1970-01-01'); PC.addExam(p, true); }
    if (!PC.exam()) {
      const p = PC.patient() || PC.db.patients[0];
      if (!p.exams.length) PC.addExam(p, true);
      PC.db.current = { patientId: p.id, examId: p.exams[p.exams.length - 1].id };
      PC.save();
    }
    VOICE.rebuild(true);
    VOICE.state.onChange = () => { renderChart(); updateVoice(); };
    VOICE.state.onStatus = updateVoice;

    document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));
    $('#btn-print').addEventListener('click', printReport);
    $('#ctx').addEventListener('change', e => {
      if (e.target.id === 'exam-select') { PC.db.current.examId = e.target.value; PC.save(); VOICE.rebuild(true); show(view); }
      if (e.target.id === 'exam-date') { PC.exam().date = e.target.value; PC.save(); renderCtx(); }
    });
    $('.badge').textContent = 'version ' + (PC.VERSION || 'test');
    bindChart();
    buildVoicePanel();
    show(view);
  }

  function show(v) {
    view = v;
    document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    renderCtx();
    if (v === 'patients') renderPatients();
    if (v === 'chart') { renderChart(); updateVoice(); }
    if (v === 'diag') renderDiag();
    if (v === 'compare') renderCompare();
    if (v === 'settings') renderSettings();
  }

  function renderCtx() {
    const p = PC.patient(), e = PC.exam();
    if (!p || !e) { $('#ctx').innerHTML = ''; return; }
    const exams = p.exams.slice().sort((a, b) => a.date.localeCompare(b.date));
    $('#ctx').innerHTML = `<span class="pname">${PC.esc(p.nom)} ${PC.esc(p.prenom)}</span>
      <label>Examen <select id="exam-select">${exams.map(x => `<option value="${x.id}"${x.id === e.id ? ' selected' : ''}>${PC.fmtDate(x.date)}</option>`).join('')}</select></label>
      <label>Date <input type="date" id="exam-date" value="${e.date}"></label>`;
    $('#print-head').innerHTML = `<h1>Charting parodontal</h1><p>${PC.esc(p.nom)} ${PC.esc(p.prenom)}${p.birth ? ' — né(e) le ' + PC.fmtDate(p.birth) : ''} — examen du ${PC.fmtDate(e.date)}</p>`;
  }

  // ---------- Charting ----------
  function renderChart() {
    const e = PC.exam();
    if (!e) return;
    const cur = VOICE.cursor();
    PC.chart.render($('#chart'), e, cur);
    renderStats();
    followTooth(cur);
  }

  // Sur petit écran, garder la dent dictée visible dans le schéma (défilement horizontal).
  let lastFollowed = null;
  function followTooth(cur) {
    const key = cur ? cur.t + cur.f : null;
    if (!cur || key === lastFollowed) return;
    lastFollowed = key;
    const sc = $('.chart-scroll'), cell = $('#chart .cell.cur');
    if (!sc || !cell || sc.scrollWidth <= sc.clientWidth) return;
    const a = sc.getBoundingClientRect(), b = cell.getBoundingClientRect(), label = 112;
    if (b.left >= a.left + label && b.right <= a.right) return;
    sc.scrollLeft += b.left - a.left - label - (a.width - label - b.width) / 2;
  }

  function renderStats() {
    const s = PC.stats(PC.exam());
    const chip = (l, v) => `<div class="chip"><span>${l}</span><b>${v}</b></div>`;
    $('#stats-bar').innerHTML = [
      chip('Dents', s.teeth), chip('Implants', s.implants), chip('Absentes', s.missing),
      chip('PD moyenne', PC.fmt(s.meanPD) + ' mm'), chip('CAL moyen', PC.fmt(s.meanCAL) + ' mm'),
      chip('Saignement', PC.fmt(s.bopPct, 0) + ' %'), chip('Plaque', PC.fmt(s.plPct, 0) + ' %'),
      chip('Sites PD ≥ 4', s.pd4), chip('PD ≥ 5', s.pd5), chip('PD ≥ 6', s.pd6)
    ].join('');
  }

  function bindChart() {
    const el = $('#chart');
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-action]');
      if (!b) return;
      const e = PC.exam(), t = +b.dataset.t, th = e.teeth[t];
      switch (b.dataset.action) {
        case 'goto': VOICE.goto(t, b.dataset.f); break;
        case 'state':
          if (!th.missing && !th.implant) th.missing = true;
          else if (th.missing) { th.missing = false; th.implant = true; }
          else th.implant = false;
          VOICE.rebuild();
          break;
        case 'mob': th.mob = ((th.mob || 0) + 1) % 4; break;
        case 'furc': th.furc[b.dataset.k] = (th.furc[b.dataset.k] + 1) % 4; break;
        case 'dot': { const a = th[b.dataset.f][b.dataset.k]; a[+b.dataset.i] = !a[+b.dataset.i]; break; }
      }
      PC.save();
      renderChart(); updateVoice();
    });
    el.addEventListener('input', ev => {
      const inp = ev.target;
      if (!inp.dataset.k) return;
      const e = PC.exam(), t = +inp.dataset.t, f = inp.dataset.f, k = inp.dataset.k, i = +inp.dataset.i;
      const raw = inp.value.trim().replace(',', '.').replace(/^[−–—]\s*/, '-').replace(/^-\s+/, '-');
      const n = raw === '' || raw === '-' || isNaN(+raw) ? null : Math.round(+raw);
      const th = e.teeth[t];
      if (k === 'kg') th.kg = n;
      else if (k === 'pd') { th[f].pd[i] = n == null ? null : Math.max(0, n); inp.classList.toggle('hi', n >= 4); }
      else if (k === 'gm') th[f].gm[i] = PC.gmStore(n);
      PC.save();
      if (k !== 'kg') PC.chart.refreshFace(e, t, f, VOICE.cursor());
      renderStats();
    });
    el.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter' || !ev.target.matches('input.v')) return;
      const all = [...el.querySelectorAll(`input.v.${ev.target.dataset.k}`)];
      const nx = all[all.indexOf(ev.target) + 1];
      if (nx) nx.focus();
    });
  }

  // ---------- Panneau de dictée ----------
  function buildVoicePanel() {
    $('#voice-panel').innerHTML = `
      <div class="vtop">
        <div class="seg" id="pass-seg">
          <button data-pass="1">Passage 1 · Profondeur + marge</button>
          <button data-pass="2">Passage 2 · Saignement · suppuration · plaque</button>
        </div>
        <button id="mic" class="mic">Démarrer la dictée</button>
      </div>
      <div class="vmain">
        <div class="target" id="target"></div>
        <div class="vside">
          <div class="interim" id="interim"></div>
          <form id="sim" class="sim"><input id="sim-input" placeholder="Simuler la dictée au clavier (ex. 3 2 4) puis Entrée" autocomplete="off"><button>Envoyer</button></form>
          <p class="hint" id="hint"></p>
        </div>
      </div>
      <ul class="log" id="log"></ul>`;
    $('#pass-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) VOICE.setPass(+b.dataset.pass); });
    $('#mic').addEventListener('click', () => VOICE.state.listening ? VOICE.stop() : VOICE.start());
    $('#sim').addEventListener('submit', e => {
      e.preventDefault();
      const inp = $('#sim-input');
      VOICE.handle(inp.value, false);
      inp.value = '';
      inp.focus();
    });
  }

  function updateVoice() {
    const V = VOICE.state, st = VOICE.current();
    document.querySelectorAll('#pass-seg button').forEach(b => b.classList.toggle('on', +b.dataset.pass === V.pass));
    const mic = $('#mic');
    mic.classList.toggle('on', V.listening);
    mic.textContent = V.listening ? 'Arrêter la dictée' : 'Démarrer la dictée';
    if (!st) {
      $('#target').innerHTML = `<div class="big">✔</div><div>Passage ${V.pass} terminé</div><button class="small" id="restart">Recommencer au début</button>`;
      $('#restart').onclick = () => VOICE.setPass(V.pass);
    } else {
      const letters = VOICE.order(st).map(i => PC.siteLetters(st.t)[i]);
      const furc = V.pass === 1 && V.sub === 'furc';
      const what = V.pass === 1 ? (furc ? 'Furcation (0 à 3, « non » si absente)' : V.sub === 'pd' ? 'Profondeur' : PC.gmLabel()) : 'Saignement · suppuration · plaque';
      const shown = furc ? VOICE.furcKeys(st).map(k => ({ V: 'V', L: 'L', MP: 'M', DP: 'D' }[k])) : letters;
      const sites = V.pass === 1 ? shown.map((l, k) => `<span class="${k === V.site ? 'on' : k < V.site ? 'done' : ''}">${l}</span>`).join('') : letters.map(l => `<span>${l}</span>`).join('');
      $('#target').innerHTML = `<div class="big">${st.t}</div><div class="face">${PC.faceName(st.t, st.f)}</div><div class="what">${what}</div><div class="sites">${sites}</div><div class="prog">${V.idx + 1} / ${V.steps.length}</div>`;
    }
    $('#interim').textContent = V.listening ? (V.interim || 'À l\'écoute…') : 'Micro arrêté';
    $('#hint').innerHTML = V.pass === 1
      ? 'Dictez 3 profondeurs puis 3 valeurs de marge (« 3 2 4 » puis « 0 -1 0 » ou « normal »). Sur les molaires, la furcation est ensuite demandée (« 0 », « 2 », « non » ; au palatin : mésiale puis distale, ex. « 1 2 »). Commandes : <i>suivant, retour, corriger, absente, implant, dent 26 palatin, mobilité 2, furcation 1, furcation distale 2, gencive 3, saignement mésial, 16 vestibulaire saignement distal, passage 2, stop</i>.'
      : 'Une phrase par face : « saignement distal mésial, plaque partout », « suppuration centre », « rien ». Sans site précisé = les 3 sites. Pour une autre face sans quitter la dictée guidée : « 45 linguale suppuration distale ».';
    $('#log').innerHTML = V.log.map(l => `<li>${l.heard ? `<q>${PC.esc(l.heard)}</q> → ` : ''}${l.msgs.map(PC.esc).join(' · ')}</li>`).join('');
  }

  // ---------- Patients ----------
  function renderPatients() {
    const pts = PC.db.patients;
    $('#view-patients').innerHTML = `
      <div class="card">
        <h2>Nouveau patient</h2>
        <form id="f-patient" class="inline">
          <label>Nom <input name="nom" required></label>
          <label>Prénom <input name="prenom"></label>
          <label>Date de naissance <input type="date" name="birth"></label>
          <label class="chk"><input type="checkbox" name="wisdom" checked> Dents de sagesse absentes</label>
          <button>Créer et ouvrir</button>
        </form>
      </div>
      <div class="card">
        <h2>Données de test</h2>
        <p class="note">Patient fictif avec un examen initial et une réévaluation à 3 mois, pour essayer l'onglet Comparaison. « Simuler une réévaluation » (dans la liste ci-dessous) crée un nouvel examen à partir du dernier examen d'un patient.</p>
        <button id="demo">Créer un patient de démonstration</button>
      </div>
      <div class="card">
        <h2>Patients (${pts.length})</h2>
        <table class="tbl">
          <thead><tr><th>Patient</th><th>Naissance</th><th>Examens</th><th></th></tr></thead>
          <tbody>${pts.map(p => `<tr>
            <td><b>${PC.esc(p.nom)}</b> ${PC.esc(p.prenom)}</td>
            <td>${PC.fmtDate(p.birth)}</td>
            <td>${p.exams.slice().sort((a, b) => a.date.localeCompare(b.date)).map(x => `<span class="exam-chip"><button class="link" data-open="${p.id}|${x.id}">${PC.fmtDate(x.date)}</button><button class="x" data-delexam="${p.id}|${x.id}" title="Supprimer l'examen">×</button></span>`).join(' ')}</td>
            <td class="act"><button data-newexam="${p.id}">Nouvel examen</button> <button data-simreeval="${p.id}" title="Crée un examen fictif à 3 mois à partir du dernier examen">Simuler une réévaluation</button> <button class="danger" data-delpat="${p.id}">Supprimer</button></td>
          </tr>`).join('')}</tbody>
        </table>
        <p class="note">Un nouvel examen reprend les dents absentes et les implants de l'examen précédent.</p>
      </div>
      <div class="card">
        <h2>Sauvegarde</h2>
        <p class="note">Les données sont enregistrées uniquement dans ce navigateur, sur cet appareil. Exportez régulièrement une sauvegarde.</p>
        <button id="export">Exporter (JSON)</button>
        <label class="filebtn">Importer (JSON)<input type="file" id="import" accept="application/json,.json" hidden></label>
      </div>`;
    $('#f-patient').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const p = PC.addPatient(fd.get('nom').trim(), fd.get('prenom').trim(), fd.get('birth'));
      PC.addExam(p, !!fd.get('wisdom'));
      VOICE.rebuild(true);
      show('chart');
    });
    $('#view-patients').onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.open) { const [pid, eid] = b.dataset.open.split('|'); PC.db.current = { patientId: pid, examId: eid }; PC.save(); VOICE.rebuild(true); show('chart'); }
      if (b.id === 'demo') { PC.demo.createDemoPatient(); VOICE.rebuild(true); show('compare'); return; }
      if (b.dataset.simreeval) {
        const p = PC.db.patients.find(x => x.id === b.dataset.simreeval);
        if (!confirm(`Ajouter à ${p.nom} ${p.prenom} un examen de réévaluation fictif (valeurs simulées) ?`)) return;
        PC.demo.simulateReevaluation(p); VOICE.rebuild(true); show('compare'); return;
      }
      if (b.dataset.newexam) { PC.addExam(PC.db.patients.find(p => p.id === b.dataset.newexam), false); VOICE.rebuild(true); show('chart'); }
      if (b.dataset.delexam) {
        const [pid, eid] = b.dataset.delexam.split('|');
        const p = PC.db.patients.find(x => x.id === pid);
        if (!confirm('Supprimer définitivement cet examen ?')) return;
        p.exams = p.exams.filter(x => x.id !== eid);
        if (!p.exams.length) PC.addExam(p, false);
        if (PC.db.current.examId === eid) PC.db.current = { patientId: pid, examId: p.exams[p.exams.length - 1].id };
        PC.save(); VOICE.rebuild(true); renderPatients(); renderCtx();
      }
      if (b.dataset.delpat) {
        if (PC.db.patients.length === 1) { alert('Créez un autre patient avant de supprimer le dernier.'); return; }
        if (!confirm('Supprimer définitivement ce patient et tous ses examens ?')) return;
        PC.db.patients = PC.db.patients.filter(x => x.id !== b.dataset.delpat);
        if (PC.db.current.patientId === b.dataset.delpat) { const p = PC.db.patients[0]; PC.db.current = { patientId: p.id, examId: p.exams[p.exams.length - 1].id }; }
        PC.save(); VOICE.rebuild(true); renderPatients(); renderCtx();
      }
      if (b.id === 'export') {
        const blob = new Blob([JSON.stringify(PC.db, null, 1)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `charting-parodontal-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
    };
    $('#import').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const d = JSON.parse(await file.text());
        if (!Array.isArray(d.patients)) throw new Error('format');
        if (!confirm(`Remplacer les données actuelles par ${d.patients.length} patient(s) ?`)) return;
        PC.db.patients = d.patients; Object.assign(PC.db.settings, d.settings || {}); PC.db.current = d.current;
        PC.save(); location.reload();
      } catch (_) { alert('Fichier invalide.'); }
    });
  }

  // ---------- Diagnostic et PRA ----------
  function renderDiag() {
    const e = PC.exam(), p = PC.patient(), d = e.diag;
    const s = PC.stats(e);
    const sel = (k, opts) => `<select data-diag="${k}">${opts.map(([v, l]) => `<option value="${v}"${d[k] === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
    const chk = (k, l) => `<label class="chk"><input type="checkbox" data-diag="${k}"${d[k] ? ' checked' : ''}> ${l}</label>`;
    const autoAge = PC.ageOf(p, { ...e, diag: { ...d, age: null } });
    $('#view-diag').innerHTML = `
      <div class="cols">
        <div class="card">
          <h2>Données complémentaires</h2>
          <div class="form">
            <label>Âge <input type="number" min="1" max="120" data-diag="age" value="${d.age ?? ''}" placeholder="${autoAge ?? ''}"><small>${autoAge != null ? 'calculé : ' + autoAge + ' ans' : 'date de naissance non renseignée'}</small></label>
            <label>Alvéolyse radiographique maximale (%) <input type="number" min="0" max="100" data-diag="rbl" value="${d.rbl ?? ''}"><small>sur la dent la plus atteinte (en % de la longueur radiculaire)</small></label>
            <label>Dents perdues pour raison parodontale <input type="number" min="0" max="32" data-diag="perioLoss" value="${d.perioLoss ?? ''}" placeholder="${s.lost28}"><small>${s.lost28} dent(s) absente(s) ou implant(s) au charting (hors dents de sagesse)</small></label>
            <fieldset><legend>Facteurs de complexité</legend>
              ${chk('vertical', 'Lésion(s) angulaire(s) ≥ 3 mm')}
              <label>Défaut de crête ${sel('ridge', [['none', 'aucun'], ['moderate', 'modéré'], ['severe', 'sévère']])}</label>
              ${chk('masticatory', 'Dysfonction masticatoire')}
              ${chk('occlTrauma', 'Trauma occlusal secondaire (mobilité ≥ 2)')}
              ${chk('collapse', 'Effondrement occlusal, migrations, égressions')}
              ${chk('fewPairs', 'Moins de 10 paires de dents antagonistes')}
            </fieldset>
            <fieldset><legend>Grade et facteurs de risque</legend>
              <label>Preuve directe de progression (5 ans) ${sel('direct', [['na', 'non disponible'], ['none', 'aucune perte'], ['lt2', 'perte < 2 mm'], ['ge2', 'perte ≥ 2 mm']])}</label>
              <label>Phénotype ${sel('phenotype', [['normal', 'destruction en rapport avec le biofilm'], ['low', 'biofilm abondant, faible destruction'], ['high', 'destruction disproportionnée / progression rapide']])}</label>
              <label>Tabac ${sel('smoking', [['never', 'non-fumeur'], ['former', 'ancien fumeur (> 5 ans)'], ['lt10', '< 10 cig./jour'], ['10to19', '10 à 19 cig./jour'], ['ge20', '≥ 20 cig./jour']])}</label>
              <label>Diabète ${sel('diabetes', [['none', 'non / normoglycémique'], ['lt7', 'diabète, HbA1c < 7 %'], ['ge7', 'diabète, HbA1c ≥ 7 %']])}</label>
              ${chk('systemic', 'Autre facteur systémique ou génétique')}
            </fieldset>
            <label>Notes <textarea data-diag="notes" rows="3">${PC.esc(d.notes)}</textarea></label>
          </div>
        </div>
        <div id="diag-results"></div>
      </div>`;
    $('#view-diag').oninput = $('#view-diag').onchange = ev => {
      const el = ev.target, k = el.dataset.diag;
      if (!k) return;
      d[k] = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? (el.value === '' ? null : +el.value) : el.value);
      PC.save();
      renderDiagResults();
    };
    renderDiagResults();
  }

  function renderDiagResults() {
    const e = PC.exam(), p = PC.patient();
    const dg = PC.diagnose(e, p), pra = PC.pra(e, p), s = dg.s;
    const riskTxt = { low: 'Risque faible', mod: 'Risque modéré', high: 'Risque élevé' };
    $('#diag-results').innerHTML = `
      <div class="card">
        <h2>Aide au diagnostic (classification 2018)</h2>
        <p class="dx">${PC.esc(dg.title)}</p>
        <ul class="trace">${dg.trace.map(t => `<li>${PC.esc(t)}</li>`).join('')}</ul>
        ${dg.gtrace.length ? `<h4>Grade</h4><ul class="trace">${dg.gtrace.map(t => `<li>${PC.esc(t)}</li>`).join('')}</ul>` : ''}
        <p class="note">Proposition automatique à valider cliniquement. Les dents absentes ne sont pas toutes perdues pour raison parodontale : renseignez ce nombre à gauche.</p>
        <h4>Données issues du charting</h4>
        <table class="tbl kv">
          <tr><td>Dents présentes / implants / absentes</td><td>${s.teeth} / ${s.implants} / ${s.missing}</td></tr>
          <tr><td>Saignement au sondage</td><td>${PC.fmt(s.bopPct, 0)} % (${s.bop}/${s.sites} sites)</td></tr>
          <tr><td>Plaque</td><td>${PC.fmt(s.plPct, 0)} %</td></tr>
          <tr><td>Sites PD ≥ 5 mm</td><td>${s.pd5}</td></tr>
          <tr><td>Profondeur max / CAL interdentaire max</td><td>${s.maxPD} mm / ${s.maxInterCAL} mm</td></tr>
          <tr><td>Furcation max / mobilité max</td><td>${PC.ROMAN[s.furcMax]} / ${s.mobMax}</td></tr>
        </table>
      </div>
      <div class="card">
        <h2>PRA — évaluation du risque parodontal</h2>
        <p class="risk ${pra.risk}">${riskTxt[pra.risk]}</p>
        ${PC.chart.praSVG(pra)}
        <p class="note">Lang &amp; Tonetti 2003. Faible : tous les paramètres faibles ou un seul modéré. Modéré : au moins 2 modérés et au plus 1 élevé. Élevé : au moins 2 élevés. Le diabète est compté comme facteur systémique. Indices calculés sur les dents naturelles.</p>
      </div>`;
  }

  // ---------- Comparaison ----------
  let cmp = { a: null, b: null };
  function renderCompare() {
    const p = PC.patient();
    const exams = p.exams.slice().sort((a, b) => a.date.localeCompare(b.date));
    const el = $('#view-compare');
    if (exams.length < 2) { el.innerHTML = '<div class="card"><h2>Comparaison</h2><p>Il faut au moins deux examens pour ce patient. Créez un nouvel examen depuis l\'onglet Patients.</p></div>'; return; }
    if (!exams.find(x => x.id === cmp.a) || !exams.find(x => x.id === cmp.b)) { cmp.a = exams[exams.length - 2].id; cmp.b = exams[exams.length - 1].id; }
    const A = exams.find(x => x.id === cmp.a), B = exams.find(x => x.id === cmp.b);
    const sa = PC.stats(A), sb = PC.stats(B);
    const opt = id => exams.map(x => `<option value="${x.id}"${x.id === id ? ' selected' : ''}>${PC.fmtDate(x.date)}</option>`).join('');
    const line = (l, a, b, d, lowerBetter = true) => {
      const delta = a == null || b == null ? null : b - a;
      const cls = delta == null || Math.abs(delta) < 1e-9 ? '' : (delta < 0) === lowerBetter ? 'better' : 'worse';
      return `<tr><td>${l}</td><td>${PC.fmt(a, d)}</td><td>${PC.fmt(b, d)}</td><td class="${cls}">${delta == null ? '–' : (delta > 0 ? '+' : '') + PC.fmt(delta, d)}</td></tr>`;
    };
    let better = 0, worse = 0;
    const grid = teeth => `<div class="cgrid">${teeth.map(t => {
      const ta = A.teeth[t], tb = B.teeth[t];
      if (ta.missing || tb.missing) return `<div class="cc missing"><b>${t}</b><span>absente</span></div>`;
      for (const f of ['V', 'O']) for (let i = 0; i < 3; i++) {
        const x = ta[f].pd[i], y = tb[f].pd[i];
        if (x != null && y != null) { if (y - x <= -2) better++; if (y - x >= 2) worse++; }
      }
      const ma = PC.toothMaxPD(ta), mb = PC.toothMaxPD(tb);
      const dd = ma != null && mb != null ? mb - ma : null;
      const cls = dd == null ? '' : dd <= -2 ? 'better' : dd < 0 ? 'better-s' : dd >= 2 ? 'worse' : dd > 0 ? 'worse-s' : '';
      return `<div class="cc ${cls}"><b>${t}</b><span>${ma ?? '–'} → ${mb ?? '–'}</span></div>`;
    }).join('')}</div>`;
    const gU = grid(PC.UPPER), gL = grid(PC.LOWER);
    el.innerHTML = `
      <div class="card">
        <h2>Comparaison de deux examens</h2>
        <form class="inline" id="cmp-form"><label>Examen 1 <select name="a">${opt(cmp.a)}</select></label><label>Examen 2 <select name="b">${opt(cmp.b)}</select></label></form>
        <table class="tbl cmp">
          <thead><tr><th></th><th>${PC.fmtDate(A.date)}</th><th>${PC.fmtDate(B.date)}</th><th>Évolution</th></tr></thead>
          <tbody>
            ${line('Dents présentes', sa.teeth, sb.teeth, 0, false)}
            ${line('PD moyenne (mm)', sa.meanPD, sb.meanPD, 1)}
            ${line('CAL moyen (mm)', sa.meanCAL, sb.meanCAL, 1)}
            ${line('Saignement (%)', sa.bopPct, sb.bopPct, 0)}
            ${line('Plaque (%)', sa.plPct, sb.plPct, 0)}
            ${line('Sites PD ≥ 4 mm', sa.pd4, sb.pd4, 0)}
            ${line('Sites PD ≥ 5 mm', sa.pd5, sb.pd5, 0)}
            ${line('Sites PD ≥ 6 mm', sa.pd6, sb.pd6, 0)}
            ${line('PD maximale (mm)', sa.maxPD, sb.maxPD, 0)}
          </tbody>
        </table>
      </div>
      <div class="card">
        <h2>Profondeur maximale par dent</h2>
        <p>${better} site(s) amélioré(s) de 2 mm ou plus · ${worse} site(s) aggravé(s) de 2 mm ou plus</p>
        <h4>Maxillaire</h4>${gU}<h4>Mandibule</h4>${gL}
        <p class="legend"><span class="cc better">amélioration ≥ 2 mm</span><span class="cc better-s">amélioration 1 mm</span><span class="cc worse-s">aggravation 1 mm</span><span class="cc worse">aggravation ≥ 2 mm</span></p>
      </div>`;
    $('#cmp-form').onchange = ev => { cmp[ev.target.name] = ev.target.value; renderCompare(); };
  }

  // ---------- Réglages ----------
  function renderSettings() {
    const st = PC.db.settings;
    const sel = (k, opts) => `<select data-set="${k}">${opts.map(([v, l]) => `<option value="${v}"${String(st[k]) === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
    $('#view-settings').innerHTML = `
      <div class="cols">
        <div class="card">
          <h2>Réglages de la dictée</h2>
          <div class="form">
            <label>Ordre de sondage ${sel('order', [
              ['arcadeA', 'Par arcade : V 18→28, P 28→18, V 38→48, L 48→38'],
              ['arcadeB', 'Par arcade : V 18→28, P 28→18, L 48→38, V 38→48'],
              ['dent', 'Dent par dent : V puis P/L, de 18 à 28 puis de 38 à 48']])}</label>
            <label>Ordre des 3 valeurs dictées ${sel('valueOrder', [['travel', 'Dans le sens du déplacement de la sonde'], ['dcm', 'Toujours distal → centre → mésial']])}</label>
            <label>Saisie de la marge ${sel('gmConv', [['bern', 'Marge gingivale (Berne) : valeur négative = récession'], ['recession', 'Récession : valeur positive = récession']])}</label>
            <label>Dictée de la marge ${sel('gmMode', [['dictate', 'Demander la marge après chaque face'], ['skip', 'Ne pas demander (0 par défaut, dire « marge » pour la saisir)']])}</label>
            <label>Furcation des molaires au passage 1 ${sel('askFurc', [['true', 'Demander après la marge de chaque face de molaire'], ['false', 'Ne pas demander (dire « furcation 2 » si besoin)']])}</label>
            <label>Fin du passage 1 ${sel('autoPass2', [['true', 'Enchaîner automatiquement sur le passage 2'], ['false', 'S\'arrêter (dire « passage 2 » pour continuer)']])}</label>
            <label>Annonce vocale de la dent suivante ${sel('speak', [['true', 'oui'], ['false', 'non']])}</label>
            <label>Bips de confirmation ${sel('beep', [['true', 'oui'], ['false', 'non']])}</label>
          </div>
        </div>
        <div class="card">
          <h2>Commandes vocales</h2>
          <table class="tbl kv">
            <tr><td>« 3 2 4 »</td><td>3 profondeurs (passage 1), puis 3 valeurs de marge</td></tr>
            <tr><td>« 3 2 4 0 0 -1 »</td><td>profondeurs et marge en une seule phrase</td></tr>
            <tr><td>« normal » / « rien »</td><td>marge à 0 pour la face en cours</td></tr>
            <tr><td>« 2 » / « non »</td><td>molaires, après la marge : classe de furcation (0 à 3) ou absence ; au palatin des molaires maxillaires, mésiale puis distale (« 1 2 », ou « furcation distale 2 »)</td></tr>
            <tr><td>« marge … » / « profondeur … »</td><td>forcer la saisie de la marge ou de la profondeur</td></tr>
            <tr><td>« saignement distal mésial »</td><td>passage 2 : saignement sur les sites cités (sans site = les 3)</td></tr>
            <tr><td>« plaque partout, suppuration centre »</td><td>passage 2 : plusieurs indices dans la même phrase</td></tr>
            <tr><td>« pus distal »</td><td>équivaut à « suppuration distale » (mot court, mieux reconnu)</td></tr>
            <tr><td>« 16 vestibulaire saignement mésial »</td><td>n'importe quel moment : indique le saignement, la suppuration ou la plaque d'une face précise, sans déplacer la dictée (s'ajoute à ce qui est déjà noté)</td></tr>
            <tr><td>« 3 2 4 0 0 0 saignement mésial »</td><td>passage 1 : saignement noté sur la face qui vient d'être sondée</td></tr>
            <tr><td>« 26 palatin 5 6 7 »</td><td>passage 1 : aller à cette face et saisir les profondeurs</td></tr>
            <tr><td>« rien » / « aucun »</td><td>passage 2 : aucun saignement ni plaque, face suivante</td></tr>
            <tr><td>« passage 2 » / « passage 1 »</td><td>changer de passage en restant sur la face en cours (aussi « deuxième passage », « premier passage ») ; « passage 2 dent 26 palatin » pour changer de face en même temps</td></tr>
            <tr><td>« suivant » / « retour »</td><td>face suivante / précédente</td></tr>
            <tr><td>« corriger »</td><td>effacer la face en cours et recommencer</td></tr>
            <tr><td>« dent 26 palatin »</td><td>aller à une dent (et une face)</td></tr>
            <tr><td>« absente » / « 18 absente »</td><td>dent absente (sautée ensuite)</td></tr>
            <tr><td>« implant »</td><td>la dent en cours est un implant</td></tr>
            <tr><td>« mobilité 2 »</td><td>mobilité de la dent en cours, classification de Miller : 0 physiologique, 1 horizontale ≤ 1 mm, 2 horizontale &gt; 1 mm, 3 horizontale et verticale (dent dépressible)</td></tr>
            <tr><td>« furcation 2 »</td><td>molaires : furcation de la face en cours (maxillaire palatin : « furcation distale 1 », mésiale par défaut)</td></tr>
            <tr><td>« gencive kératinisée 3 »</td><td>hauteur de gencive kératinisée (mm)</td></tr>
            <tr><td>« stop »</td><td>arrêter la dictée</td></tr>
          </table>
        </div>
      </div>`;
    $('#view-settings').onchange = ev => {
      const k = ev.target.dataset.set;
      if (!k) return;
      const v = ev.target.value;
      st[k] = v === 'true' ? true : v === 'false' ? false : v;
      PC.save();
      if (k === 'order') VOICE.rebuild(true);
    };
  }

  function printReport() {
    renderChart();
    renderDiag();
    document.body.classList.add('printing');
    setTimeout(() => { window.print(); document.body.classList.remove('printing'); show(view); }, 50);
  }

  document.addEventListener('DOMContentLoaded', init);

  // Installation sur l'écran d'accueil et ouverture hors connexion (https ou localhost uniquement).
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker', e)));
  }
})();
