'use strict';
// Dictée vocale guidée : séquence de sondage, analyse des phrases, reconnaissance vocale (Web Speech API).

PC.VERSION = '27/10 c'; // affichée dans l'en-tête pour vérifier la mise à jour sur le téléphone

PC.voice = (() => {
  const V = {
    pass: 1, full: [], steps: [], idx: 0, sub: 'pd', site: 0,
    listening: false, rec: null, speakingUntil: 0, lastSpoken: '',
    log: [], interim: '', onChange: () => {}, onStatus: () => {},
    done: new Set(), pendingText: null, pendingAt: 0, lastFinal: null
  };

  const KW = {
    stop: ['stop', 'pause', 'arrete', 'arreter', 'termine', 'terminer'],
    back: ['retour', 'precedent', 'precedente', 'arriere'],
    next: ['suivant', 'suivante', 'passe', 'passer', 'sauter', 'saute', 'suite'],
    fix: ['corriger', 'correction', 'effacer', 'efface', 'recommencer', 'annule', 'annuler'],
    jump: ['dent', 'aller', 'va', 'vas', 'allez'],
    missing: ['absente', 'absent', 'manquante', 'manquant', 'extraite', 'extrait'],
    implant: ['implant', 'implants'],
    mob: ['mobilite'],
    furc: ['furcation', 'furcations', 'furca'],
    kg: ['gencive', 'keratinisee', 'gk', 'kg', 'attachee'],
    pd: ['profondeur', 'profondeurs', 'poche', 'poches', 'sondage'],
    gm: ['marge', 'marges', 'recession', 'recessions'],
    normal: ['normal', 'normale', 'rien', 'ras'],
    all: ['tout', 'tous', 'toutes', 'partout', 'total'],
    none: ['rien', 'aucun', 'aucune', 'non', 'negatif', 'ras', 'propre']
  };
  const CAT = { saignement: 'bop', saignements: 'bop', sang: 'bop', saigne: 'bop', bop: 'bop',
    suppuration: 'sup', pus: 'sup', pu: 'sup', pue: 'sup', suppure: 'sup', supp: 'sup', sup: 'sup', plaque: 'pl', plaques: 'pl' };
  // Tolérance aux erreurs de reconnaissance (« supration », « suppression », « saignemant »…).
  const lev = (a, b) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  const catOf = w => {
    if (!w) return null;
    if (CAT[w]) return CAT[w];
    if (w.length >= 5 && w.startsWith('sup')) return 'sup';
    if (w.startsWith('purul')) return 'sup';
    if (w.startsWith('saign')) return 'bop';
    if (w.startsWith('plaq')) return 'pl';
    if (w.length >= 6) {
      if (lev(w, 'suppuration') <= 3) return 'sup';
      if (lev(w, 'saignement') <= 2) return 'bop';
    }
    return null;
  };
  const SITE = { distal: 'D', distale: 'D', distaux: 'D', disto: 'D', d: 'D', mesial: 'M', mesiale: 'M', mesiaux: 'M', mesio: 'M', m: 'M',
    centre: 'C', central: 'C', centrale: 'C', milieu: 'C', median: 'C', mediane: 'C', c: 'C' };
  // Sites avec tolérance : « mésiale », « messial », « mezial », « distale », « centrale »…
  const siteOf = w => {
    if (!w) return null;
    if (SITE[w]) return SITE[w];
    if (/^(mes|mez|mess|mais)i/.test(w) || (w.length >= 5 && lev(w, 'mesial') <= 2)) return 'M';
    if (w.startsWith('dist') || (w.length >= 5 && lev(w, 'distal') <= 2)) return 'D';
    if (/^(centr|sentr|milie)/.test(w)) return 'C';
    return null;
  };
  // Faces : « palatin » et « lingual » désignent la même face orale, quelle que soit l'arcade.
  const FACE = { vestibulaire: 'V', vestibule: 'V', vestibulaires: 'V', buccal: 'V', buccale: 'V', jugal: 'V', labial: 'V', labiale: 'V', externe: 'V',
    palatin: 'O', palatine: 'O', palatins: 'O', palatal: 'O', palatale: 'O', palais: 'O',
    lingual: 'O', linguale: 'O', linguaux: 'O', oral: 'O', orale: 'O', interne: 'O' };
  const faceOf = w => {
    if (!w) return null;
    if (FACE[w]) return FACE[w];
    if (w.startsWith('vestib')) return 'V';
    if (w.startsWith('palat') || w.startsWith('lingu')) return 'O';
    if (w.length >= 5 && (lev(w, 'palatin') <= 2 || lev(w, 'lingual') <= 2)) return 'O';
    return null;
  };
  const PASS_ORD = { premier: 1, premiere: 1, deuxieme: 2, second: 2, seconde: 2, dernier: 2 };
  // Après « passage » : « deux » souvent entendu « de », « des », « deu » ; « un » entendu « hein », « in ».
  const PASS_HEARD = { de: 2, des: 2, deu: 2, deus: 2, d: 2, hein: 1, in: 1, ain: 1 };
  const FILLER = ['a', 'au', 'sur', 'la', 'le', 'de', 'du', 'numero', 'classe', 'degre', 'est', 'en', 'et'];
  const WORDS = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, cette: 7, huit: 8, neuf: 9,
    dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, ii: 2, iii: 3 };
  const TENS = { vingt: 20, trente: 30, quarante: 40 };

  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/([a-z])[-–]([a-z])/g, '$1 $2') // « quarante-deux », « dix-huit » : le trait d'union n'est pas un signe moins
    // Signe moins sous toutes ses formes (« -2 », « - 2 », « 0-2 », « −2 », « –2 ») ; ignoré pour la profondeur.
    .replace(/[-−–—]/g, ' moins ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b(pas|pa|par) latins?\b/g, 'palatin'); // « palatin » parfois entendu « pas latin »

  function tokenize(text) {
    const words = norm(text).split(' ').filter(Boolean);
    const out = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (TENS[w] != null) {
        let n = TENS[w];
        let j = i + 1;
        if (words[j] === 'et') j++;
        const u = words[j] != null ? (WORDS[words[j]] ?? (/^\d$/.test(words[j]) ? +words[j] : null)) : null;
        if (u != null && u >= 1 && u <= 9) { n += u; i = j; }
        out.push({ n });
      } else if (w === 'dix' && ['sept', 'cette', 'huit', 'neuf'].includes(words[i + 1])) {
        out.push({ n: 10 + WORDS[words[i + 1]] }); i++; // « dix-huit » → 18
      } else if (/^\d+$/.test(w)) out.push({ n: +w, digits: w });
      else if (WORDS[w] != null) out.push({ n: WORDS[w] });
      else out.push({ w });
    }
    for (let i = 0; i < out.length - 1; i++) {
      if (out[i].w === 'moins' && out[i + 1].n != null) { out[i + 1].n = -out[i + 1].n; out[i + 1].neg = true; out[i].skip = true; }
    }
    return out.filter(t => !t.skip);
  }

  // "324" → 3, 2, 4 (la reconnaissance colle souvent les chiffres). 10-12 conservés pour la profondeur.
  function expand(tk, sub) {
    if (tk.neg && tk.digits && tk.digits.length > 1 && sub === 'gm') {
      const d = tk.digits.split('').map(Number);
      return [-d[0], ...d.slice(1)];
    }
    if (!tk.digits || tk.digits.length === 1 || tk.neg) return [tk.n];
    if (sub === 'pd' && tk.n >= 10 && tk.n <= 12) return [tk.n];
    return tk.digits.split('').map(Number);
  }
  const digitsOf = tk => tk.digits && tk.digits.length > 1 ? tk.digits.split('').map(Number) : [tk.n];

  // ---------- Séquence de sondage ----------
  function fullSequence() {
    const U = PC.UPPER, L = PC.LOWER, rev = a => a.slice().reverse();
    const seq = [];
    const push = (teeth, f, dir) => teeth.forEach(t => seq.push({ t, f, dir }));
    const o = PC.db.settings.order;
    if (o === 'dent') {
      U.forEach(t => { seq.push({ t, f: 'V', dir: 'LR' }); seq.push({ t, f: 'O', dir: 'LR' }); });
      rev(L).forEach(t => { seq.push({ t, f: 'V', dir: 'RL' }); seq.push({ t, f: 'O', dir: 'RL' }); });
    } else {
      push(U, 'V', 'LR');
      push(rev(U), 'O', 'RL');
      if (o === 'arcadeA') { push(rev(L), 'V', 'RL'); push(L, 'O', 'LR'); }
      else { push(L, 'O', 'LR'); push(rev(L), 'V', 'RL'); }
    }
    return seq;
  }

  function rebuild(reset) {
    const exam = PC.exam();
    const prev = V.steps[V.idx];
    V.full = exam ? fullSequence() : [];
    V.steps = exam ? V.full.filter(s => !exam.teeth[s.t].missing) : [];
    if (reset || !prev) { V.idx = 0; V.sub = 'pd'; V.site = 0; return; }
    const same = V.steps.findIndex(s => s.t === prev.t && s.f === prev.f);
    if (same >= 0) { V.idx = same; return; }
    let p = V.full.findIndex(s => s.t === prev.t && s.f === prev.f);
    V.idx = V.steps.length;
    for (; p >= 0 && p < V.full.length; p++) {
      const j = V.steps.indexOf(V.full[p]);
      if (j >= 0) { V.idx = j; break; }
    }
    V.sub = 'pd'; V.site = 0;
  }

  const current = () => V.steps[V.idx] || null;
  // Ordre de remplissage des 3 sites (indices d'affichage).
  function order(st) {
    if (PC.db.settings.valueOrder === 'dcm') return PC.distalLeft(st.t) ? [0, 1, 2] : [2, 1, 0];
    return st.dir === 'LR' ? [0, 1, 2] : [2, 1, 0];
  }
  function cursor() {
    const st = current();
    if (!st) return null;
    return { t: st.t, f: st.f, pass: V.pass, sub: V.sub, siteIdx: order(st)[V.site],
      furcKey: V.sub === 'furc' ? furcKeys(st)[V.site] : null };
  }

  // ---------- Retours sonores ----------
  let actx = null;
  function beep(freq = 880, dur = 0.07) {
    if (!PC.db.settings.beep) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = freq; g.gain.value = 0.08;
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + dur);
    } catch (_) { /* audio indisponible */ }
  }
  function speak(text) {
    if (!PC.db.settings.speak || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR'; u.rate = 1.2;
    V.lastSpoken = norm(text);
    V.speakingUntil = Date.now() + 4000;
    u.onend = () => { V.speakingUntil = Date.now() + 500; };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
  function announce() {
    const st = current();
    if (!st) { speak('Passage terminé'); return; }
    speak(`${st.t} ${PC.faceName(st.t, st.f)}`);
  }

  // ---------- Navigation ----------
  // done : face qui vient d'être complétée ; mobilité/furcation/gencive dites juste après s'y appliquent.
  function advance(msgs, done) {
    V.justDone = done || null;
    V.advPending = null; clearTimeout(V.advTimer);
    V.idx++; V.sub = 'pd'; V.site = 0;
    if (V.idx < V.steps.length) { beep(); announce(); return; }
    beep(1200, 0.25);
    if (V.pass === 1 && PC.db.settings.autoPass2 && V.steps.length) {
      // Enchaînement automatique sur le saignement / la suppuration / la plaque
      V.pass = 2; V.idx = 0; V.justDone = null;
      msgs && msgs.push('Passage 1 terminé → passage 2');
      const st = current();
      speak(`Passage 2, ${st.t} ${PC.faceName(st.t, st.f)}`);
      return;
    }
    V.idx = V.steps.length;
    msgs && msgs.push(`Passage ${V.pass} terminé`);
    speak('Passage terminé');
  }
  function back() { V.justDone = null; V.advPending = null; V.idx = Math.max(0, V.idx - 1); V.sub = 'pd'; V.site = 0; announce(); }
  function goto(t, f) {
    const j = V.steps.findIndex(s => s.t === t && (!f || s.f === f));
    if (j < 0) return false;
    V.justDone = null; V.advPending = null; V.idx = j; V.sub = 'pd'; V.site = 0;
    announce();
    return true;
  }
  // Changer de passage en restant sur la face en cours (reprise au début si le passage était terminé).
  function setPass(p) {
    V.justDone = null; V.advPending = null; V.pass = p; V.sub = 'pd'; V.site = 0;
    if (!current()) V.idx = 0;
    const st = current();
    if (V.listening && st) speak(`Passage ${p}, ${st.t} ${PC.faceName(st.t, st.f)}`);
    V.onChange();
  }

  function nextNum(toks, i) {
    for (let j = i + 1; j < toks.length; j++) {
      const tk = toks[j];
      if (tk.n != null) return { n: tk.n, tk, i: j };
      if (!FILLER.includes(tk.w)) return null;
    }
    return null;
  }
  function findTooth(toks, i) {
    const v = nextNum(toks, i);
    if (!v) return null;
    let t = v.n, end = v.i;
    if (!PC.isValidTooth(t) && t >= 1 && t <= 4 && toks[end + 1] && toks[end + 1].n != null) { t = t * 10 + toks[end + 1].n; end++; }
    if (!PC.isValidTooth(t)) return null;
    let f = null;
    let k = end + 1;
    while (toks[k] && (toks[k].w === 'face' || toks[k].w === 'cote' || toks[k].w === 'en')) k++;
    if (toks[k] && faceOf(toks[k].w)) { f = faceOf(toks[k].w); end = k; }
    return { t, f, end };
  }

  // ---------- Analyse d'une phrase ----------
  // Furcations demandées au passage 1 : V ou L = 1 valeur ; palatin des molaires maxillaires = mésiale puis distale.
  const furcKeys = st => st.f === 'V' ? ['V'] : PC.isUpper(st.t) ? ['MP', 'DP'] : ['L'];
  // Après la profondeur et la marge d'une face de molaire : demander la furcation, sinon face suivante.
  function faceDone(exam, st, msgs) {
    if (PC.db.settings.askFurc && exam.teeth[st.t].furc) {
      V.sub = 'furc'; V.site = 0;
      beep(520);
      speak(furcKeys(st).length === 2 ? 'furcation mésiale et distale' : 'furcation');
    } else advance(msgs, st);
  }

  function feedNumber(exam, n, msgs) {
    const st = current();
    if (!st) return;
    const fc = exam.teeth[st.t][st.f];
    const label = `${st.t} ${PC.faceShort(st.t, st.f)}`;
    if (V.sub === 'furc') {
      const keys = furcKeys(st);
      n = Math.abs(n);
      if (n > 3) { msgs.push(`Furcation ignorée : ${n} (0 à 3)`); return; }
      V.justDone = null;
      exam.teeth[st.t].furc[keys[V.site]] = n;
      V.site++;
      if (V.site < keys.length) return;
      msgs.push(`${label} furcation ${keys.map(k => PC.ROMAN[exam.teeth[st.t].furc[k]]).join(' ')}`);
      advance(msgs, st);
      return;
    }
    const i = order(st)[V.site];
    if (V.sub === 'pd') n = Math.abs(n); // « 3-2-4 » : le tiret sépare les profondeurs
    if (Math.abs(n) > 15) { msgs.push(`Valeur ignorée : ${n}`); return; }
    V.justDone = null;
    if (V.sub === 'pd') fc.pd[i] = n; else fc.gm[i] = PC.gmStore(n);
    V.site++;
    if (V.site <= 2) return;
    V.site = 0;
    const ord = order(st);
    if (V.sub === 'pd') {
      msgs.push(`${label} profondeur ${ord.map(k => fc.pd[k]).join(' ')}`);
      if (PC.db.settings.gmMode === 'skip') { fc.gm = fc.gm.map(v => v ?? 0); faceDone(exam, st, msgs); }
      else { V.sub = 'gm'; beep(660); }
    } else {
      msgs.push(`${label} ${PC.gmLabel().toLowerCase()} ${ord.map(k => PC.gmShow(fc.gm[k])).join(' ')}`);
      faceDone(exam, st, msgs);
    }
  }

  function handle(text, fromSpeech) {
    const exam = PC.exam();
    if (!exam || !text.trim()) return;
    // Écho de la synthèse vocale (« 45 vestibulaire » capté par le micro) : ignoré, ou retiré du début de la phrase.
    // Une phrase différente dite pendant l'annonce est conservée.
    if (fromSpeech && V.lastSpoken) {
      const n = norm(text), sp = V.lastSpoken;
      if (n === sp) return;
      if (Date.now() < V.speakingUntil) {
        if (sp.split(' ').includes(n) || sp.startsWith(n + ' ') || sp.endsWith(' ' + n)) return;
        if (n.startsWith(sp + ' ')) text = n.slice(sp.length + 1);
      }
    }
    // Commande coupée par une pause (« aller à » … « 13 ») : on la recolle à la phrase suivante.
    if (V.pendingText && Date.now() - V.pendingAt < 4000) {
      if (!norm(text).startsWith(V.pendingText)) text = V.pendingText + ' ' + text;
    }
    V.pendingText = null;
    const toks = tokenize(text);
    const msgs = [];
    const WAITS = [...KW.jump, ...KW.mob, ...KW.furc, ...KW.kg, 'passage'];
    if (toks.length && toks.length <= 4 && WAITS.includes(toks[0].w)
      && toks.slice(1).every(t => t.w && (FILLER.includes(t.w) || siteOf(t.w) || faceOf(t.w) || KW.kg.includes(t.w) || t.w === 'au'))) {
      V.pendingText = norm(text); V.pendingAt = Date.now();
      V.log.unshift({ heard: text, msgs: ['… suite ?'] });
      V.onChange();
      return;
    }
    // « 18 absente » / « 26 implant »
    for (let i = 1; i < toks.length; i++) {
      if ((KW.missing.includes(toks[i].w) || KW.implant.includes(toks[i].w)) && toks[i - 1].n != null && PC.isValidTooth(toks[i - 1].n)) {
        toks[i].tooth = toks[i - 1].n; toks[i - 1].skip = true;
      }
    }
    // Saignement / suppuration / plaque. Chaque marque vise une face :
    //  - guidée (passage 2, face annoncée) : remplace les valeurs puis passe à la face suivante ;
    //  - explicite (« 16 vestibulaire saignement mésial », ou pendant le passage 1) : ajoute, sans déplacer la dictée.
    // Une phrase coupée après « saignement » (pause avant « mésial ») reprend la marque restée ouverte.
    let mk = V.pendingMark || null;
    const marks = mk ? [mk] : [];
    clearTimeout(V.pendingTimer);
    V.pendingMark = null;
    let endsWithCat = false;
    for (let i = 0; i < toks.length; i++) {
      const tk = toks[i];
      if (tk.skip) continue;
      endsWithCat = false;
      const st = current();
      const w = tk.w;
      // « 16 vestibulaire », « 45 face linguale »
      if (tk.n != null && PC.isValidTooth(tk.n)) {
        let j = i + 1;
        while (toks[j] && (toks[j].w === 'face' || toks[j].w === 'cote')) j++;
        if (toks[j] && faceOf(toks[j].w)) {
          const t = tk.n, f = faceOf(toks[j].w);
          i = j;
          if (exam.teeth[t].missing) { msgs.push(`${t} absente`); mk = null; continue; }
          if (V.pass === 1 && toks[j + 1] && toks[j + 1].n != null) { goto(t, f); msgs.push(`Aller à ${t} ${PC.faceShort(t, f)}`); mk = null; continue; }
          mk = { t, f, cats: {}, explicit: true };
          marks.push(mk);
          continue;
        }
      }
      if (w) {
        if (KW.stop.includes(w)) { stop(); msgs.push('Dictée arrêtée'); continue; }
        // « passage 2 », « deuxième passage », « premier passage »…
        if (w === 'passage' || PASS_ORD[w]) {
          let p = null;
          if (w === 'passage') {
            let j = i + 1;
            if (toks[j] && (toks[j].w === 'a' || toks[j].w === 'au' || toks[j].w === 'numero')) j++;
            const nx = toks[j];
            if (nx && (nx.n === 1 || nx.n === 2)) p = nx.n;
            else if (nx && (PASS_ORD[nx.w] || PASS_HEARD[nx.w])) p = PASS_ORD[nx.w] || PASS_HEARD[nx.w];
            if (p) i = j;
          } else if (toks[i + 1] && toks[i + 1].w === 'passage') { p = PASS_ORD[w]; i++; }
          if (p) { mk = null; setPass(p); const s2 = current(); msgs.push(`Passage ${p}${s2 ? ` · ${s2.t} ${PC.faceShort(s2.t, s2.f)}` : ''}`); }
          continue;
        }
        if (KW.back.includes(w)) { back(); msgs.push('Retour'); continue; }
        if (KW.next.includes(w)) { if (st) { msgs.push('Suivant'); advance(msgs); } continue; }
        if (catOf(w)) {
          if (!mk) {
            const tg = V.pass === 2 ? st : (V.justDone || st);
            if (!tg) continue;
            // add : suite d'une dictée sur la même face (« saignement mésial » … « suppuration distale ») → on ajoute
            mk = { t: tg.t, f: tg.f, step: tg, cats: {}, explicit: V.pass === 1, add: V.pass === 2 && V.advPending === tg };
            marks.push(mk);
          }
          mk.cat = catOf(w);
          mk.cats[mk.cat] = mk.cats[mk.cat] || [];
          endsWithCat = true;
          continue;
        }
        if (mk && mk.cat && siteOf(w)) { mk.cats[mk.cat].push(PC.siteIndex(mk.t, siteOf(w))); continue; }
        if (mk && mk.cat && KW.all.includes(w)) { mk.cats[mk.cat].push(0, 1, 2); continue; }
        if (V.pass === 2 && KW.none.includes(w) && (!mk || !mk.explicit)) {
          if (!mk && st) { mk = { t: st.t, f: st.f, step: st, cats: {} }; marks.push(mk); }
          if (mk) mk.none = true;
          continue;
        }
        if (KW.jump.includes(w)) {
          const j = findTooth(toks, i);
          if (j) { i = j.end; msgs.push(goto(j.t, j.f) ? `Aller à ${j.t}` : `${j.t} absente ou introuvable`); }
          continue;
        }
        if (KW.missing.includes(w)) {
          const t = tk.tooth ?? (st && st.t);
          if (t) { exam.teeth[t].missing = true; exam.teeth[t].implant = false; rebuild(); msgs.push(`${t} absente`); beep(); announce(); }
          continue;
        }
        if (KW.implant.includes(w)) {
          const t = tk.tooth ?? (st && st.t);
          if (t) { exam.teeth[t].implant = true; exam.teeth[t].missing = false; rebuild(); msgs.push(`${t} implant`); }
          continue;
        }
        // Mobilité, furcation, gencive : dent qui vient d'être sondée si la face annoncée n'est pas commencée.
        const tg = V.justDone || st;
        if (!tg) continue;
        const th = exam.teeth[tg.t];
        if (KW.mob.includes(w)) {
          const v = nextNum(toks, i);
          if (v) { i = v.i; th.mob = Math.max(0, Math.min(3, v.n)); msgs.push(`${tg.t} mobilité ${th.mob}`); }
          continue;
        }
        if (KW.furc.includes(w)) {
          let side = null, j = i + 1;
          while (j < toks.length && toks[j].w && (siteOf(toks[j].w) || FILLER.includes(toks[j].w))) { if (siteOf(toks[j].w)) side = siteOf(toks[j].w); j++; }
          // Étape furcation en cours : les chiffres qui suivent sont pris par cette étape.
          if (V.sub === 'furc' && V.pass === 1 && tg === st) {
            if (side === 'D' && furcKeys(st).length === 2) V.site = 1;
            if (side === 'M') V.site = 0;
            i = j - 1;
            continue;
          }
          const v = nextNum(toks, j - 1);
          if (v) i = v.i;
          if (!th.furc) { msgs.push(`Pas de furcation sur la ${tg.t} (molaires uniquement)`); continue; }
          if (!v) continue;
          const k = tg.f === 'V' ? 'V' : PC.isUpper(tg.t) ? (side === 'D' ? 'DP' : 'MP') : 'L';
          th.furc[k] = Math.max(0, Math.min(3, v.n));
          msgs.push(`${tg.t} furcation ${k} ${PC.ROMAN[th.furc[k]]}`);
          continue;
        }
        if (KW.kg.includes(w)) {
          const v = nextNum(toks.map(x => (x.w === 'keratinisee' || x.w === 'attachee') ? { w: 'de' } : x), i);
          if (v) { i = v.i; th.kg = v.n; msgs.push(`${tg.t} gencive kératinisée ${v.n} mm`); }
          continue;
        }
        if (!st) continue;
        if (KW.fix.includes(w)) {
          const th = exam.teeth[st.t];
          const fc = th[st.f];
          if (V.pass === 1) { fc.pd = [null, null, null]; fc.gm = [null, null, null]; }
          else { fc.bop = [false, false, false]; fc.sup = [false, false, false]; fc.pl = [false, false, false]; }
          V.justDone = null; V.sub = 'pd'; V.site = 0; msgs.push(`${st.t} ${PC.faceShort(st.t, st.f)} effacée`);
          continue;
        }
        if (V.pass === 1) {
          if (KW.pd.includes(w)) { V.sub = 'pd'; V.site = 0; continue; }
          if (KW.gm.includes(w)) { V.sub = 'gm'; V.site = 0; continue; }
          if (KW.normal.includes(w) && V.sub === 'gm') {
            while (V.sub === 'gm' && current() === st) feedNumber(exam, 0, msgs);
            continue;
          }
          // « non », « rien », « aucune » : pas de furcation sur cette face
          if ((KW.normal.includes(w) || KW.none.includes(w)) && V.sub === 'furc') {
            while (V.sub === 'furc' && current() === st) feedNumber(exam, 0, msgs);
            continue;
          }
        }
        continue;
      }
      // Nombre : sites 1-2-3 après un indice (passage 2), sinon valeur de sondage (passage 1)
      if (mk && mk.cat && V.pass === 2) {
        const ord = mk.step ? order(mk.step) : [0, 1, 2];
        for (const n of digitsOf(tk)) if (n >= 1 && n <= 3) mk.cats[mk.cat].push(ord[n - 1]);
        continue;
      }
      if (!st) continue;
      if (V.pass === 1) { mk = null; for (const n of expand(tk, V.sub)) feedNumber(exam, n, msgs); }
    }
    // Phrase terminée par « saignement » sans site : on attend la suite (2,5 s) avant d'appliquer aux 3 sites.
    const last = marks[marks.length - 1];
    if (endsWithCat && last && !last.cats[last.cat].length) {
      marks.pop();
      V.pendingMark = last;
      msgs.push(`${NAMES[last.cat]} : quel site ?`);
      V.pendingTimer = setTimeout(() => {
        const m = V.pendingMark;
        if (!m || !PC.exam()) return;
        V.pendingMark = null;
        const ms = [];
        applyMarks(PC.exam(), [m], ms);
        V.log.unshift({ heard: '(sans site : les 3 sites)', msgs: ms });
        PC.save();
        V.onChange();
      }, 2500);
    }
    applyMarks(exam, marks, msgs);
    if (!msgs.length && V.pass === 1 && V.site > 0 && current()) msgs.push(progressMsg(exam));
    if (!msgs.length) { msgs.push('Non compris'); beep(220, 0.15); }
    V.log.unshift({ heard: text, msgs });
    V.log.length = Math.min(V.log.length, 40);
    PC.save();
    V.onChange();
  }

  // Face en cours de saisie, ex. « 13 V profondeur 4 · · »
  function progressMsg(exam) {
    const st = current(), th = exam.teeth[st.t], fc = th[st.f];
    const label = `${st.t} ${PC.faceShort(st.t, st.f)}`;
    if (V.sub === 'furc') return `${label} furcation ${furcKeys(st).map((k, j) => j < V.site ? PC.ROMAN[th.furc[k]] : '·').join(' ')}`;
    const vals = order(st).map((k, j) => j >= V.site ? '·' : V.sub === 'pd' ? fc.pd[k] : PC.gmShow(fc.gm[k]));
    return `${label} ${V.sub === 'pd' ? 'profondeur' : PC.gmLabel().toLowerCase()} ${vals.join(' ')}`;
  }

  const NAMES = { bop: 'saignement', sup: 'suppuration', pl: 'plaque' };
  // Passage 2 : après un indice, la face suivante n'est annoncée qu'après un court silence,
  // pour pouvoir enchaîner « saignement mésial », « suppuration distale », « plaque centre » sur la même face.
  const ADVANCE_DELAY = 3000;
  function applyMarks(exam, marks, msgs) {
    let advanceFrom = null, now = false;
    for (const m of marks) {
      const fc = exam.teeth[m.t][m.f];
      const parts = [];
      const noneOnly = m.none && !Object.keys(m.cats).length;
      if (noneOnly) {
        fc.bop = [false, false, false]; fc.sup = [false, false, false]; fc.pl = [false, false, false];
        parts.push('rien');
      }
      for (const [k, sites] of Object.entries(m.cats)) {
        const set = sites.length ? sites : [0, 1, 2];
        fc[k] = [0, 1, 2].map(i => set.includes(i) || ((m.explicit || m.add) && fc[k][i]));
        parts.push(`${NAMES[k]} ${[0, 1, 2].filter(i => fc[k][i]).map(i => PC.siteLetters(m.t)[i]).join('') || '—'}`);
      }
      if (!parts.length) continue;
      msgs.push(`${m.t} ${PC.faceShort(m.t, m.f)} : ${parts.join(', ')}`);
      if (!m.explicit) { advanceFrom = m.step; now = noneOnly; }
    }
    if (!advanceFrom || current() !== advanceFrom) return;
    clearTimeout(V.advTimer);
    if (now) { advance(msgs, advanceFrom); return; } // « rien » : face suivante tout de suite
    V.advPending = advanceFrom;
    V.advTimer = setTimeout(() => {
      if (V.advPending !== advanceFrom || current() !== advanceFrom) return;
      advance(null, advanceFrom);
      V.onChange();
    }, ADVANCE_DELAY);
  }

  // ---------- Reconnaissance vocale ----------
  function start() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Reconnaissance vocale non disponible dans ce navigateur. Utilisez Google Chrome, ou le champ « Simuler la dictée ».'); return; }
    if (!V.rec) {
      const r = new SR();
      r.lang = 'fr-FR'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 4;
      // Si la meilleure hypothèse ne contient aucun indice mais une autre oui, on garde celle-là.
      const hasCat = s => norm(s).split(' ').some(catOf);
      const pick = res => {
        const alts = Array.from(res, a => a.transcript);
        return hasCat(alts[0]) ? alts[0] : (alts.find(hasCat) || alts[0]);
      };
      r.onstart = () => { V.done = new Set(); V.started = true; V.session = (V.session || 0) + 1; };
      r.onresult = e => {
        V.failures = 0;
        let interim = '';
        // Android renvoie parfois des résultats déjà traités : chaque index n'est traité qu'une fois.
        for (let k = e.resultIndex; k < e.results.length; k++) {
          const res = e.results[k];
          if (res.isFinal) { if (!V.done.has(k)) { V.done.add(k); handleFinal(pick(res)); } }
          else interim += res[0].transcript;
        }
        V.interim = interim;
        V.onStatus();
      };
      r.onerror = e => {
        V.lastError = e.error;
        if ((e.error === 'not-allowed' || e.error === 'service-not-allowed') && !V.started) {
          // Refus au premier démarrage : vrai refus d'autorisation
          V.listening = false;
          V.log.unshift({ heard: '', msgs: ['Accès au micro refusé : autorisez le micro pour ce site dans Chrome (icône à gauche de l\'adresse)'] });
        } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
          V.failures = (V.failures || 0) + 1;
        }
        V.onStatus();
      };
      // Chrome Android arrête l'écoute après chaque phrase ou silence : relance automatique.
      r.onend = () => {
        if (!V.listening) { V.onStatus(); return; }
        if ((V.failures || 0) >= 5) {
          V.listening = false;
          V.log.unshift({ heard: '', msgs: [`Micro arrêté après plusieurs erreurs (${V.lastError}). Vérifiez la connexion internet puis relancez la dictée.`] });
          releaseWakeLock();
          V.onStatus();
          return;
        }
        setTimeout(() => { if (V.listening) { try { r.start(); } catch (_) { /* déjà démarré */ } } }, V.failures ? 400 : 60);
      };
      V.rec = r;
    }
    V.listening = true; V.started = false; V.failures = 0;
    try { V.rec.start(); } catch (_) { /* déjà démarré */ }
    requestWakeLock();
    announce();
    V.onStatus();
  }
  function stop() {
    V.listening = false; V.interim = '';
    try { V.rec && V.rec.stop(); } catch (_) { /* déjà arrêté */ }
    releaseWakeLock();
    V.onStatus();
  }

  // Android renvoie des phrases cumulatives pendant une même écoute : « 5 », puis « 5 4 », puis « 5 4 2 ».
  // Une phrase qui reprend la précédente (même écoute, ou moins d'1,5 s après) n'est traitée que pour sa partie nouvelle.
  function handleFinal(text) {
    const now = Date.now(), n = norm(text);
    const prev = V.lastFinal;
    V.lastFinal = { n, t: now, session: V.session };
    if (prev && (prev.session === V.session || now - prev.t < 1500) && n.length > prev.n.length && n.startsWith(prev.n + ' ')) {
      const rest = n.slice(prev.n.length + 1);
      if (V.pendingText) { handle(text, true); return; } // la phrase précédente attendait sa suite : on prend la nouvelle en entier
      handle(rest, true);
      return;
    }
    if (prev && n === prev.n && (prev.session === V.session || now - prev.t < 1500)) return; // doublon exact
    handle(text, true);
  }

  // Écran allumé pendant la dictée (sinon le téléphone se verrouille et coupe le micro).
  let wakeLock = null;
  async function requestWakeLock() {
    try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (_) { /* refusé ou non pris en charge */ }
  }
  function releaseWakeLock() { try { wakeLock && wakeLock.release(); } catch (_) { /* déjà libéré */ } wakeLock = null; }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && V.listening) requestWakeLock(); });

  return { state: V, rebuild, setPass, start, stop, handle, handleFinal, goto, cursor, current, order, announce, furcKeys };
})();
