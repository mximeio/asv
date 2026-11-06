// ============================================================================
// CONFIGURATION FIREBASE — À REMPLACER PAR TA CONFIG DEPUIS LA CONSOLE FIREBASE
// ----------------------------------------------------------------------------
// 1. Créer un projet sur https://console.firebase.google.com
// 2. Ajouter une app web (icône </>) — récupérer firebaseConfig
// 3. Activer Authentication → méthode "Email/Password"
// 4. Activer Firestore Database (mode production)
// 5. Coller les Security Rules suivantes dans Firestore :
//
//    rules_version = '2';
//    service cloud.firestore {
//      match /databases/{database}/documents {
//        match /users/{userId} {
//          allow read, write: if request.auth != null && request.auth.uid == userId;
//        }
//      }
//    }
//
// 6. Remplacer le placeholder ci-dessous par TA config (les valeurs sont publiques)
// ============================================================================
const firebaseConfig = {
  apiKey: "AIzaSyDZU1lPqojDRE4uSP0VK2v1qF67dmd3X8w",
  authDomain: "asv-application.firebaseapp.com",
  projectId: "asv-application",
  storageBucket: "asv-application.firebasestorage.app",
  messagingSenderId: "905624924923",
  appId: "1:905624924923:web:07b723b16f2ad26dccf65e"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Activer la persistance offline native de Firestore (cache local + file d'attente d'écritures)
// Cache hors-ligne désactivé volontairement : l'app fonctionne en ligne (synchro temps réel)
// et le cache multi-onglets pouvait bloquer le chargement au rechargement (F5).
// (Anciennement : db.enablePersistence({ synchronizeTabs: true }))

// ============ DATA ============
const INITIAL_DATA = {};

const MONTHS_ORIGINAL = [];
const MONTHS_ALL = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const WEEKDAYS_SHORT = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
const BIS_SUFFIXES = ["bis", "ter", "quater", "quinquies", "sexies", "septies", "octies", "nonies"];
const DEFAULT_YEAR = 2025;

const CATS = [
  { key: "nuit",     label: "Heures de nuit",     color: "#2D2D3E", short: "Nuit"     },
  { key: "jour",     label: "Heures de jour",     color: "#E5A547", short: "Jour"     },
  { key: "dimanche", label: "Dimanches",          color: "#c90c0f", short: "Dimanche" },
  { key: "ferie",    label: "Jours fériés",       color: "#2E7D5B", short: "Fériés"   },
  { key: "admin",    label: "Tâches admin",       color: "#6B4E8E", short: "Admin"    },
];

// Catégories pour les deux axes
const CATS_WHEN = [
  { key: "nuit", label: "Nuit",  color: "#2D2D3E" },
  { key: "jour", label: "Jour",  color: "#E5A547" },
];
const CATS_WHAT = [
  { key: "normal",   label: "Heures normales", color: "#4A5568" },
  { key: "dimanche", label: "Dimanches",       color: "#c90c0f" },
  { key: "ferie",    label: "Jours fériés",    color: "#2E7D5B" },
  { key: "admin",    label: "Admin",            color: "#6B4E8E" },
];

// La donnée d'un utilisateur vit dans /users/{uid} dans Firestore
function userDocRef() {
  const u = auth.currentUser;
  return u ? db.collection("users").doc(u.uid) : null;
}

const INITIAL_YEARS = MONTHS_ORIGINAL.reduce((acc, m) => { acc[m] = DEFAULT_YEAR; return acc; }, {});

let state = {
  active: null,
  activeYear: 2025,
  data: deepCopy(INITIAL_DATA),
  order: [...MONTHS_ORIGINAL],
  years: { ...INITIAL_YEARS },
};
let stackedChart = null;

function deepCopy(o){ return JSON.parse(JSON.stringify(o)); }

// Liste des mois (ordre brut) — getter
function months() { return state.order; }

// Toutes les années présentes dans les données, triées
function allYears() {
  const years = new Set();
  for (const m of months()) {
    const y = yearOf(m);
    if (y) years.add(y);
  }
  return Array.from(years).sort((a, b) => a - b);
}

// Mois de l'année active, triés chronologiquement
function monthsInActiveYear() {
  return sortedMonths().filter(m => yearOf(m) === state.activeYear);
}

// Bascule vers une autre année avec préservation intelligente du mois actif
function selectYear(year) {
  if (state.activeYear === year) return;
  state.activeYear = year;
  const newActive = pickMonthForYear(year);
  if (newActive) state.active = newActive;
  renderAll();
  saveToStorage();
}

// Choisit le mois à afficher pour une année donnée :
//  - Si c'est l'année EN COURS : le mois actuel s'il existe, sinon le plus proche du mois actuel
//  - Sinon : le premier mois chronologique disponible dans cette année
function pickMonthForYear(year) {
  const inYear = sortedMonths().filter(m => yearOf(m) === year);
  if (inYear.length === 0) return null;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth(); // 0-11

  if (year === currentYear) {
    // Année en cours : mois actuel s'il existe, sinon le plus proche
    const currentMonthName = MONTHS_ALL[currentMonthIdx];
    const exact = inYear.find(m => realMonthName(m) === currentMonthName);
    if (exact) return exact;

    let best = null;
    let bestDist = Infinity;
    for (const key of inYear) {
      const m = MONTHS_ALL.indexOf(realMonthName(key));
      if (m === -1) continue;
      const dist = Math.abs(m - currentMonthIdx);
      if (dist < bestDist) {
        bestDist = dist;
        best = key;
      }
    }
    return best;
  }

  // Autre année : premier mois chronologique
  let best = null;
  let bestIdx = Infinity;
  for (const key of inYear) {
    const m = MONTHS_ALL.indexOf(realMonthName(key));
    if (m === -1) continue;
    if (m < bestIdx) {
      bestIdx = m;
      best = key;
    }
  }
  return best;
}

// Année d'un mois (peut être null si non renseignée)
function yearOf(monthName) { return state.years[monthName] || null; }

// Extrait le nom propre du mois depuis la clé ("Février 2027" → "Février")
function realMonthName(key) {
  return String(key).replace(/\s+\d{4}$/, '');
}

// Libellé d'affichage d'un mois ("Février 2026" ou "Février" si pas d'année)
function monthLabel(monthName) {
  const y = yearOf(monthName);
  const name = realMonthName(monthName);
  return y ? `${name} ${y}` : name;
}

// Formule du fichier .numbers d'origine :
// IF(ISBLANK(Fin), 0, IF(Fin<12, 24+Fin-Début, Fin-Début))
function computeHeures(debut, fin) {
  if (fin === null || fin === undefined || fin === "" || isNaN(fin)) return 0;
  if (debut === null || debut === undefined || debut === "" || isNaN(debut)) return 0;
  const d = Number(debut), f = Number(fin);
  const h = f < 12 ? (24 + f - d) : (f - d);
  return Math.round(h * 100) / 100;
}

// Renvoie le jour de la semaine (0=dim, 1=lun, ...) ou null si indéterminable
function getWeekday(monthName, year, dayStr) {
  const monthIdx = MONTHS_ALL.indexOf(realMonthName(monthName));
  if (monthIdx === -1 || !year) return null;
  const m = String(dayStr).match(/^(\d+)/);
  if (!m) return null;
  const dayNum = parseInt(m[1], 10);
  if (!dayNum) return null;
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  if (dayNum < 1 || dayNum > lastDay) return null;
  return new Date(year, monthIdx, dayNum).getDay();
}

// Variante : calcule le jour de la semaine en tenant compte du fait que la ligne
// peut appartenir au mois précédent (pour les "28, 29, 30, 31" en début de tableau).
function getWeekdayForRow(monthName, year, dayStr, isPrevMonth) {
  const monthIdx = MONTHS_ALL.indexOf(realMonthName(monthName));
  if (monthIdx === -1 || !year) return null;
  const m = String(dayStr).match(/^(\d+)/);
  if (!m) return null;
  const dayNum = parseInt(m[1], 10);
  if (!dayNum) return null;

  let realMonthIdx = monthIdx;
  let realYear = year;
  if (isPrevMonth) {
    realMonthIdx = monthIdx - 1;
    if (realMonthIdx < 0) { realMonthIdx = 11; realYear = year - 1; }
  }
  const lastDay = new Date(realYear, realMonthIdx + 1, 0).getDate();
  if (dayNum < 1 || dayNum > lastDay) return null;
  return new Date(realYear, realMonthIdx, dayNum).getDay();
}

// Détecte les lignes en début de tableau qui appartiennent au mois précédent
// (heuristique : suite décroissante puis retour à 1, comme 28, 29, 30, 31, 1, 2, ...)
function detectPrevMonthIndices(rows) {
  const prev = new Set();
  for (let i = 0; i < rows.length - 1; i++) {
    const d = baseDayNumber(rows[i].day);
    const dn = baseDayNumber(rows[i + 1].day);
    if (d && dn && dn === 1 && d > 20) {
      // Tous les indices jusqu'à i sont du mois précédent
      for (let j = 0; j <= i; j++) prev.add(j);
      return prev;
    }
    // Si on rencontre déjà un jour 1 avant toute séquence anormale, arrêter
    if (d === 1) return prev;
  }
  return prev;
}

// Nom court du mois précédent (pour l'étiquette "← janv.")
function prevMonthShort(monthName) {
  const idx = MONTHS_ALL.indexOf(realMonthName(monthName));
  if (idx === -1) return null;
  const prev = MONTHS_ALL[(idx - 1 + 12) % 12];
  return prev.slice(0, 4).toLowerCase() + (prev.length > 4 ? "." : "");
}

// ============ JOURS FÉRIÉS FRANÇAIS ============
// Algorithme de Butcher pour le dimanche de Pâques (calendrier grégorien)
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const monthNum = Math.floor((h + l - 7 * mm + 114) / 31);
  const day = ((h + l - 7 * mm + 114) % 31) + 1;
  return { month: monthNum - 1, day };
}

function addDaysToDate(year, month, day, n) {
  const dt = new Date(year, month, day);
  dt.setDate(dt.getDate() + n);
  return { year: dt.getFullYear(), month: dt.getMonth(), day: dt.getDate() };
}

const _holidaysCache = new Map();
function getHolidaysForYear(year) {
  if (_holidaysCache.has(year)) return _holidaysCache.get(year);
  const easter = easterSunday(year);
  const easterMonday = addDaysToDate(year, easter.month, easter.day, 1);
  const ascension = addDaysToDate(year, easter.month, easter.day, 39);
  const whitMonday = addDaysToDate(year, easter.month, easter.day, 50);

  const key = (m, d) => `${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const map = new Map();
  map.set("01-01", "Jour de l'An");
  map.set(key(easterMonday.month, easterMonday.day), "Lundi de Pâques");
  map.set("05-01", "1ᵉʳ mai");
  map.set("05-08", "Victoire 1945");
  map.set(key(ascension.month, ascension.day), "Ascension");
  map.set(key(whitMonday.month, whitMonday.day), "Lundi de Pentecôte");
  map.set("07-14", "Fête nationale");
  map.set("08-15", "Assomption");
  map.set("11-01", "Toussaint");
  map.set("11-11", "Armistice");
  map.set("12-25", "Noël");
  _holidaysCache.set(year, map);
  return map;
}

// Renvoie le nom du jour férié pour une ligne (en tenant compte du mois précédent éventuel)
function getHolidayForRow(monthName, year, dayStr, isPrevMonth) {
  const monthIdx = MONTHS_ALL.indexOf(realMonthName(monthName));
  if (monthIdx === -1 || !year) return null;
  const m = String(dayStr).match(/^(\d+)/);
  if (!m) return null;
  const dayNum = parseInt(m[1], 10);
  if (!dayNum) return null;
  let realMonthIdx = monthIdx;
  let realYear = year;
  if (isPrevMonth) {
    realMonthIdx = monthIdx - 1;
    if (realMonthIdx < 0) { realMonthIdx = 11; realYear = year - 1; }
  }
  const key = `${String(realMonthIdx + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
  return getHolidaysForYear(realYear).get(key) || null;
}

// ============ CHANGEMENT D'HEURE (DST) ============
function getLastSunday(year, monthIdx) {
  const lastDay = new Date(year, monthIdx + 1, 0);
  return lastDay.getDate() - lastDay.getDay();
}

function getDSTInfo(monthName, year, dayStr, isPrevMonth, debut, fin) {
  if (debut == null || fin == null) return null;
  if (Number(fin) >= Number(debut)) return null;
  const monthIdx = MONTHS_ALL.indexOf(realMonthName(monthName));
  if (monthIdx === -1 || !year) return null;
  const dm = String(dayStr).match(/^(\d+)/);
  if (!dm) return null;
  const dayNum = parseInt(dm[1], 10);
  if (!dayNum) return null;

  let realMonthIdx = monthIdx, realYear = year;
  if (isPrevMonth) {
    realMonthIdx = monthIdx - 1;
    if (realMonthIdx < 0) { realMonthIdx = 11; realYear = year - 1; }
  }
  const endDate = new Date(realYear, realMonthIdx, dayNum + 1);
  const endMonthIdx = endDate.getMonth();
  const endDay = endDate.getDate();
  const endYear = endDate.getFullYear();
  const finN = Number(fin);

  if (endMonthIdx === 2) {
    const lastSun = getLastSunday(endYear, 2);
    if (endDay === lastSun && finN >= 2) {
      return { type: "spring", adjust: -1, label: "−1h (heure d'été)" };
    }
  }
  if (endMonthIdx === 9) {
    const lastSun = getLastSunday(endYear, 9);
    if (endDay === lastSun && finN >= 3) {
      return { type: "autumn", adjust: +1, label: "+1h (heure d'hiver)" };
    }
  }
  return null;
}

function computeHeuresWithDST(debut, fin, monthName, year, dayStr, isPrevMonth) {
  const base = computeHeures(debut, fin);
  if (base === 0) return base;
  const dst = getDSTInfo(monthName, year, dayStr, isPrevMonth, debut, fin);
  return dst ? base + dst.adjust : base;
}

// ============ CALCUL AUTO : NUIT / DIM / FÉRIÉ ============
// Nuit : convention "tout ou rien" — si la garde chevauche la plage [21h, 6h], toute la garde est nuit.
function computeNuit(debut, fin, heures) {
  if (debut == null || fin == null || !heures) return 0;
  const d = Number(debut), f = Number(fin);
  if (isNaN(d) || isNaN(f)) return 0;
  const crosses = f < d;
  const fEff = crosses ? f + 24 : f;
  // Plage nuit étendue [21, 30] (= 21h → 6h du lendemain)
  const overlapsNight = Math.max(d, 21) < Math.min(fEff, 30);
  // Cas matin (garde tôt en début de journée touchant [0, 6])
  const overlapsMorning = !crosses && Math.max(d, 0) < Math.min(f, 6);
  return (overlapsNight || overlapsMorning) ? heures : 0;
}

// Dim : heures travaillées DANS un dimanche (intra-day + débordement minuit éventuel)
function computeDim(debut, fin, monthName, year, dayStr, isPrev) {
  if (debut == null || fin == null) return 0;
  const d = Number(debut), f = Number(fin);
  if (isNaN(d) || isNaN(f)) return 0;
  const info = getDateForRow(monthName, year, dayStr, isPrev);
  if (!info) return 0;
  // Cas spécial Début=24 : ces heures sont sur le créneau 0h→fin, qui peut être attribué à J ou J+1
  if (d === 24) {
    if (info.weekday === 0) return Math.max(0, f);
    const tomorrow = new Date(info.year, info.month, info.day + 1);
    if (tomorrow.getDay() === 0) return Math.max(0, f);
    return 0;
  }
  const crosses = f < d;
  let dim = 0;
  if (info.weekday === 0) {
    dim += crosses ? Math.max(0, 24 - d) : Math.max(0, f - d);
  }
  if (crosses) {
    const tomorrow = new Date(info.year, info.month, info.day + 1);
    if (tomorrow.getDay() === 0) dim += Math.max(0, f);
  }
  return dim;
}

// Férié : heures travaillées DANS un jour férié (intra-day + débordement minuit éventuel)
function computeFerie(debut, fin, monthName, year, dayStr, isPrev) {
  if (debut == null || fin == null) return 0;
  const d = Number(debut), f = Number(fin);
  if (isNaN(d) || isNaN(f)) return 0;
  const info = getDateForRow(monthName, year, dayStr, isPrev);
  if (!info) return 0;
  // Cas spécial Début=24
  if (d === 24) {
    const todayKey = `${String(info.month + 1).padStart(2, "0")}-${String(info.day).padStart(2, "0")}`;
    if (getHolidaysForYear(info.year).has(todayKey)) return Math.max(0, f);
    const tomorrow = new Date(info.year, info.month, info.day + 1);
    const tKey = `${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    if (getHolidaysForYear(tomorrow.getFullYear()).has(tKey)) return Math.max(0, f);
    return 0;
  }
  const crosses = f < d;
  let fer = 0;
  const todayKey = `${String(info.month + 1).padStart(2, "0")}-${String(info.day).padStart(2, "0")}`;
  if (getHolidaysForYear(info.year).has(todayKey)) {
    fer += crosses ? Math.max(0, 24 - d) : Math.max(0, f - d);
  }
  if (crosses) {
    const tomorrow = new Date(info.year, info.month, info.day + 1);
    const tKey = `${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    if (getHolidaysForYear(tomorrow.getFullYear()).has(tKey)) {
      fer += Math.max(0, f);
    }
  }
  return fer;
}

// Recalcule toutes les valeurs auto (Heures, Nuit, Jour, Dim, Férié) pour toutes les lignes.
// Admin reste saisi manuellement.
function recomputeAllAutoColumns() {
  for (const monthKey of Object.keys(state.data)) {
    const rows = state.data[monthKey] || [];
    const yearM = yearOf(monthKey);
    if (!yearM) continue;
    const prevSet = detectPrevMonthIndices(rows);
    rows.forEach((r, i) => {
      if (r.debut == null || r.fin == null) {
        r.heures = 0; r.nuit = 0; r.jour = 0; r.dimanche = 0; r.ferie = 0;
        return;
      }
      const isPrev = prevSet.has(i);
      r.heures = computeHeuresWithDST(r.debut, r.fin, monthKey, yearM, r.day, isPrev);
      r.nuit = computeNuit(r.debut, r.fin, r.heures);
      r.jour = Math.max(0, r.heures - r.nuit);
      r.dimanche = computeDim(r.debut, r.fin, monthKey, yearM, r.day, isPrev);
      r.ferie = computeFerie(r.debut, r.fin, monthKey, yearM, r.day, isPrev);
    });
  }
}

// ============ ANALYSE D'ACTIVITÉ ANNUELLE ============
function getDateForRow(monthName, year, dayStr, isPrevMonth) {
  const monthIdx = MONTHS_ALL.indexOf(realMonthName(monthName));
  if (monthIdx === -1 || !year) return null;
  const m = String(dayStr).match(/^(\d+)/);
  if (!m) return null;
  const dayNum = parseInt(m[1], 10);
  if (!dayNum) return null;
  let realMonthIdx = monthIdx, realYear = year;
  if (isPrevMonth) {
    realMonthIdx = monthIdx - 1;
    if (realMonthIdx < 0) { realMonthIdx = 11; realYear = year - 1; }
  }
  const d = new Date(realYear, realMonthIdx, dayNum);
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), weekday: d.getDay() };
}
function dateKey(info) {
  return `${info.year}-${String(info.month + 1).padStart(2, "0")}-${String(info.day).padStart(2, "0")}`;
}

function countSundaysInYear(year) {
  let count = 0;
  const d = new Date(year, 0, 1);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  while (d.getFullYear() === year) {
    count++;
    d.setDate(d.getDate() + 7);
  }
  return count;
}

// Dimanches de l'année écoulés jusqu'à une date limite incluse
function countSundaysUpTo(year, limitDate) {
  let count = 0;
  const d = new Date(year, 0, 1);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  while (d.getFullYear() === year && d <= limitDate) {
    count++;
    d.setDate(d.getDate() + 7);
  }
  return count;
}

// "15 juillet" — pour afficher la borne des dénominateurs
function fmtDayMonth(d) {
  return `${d.getDate() === 1 ? "1er" : d.getDate()} ${MONTHS_ALL[d.getMonth()].toLowerCase()}`;
}

function analyzeYearActivity(year) {
  const weekendSet = new Set();
  const holidaySet = new Set();
  let lastWorkedKey = null; // dernière date (AAAA-MM-JJ) avec des heures saisies
  for (const monthKey of months()) {
    const rows = state.data[monthKey] || [];
    const monthYear = yearOf(monthKey);
    if (!monthYear) continue;
    const prevSet = detectPrevMonthIndices(rows);
    rows.forEach((r, i) => {
      const heures = Number(r.heures) || 0;
      if (heures === 0) return;
      const isPrev = prevSet.has(i);
      const info = getDateForRow(monthKey, monthYear, r.day, isPrev);
      if (!info || info.year !== year) return;
      const dkRow = dateKey(info);
      if (!lastWorkedKey || dkRow > lastWorkedKey) lastWorkedKey = dkRow;
      const debut = Number(r.debut) || 0;
      const fin = Number(r.fin) || 0;
      const crosses = (debut > 0 || fin > 0) && fin < debut;

      if (info.weekday === 0) {
        if (heures >= 1) weekendSet.add(dateKey(info));
      } else if (info.weekday === 6 && crosses && fin >= 1) {
        const sunday = new Date(info.year, info.month, info.day + 1);
        if (sunday.getFullYear() === year) {
          weekendSet.add(dateKey({ year: sunday.getFullYear(), month: sunday.getMonth(), day: sunday.getDate() }));
        }
      }

      const holiday = getHolidayForRow(monthKey, monthYear, r.day, isPrev);
      if (holiday && heures >= 2) {
        holidaySet.add(dateKey(info));
      }
      if (crosses && fin >= 2) {
        const tomorrow = new Date(info.year, info.month, info.day + 1);
        const tKey = `${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
        const tYear = tomorrow.getFullYear();
        if (tYear === year) {
          const yearHolidays = getHolidaysForYear(tYear);
          if (yearHolidays.has(tKey)) {
            holidaySet.add(`${tYear}-${tKey}`);
          }
        }
      }
    });
  }
  // Dénominateurs : année entière pour les années passées ; pour l'année
  // calendaire EN COURS, on borne au dernier jour avec des heures saisies
  // (weekends/fériés écoulés entre le 1er janvier et cette date).
  let weekendsTotal = countSundaysInYear(year);
  let holidaysTotal = getHolidaysForYear(year).size;
  let bound = null;
  if (year === new Date().getFullYear() && lastWorkedKey) {
    // Garde-fou : un poste débordant après minuit peut compter un dimanche
    // ou un férié à J+1 — la borne s'étend pour garantir numérateur ⊆ dénominateur.
    let boundKey = lastWorkedKey;
    for (const k of weekendSet) if (k > boundKey) boundKey = k;
    for (const k of holidaySet) if (k > boundKey) boundKey = k;
    const [by, bm, bd] = boundKey.split("-").map(Number);
    bound = new Date(by, bm - 1, bd);
    weekendsTotal = countSundaysUpTo(year, bound);
    holidaysTotal = [...getHolidaysForYear(year).keys()].filter(md => `${year}-${md}` <= boundKey).length;
  }
  return {
    weekendsWorked: weekendSet.size,
    weekendsTotal,
    holidaysWorked: holidaySet.size,
    holidaysTotal,
    bound,
  };
}

// Extrait le numéro de jour de base depuis "1", "1 bis", "1 ter"...
function baseDayNumber(dayStr) {
  const m = String(dayStr).match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// Calcule le libellé "X bis", "X ter"... selon ce qui existe déjà
function nextBisLabel(rows, baseDay) {
  const existing = rows.filter(r => baseDayNumber(r.day) === baseDay);
  const idx = existing.length - 1; // 0 → bis, 1 → ter
  if (idx >= 0 && idx < BIS_SUFFIXES.length) return `${baseDay} ${BIS_SUFFIXES[idx]}`;
  return `${baseDay} (${idx + 1})`;
}

function emptyDay(d) {
  return { day: String(d), debut: null, fin: null, heures: 0, nuit: 0, jour: 0, dimanche: 0, ferie: 0, admin: 0 };
}
function emptyMonth() {
  return Array.from({length: 31}, (_, i) => emptyDay(i + 1));
}

// Nombre de jours dans un mois donné (selon l'année)
function daysInMonth(monthName, year) {
  const idx = MONTHS_ALL.indexOf(realMonthName(monthName));
  if (idx === -1 || !year) return 31;
  return new Date(year, idx + 1, 0).getDate();
}

// Crée un mois vide avec le bon nombre de jours
function emptyMonthForYear(monthName, year) {
  const last = daysInMonth(monthName, year);
  return Array.from({length: last}, (_, i) => emptyDay(i + 1));
}

// Vérifie si une ligne correspond à un jour qui n'existe pas dans le mois courant
function isInvalidDay(monthName, year, dayStr, isPrevMonth) {
  if (isPrevMonth) return false; // les jours du mois précédent sont valides ailleurs
  const m = String(dayStr).match(/^(\d+)/);
  if (!m) return false;
  const dayNum = parseInt(m[1], 10);
  if (!dayNum) return false;
  const last = daysInMonth(monthName, year);
  return dayNum > last;
}

// Une ligne est-elle entièrement vide ?
function isRowEmpty(r) {
  return (!r.heures && !r.nuit && !r.jour && !r.dimanche && !r.ferie && !r.admin
          && (r.debut === null || r.debut === undefined || r.debut === "")
          && (r.fin === null || r.fin === undefined || r.fin === ""));
}

// Supprime TOUTES les lignes qui correspondent à des jours inexistants du mois
// (les lignes "mois précédent" comme 28-31 janvier en début de Février sont préservées)
function cleanupInvalidDays(monthKey) {
  const rows = state.data[monthKey];
  if (!rows) return { removed: 0, removedWithData: 0 };
  const year = yearOf(monthKey);
  if (!year) return { removed: 0, removedWithData: 0 };
  const prevSet = detectPrevMonthIndices(rows);
  let removed = 0, removedWithData = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (prevSet.has(i)) continue;
    if (!isInvalidDay(monthKey, year, rows[i].day, false)) continue;
    if (!isRowEmpty(rows[i])) removedWithData++;
    rows.splice(i, 1);
    removed++;
  }
  return { removed, removedWithData };
}

// Supprime les lignes en fin de mois dont le numéro de jour fait un saut en arrière
// (ex: "1" après "30" en fin d'avril → ligne parasite résiduelle)
function cleanupTrailingParasites(monthKey) {
  const rows = state.data[monthKey];
  if (!rows || rows.length < 2) return { removed: 0, removedWithData: 0 };
  let removed = 0, removedWithData = 0;
  while (rows.length >= 2) {
    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    const lm = String(last.day).match(/^(\d+)/);
    const pm = String(prev.day).match(/^(\d+)/);
    if (!lm || !pm) break;
    const lastDay = parseInt(lm[1], 10);
    const prevDay = parseInt(pm[1], 10);
    if (lastDay < prevDay) {
      if (!isRowEmpty(last)) removedWithData++;
      rows.pop();
      removed++;
    } else {
      break;
    }
  }
  return { removed, removedWithData };
}

// Nettoie tous les mois ; renvoie un résumé { total, perMonth }
function cleanupAllMonths() {
  let total = 0, withData = 0;
  const perMonth = [];
  for (const m of months()) {
    const r1 = cleanupInvalidDays(m);
    const r2 = cleanupTrailingParasites(m);
    const removed = r1.removed + r2.removed;
    const removedWithData = r1.removedWithData + r2.removedWithData;
    if (removed > 0) perMonth.push({ name: m, removed, removedWithData });
    total += removed;
    withData += removedWithData;
  }
  return { total, withData, perMonth };
}

// Renvoie le mois (clé) le plus proche temporellement du mois courant.
function pickClosestMonth() {
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth();
  const list = months();
  if (list.length === 0) return null;
  let best = null;
  let bestDist = Infinity;
  for (const key of list) {
    const y = yearOf(key);
    if (!y) continue;
    const m = MONTHS_ALL.indexOf(realMonthName(key));
    if (m === -1) continue;
    const dist = Math.abs((y - curY) * 12 + (m - curM));
    if (dist < bestDist) {
      bestDist = dist;
      best = key;
    }
  }
  return best;
}

// ============ CONTRÔLE DES DONNÉES (sécurité, 06/11/2026) ============
// Un fichier importé pouvait porter du HTML dans le jour, les heures, le nom du mois ou
// l'année ; une fois enregistré, il s'exécutait à chaque ouverture. Et une année en lettres
// faisait tourner countSundaysInYear sans fin. Formes acceptées : celles que l'appli produit.
const MONTH_KEY_RE = new RegExp("^(" + MONTHS_ALL.join("|") + ")( \\d{4})?$");
const DAY_RE = new RegExp("^\\d{1,2}( (" + BIS_SUFFIXES.join("|") + ")| \\(\\d{1,2}\\))?$");
const ROW_NUM_FIELDS = ["debut", "fin", "admin", "heures", "nuit", "jour", "dimanche", "ferie"];
function isYearOk(y) { return Number.isInteger(y) && y >= 2000 && y <= 2100; }
function isNumOrNull(v) { return v == null || (typeof v === "number" && Number.isFinite(v)); }
function isPlainObj(o) { return !!o && typeof o === "object" && !Array.isArray(o); }

// Import : liste des problèmes (vide si le fichier est conforme). Ne modifie rien.
function decompteProblems(d) {
  const pb = [];
  if (!isPlainObj(d) || !isPlainObj(d.data)) return ["aucune donnée lisible"];
  for (const k of Object.keys(d.data)) {
    const nom = String(k).slice(0, 30);
    if (!MONTH_KEY_RE.test(k)) { pb.push(`mois « ${nom} »`); continue; }
    const rows = d.data[k];
    if (!Array.isArray(rows)) { pb.push(`${nom} : lignes illisibles`); continue; }
    rows.forEach((r, i) => {
      if (!isPlainObj(r)) { pb.push(`${nom}, ligne ${i + 1}`); return; }
      if (!DAY_RE.test(String(r.day))) pb.push(`${nom}, jour « ${String(r.day).slice(0, 20)} »`);
      for (const f of ROW_NUM_FIELDS) if (!isNumOrNull(r[f])) pb.push(`${nom}, ligne ${i + 1}, ${f}`);
      if (r.note != null && (typeof r.note !== "string" || r.note.length > 200)) pb.push(`${nom}, ligne ${i + 1}, commentaire`);
    });
  }
  if (!Array.isArray(d.order) || !d.order.every(k => typeof k === "string")) pb.push("ordre des mois");
  if (!isPlainObj(d.years)) pb.push("années");
  else for (const [k, y] of Object.entries(d.years)) if (!isYearOk(y)) pb.push(`année de « ${String(k).slice(0, 30)} »`);
  if (d.activeYear != null && !isYearOk(d.activeYear)) pb.push("année affichée");
  return pb;
}

// Chargement : écarte ce qui sort des formes attendues, sans refuser le compte entier.
// Rend le nombre de valeurs écartées (0 pour des données produites par l'appli).
function sanitizeLoadedState() {
  let n = 0;
  if (!isPlainObj(state.data)) { state.data = {}; n++; }
  for (const k of Object.keys(state.data)) {
    if (!MONTH_KEY_RE.test(k) || !Array.isArray(state.data[k])) { delete state.data[k]; n++; continue; }
    const rows = state.data[k];
    const kept = rows.filter(r => isPlainObj(r) && DAY_RE.test(String(r.day)));
    n += rows.length - kept.length;
    for (const r of kept) {
      for (const f of ROW_NUM_FIELDS) if (!isNumOrNull(r[f])) { r[f] = null; n++; }
      if (r.note != null && typeof r.note !== "string") { delete r.note; n++; }
      else if (typeof r.note === "string" && r.note.length > 200) { r.note = r.note.slice(0, 200); n++; }
    }
    state.data[k] = kept;
  }
  if (!isPlainObj(state.years)) { state.years = {}; n++; }
  for (const [k, y] of Object.entries(state.years)) if (!isYearOk(y)) { delete state.years[k]; n++; }
  if (state.activeYear != null && !isYearOk(state.activeYear)) { state.activeYear = null; n++; }
  if (!Array.isArray(state.order)) { state.order = Object.keys(state.data); n++; }
  const ord = state.order.filter(k => typeof k === "string" && state.data[k]);
  n += state.order.length - ord.length;
  state.order = ord;
  return n;
}

// ============ STORAGE ============
async function loadFromStorage() {
  const ref = userDocRef();
  if (!ref) return;
  try {
    const snap = await ref.get();
    if (snap.exists) {
      const saved = snap.data();
      if (saved.data) {
        state.data = saved.data;
        state.order = saved.order || Object.keys(saved.data);
        state.years = saved.years || {};
        if (saved.activeYear) state.activeYear = saved.activeYear;
        for (const m of state.order) {
          if (!state.years[m] && MONTHS_ORIGINAL.includes(m)) {
            state.years[m] = DEFAULT_YEAR;
          }
        }
        if (!state.data[state.active]) state.active = state.order[0];
      }
    } else {
      // Première connexion : initialiser un doc Firestore VIDE
      // (l'utilisateur ajoutera ses mois manuellement ou via Import JSON)
      state.data = {};
      state.order = [];
      state.years = {};
      state.active = null;
      await ref.set({
        data: state.data,
        order: state.order,
        years: state.years,
        activeYear: state.activeYear,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      setStatus("✓ Compte initialisé · vide");
    }
  } catch(e) {
    console.error("Firestore load error:", e);
    const code = e.code || "";
    const msg = e.message || String(e);
    // Toast plus long pour les erreurs critiques
    toastError(`⚠ Chargement impossible — ${code ? code + " : " : ""}${msg}`);
  }

  const ecartees = sanitizeLoadedState();
  if (ecartees > 0) toastError(`⚠ ${ecartees} valeur${ecartees > 1 ? "s" : ""} illisible${ecartees > 1 ? "s" : ""} écartée${ecartees > 1 ? "s" : ""} de tes données`);

  // À l'ouverture : choisir l'année à afficher + le bon mois dans cette année.
  // Règle :
  //  - Si l'utilisateur a une activeYear sauvegardée, on la respecte
  //  - Sinon, on prend l'année actuelle si elle existe, sinon la plus récente
  //  - Dans tous les cas, on applique pickMonthForYear() pour choisir le bon mois
  const years = allYears();
  const currentYear = new Date().getFullYear();
  let targetYear = state.activeYear;
  if (!targetYear || !years.includes(targetYear)) {
    targetYear = years.includes(currentYear) ? currentYear : (years[years.length - 1] || currentYear);
  }
  state.activeYear = targetYear;

  const monthForYear = pickMonthForYear(targetYear);
  if (monthForYear) {
    state.active = monthForYear;
  } else if (state.active && yearOf(state.active) === targetYear) {
    // Conserver l'ancien si pas d'autre choix
  } else {
    state.active = null;
  }

  // Nettoyer les jours invalides
  const summary = cleanupAllMonths();
  if (summary.total > 0) {
    if (summary.withData > 0) {
      setStatus(`✓ ${summary.total} jours hors-mois supprimés (dont ${summary.withData} avec données)`);
    } else {
      setStatus(`✓ ${summary.total} jours hors-mois supprimés automatiquement`);
    }
    await saveToStorage();
  }

  // Recalcul automatique des colonnes auto
  recomputeAllAutoColumns();
  await saveToStorage();
}

async function saveToStorage() {
  const ref = userDocRef();
  if (!ref) return;
  try {
    await ref.set({
      data: state.data,
      order: state.order,
      years: state.years,
      activeYear: state.activeYear,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    setStatus("✓ sauvegardé sur le cloud");
  } catch(e) {
    console.error("Firestore save error:", e);
    setStatus("⚠ Erreur de sauvegarde", true);
  }
}

function setStatus(msg, err) {
  // Plus d'affichage dans l'UI ; les erreurs critiques deviennent des toasts.
  if (err) toast(msg);
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("error");
  t.classList.add("show");
  setTimeout(()=> t.classList.remove("show"), 1800);
}

function toastError(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("error", "show");
  // Affichage long (8s) pour erreurs — le toast reste cliquable pour fermer
  const onClick = () => {
    t.classList.remove("show");
    t.removeEventListener("click", onClick);
  };
  t.addEventListener("click", onClick);
  setTimeout(()=> { t.classList.remove("show"); t.removeEventListener("click", onClick); }, 8000);
}

// ============ HELPERS ============
function fmt(n) {
  if (n === null || n === undefined || n === "" || isNaN(n)) return "";
  const v = Number(n);
  if (v === 0) return "";
  return v % 1 === 0 ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
}
function fmtNum(n) {
  const v = Number(n) || 0;
  return v % 1 === 0 ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
}

function monthTotals(month) {
  const rows = state.data[month] || [];
  const t = { heures: 0, nuit: 0, jour: 0, dimanche: 0, ferie: 0, admin: 0, workedDays: 0 };
  for (const r of rows) {
    t.heures += Number(r.heures) || 0;
    t.nuit += Number(r.nuit) || 0;
    t.jour += Number(r.jour) || 0;
    t.dimanche += Number(r.dimanche) || 0;
    t.ferie += Number(r.ferie) || 0;
    t.admin += Number(r.admin) || 0;
    if ((Number(r.heures) || 0) > 0) t.workedDays++;
  }
  return t;
}

function globalTotals() {
  const t = { heures: 0, nuit: 0, jour: 0, dimanche: 0, ferie: 0, admin: 0, workedDays: 0 };
  for (const m of months()) {
    const mt = monthTotals(m);
    for (const k of Object.keys(t)) t[k] += mt[k];
  }
  return t;
}

// Totaux pour une liste de mois (utilisé pour les stats annuelles)
function totalsForMonths(list) {
  const t = { heures: 0, nuit: 0, jour: 0, dimanche: 0, ferie: 0, admin: 0, workedDays: 0 };
  for (const m of list) {
    const mt = monthTotals(m);
    for (const k of Object.keys(t)) t[k] += mt[k];
  }
  return t;
}

function totalsForYear(year) {
  return totalsForMonths(months().filter(m => yearOf(m) === year));
}

// ============ RENDER ============
function renderGlobal() {
  const monthsList = monthsInActiveYear();
  const nbMonths = monthsList.length;
  const t = totalsForMonths(monthsList);
  document.getElementById("periodCount").textContent = `— ${nbMonths} mois · ${state.activeYear}`;
  const el = document.getElementById("globalStats");

  if (nbMonths === 0) {
    el.innerHTML = `<div class="stat" style="grid-column: 1 / -1"><div class="stat-label">Aucun mois pour ${gpEsc(state.activeYear)}</div><div class="stat-value">—</div><div class="stat-sub">cliquez sur "+ Ajouter un mois" pour commencer</div></div>`;
    return;
  }

  const moyMensuelle = t.heures / nbMonths;
  const moyParGarde = t.workedDays > 0 ? t.heures / t.workedDays : 0;
  const act = analyzeYearActivity(state.activeYear);
  const pctWeekends = act.weekendsTotal > 0 ? (act.weekendsWorked / act.weekendsTotal) * 100 : 0;
  const pctFeries = act.holidaysTotal > 0 ? (act.holidaysWorked / act.holidaysTotal) * 100 : 0;

  el.innerHTML = `
    <div class="stat">
      <div class="stat-label">Moyenne ${gpEsc(state.activeYear)}</div>
      <div class="stat-value">${fmtNum(moyMensuelle.toFixed(1))}<span class="unit">h</span></div>
      <div class="stat-sub">${fmtNum(t.heures)}h sur ${nbMonths} mois</div>
    </div>
    <div class="stat">
      <div class="stat-label">Moyenne par garde</div>
      <div class="stat-value">${fmtNum(moyParGarde.toFixed(1))}<span class="unit">h</span></div>
      <div class="stat-sub">${t.workedDays} gardes effectuées</div>
    </div>
    <div class="stat">
      <div class="stat-label">Part de weekends</div>
      <div class="stat-value">${pctWeekends.toFixed(0)}<span class="unit">%</span></div>
      <div class="stat-sub">${act.weekendsWorked} / ${act.weekendsTotal} weekends${act.bound ? ` · au ${fmtDayMonth(act.bound)}` : " travaillés"}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Part de jours fériés</div>
      <div class="stat-value">${pctFeries.toFixed(0)}<span class="unit">%</span></div>
      <div class="stat-sub">${act.holidaysWorked} / ${act.holidaysTotal} fériés${act.bound ? ` · au ${fmtDayMonth(act.bound)}` : " travaillés"}</div>
    </div>
  `;
}

function renderYearPills() {
  const years = allYears();
  const el = document.getElementById("yearPills");

  // S'assurer que activeYear est valide
  if (!years.includes(state.activeYear) && years.length > 0) {
    state.activeYear = years[years.length - 1];
  }

  let html = years.map(y => {
    const active = y === state.activeYear ? "active" : "";
    return `<button class="year-pill ${active}" data-year="${gpEsc(y)}" type="button">${gpEsc(y)}</button>`;
  }).join("");
  el.innerHTML = html;

  el.querySelectorAll("button[data-year]").forEach(btn => {
    btn.addEventListener("click", () => selectYear(parseInt(btn.dataset.year, 10)));
  });
}

// Trie les mois par (année, index mois). Les "non datés" vont à la fin.
function sortedMonths() {
  const list = [...months()];
  list.sort((a, b) => {
    const ya = yearOf(a), yb = yearOf(b);
    if (ya == null && yb == null) return state.order.indexOf(a) - state.order.indexOf(b);
    if (ya == null) return 1;
    if (yb == null) return -1;
    if (ya !== yb) return ya - yb;
    const ia = MONTHS_ALL.indexOf(realMonthName(a));
    const ib = MONTHS_ALL.indexOf(realMonthName(b));
    if (ia === -1 && ib === -1) return state.order.indexOf(a) - state.order.indexOf(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return list;
}

function cssEscapeMonth(m) {
  // Transforme "Décembre 2025" → "Decembre-2025" (ID CSS valide)
  return m.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-").replace(/[^A-Za-z0-9-_]/g, "");
}

// ============ COMMENTAIRES PAR JOUR ============
let noteEditIdx = null; // index de la ligne éditée dans la modale commentaire

function rowNote(r) { return r && r.note != null ? String(r.note).trim() : ""; }

// Icônes SVG (style lucide, cohérentes avec le reste de l'appli)
function noteIcon(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
}
function warnIcon(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 20h16a2 2 0 0 0 1.73-2Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`;
}

// Sous-titre du tableau, format compact : "31 lignes · valeurs en heures · ⚠ 2 · 🗨 1"
function tableSubHtml(rows) {
  let warns = 0, notes = 0;
  for (const r of rows) { if (getRowIssues(r)) warns++; if (rowNote(r)) notes++; }
  let s = `${rows.length} lignes · valeurs en heures`;
  if (warns) s += ` · <span class="sub-pill warn" title="${warns} anomalie${warns > 1 ? "s" : ""} à vérifier — détail dans le panneau À vérifier">${warnIcon(10)} ${warns}</span>`;
  if (notes) s += ` · <span class="sub-pill note" title="${notes} commentaire${notes > 1 ? "s" : ""}">${noteIcon(10)} ${notes}</span>`;
  return s;
}

function openNoteModal(idx) {
  const m = state.active;
  if (!m || !state.data[m] || !state.data[m][idx]) return;
  noteEditIdx = idx;
  const rows = state.data[m];
  const r = rows[idx];
  const prevSet = detectPrevMonthIndices(rows);
  const wd = getWeekdayForRow(m, yearOf(m), r.day, prevSet.has(idx));
  const wdLabel = wd !== null ? WEEKDAYS_SHORT[wd] + " " : "";
  document.getElementById("noteTitle").textContent = `Commentaire — ${wdLabel}${r.day} ${realMonthName(m).toLowerCase()}`;
  const ta = document.getElementById("noteTextarea");
  ta.value = rowNote(r);
  document.getElementById("noteCharCount").textContent = `${ta.value.length}/200`;
  document.getElementById("noteDeleteBtn").hidden = !rowNote(r);
  document.getElementById("noteOverlay").classList.add("show");
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

function closeNoteModal() {
  noteEditIdx = null;
  document.getElementById("noteOverlay").classList.remove("show");
}

(function noteInit() {
  const ov = document.getElementById("noteOverlay");
  if (!ov) return;
  document.getElementById("noteCloseBtn").addEventListener("click", closeNoteModal);
  document.getElementById("noteCancelBtn").addEventListener("click", closeNoteModal);
  document.getElementById("noteSaveBtn").addEventListener("click", () => saveNoteFromEditor());
  document.getElementById("noteDeleteBtn").addEventListener("click", () => saveNoteFromEditor(""));
  ov.addEventListener("click", (e) => { if (e.target === ov) closeNoteModal(); });
  const ta = document.getElementById("noteTextarea");
  ta.addEventListener("input", () => {
    document.getElementById("noteCharCount").textContent = `${ta.value.length}/200`;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && ov.classList.contains("show")) closeNoteModal();
  });
})();

// Compteurs {warns, notes} d'un mois, pour les badges des cards
function monthFlags(key) {
  const rows = state.data[key] || [];
  let warns = 0, notes = 0;
  rows.forEach(r => {
    if (getRowIssues(r)) warns++;
    if (rowNote(r)) notes++;
  });
  return { warns, notes };
}

function saveNoteFromEditor(txtOverride) {
  const m = state.active;
  const idx = noteEditIdx;
  if (m == null || idx == null || !state.data[m] || !state.data[m][idx]) { closeNoteModal(); return; }
  const ta = document.getElementById("noteTextarea");
  const txt = (txtOverride !== undefined ? txtOverride : (ta ? ta.value : "")).trim().slice(0, 200);
  const r = state.data[m][idx];
  const had = !!rowNote(r);
  if (txt) r.note = txt; else delete r.note;
  closeNoteModal();
  renderTable();
  renderMonths();
  saveToStorage();
  toast(txt ? "Commentaire enregistré" : (had ? "Commentaire supprimé" : "Commentaire vide — rien à enregistrer"));
}

function renderMonths() {
  const el = document.getElementById("months");
  const year = state.activeYear;
  const keyForIdx = (m) => Object.keys(state.data).find(k => realMonthName(k) === MONTHS_ALL[m] && yearOf(k) === year) || null;
  let cells = "";
  for (let m = 0; m < 12; m++) {
    const key = keyForIdx(m);
    const abbr = MONTHS_ALL[m].slice(0, 4);
    if (key) {
      const t = monthTotals(key);
      const sel = key === state.active ? " sel" : "";
      const segs = CATS.map(c => { const v = t[c.key] || 0; const pct = t.heures > 0 ? (v / t.heures) * 100 : 0; return `<span style="width:${pct}%;background:${c.color}"></span>`; }).join("");
      const fl = monthFlags(key);
      const badges = (fl.warns || fl.notes)
        ? `<span class="mp-badges">${fl.warns ? `<span class="mp-bdg warn" title="${fl.warns} anomalie${fl.warns>1?"s":""} à vérifier">${warnIcon(9)} ${fl.warns}</span>` : ""}${fl.notes ? `<span class="mp-bdg note" title="${fl.notes} commentaire${fl.notes>1?"s":""}">${noteIcon(9)} ${fl.notes}</span>` : ""}</span>`
        : "";
      cells += `<button type="button" class="mp-cell created${sel}" data-month="${gpEsc(key)}">${badges}<span class="mp-cell-m">${abbr}</span><span class="mp-cell-h">${fmtNum(t.heures)}<i>h</i></span><span class="mp-cell-g">${t.workedDays} gardes</span><span class="mp-cell-bar">${segs}</span></button>`;
    } else {
      cells += `<button type="button" class="mp-cell empty" data-newmonth="${m}" title="${MONTHS_ALL[m]} ${year} \u2014 Ajouter ce mois"><span class="mp-cell-m">${abbr}</span><span class="mp-cell-plus">+</span></button>`;
    }
  }
  el.innerHTML = `<div class="cal-grid">${cells}</div>`;
  el.querySelectorAll("[data-month]").forEach(b => b.addEventListener("click", () => selectMonth(b.dataset.month)));
  el.querySelectorAll("[data-newmonth]").forEach(b => b.addEventListener("click", () => addMonthWithConfirm(MONTHS_ALL[+b.dataset.newmonth], state.activeYear)));
}

// Détecte les anomalies d'une ligne de saisie.
function getRowIssues(r) {
  const issues = [];
  // Anomalie : Début sans Fin (ou inversement)
  const hasDebut = r.debut != null && r.debut !== "" && !isNaN(Number(r.debut));
  const hasFin = r.fin != null && r.fin !== "" && !isNaN(Number(r.fin));
  if (hasDebut && !hasFin) {
    issues.push({ type: "missing-fin" });
  } else if (!hasDebut && hasFin) {
    issues.push({ type: "missing-debut" });
  }
  const heures = Number(r.heures) || 0;
  if (heures === 0) {
    return issues.length > 0 ? issues : null;
  }
  const nuit = Number(r.nuit) || 0;
  const jour = Number(r.jour) || 0;
  const dim  = Number(r.dimanche) || 0;
  const fer  = Number(r.ferie) || 0;
  const adm  = Number(r.admin) || 0;
  const whenSum = nuit + jour;
  const commentSum = dim + fer + adm;
  if (whenSum < heures - 0.001) {
    issues.push({ type: "when-missing", missing: +(heures - whenSum).toFixed(2), heures, whenSum });
  } else if (whenSum > heures + 0.001) {
    issues.push({ type: "when-excess", excess: +(whenSum - heures).toFixed(2), heures, whenSum });
  }
  if (commentSum > heures + 0.001) {
    issues.push({ type: "comment-excess", excess: +(commentSum - heures).toFixed(2), heures, commentSum });
  }
  return issues.length > 0 ? issues : null;
}

function describeIssues(issues, r) {
  return issues.map(iss => {
    if (iss.type === "missing-fin") return "Début saisi mais Fin manquante";
    if (iss.type === "missing-debut") return "Fin saisie mais Début manquant";
    if (iss.type === "when-missing") return `Il manque ${fmtNum(iss.missing)}h à ventiler entre Nuit et Jour`;
    if (iss.type === "when-excess")  return `Nuit + Jour (${fmtNum(iss.whenSum)}h) dépasse le total (${fmtNum(iss.heures)}h)`;
    if (iss.type === "comment-excess") return `Dim + Fériés + Admin (${fmtNum(iss.commentSum)}h) dépasse le total (${fmtNum(iss.heures)}h)`;
    return "";
  }).join(" · ");
}

function renderTable() {
  const m = state.active;
  if (!m) {
    document.getElementById("tableTitle").textContent = "Aucun mois";
    document.getElementById("tableBody").innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--mute)">Aucun mois sélectionné. Clique sur "+ Ajouter un mois" pour commencer.</td></tr>`;
    return;
  }
  const rows = state.data[m] || [];
  const year = yearOf(m);
  const t = monthTotals(m);

  // Mettre à jour les sous-titres
  document.getElementById("tableTitle").textContent = monthLabel(m);
  document.getElementById("syntheseSub").textContent = monthLabel(m).toLowerCase();

  const tbody = document.getElementById("tableBody");
  const prevSet = detectPrevMonthIndices(rows);
  const prevShort = prevMonthShort(m);
  let warnCount = 0;
  let noteCount = 0;
  tbody.innerHTML = rows.map((r, i) => {
    const isEmpty = !r.heures;
    const isBis = /\s(bis|ter|quater|quinquies|sexies|septies|octies|nonies|\(\d+\))$/i.test(r.day);
    const isPrev = prevSet.has(i);
    const isInvalid = isInvalidDay(m, year, r.day, isPrev);
    const wd = getWeekdayForRow(m, year, r.day, isPrev);
    const wdClass = wd === 0 ? "sun" : wd === 6 ? "sat" : "";
    const wdLabel = wd !== null ? WEEKDAYS_SHORT[wd] : "";
    const holiday = getHolidayForRow(m, year, r.day, isPrev);
    const ferieClass = holiday ? "ferie-row" : "";
    const issues = getRowIssues(r);
    if (issues) warnCount++;
    const warnClass = issues ? "cell-warn" : "";
    const warnTitle = issues ? describeIssues(issues, r).replace(/"/g, "&quot;") : "";
    const classes = [isEmpty ? "empty" : "", isBis ? "bis" : "", isPrev ? "prev-month" : "", isInvalid ? "invalid-day" : "", ferieClass, wdClass].filter(Boolean).join(" ");
    const baseDay = baseDayNumber(r.day);
    const noteVal = rowNote(r);
    if (noteVal) noteCount++;
    const noteBtn = `<button class="row-action note-btn${noteVal ? " note-on" : ""}" data-action="note" data-idx="${i}" title="${noteVal ? gpEsc(noteVal) : "Ajouter un commentaire"}">${noteIcon(12)}</button>`;
    const actionCell = isBis
      ? `<td class="action-cell">${noteBtn}<button class="row-action remove" data-action="remove" data-idx="${i}" title="Supprimer cette garde">×</button></td>`
      : isInvalid
        ? `<td class="action-cell">${noteBtn}<button class="row-action remove" data-action="remove" data-idx="${i}" title="Supprimer cette ligne (jour inexistant)">×</button></td>`
        : `<td class="action-cell">${noteBtn}<button class="row-action" data-action="add-bis" data-base="${baseDay}" title="Ajouter une garde le même jour">+</button></td>`;

    const prevTag = isPrev && prevShort ? `<span class="day-prev">${prevShort}</span>` : "";
    const invalidTag = isInvalid ? `<span class="day-invalid" title="Jour inexistant dans ce mois">⚠</span>` : "";
    const holidayTag = holiday ? `<span class="day-holiday" title="${holiday}" aria-label="Jour férié : ${holiday}"></span>` : "";
    const dstInfo = getDSTInfo(m, year, r.day, isPrev, r.debut, r.fin);
    const dstTag = dstInfo ? `<span class="day-dst" title="Changement d'heure ce jour : ${dstInfo.label}">🕐 ${dstInfo.label}</span>` : "";
    const noteTag = noteVal ? `<span class="day-note" title="${gpEsc(noteVal)}"></span>` : "";

    return `
      <tr class="${classes}" data-idx="${i}">
        <td><div class="day-cell"><span class="day-num">${gpEsc(r.day)}</span>${wdLabel ? `<span class="day-wd">${wdLabel}</span>` : ''}${prevTag}${invalidTag}${holidayTag}${noteTag}${dstTag}</div></td>
        <td><input class="cell-input" type="number" step="0.25" data-field="debut" value="${gpEsc(r.debut ?? '')}" placeholder="—"></td>
        <td><input class="cell-input" type="number" step="0.25" data-field="fin"   value="${gpEsc(r.fin   ?? '')}" placeholder="—"></td>
        <td class="${r.heures ? 'has-value':''} ${warnClass}"><input class="cell-input computed" type="text" data-field="heures" value="${fmt(r.heures)}" placeholder="—" readonly title="${warnTitle || "Calculé automatiquement depuis Début et Fin"}"></td>
        <td class="col-nuit ${r.nuit?'has-value':''}"><input class="cell-input computed" type="text" data-field="nuit"     value="${fmt(r.nuit)}"     placeholder="—" readonly title="Calculé automatiquement"></td>
        <td class="col-jour ${r.jour?'has-value':''}"><input class="cell-input computed" type="text" data-field="jour"     value="${fmt(r.jour)}"     placeholder="—" readonly title="Calculé automatiquement (Heures − Nuit)"></td>
        <td class="col-dim  ${r.dimanche?'has-value':''}"><input class="cell-input computed" type="text" data-field="dimanche" value="${fmt(r.dimanche)}" placeholder="—" readonly title="Calculé automatiquement"></td>
        <td class="col-fer  ${r.ferie?'has-value':''}"><input class="cell-input computed" type="text" data-field="ferie"    value="${fmt(r.ferie)}"    placeholder="—" readonly title="Calculé automatiquement"></td>
        <td class="col-adm  ${r.admin?'has-value':''}"><input class="cell-input" type="number" step="0.25" data-field="admin"    value="${fmt(r.admin)}"    placeholder="—"></td>
        ${actionCell}
      </tr>
    `;
  }).join("") + `
    <tr class="total">
      <td>Total</td>
      <td></td><td></td>
      <td>${fmtNum(t.heures)} h</td>
      <td class="col-nuit" style="color:var(--nuit)">${fmtNum(t.nuit)}</td>
      <td class="col-jour" style="color:var(--jour)">${fmtNum(t.jour)}</td>
      <td class="col-dim" style="color:var(--dimanche)">${fmtNum(t.dimanche)}</td>
      <td class="col-fer" style="color:var(--ferie)">${fmtNum(t.ferie)}</td>
      <td style="color:var(--admin)">${fmtNum(t.admin)}</td>
      <td></td>
    </tr>
  `;

  // Hook inputs (sauf readonly)
  tbody.querySelectorAll("input.cell-input:not([readonly])").forEach(inp => {
    inp.addEventListener("change", onCellChange);
    inp.addEventListener("blur", onCellChange);
  });
  // Hook boutons d'action de ligne
  tbody.querySelectorAll(".row-action").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === "add-bis") {
        addBisRow(parseInt(btn.dataset.base, 10));
      } else if (action === "remove") {
        removeRow(parseInt(btn.dataset.idx, 10));
      } else if (action === "note") {
        openNoteModal(parseInt(btn.dataset.idx, 10));
      }
    });
  });

  // Mise à jour du sous-titre avec compteur d'anomalies
  document.getElementById("tableSub").innerHTML = tableSubHtml(rows);

  renderVerify();
}

// Renseigne le panel "À vérifier" — masqué s'il n'y a rien à signaler
function renderVerify() {
  const panel = document.getElementById("verifyPanel");
  if (!panel) return;
  const m = state.active;
  if (!m || !state.data[m]) { panel.hidden = true; return; }
  const rows = state.data[m];
  const year = yearOf(m);
  const prevSet = detectPrevMonthIndices(rows);

  // Une seule liste, triée par jour croissant (l'ordre des lignes du tableau) :
  // anomalies (⚠) et commentaires (💬) mélangés — l'anomalie d'abord si même jour.
  const items = [];
  rows.forEach((r, i) => {
    const issues = getRowIssues(r);
    const noteTxt = rowNote(r);
    if (!issues && !noteTxt) return;
    const isPrev = prevSet.has(i);
    const wd = getWeekdayForRow(m, year, r.day, isPrev);
    const wdLabel = wd !== null ? WEEKDAYS_SHORT[wd] : "";
    if (issues) items.push({ kind: "issue", idx: i, day: r.day, wdLabel, r, issues });
    if (noteTxt) items.push({ kind: "note", idx: i, day: r.day, wdLabel, r, note: noteTxt });
  });

  if (items.length === 0) {
    // État B1 : aucune anomalie — panel toujours visible
    panel.hidden = false;
    const countEl = document.getElementById("verifyCount");
    countEl.textContent = "0";
    countEl.classList.remove("pills");
    countEl.classList.add("ok");
    document.getElementById("verifyList").innerHTML = `
      <div class="verify-empty">
        <div class="verify-empty-circle" aria-hidden="true">✓</div>
        <div class="verify-empty-text">Aucune anomalie ni commentaire</div>
      </div>
    `;
    requestAnimationFrame(syncPanelHeights);
    return;
  }

  panel.hidden = false;
  const nbIssues = items.filter(it => it.kind === "issue").length;
  const nbNotes = items.length - nbIssues;
  const countEl = document.getElementById("verifyCount");
  countEl.classList.remove("ok");
  countEl.classList.add("pills");
  countEl.innerHTML =
    (nbIssues ? `<span class="sub-pill warn" title="${nbIssues} anomalie${nbIssues > 1 ? "s" : ""}">${warnIcon(10)} ${nbIssues}</span>` : "") +
    (nbNotes ? `<span class="sub-pill note" title="${nbNotes} commentaire${nbNotes > 1 ? "s" : ""}">${noteIcon(10)} ${nbNotes}</span>` : "");
  document.getElementById("verifyList").innerHTML = items.map(it => {
    if (it.kind === "note") {
      return `
      <button class="verify-item is-note" data-idx="${it.idx}" type="button">
        <div class="v-day">${gpEsc(it.r.day)} <span class="wd">${it.wdLabel}</span></div>
        <div class="v-detail"><span class="v-comment">${noteIcon(12)} « ${gpEsc(it.note)} »</span></div>
        <div class="v-arrow">›</div>
      </button>
      `;
    }
    const r = it.r;
    const heures = Number(r.heures) || 0;
    const nuit = Number(r.nuit) || 0;
    const jour = Number(r.jour) || 0;
    const detailParts = [];
    detailParts.push(`Total <span class="ok">${fmtNum(heures)}h</span>`);
    detailParts.push(`Nuit <span class="ok">${fmtNum(nuit)}h</span> + Jour <span class="ok">${fmtNum(jour)}h</span> = <span class="${nuit + jour !== heures ? 'focus' : 'ok'}">${fmtNum(nuit + jour)}h</span>`);
    const desc = describeIssues(it.issues, r);
    return `
      <button class="verify-item" data-idx="${it.idx}" type="button">
        <div class="v-day">${gpEsc(r.day)} <span class="wd">${it.wdLabel}</span></div>
        <div class="v-detail">
          <span style="color:var(--color-primary)">${warnIcon(12)}</span> ${detailParts.join(" · ")}
          <br><span class="v-note">${desc}</span>
        </div>
        <div class="v-arrow">›</div>
      </button>
    `;
  }).join("");

  document.querySelectorAll("#verifyList .verify-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const tr = document.querySelector(`#tableBody tr[data-idx="${idx}"]`);
      if (tr) {
        tr.scrollIntoView({ behavior: "smooth", block: "center" });
        tr.classList.add("highlight-row");
        setTimeout(() => tr.classList.remove("highlight-row"), 1600);
      }
    });
  });

  requestAnimationFrame(syncPanelHeights);
}

function renderSynthese() {
  const m = state.active;
  if (!m) {
    document.getElementById("bigTotal").innerHTML = "—";
    document.getElementById("bigNote").textContent = "";
    document.getElementById("synWhenBar").innerHTML = "";
    document.getElementById("synWhenLegend").innerHTML = "";
    document.getElementById("synWhatBar").innerHTML = "";
    document.getElementById("synWhatLegend").innerHTML = "";
    return;
  }
  const t = monthTotals(m);
  document.getElementById("bigTotal").innerHTML = `${fmtNum(t.heures)}<span class="unit">h</span>`;
  document.getElementById("bigNote").textContent = `${t.workedDays} gardes · moyenne ${fmtNum((t.heures/Math.max(t.workedDays,1)).toFixed(1))}h/garde`;

  // Décomposition double : "Quand" et "Comment"
  const normal = Math.max(0, t.heures - t.dimanche - t.ferie - t.admin);
  const what = { normal, dimanche: t.dimanche, ferie: t.ferie, admin: t.admin };
  const when = { nuit: t.nuit, jour: t.jour };

  // Render d'une section (barre empilée + légende)
  function renderSection(cats, vals, total, barEl, legendEl) {
    barEl.innerHTML = cats.map(c => {
      const v = vals[c.key] || 0;
      const pct = total > 0 ? (v / total) * 100 : 0;
      return v > 0
        ? `<div class="seg" style="width:${pct}%; background:${c.color}" title="${c.label} : ${fmtNum(v)}h (${pct.toFixed(0)}%)"></div>`
        : "";
    }).join("");
    legendEl.innerHTML = cats.map(c => {
      const v = vals[c.key] || 0;
      return `
        <div class="syn-leg">
          <span class="dot" style="background:${c.color}"></span>
          <span class="name">${c.label}</span>
          <span class="val">${fmtNum(v)}<span class="u">h</span></span>
        </div>
      `;
    }).join("");
  }

  renderSection(CATS_WHEN, when, t.heures,
    document.getElementById("synWhenBar"),
    document.getElementById("synWhenLegend"));
  renderSection(CATS_WHAT, what, t.heures,
    document.getElementById("synWhatBar"),
    document.getElementById("synWhatLegend"));
}

function renderStacked() {
  const ctx = document.getElementById("stackedChart");
  const list = monthsInActiveYear();
  if (list.length === 0) {
    if (stackedChart) {
      stackedChart.destroy();
      stackedChart = null;
    }
    return;
  }

  // Données : total mensuel
  const totals = list.map(m => monthTotals(m).heures);
  const avg = totals.length > 0 ? totals.reduce((a,b) => a + b, 0) / totals.length : 0;

  // Indices min/max pour highlight
  let maxIdx = 0, minIdx = 0;
  totals.forEach((v, i) => {
    if (v > totals[maxIdx]) maxIdx = i;
    if (v < totals[minIdx]) minIdx = i;
  });

  // Couleur et taille de chaque point
  const pointColors = totals.map((_, i) => {
    if (i === maxIdx) return '#c90c0f';
    if (i === minIdx) return '#2E7D5B';
    return '#064969';
  });
  const pointRadius = totals.map((_, i) => (i === maxIdx || i === minIdx) ? 6 : 4);
  const pointHoverRadius = totals.map((_, i) => (i === maxIdx || i === minIdx) ? 8 : 6);

  // Labels d'axe
  const labels = list.map(m => {
    const name = realMonthName(m);
    return name.length > 4 ? name.slice(0, 4) + "." : name;
  });

  const data = {
    labels,
    datasets: [{
      label: "Total mensuel",
      data: totals,
      borderColor: "#064969",
      borderWidth: 2.5,
      tension: 0.25,
      fill: true,
      backgroundColor: (ctx) => {
        const c = ctx.chart.ctx;
        const g = c.createLinearGradient(0, 0, 0, ctx.chart.height);
        g.addColorStop(0, "rgba(6, 73, 105, 0.22)");
        g.addColorStop(1, "rgba(6, 73, 105, 0)");
        return g;
      },
      pointBackgroundColor: pointColors,
      pointBorderColor: "#ffffff",
      pointBorderWidth: 2,
      pointRadius,
      pointHoverRadius,
      pointHoverBackgroundColor: pointColors,
      pointHoverBorderColor: "#ffffff",
      pointHoverBorderWidth: 2.5,
    }]
  };

  // Plugin pour tracer la ligne de moyenne pointillée
  const averageLinePlugin = {
    id: "averageLine",
    afterDatasetsDraw(chart) {
      const { ctx: c, chartArea, scales } = chart;
      if (!chartArea || avg === 0) return;
      const y = scales.y.getPixelForValue(avg);
      c.save();
      c.beginPath();
      c.setLineDash([4, 4]);
      c.strokeStyle = "#c90c0f";
      c.globalAlpha = 0.55;
      c.lineWidth = 1.2;
      c.moveTo(chartArea.left, y);
      c.lineTo(chartArea.right, y);
      c.stroke();
      // Label "moy."
      c.setLineDash([]);
      c.globalAlpha = 0.85;
      c.font = "700 9px Lato";
      c.fillStyle = "#c90c0f";
      c.textAlign = "left";
      c.textBaseline = "middle";
      c.fillText(`moy. ${fmtNum(avg.toFixed(1))}h`, chartArea.right - 80, y - 8);
      c.restore();
    }
  };

  if (stackedChart) {
    stackedChart.destroy();
    stackedChart = null;
  }
  stackedChart = new Chart(ctx, {
    type: "line",
    data,
    plugins: [averageLinePlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 18, right: 12, left: 4 } },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { family: "Lato", size: 11 },
            color: (ctx) => {
              if (ctx.index === maxIdx) return "#c90c0f";
              if (ctx.index === minIdx) return "#2E7D5B";
              return "#333333";
            }
          }
        },
        y: {
          grid: { color: "#f0f0f2" },
          ticks: { font: { family: "Lato", size: 11 }, color: "#888888", callback: v => v + "h" },
          beginAtZero: true,
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: makeExternalTooltip(list, maxIdx, minIdx)
        }
      },
      interaction: { mode: "index", intersect: false },
    }
  });
}

// Tooltip HTML custom — variante B (mini-barres de répartition)
function makeExternalTooltip(list, maxIdx, minIdx) {
  return function(context) {
    const chart = context.chart;
    let tooltipEl = document.body.querySelector("div.chart-tooltip");
    if (!tooltipEl) {
      tooltipEl = document.createElement("div");
      tooltipEl.className = "chart-tooltip";
      document.body.appendChild(tooltipEl);
    }

    const tooltip = context.tooltip;
    if (tooltip.opacity === 0) {
      tooltipEl.style.opacity = 0;
      // Replacer en haut à gauche pour ne pas étirer la page une fois masquée
      tooltipEl.style.top = "0px";
      tooltipEl.style.left = "0px";
      return;
    }

    if (tooltip.dataPoints && tooltip.dataPoints.length) {
      const idx = tooltip.dataPoints[0].dataIndex;
      const m = list[idx];
      const t = monthTotals(m);
      const normal = Math.max(0, t.heures - t.dimanche - t.ferie - t.admin);
      const yearStr = yearOf(m) || "";

      // Largeurs des segments — Quand
      const whenSum = t.nuit + t.jour;
      const wn = whenSum > 0 ? (t.nuit / whenSum) * 100 : 0;
      const wj = whenSum > 0 ? (t.jour / whenSum) * 100 : 0;

      // Largeurs des segments — Comment
      const whatSum = normal + t.dimanche + t.ferie + t.admin;
      const cN = whatSum > 0 ? (normal / whatSum) * 100 : 0;
      const cD = whatSum > 0 ? (t.dimanche / whatSum) * 100 : 0;
      const cF = whatSum > 0 ? (t.ferie / whatSum) * 100 : 0;
      const cA = whatSum > 0 ? (t.admin / whatSum) * 100 : 0;

      // Badge pic / creux
      let pillHtml = "";
      if (idx === maxIdx) pillHtml = `<span class="ctt-pill peak">Pic</span>`;
      else if (idx === minIdx) pillHtml = `<span class="ctt-pill low">Creux</span>`;

      tooltipEl.innerHTML = `
        <div class="ctt-head">
          <div>
            <div class="ctt-month">${gpEsc(realMonthName(m))} ${gpEsc(yearStr)}</div>
            <div class="ctt-gardes">${t.workedDays} ${t.workedDays > 1 ? "gardes" : "garde"}</div>
          </div>
          <div class="ctt-head-right">
            <div class="ctt-total">${fmtNum(t.heures)}<span class="ctt-unit"> h</span></div>
            ${pillHtml}
          </div>
        </div>
        <div class="ctt-section-label">Quand</div>
        <div class="ctt-bar">
          <div style="background:#2D2D3E;width:${wn}%"></div>
          <div style="background:#E5A547;width:${wj}%"></div>
        </div>
        <div class="ctt-row">
          <div><span class="ctt-dot" style="background:#2D2D3E"></span>Nuit<span class="ctt-val">${fmtNum(t.nuit)} h</span></div>
          <div><span class="ctt-dot" style="background:#E5A547"></span>Jour<span class="ctt-val">${fmtNum(t.jour)} h</span></div>
        </div>
        <div class="ctt-section-label">Comment</div>
        <div class="ctt-bar">
          <div style="background:#9ca3af;width:${cN}%"></div>
          <div style="background:#c90c0f;width:${cD}%"></div>
          <div style="background:#2E7D5B;width:${cF}%"></div>
          <div style="background:#6B4E8E;width:${cA}%"></div>
        </div>
        <div class="ctt-grid">
          <div><span class="ctt-dot" style="background:#9ca3af"></span>Normal<span class="ctt-val">${fmtNum(normal)} h</span></div>
          <div><span class="ctt-dot" style="background:#c90c0f"></span>Dimanche<span class="ctt-val">${fmtNum(t.dimanche)} h</span></div>
          <div><span class="ctt-dot" style="background:#2E7D5B"></span>Férié<span class="ctt-val">${fmtNum(t.ferie)} h</span></div>
          <div><span class="ctt-dot" style="background:#6B4E8E"></span>Admin<span class="ctt-val">${fmtNum(t.admin)} h</span></div>
        </div>
      `;
    }

    // Positionnement en coordonnées page (tooltip est sur le body)
    const canvasRect = chart.canvas.getBoundingClientRect();
    const ptXView = canvasRect.left + tooltip.caretX;
    const ptYView = canvasRect.top + tooltip.caretY;

    const ttW = tooltipEl.offsetWidth || 270;
    const ttH = tooltipEl.offsetHeight || 240;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const margin = 12;

    // X : centré sur le point, recadré dans le viewport
    let leftView = ptXView - ttW / 2;
    if (leftView < margin) leftView = margin;
    if (leftView + ttW > vw - margin) leftView = vw - ttW - margin;

    // Y : au-dessus si possible, sinon en dessous
    let topView = ptYView - ttH - 14;
    if (topView < margin) {
      topView = ptYView + 14;
    }
    // Si toujours trop bas, on remonte au max possible
    if (topView + ttH > vh - margin) {
      topView = vh - ttH - margin;
      if (topView < margin) topView = margin;
    }

    // Conversion en coordonnées page (avec scroll)
    tooltipEl.style.left = (leftView + window.scrollX) + "px";
    tooltipEl.style.top = (topView + window.scrollY) + "px";
    tooltipEl.style.opacity = 1;
  };
}

function renderInsights() {
  const list = monthsInActiveYear();
  const all = list.map(m => ({ m, t: monthTotals(m) }));
  const total = totalsForMonths(list);

  if (all.length === 0) {
    document.getElementById("insights").innerHTML = `<div class="insight-item"><div class="idetail">Aucun mois pour ${gpEsc(state.activeYear)} — ajoutes-en un.</div></div>`;
    return;
  }

  const maxMonth = all.reduce((a,b) => a.t.heures > b.t.heures ? a : b);
  const minMonth = all.reduce((a,b) => a.t.heures < b.t.heures ? a : b);
  const avg = all.length > 0 ? total.heures / all.length : 0;

  const act = analyzeYearActivity(state.activeYear);
  const pctWeekends = act.weekendsTotal > 0 ? (act.weekendsWorked / act.weekendsTotal) * 100 : 0;
  const pctFeries = act.holidaysTotal > 0 ? (act.holidaysWorked / act.holidaysTotal) * 100 : 0;

  document.getElementById("insights").innerHTML = `
    <div class="insight-headline">
      <div class="ihead-value">${fmtNum(total.heures)}<span class="unit">h</span></div>
      <div class="ihead-sub">sur ${list.length} mois · soit <strong>${fmtNum(avg.toFixed(1))} h</strong> en moyenne par mois</div>
    </div>
    <div class="insight-cards">
      <div class="insight-card low">
        <div class="icard-label">Mois le + calme</div>
        <div class="icard-value">${gpEsc(realMonthName(minMonth.m))} · ${fmtNum(minMonth.t.heures)} h</div>
      </div>
      <div class="insight-card peak">
        <div class="icard-label">Mois le + chargé</div>
        <div class="icard-value">${gpEsc(realMonthName(maxMonth.m))} · ${fmtNum(maxMonth.t.heures)} h</div>
      </div>
    </div>
    <div class="insight-bar">
      <div class="insight-bar-head">
        <span class="insight-bar-label">Weekends travaillés</span>
        <span class="insight-bar-value">${act.weekendsWorked} / ${act.weekendsTotal}</span>
      </div>
      <div class="insight-bar-track">
        <div class="insight-bar-fill wk" style="width: ${pctWeekends}%"></div>
      </div>
      <div class="insight-bar-sub">soit ${pctWeekends.toFixed(0)} % des weekends ${act.bound ? `du 1er janvier au ${fmtDayMonth(act.bound)}` : `de ${gpEsc(state.activeYear)}`}</div>
    </div>
    <div class="insight-bar">
      <div class="insight-bar-head">
        <span class="insight-bar-label">Jours fériés travaillés</span>
        <span class="insight-bar-value">${act.holidaysWorked} / ${act.holidaysTotal}</span>
      </div>
      <div class="insight-bar-track">
        <div class="insight-bar-fill ho" style="width: ${pctFeries}%"></div>
      </div>
      <div class="insight-bar-sub">soit ${pctFeries.toFixed(0)} % des fériés ${act.bound ? `du 1er janvier au ${fmtDayMonth(act.bound)}` : `de ${gpEsc(state.activeYear)}`}</div>
    </div>
  `;
}

// ============ BILAN ANNUEL — MODE GRAPHIQUE ============
const YCH_METRICS = [
  { key: "heures", label: "Heures", color: "#064969", unit: "h" },
  { key: "gardes", label: "Gardes", color: "#064969", unit: "" },
  { key: "nuit", label: "Nuit", color: "#2D2D3E", unit: "h" },
  { key: "dimanche", label: "Dimanches", color: "#c90c0f", unit: "h" },
  { key: "ferie", label: "Fériés", color: "#2E7D5B", unit: "h" },
  { key: "admin", label: "Admin", color: "#6B4E8E", unit: "h" },
  { key: "moy", label: "Moy./garde", color: "#2F6E9E", unit: "h" },
];
let yearlyView = localStorage.getItem("ychView") === "chart" ? "chart" : "table";
let ychMetricKey = localStorage.getItem("ychMetric") || "heures";
let yearlyChartInst = null;

// Weekends et fériés travaillés d'un mois (mêmes règles que analyzeYearActivity :
// ≥1h le dimanche — débordement du samedi compris —, ≥2h un jour férié)
function monthWorkedCounts(monthKey) {
  const rows = state.data[monthKey] || [];
  const year = yearOf(monthKey);
  if (!year) return { we: 0, jf: 0 };
  const prevSet = detectPrevMonthIndices(rows);
  const weSet = new Set(), jfSet = new Set();
  rows.forEach((r, i) => {
    const heures = Number(r.heures) || 0;
    if (heures === 0) return;
    const isPrev = prevSet.has(i);
    const info = getDateForRow(monthKey, year, r.day, isPrev);
    if (!info) return;
    const debut = Number(r.debut) || 0;
    const fin = Number(r.fin) || 0;
    const crosses = (debut > 0 || fin > 0) && fin < debut;
    if (info.weekday === 0) {
      if (heures >= 1) weSet.add(dateKey(info));
    } else if (info.weekday === 6 && crosses && fin >= 1) {
      const sunday = new Date(info.year, info.month, info.day + 1);
      weSet.add(dateKey({ year: sunday.getFullYear(), month: sunday.getMonth(), day: sunday.getDate() }));
    }
    const holiday = getHolidayForRow(monthKey, year, r.day, isPrev);
    if (holiday && heures >= 2) jfSet.add(dateKey(info));
    if (crosses && fin >= 2) {
      const tomorrow = new Date(info.year, info.month, info.day + 1);
      const tKey = `${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
      if (getHolidaysForYear(tomorrow.getFullYear()).has(tKey)) jfSet.add(`${tomorrow.getFullYear()}-${tKey}`);
    }
  });
  return { we: weSet.size, jf: jfSet.size };
}

// Tous les mois suivis, chronologiques, toutes années confondues
function yearlyChartData() {
  return sortedMonths()
    .filter(m => yearOf(m))
    .map(m => {
      const t = monthTotals(m);
      const name = realMonthName(m);
      const abbr = name.length > 4 ? name.slice(0, 4) + "." : name;
      const counts = monthWorkedCounts(m);
      return { key: m, label: `${abbr} ${String(yearOf(m)).slice(2)}`, fullLabel: `${name} ${yearOf(m)}`, year: yearOf(m), t, we: counts.we, jf: counts.jf };
    });
}

function ychValue(d, key) {
  if (key === "gardes") return d.t.workedDays;
  if (key === "moy") return d.t.workedDays ? +(d.t.heures / d.t.workedDays).toFixed(1) : 0;
  return d.t[key] || 0;
}

// Tooltip "Détaillé" : mois + gardes/moyenne + valeur + Nuit/Dimanche/Férié/Admin
function makeYearlyTooltip(data, maxIdx, minIdx, metric) {
  return function (context) {
    let el = document.body.querySelector("div.ych-tooltip");
    if (!el) { el = document.createElement("div"); el.className = "ych-tooltip"; document.body.appendChild(el); }
    const tooltip = context.tooltip;
    if (tooltip.opacity === 0) { el.style.opacity = 0; el.style.top = "0px"; el.style.left = "0px"; return; }
    if (tooltip.dataPoints && tooltip.dataPoints.length) {
      const idx = tooltip.dataPoints[0].dataIndex;
      const d = data[idx];
      const val = ychValue(d, metric.key);
      let pill = "";
      if (idx === maxIdx) pill = `<span class="ctt-pill peak">Pic</span>`;
      else if (idx === minIdx) pill = `<span class="ctt-pill low">Creux</span>`;
      el.innerHTML = `
        <div class="ctt-head" style="margin-bottom:0">
          <div>
            <div class="ctt-month">${gpEsc(d.fullLabel)}</div>
            <div class="ctt-gardes">${d.t.workedDays} ${d.t.workedDays > 1 ? "gardes" : "garde"} · moy. ${ychValue(d, "moy")} h</div>
          </div>
          <div class="ctt-head-right">
            <div class="ctt-total">${fmtNum(val)}<span class="ctt-unit"> ${metric.unit || ""}</span></div>
            ${pill}
          </div>
        </div>
        <div class="ctt-sep"></div>
        <div class="ctt-tab">
          <div><span class="k"><span class="ctt-dot" style="background:#2D2D3E"></span>Nuit</span><span class="v">${fmtNum(d.t.nuit)} h</span></div>
          <div><span class="k"><span class="ctt-dot" style="background:#c90c0f"></span>Dimanche</span><span class="v">${fmtNum(d.t.dimanche)} h</span></div>
          <div><span class="k"><span class="ctt-dot" style="background:#2E7D5B"></span>Férié</span><span class="v">${fmtNum(d.t.ferie)} h</span></div>
          <div><span class="k"><span class="ctt-dot" style="background:#6B4E8E"></span>Admin</span><span class="v">${fmtNum(d.t.admin)} h</span></div>
        </div>
        ${metric.key === "dimanche" ? `<div class="ctt-sep"></div><div class="ctt-tab"><div><span class="k"><span class="ctt-dot" style="background:#c90c0f"></span>Weekends travaillés</span><span class="v">${d.we}</span></div></div>` : ""}
        ${metric.key === "ferie" ? `<div class="ctt-sep"></div><div class="ctt-tab"><div><span class="k"><span class="ctt-dot" style="background:#2E7D5B"></span>Fériés travaillés</span><span class="v">${d.jf}</span></div></div>` : ""}`;
    }
    // Positionnement au-dessus du point, recadré dans le viewport
    const canvasRect = context.chart.canvas.getBoundingClientRect();
    const ptX = canvasRect.left + tooltip.caretX;
    const ptY = canvasRect.top + tooltip.caretY;
    const ttW = el.offsetWidth || 252, ttH = el.offsetHeight || 150;
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight, margin = 12;
    let left = ptX - ttW / 2;
    if (left < margin) left = margin;
    if (left + ttW > vw - margin) left = vw - ttW - margin;
    let top = ptY - ttH - 14;
    if (top < margin) top = ptY + 14;
    if (top + ttH > vh - margin) top = Math.max(margin, vh - ttH - margin);
    el.style.left = (left + window.scrollX) + "px";
    el.style.top = (top + window.scrollY) + "px";
    el.style.opacity = 1;
  };
}

function renderYearlyChart() {
  const canvas = document.getElementById("yearlyChart");
  if (!canvas) return;
  const data = yearlyChartData();
  if (yearlyChartInst) { yearlyChartInst.destroy(); yearlyChartInst = null; }
  if (data.length === 0) return;
  const metric = YCH_METRICS.find(mm => mm.key === ychMetricKey) || YCH_METRICS[0];
  const vals = data.map(d => ychValue(d, metric.key));
  let maxIdx = 0, minIdx = 0;
  vals.forEach((v, i) => { if (v > vals[maxIdx]) maxIdx = i; if (v < vals[minIdx]) minIdx = i; });
  const pc = vals.map((_, i) => i === maxIdx ? "#c90c0f" : i === minIdx ? "#2E7D5B" : metric.color);
  const pr = vals.map((_, i) => (i === maxIdx || i === minIdx) ? 6 : 3.5);

  // Ratios annuels weekends/fériés travaillés (dénominateurs bornés pour
  // l'année en cours) — affichés dans l'étiquette de bande sur ces filtres
  const showRatio = metric.key === "dimanche" || metric.key === "ferie";
  const actByYear = {};
  if (showRatio) {
    [...new Set(data.map(d => d.year))].forEach(y => { actByYear[y] = analyzeYearActivity(y); });
  }

  // Fond alterné par année + étiquette de l'année au changement
  const yearBands = {
    id: "ychYearBands",
    beforeDraw(c) {
      const { ctx, chartArea: a, scales: { x } } = c;
      if (!a || data.length === 0) return;
      const half = x.width / data.length / 2;
      let start = 0;
      ctx.save();
      for (let i = 1; i <= data.length; i++) {
        if (i === data.length || data[i].year !== data[start].year) {
          const x1 = x.getPixelForValue(start) - half;
          const x2 = x.getPixelForValue(i - 1) + half;
          if (data[start].year % 2 === 0) { ctx.fillStyle = "rgba(6,73,105,.035)"; ctx.fillRect(x1, a.top, x2 - x1, a.bottom - a.top); }
          const year = data[start].year;
          let lbl = String(year);
          if (showRatio && actByYear[year]) {
            const act = actByYear[year];
            lbl += metric.key === "dimanche"
              ? ` · ${act.weekendsWorked}/${act.weekendsTotal} we`
              : ` · ${act.holidaysWorked}/${act.holidaysTotal} JF`;
          }
          ctx.fillStyle = showRatio ? metric.color : "#8899a6";
          ctx.font = "900 10px Lato"; ctx.textAlign = "left";
          ctx.fillText(lbl, Math.max(x1 + 6, a.left + 6), a.top + 12);
          start = i;
        }
      }
      ctx.restore();
    }
  };

  // Ligne de moyenne globale (tous les mois suivis), pointillée
  const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  const globalAvgLine = {
    id: "ychGlobalAvg",
    afterDatasetsDraw(c) {
      const { ctx, chartArea: a, scales: { y } } = c;
      if (!a || avg === 0) return;
      const py = y.getPixelForValue(avg);
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "#c90c0f";
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.2;
      ctx.moveTo(a.left, py);
      ctx.lineTo(a.right, py);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.9;
      ctx.font = "700 9.5px Lato";
      ctx.fillStyle = "#c90c0f";
      ctx.textAlign = "right";
      ctx.fillText(`moy. ${fmtNum(avg.toFixed(1))}${metric.unit || ""}`, a.right - 6, py - 7);
      ctx.restore();
    }
  };

  yearlyChartInst = new Chart(canvas, {
    type: "line",
    data: {
      labels: data.map(d => d.label),
      datasets: [{
        data: vals,
        borderColor: metric.color,
        borderWidth: 2.5,
        tension: 0.25,
        fill: true,
        backgroundColor: (c) => {
          const { ctx, chartArea: a } = c.chart;
          if (!a) return "rgba(6,73,105,.06)";
          const g = ctx.createLinearGradient(0, a.top, 0, a.bottom);
          g.addColorStop(0, metric.color + "33");
          g.addColorStop(1, metric.color + "05");
          return g;
        },
        pointBackgroundColor: pc,
        pointBorderColor: "#fff",
        pointBorderWidth: 1.5,
        pointRadius: pr,
        pointHoverRadius: 7,
        pointHoverBackgroundColor: pc,
        pointHoverBorderColor: "#fff",
        pointHoverBorderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 18, right: 8, left: 2 } },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false, external: makeYearlyTooltip(data, maxIdx, minIdx, metric) },
      },
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { beginAtZero: true, grid: { color: "#f0f0f2" }, ticks: { font: { family: "Lato", size: 11 }, color: "#888888", callback: v => v + (metric.unit || "") } },
        x: { grid: { display: false }, ticks: { font: { family: "Lato", size: 10 }, color: "#888888", maxRotation: 45, minRotation: 45 } },
      },
    },
    plugins: [yearBands, globalAvgLine],
  });
}

function renderYchChips() {
  const el = document.getElementById("ychChips");
  if (!el) return;
  el.innerHTML = YCH_METRICS.map(mm =>
    `<button type="button" class="gp-chip ${mm.key === ychMetricKey ? "active" : ""}" data-ych="${mm.key}"><span class="dot" style="background:${mm.color}"></span>${mm.label}</button>`
  ).join("");
}

function applyYearlyView() {
  const table = document.getElementById("yearlyTable");
  const chartView = document.getElementById("yearlyChartView");
  const bTable = document.getElementById("ysTable");
  const bChart = document.getElementById("ysChart");
  if (!table || !chartView) return;
  const isChart = yearlyView === "chart";
  table.hidden = isChart;
  chartView.hidden = !isChart;
  if (bTable) bTable.classList.toggle("on", !isChart);
  if (bChart) bChart.classList.toggle("on", isChart);
  if (isChart) { renderYchChips(); renderYearlyChart(); }
  requestAnimationFrame(syncPanelHeights);
}

// ============ INTERACTIONS ============
function selectMonth(m) {
  state.active = m;
  const y = yearOf(m);
  if (y && y !== state.activeYear) {
    state.activeYear = y;
    renderAll();
  } else {
    renderMonths();
    renderTable();
    renderSynthese();
  }
  saveToStorage();
}

function onCellChange(e) {
  const tr = e.target.closest("tr");
  const idx = Number(tr.dataset.idx);
  const field = e.target.dataset.field;
  const raw = e.target.value.trim();
  const isTime = field === "debut" || field === "fin";
  const val = raw === "" ? (isTime ? null : 0) : Number(raw);

  state.data[state.active][idx][field] = isNaN(val) ? (isTime ? null : 0) : val;

  // Si on touche à Début ou Fin → recalcul automatique des heures (avec DST éventuel)
  if (isTime) {
    const row = state.data[state.active][idx];
    const rowsList = state.data[state.active];
    const prevSetLocal = detectPrevMonthIndices(rowsList);
    const isPrev = prevSetLocal.has(idx);
    const yearLocal = yearOf(state.active);
    row.heures = computeHeuresWithDST(row.debut, row.fin, state.active, yearLocal, row.day, isPrev);
    row.nuit = computeNuit(row.debut, row.fin, row.heures);
    row.jour = Math.max(0, row.heures - row.nuit);
    row.dimanche = computeDim(row.debut, row.fin, state.active, yearLocal, row.day, isPrev);
    row.ferie = computeFerie(row.debut, row.fin, state.active, yearLocal, row.day, isPrev);
    // Mettre à jour les 5 inputs (heures + 4 auto)
    for (const field of ["heures", "nuit", "jour", "dimanche", "ferie"]) {
      const inp = tr.querySelector(`input[data-field="${field}"]`);
      if (!inp) continue;
      inp.value = fmt(row[field]);
      const td = inp.closest("td");
      if (td) {
        if (row[field]) td.classList.add("has-value");
        else td.classList.remove("has-value");
      }
    }
    // Mettre à jour le badge DST
    const dayCell = tr.querySelector(".day-cell");
    if (dayCell) {
      const oldDstTag = dayCell.querySelector(".day-dst");
      if (oldDstTag) oldDstTag.remove();
      const dstInfo = getDSTInfo(state.active, yearLocal, row.day, isPrev, row.debut, row.fin);
      if (dstInfo) {
        const span = document.createElement("span");
        span.className = "day-dst";
        span.setAttribute("title", `Changement d'heure ce jour : ${dstInfo.label}`);
        span.textContent = `🕐 ${dstInfo.label}`;
        dayCell.appendChild(span);
      }
    }
    // Maj de la classe de ligne (empty si tout = 0)
    if (row.heures) tr.classList.remove("empty");
    else tr.classList.add("empty");
  }

  renderYearPills();
  renderMonths();
  renderSynthese();
  renderStacked();
  renderGlobal();
  renderInsights();
  renderYearlySummary();

  // Update only the relevant cell style
  const cellTd = e.target.closest("td");
  if (cellTd && !isTime) {
    if (val && val !== 0) cellTd.classList.add("has-value");
    else cellTd.classList.remove("has-value");
  }

  // Update total row
  const t = monthTotals(state.active);
  const totalTr = document.querySelector("#tableBody tr.total");
  if (totalTr) {
    const tds = totalTr.querySelectorAll("td");
    tds[3].textContent = `${fmtNum(t.heures)} h`;
    tds[4].textContent = fmtNum(t.nuit);
    tds[5].textContent = fmtNum(t.jour);
    tds[6].textContent = fmtNum(t.dimanche);
    tds[7].textContent = fmtNum(t.ferie);
    tds[8].textContent = fmtNum(t.admin);
  }

  // Réévaluer les anomalies pour la ligne modifiée
  const row = state.data[state.active][idx];
  const rowIssues = getRowIssues(row);
  const heuresTd2 = tr.querySelector('td:nth-of-type(4)');
  const heuresInput2 = heuresTd2 ? heuresTd2.querySelector('input[data-field="heures"]') : null;
  if (heuresTd2 && heuresInput2) {
    if (rowIssues) {
      heuresTd2.classList.add("cell-warn");
      heuresInput2.setAttribute("title", describeIssues(rowIssues, row).replace(/"/g, "&quot;"));
    } else {
      heuresTd2.classList.remove("cell-warn");
      heuresInput2.setAttribute("title", "Calculé automatiquement depuis Début et Fin");
    }
  }

  // Recompter et mettre à jour le sous-titre du panel tableau
  const allRows = state.data[state.active];
  document.getElementById("tableSub").innerHTML = tableSubHtml(allRows);

  renderVerify();

  saveToStorage();
}

// ============ AJOUT / SUPPRESSION DE MOIS ============
let modalState = { month: null, year: DEFAULT_YEAR };

// Crée un mois (avec confirmation). Utilisé par la modale ET par le clic direct sur une case vide.
function addMonthWithConfirm(monthName, year) {
  if (!monthName || !year) return;
  const exists = months().some(m => realMonthName(m) === monthName && yearOf(m) === year);
  if (exists) { toast(`${monthName} ${year} existe déjà`); return; }
  if (!confirm(`Créer le mois de ${monthName} ${year} ?`)) return;
  let key = monthName;
  if (state.data[key]) key = `${monthName} ${year}`;
  state.data[key] = emptyMonthForYear(monthName, year);
  state.years[key] = year;
  state.order.push(key);
  state.active = key;
  state.activeYear = year;
  closeModal();
  renderAll();
  toast(`${monthLabel(key)} ajouté`);
  saveToStorage();
}

function openAddMonthModal() {
  modalState.year = new Date().getFullYear();
  modalState.month = null;
  refreshModalMonthGrid();
  document.getElementById("modalOverlay").classList.add("show");
}

function refreshModalMonthGrid() {
  const yEl = document.getElementById("addmYear");
  if (yEl) yEl.textContent = modalState.year;
  const grid = document.getElementById("modalMonthGrid");
  const usedCombos = new Set(months().map(m => `${realMonthName(m)}|${yearOf(m)}`));
  grid.innerHTML = MONTHS_ALL.map((m, i) => {
    const created = usedCombos.has(`${m}|${modalState.year}`);
    if (created) return `<button class="addm-cell created" type="button" title="${m} ${modalState.year} — déjà créé">${m.slice(0,4)}<span class="pl">✓</span></button>`;
    return `<button class="addm-cell empty" data-addm="${i}" title="${m} ${modalState.year} — créer">${m.slice(0,4)}<span class="pl">+</span></button>`;
  }).join("");
  grid.querySelectorAll("[data-addm]").forEach(b => {
    b.addEventListener("click", () => addMonthWithConfirm(MONTHS_ALL[+b.dataset.addm], modalState.year));
  });
}

function closeModal() {
  document.getElementById("modalOverlay").classList.remove("show");
}

function removeMonth(name) {
  if (!confirm(`Supprimer ${monthLabel(name)} et toutes ses données ?`)) return;
  delete state.data[name];
  delete state.years[name];
  state.order = state.order.filter(m => m !== name);
  if (state.active === name) {
    // Préférer un autre mois de l'année active
    const sameYear = monthsInActiveYear();
    state.active = sameYear[0] || state.order[0] || null;
  }
  // Si plus aucun mois pour activeYear, basculer
  const years = allYears();
  if (!years.includes(state.activeYear) && years.length > 0) {
    state.activeYear = years[years.length - 1];
    if (state.active) state.activeYear = yearOf(state.active) || state.activeYear;
  }
  renderAll();
  toast(`${name} supprimé`);
  saveToStorage();
}

function editYear(monthKey) {
  const current = yearOf(monthKey);
  const input = prompt(`Année pour ${realMonthName(monthKey)} :`, current || new Date().getFullYear());
  if (input === null) return;
  const y = parseInt(input, 10);
  if (!y || y < 2000 || y > 2100) {
    toast("Année invalide (2000–2100)");
    return;
  }
  const dup = months().some(m => m !== monthKey && realMonthName(m) === realMonthName(monthKey) && yearOf(m) === y);
  if (dup) {
    toast(`${realMonthName(monthKey)} ${y} existe déjà`);
    return;
  }
  state.years[monthKey] = y;
  // Si on change l'année du mois actif, suivre l'année active
  if (monthKey === state.active) {
    state.activeYear = y;
  }
  const cleanup = cleanupInvalidDays(monthKey);
  renderAll();
  if (cleanup.removed > 0 && cleanup.removedWithData > 0) {
    toast(`Année ${y} · ${cleanup.removed} jours supprimés (dont ${cleanup.removedWithData} avec données)`);
  } else if (cleanup.removed > 0) {
    toast(`Année ${y} · ${cleanup.removed} jours hors-mois supprimés`);
  } else {
    toast(`Année mise à jour : ${realMonthName(monthKey)} ${y}`);
  }
  saveToStorage();
}

// ============ AJOUT / SUPPRESSION DE LIGNES (1 bis, ter...) ============
function addBisRow(baseDay) {
  if (!state.active || !baseDay) return;
  const rows = state.data[state.active];
  // Trouver l'index de la dernière ligne avec ce baseDay
  let insertAt = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (baseDayNumber(rows[i].day) === baseDay) {
      insertAt = i + 1;
      break;
    }
  }
  if (insertAt === -1) return;
  const newLabel = nextBisLabel(rows, baseDay);
  const newRow = emptyDay(baseDay);
  newRow.day = newLabel;
  rows.splice(insertAt, 0, newRow);
  renderTable();
  renderMonths();
  toast(`Garde "${newLabel}" ajoutée`);
  saveToStorage();
}

function removeRow(idx) {
  if (!state.active) return;
  const rows = state.data[state.active];
  const removed = rows[idx];
  if (!removed) return;
  rows.splice(idx, 1);
  renderTable();
  renderMonths();
  renderSynthese();
  renderStacked();
  renderGlobal();
  renderInsights();
  toast(`Garde "${removed.day}" supprimée`);
  saveToStorage();
}

function exportJSON() {
  const payload = {
    version: 2,
    exportDate: new Date().toISOString(),
    data: state.data,
    order: state.order,
    years: state.years,
    activeYear: state.activeYear
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `heures-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Export JSON téléchargé");
}

async function importJSON(file) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    let imported;
    if (parsed && typeof parsed === "object" && parsed.data && typeof parsed.data === "object") {
      // Format v2 (export complet)
      imported = {
        data: parsed.data,
        order: Array.isArray(parsed.order) ? parsed.order : Object.keys(parsed.data),
        years: parsed.years && typeof parsed.years === "object" ? parsed.years : {},
        activeYear: parsed.activeYear || DEFAULT_YEAR
      };
    } else if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      // Format legacy : { "Février": [...], "Mars": [...], ... }
      const keys = Object.keys(parsed).filter(k => Array.isArray(parsed[k]));
      if (keys.length === 0) throw new Error("Aucun mois trouvé dans ce fichier");
      const years = {};
      for (const k of keys) {
        const m = k.match(/\s+(\d{4})$/);
        years[k] = m ? parseInt(m[1], 10) : DEFAULT_YEAR;
      }
      imported = { data: parsed, order: keys, years, activeYear: DEFAULT_YEAR };
    } else {
      throw new Error("Format de fichier non reconnu");
    }

    // Pour les clés sans année dans 'years', on attribue DEFAULT_YEAR
    for (const k of imported.order) {
      if (!imported.years[k]) {
        const m = k.match(/\s+(\d{4})$/);
        imported.years[k] = m ? parseInt(m[1], 10) : DEFAULT_YEAR;
      }
    }

    // Contrôle de forme : un fichier qui sort des formes produites par l'appli est refusé en entier.
    const problemes = decompteProblems(imported);
    if (problemes.length) {
      const extrait = problemes.slice(0, 3).join("\n- ") + (problemes.length > 3 ? `\n(et ${problemes.length - 3} autre${problemes.length > 4 ? "s" : ""})` : "");
      alert(`Fichier refusé : certaines valeurs ne sont pas au format attendu.\n- ${extrait}\n\nAucune donnée n'a été modifiée.`);
      return;
    }
    imported.order = imported.order.filter(k => imported.data[k]);

    // Comptage pour confirmation
    const monthsCount = Object.keys(imported.data).length;
    const rowsCount = Object.values(imported.data).reduce((s, r) => s + (Array.isArray(r) ? r.length : 0), 0);
    const hoursCount = Object.values(imported.data).reduce((s, r) => {
      if (!Array.isArray(r)) return s;
      return s + r.reduce((ss, row) => ss + (Number(row.heures) || 0), 0);
    }, 0);

    if (!confirm(`Importer ce fichier ?\n${monthsCount} mois · ${rowsCount} lignes · ${fmtNum(hoursCount)} h\n\nLes données actuelles seront remplacées.`)) {
      return;
    }

    // Sanitize : Firestore refuse les valeurs undefined ; on les convertit en null/0.
    // On parcourt récursivement toutes les données importées.
    function sanitizeForFirestore(value) {
      if (value === undefined) return null;
      if (value === null) return null;
      if (typeof value !== "object") return value;
      if (Array.isArray(value)) return value.map(sanitizeForFirestore);
      const out = {};
      for (const k in value) {
        if (Object.prototype.hasOwnProperty.call(value, k)) {
          const v = sanitizeForFirestore(value[k]);
          if (v !== undefined) out[k] = v;
        }
      }
      return out;
    }
    imported.data = sanitizeForFirestore(imported.data);
    imported.years = sanitizeForFirestore(imported.years);

    state.data = imported.data;
    state.order = imported.order;
    state.years = imported.years;
    state.activeYear = imported.activeYear;
    state.active = state.order[0] || null;

    cleanupAllMonths();
    recomputeAllAutoColumns();

    try {
      await saveToStorage();
    } catch (saveErr) {
      console.error("Save after import failed:", saveErr);
      toastError(`⚠ Import lu mais sauvegarde échouée — ${saveErr.code || saveErr.message}`);
      return;
    }

    renderAll();
    toast(`✓ Import réussi : ${monthsCount} mois, ${fmtNum(hoursCount)} h`);
  } catch (e) {
    console.error("Import error:", e);
    alert(`Échec de l'import : ${e.message}`);
  }
}

function resetAll() {
  // Ouvre la modale de confirmation forte (saisie du mot "RESET")
  const modal = document.getElementById("modalReset");
  const input = document.getElementById("modalResetConfirm");
  const btnOk = document.getElementById("modalResetConfirmBtn");
  input.value = "";
  btnOk.disabled = true;
  modal.classList.add("show");
  // Focus après affichage
  setTimeout(() => input.focus(), 50);
}

async function performReset() {
  state.data = {};
  state.order = [];
  state.years = {};
  state.active = null;
  state.activeYear = DEFAULT_YEAR;
  // Détruire le chart s'il existait
  if (stackedChart) {
    stackedChart.destroy();
    stackedChart = null;
  }
  // Cacher le tooltip du chart s'il était visible
  const cttEl = document.body.querySelector("div.chart-tooltip");
  if (cttEl) cttEl.style.opacity = 0;
  // Sauvegarder l'état vide
  await saveToStorage();
  renderAll();
  toast("Compte réinitialisé · prêt pour un import");
}

// ============ INIT ============

function renderAll() {
  renderYearPills();
  renderGlobal();
  renderMonths();
  renderTable();
  renderSynthese();
  renderStacked();
  renderInsights();
  renderYearlySummary();
  // Synchroniser les hauteurs après le rendu (en desktop)
  requestAnimationFrame(syncPanelHeights);
}

function renderYearlySummary() {
  const years = allYears();
  const tbody = document.getElementById("yearlyTableBody");
  const sub = document.getElementById("yearlyToggleSub");

  if (years.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--mute);padding:24px">Aucune donnée annuelle.</td></tr>`;
    sub.textContent = "—";
    return;
  }

  sub.textContent = `${years.length} ${years.length > 1 ? "années suivies" : "année suivie"}`;

  let prev = null;
  tbody.innerHTML = years.map(y => {
    const monthsOfY = months().filter(m => yearOf(m) === y);
    const t = totalsForMonths(monthsOfY);
    const moyMois = monthsOfY.length > 0 ? t.heures / monthsOfY.length : 0;
    const act = analyzeYearActivity(y);

    const deltaMois = prev ? deltaCell(monthsOfY.length, prev.mois, "", 0) : "";
    const deltaGardes = prev ? deltaCell(t.workedDays, prev.gardes, "", 0) : "";
    const deltaHeures = prev ? deltaCell(t.heures, prev.heures, " h") : "";
    const deltaMoy = prev ? deltaCell(moyMois, prev.moyMois, "h") : "";
    const deltaWk = prev ? deltaCell(act.weekendsWorked, prev.wkWorked, "", 0) : "";
    const deltaHo = prev ? deltaCell(act.holidaysWorked, prev.hoWorked, "", 0) : "";

    prev = {
      moyMois,
      mois: monthsOfY.length,
      gardes: t.workedDays,
      heures: t.heures,
      wkWorked: act.weekendsWorked,
      hoWorked: act.holidaysWorked
    };
    const isActive = y === state.activeYear ? "active-year" : "";

    return `
      <tr class="${isActive}" data-go-year="${gpEsc(y)}">
        <td>${gpEsc(y)}</td>
        <td><span class="cell-val">${monthsOfY.length}</span>${deltaMois}</td>
        <td><span class="cell-val">${t.workedDays}</span>${deltaGardes}</td>
        <td><span class="cell-val">${fmtNum(t.heures)} h</span>${deltaHeures}</td>
        <td><span class="cell-val">${fmtNum(moyMois.toFixed(1))} h</span>${deltaMoy}</td>
        <td title="${act.weekendsWorked} weekends travaillés sur ${act.weekendsTotal}"><span class="cell-val">${act.weekendsWorked} / ${act.weekendsTotal}</span>${deltaWk}</td>
        <td title="${act.holidaysWorked} jours fériés travaillés sur ${act.holidaysTotal}"><span class="cell-val">${act.holidaysWorked} / ${act.holidaysTotal}</span>${deltaHo}</td>
      </tr>
    `;
  }).join("");

  // Maintenir la vue choisie (tableau/graphique) à chaque re-rendu
  applyYearlyView();

  // Toute la ligne devient cliquable pour basculer sur cette année
  tbody.querySelectorAll("tr[data-go-year]").forEach(tr => {
    tr.addEventListener("click", () => selectYear(parseInt(tr.dataset.goYear, 10)));
  });
}

function deltaCell(curr, prev, unit, digits) {
  if (prev === 0 || prev == null) return "";
  const d = curr - prev;
  const sign = d > 0 ? "+" : d < 0 ? "−" : "=";
  const cls = d > 0.1 ? "up" : d < -0.1 ? "down" : "flat";
  const val = Math.abs(d);
  const formatted = digits !== undefined ? val.toFixed(digits) : fmtNum(val.toFixed(1));
  return `<span class="delta ${cls}">${sign}${formatted}${unit}</span>`;
}

// Aligne la hauteur du panel tableau sur celle du panel synthèse,
// et la hauteur du panel chart sur celle du panel repères.
// En mode mobile (single column), ne fait rien.
function syncPanelHeights() {
  const isMobile = window.innerWidth <= 1200;
  const tableWrap = document.querySelector('.detail > .panel > .table-wrap');
  const tablePanelHeader = document.querySelector('.detail > .panel > .panel-header');
  const detailRight = document.querySelector('.detail-right');
  const comparePanels = document.querySelectorAll('.compare-grid > .panel');

  // Reset
  if (tableWrap) tableWrap.style.maxHeight = '';
  comparePanels.forEach(p => p.style.height = '');

  if (isMobile) return;

  // Aligner la hauteur du tableau (zone scrollable) sur la hauteur totale de detail-right
  // moins la hauteur du panel-header du tableau — UNIQUEMENT si le tableau dépasse naturellement
  if (tableWrap && tablePanelHeader && detailRight) {
    const headerH = tablePanelHeader.offsetHeight;
    const targetH = detailRight.offsetHeight - headerH;
    // Mesurer la hauteur naturelle (après reset)
    const naturalH = tableWrap.scrollHeight;
    if (naturalH > targetH && targetH > 240) {
      tableWrap.style.maxHeight = targetH + 'px';
    }
    // sinon : on laisse le tableau prendre sa hauteur naturelle (pas de scroll, pas d'espace fantôme)
  }

  if (comparePanels.length === 2) {
    const h = comparePanels[1].offsetHeight;
    if (h > 0) comparePanels[0].style.height = h + 'px';
  }
  if (stackedChart) stackedChart.resize();
}

(async function init() {
  // Anti-jump : préserver la position de scroll lors d'un clic sur une cellule.
  let scrollSnapshot = null;
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest || !e.target.closest(".cell-input")) return;
    const tableWrap = document.querySelector(".detail > .panel > .table-wrap");
    scrollSnapshot = {
      page: window.scrollY,
      table: tableWrap ? tableWrap.scrollTop : 0
    };
  }, true);
  document.addEventListener("focusin", (e) => {
    if (!scrollSnapshot) return;
    if (!e.target.closest || !e.target.closest(".cell-input")) { scrollSnapshot = null; return; }
    const snap = scrollSnapshot;
    scrollSnapshot = null;
    const tableWrap = document.querySelector(".detail > .panel > .table-wrap");
    requestAnimationFrame(() => {
      if (window.scrollY !== snap.page) window.scrollTo(0, snap.page);
      if (tableWrap && tableWrap.scrollTop !== snap.table) tableWrap.scrollTop = snap.table;
    });
  });

  // Menu kebab : ouverture/fermeture
  const menuBtn = document.getElementById("actionsMenuBtn");
  const menu = document.getElementById("actionsMenu");
  function openMenu() {
    menu.hidden = false;
    menuBtn.setAttribute("aria-expanded", "true");
  }
  function closeMenu() {
    menu.hidden = true;
    menuBtn.setAttribute("aria-expanded", "false");
  }
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.hidden) openMenu(); else closeMenu();
  });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !e.target.closest("#actionsMenuWrap")) closeMenu();
    // Fermer les menus mois ouverts si clic en dehors
    document.querySelectorAll(".month-actions-dropdown").forEach(d => {
      if (!d.hidden && !e.target.closest(".month-card")) d.hidden = true;
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!menu.hidden) {
        closeMenu();
        menuBtn.focus();
      }
      document.querySelectorAll(".month-actions-dropdown").forEach(d => d.hidden = true);
    }
  });

  function withCloseMenu(fn) {
    return (...args) => { closeMenu(); fn(...args); };
  }

  document.getElementById("btnExport").addEventListener("click", withCloseMenu(exportJSON));
  document.getElementById("btnImport").addEventListener("click", withCloseMenu(() => {
    document.getElementById("fileImport").click();
  }));
  document.getElementById("btnAddMonth").addEventListener("click", withCloseMenu(openAddMonthModal));
  document.getElementById("btnDeleteMonth").addEventListener("click", withCloseMenu(() => {
    if (state.active) removeMonth(state.active);
    else toast("Aucun mois sélectionné");
  }));
  document.getElementById("fileImport").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importJSON(file);
    e.target.value = "";
  });
  document.getElementById("btnLogout").addEventListener("click", withCloseMenu(async () => {
    if (!confirm("Se déconnecter ?")) return;
    await auth.signOut();
  }));

  // Modal "Ajouter un mois"
  document.getElementById("modalCancel").addEventListener("click", closeModal);
  document.getElementById("addmPrev").addEventListener("click", () => { modalState.year = Math.max(2000, modalState.year - 1); refreshModalMonthGrid(); });
  document.getElementById("addmNext").addEventListener("click", () => { modalState.year = Math.min(2100, modalState.year + 1); refreshModalMonthGrid(); });
  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") closeModal();
  });

  // Modal "Réinitialiser le compte" — confirmation par saisie du mot RESET
  const modalReset = document.getElementById("modalReset");
  const modalResetInput = document.getElementById("modalResetConfirm");
  const modalResetBtn = document.getElementById("modalResetConfirmBtn");
  function closeModalReset() {
    modalReset.classList.remove("show");
    modalResetInput.value = "";
    modalResetBtn.disabled = true;
  }
  modalResetInput.addEventListener("input", () => {
    modalResetBtn.disabled = modalResetInput.value.trim().toUpperCase() !== "RESET";
  });
  modalResetInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !modalResetBtn.disabled) {
      e.preventDefault();
      modalResetBtn.click();
    }
    if (e.key === "Escape") closeModalReset();
  });
  document.getElementById("modalResetCancel").addEventListener("click", closeModalReset);
  modalResetBtn.addEventListener("click", async () => {
    if (modalResetInput.value.trim().toUpperCase() !== "RESET") return;
    closeModalReset();
    await performReset();
  });
  modalReset.addEventListener("click", (e) => {
    if (e.target.id === "modalReset") closeModalReset();
  });

  // (Ancien sélecteur d'année +/- de la modale retiré : la modale calendrier gère l'année via ses flèches.)

  // Toggle du bilan annuel
  const yearlyToggle = document.getElementById("yearlyToggle");
  const yearlyContent = document.getElementById("yearlyContent");
  yearlyToggle.addEventListener("click", () => {
    const expanded = yearlyToggle.getAttribute("aria-expanded") === "true";
    yearlyToggle.setAttribute("aria-expanded", String(!expanded));
    yearlyContent.hidden = expanded;
    if (!expanded) applyYearlyView();
    requestAnimationFrame(syncPanelHeights);
  });

  // Bilan annuel : bascule tableau / graphique + choix de la mesure
  document.getElementById("ysTable").addEventListener("click", () => {
    yearlyView = "table";
    localStorage.setItem("ychView", "table");
    applyYearlyView();
  });
  document.getElementById("ysChart").addEventListener("click", () => {
    yearlyView = "chart";
    localStorage.setItem("ychView", "chart");
    if (yearlyToggle.getAttribute("aria-expanded") !== "true") yearlyToggle.click();
    applyYearlyView();
  });
  document.getElementById("ychChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ych]");
    if (!b) return;
    ychMetricKey = b.dataset.ych;
    localStorage.setItem("ychMetric", ychMetricKey);
    renderYchChips();
    renderYearlyChart();
  });

  // Re-synchroniser les hauteurs au redimensionnement
  let syncTimer;
  window.addEventListener("resize", () => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncPanelHeights, 100);
  });

  // ============ AUTH ============
  setupLoginUI();
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      // Connecté → afficher l'app
      // 1. Libérer le scroll du body (qui était bloqué pendant le login)
      document.body.classList.remove("login-shown");
      // 2. Cacher le login screen
      document.getElementById("loginScreen").hidden = true;
      // 3. Afficher le loader pendant le chargement des données
      const loadingOverlay = document.getElementById("loadingOverlay");
      loadingOverlay.hidden = false;
      await loadFromStorage();
      document.getElementById("appWrap").hidden = false;
      renderAll();
      loadingOverlay.hidden = true;
      // (e-mail retiré du menu) — garde-fou si l'élément n'existe plus
      const userEl = document.getElementById("actionsUser");
      if (userEl) { userEl.textContent = user.email; userEl.setAttribute("title", user.email); }
      // 4. Remet le scroll en haut (sur iOS, malgré le body.login-shown,
      //    on force le reset pour être sûr d'arriver tout en haut)
      setTimeout(() => {
        if (document.activeElement && document.activeElement.blur) {
          document.activeElement.blur();
        }
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
      }, 60);
    } else {
      // Déconnecté → afficher le login, bloquer le scroll du body (fix iOS)
      document.body.classList.add("login-shown");
      document.getElementById("loginScreen").hidden = false;
      document.getElementById("appWrap").hidden = true;
      document.getElementById("loadingOverlay").hidden = true;
      state.data = {};
      state.order = [];
      state.years = {};
      state.active = null;
      state.activeYear = DEFAULT_YEAR;
      // Réinitialiser le formulaire de login (sinon le bouton reste disabled après un login réussi précédent)
      const loginForm = document.getElementById("loginForm");
      if (loginForm) loginForm.reset();
      const submitBtn = document.getElementById("loginSubmit");
      if (submitBtn) submitBtn.disabled = false;
      const errEl = document.getElementById("loginError");
      if (errEl) errEl.hidden = true;
      const infoEl = document.getElementById("loginInfo");
      if (infoEl) infoEl.hidden = true;
    }
  });
})();

// ============ LOGIN UI ============
function setupLoginUI() {
  let mode = "signin"; // "signin" | "forgot"
  const form = document.getElementById("loginForm");
  const emailEl = document.getElementById("loginEmail");
  const passEl = document.getElementById("loginPassword");
  const passField = document.getElementById("loginPasswordField");
  const submitBtn = document.getElementById("loginSubmit");
  const forgotBtn = document.getElementById("loginForgot");
  const errorEl = document.getElementById("loginError");
  const infoEl = document.getElementById("loginInfo");
  const subEl = document.getElementById("loginSub");

  function clearMessages() {
    errorEl.hidden = true; errorEl.textContent = "";
    infoEl.hidden = true; infoEl.textContent = "";
  }
  function showError(msg) {
    clearMessages();
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }
  function showInfo(msg) {
    clearMessages();
    infoEl.textContent = msg;
    infoEl.hidden = false;
  }
  function setMode(m) {
    mode = m;
    clearMessages();
    if (m === "signin") {
      subEl.textContent = "Connecte-toi pour accéder à tes applications.";
      submitBtn.textContent = "Se connecter";
      passField.hidden = false;
      passEl.required = true;
      passEl.setAttribute("autocomplete", "current-password");
      forgotBtn.textContent = "Mot de passe oublié ?";
    } else if (m === "forgot") {
      subEl.textContent = "Saisis ton email pour recevoir un lien de réinitialisation.";
      submitBtn.textContent = "Envoyer le mail";
      passField.hidden = true;
      passEl.required = false;
      forgotBtn.textContent = "Retour à la connexion";
    }
  }

  forgotBtn.addEventListener("click", () => {
    if (mode === "signin") setMode("forgot");
    else setMode("signin");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    clearMessages();
    const email = emailEl.value.trim();
    const password = passEl.value;
    try {
      if (mode === "signin") {
        await auth.signInWithEmailAndPassword(email, password);
      } else if (mode === "forgot") {
        await auth.sendPasswordResetEmail(email);
        showInfo(`✓ Email envoyé à ${email}. Vérifie ta boîte mail.`);
        return;
      }
      form.reset();
      // onAuthStateChanged va prendre le relais et basculer vers l'app
    } catch (err) {
      showError(translateAuthError(err));
    } finally {
      submitBtn.disabled = false;
    }
  });

  setMode("signin");
}

function translateAuthError(e) {
  const map = {
    "auth/invalid-email": "Email invalide.",
    "auth/user-not-found": "Aucun compte trouvé avec cet email.",
    "auth/wrong-password": "Mot de passe incorrect.",
    "auth/invalid-credential": "Identifiants invalides.",
    "auth/too-many-requests": "Trop de tentatives. Réessaie plus tard.",
    "auth/network-request-failed": "Erreur réseau. Vérifie ta connexion.",
    "auth/missing-password": "Renseigne ton mot de passe.",
    "auth/user-disabled": "Ce compte a été désactivé.",
  };
  return map[e.code] || e.message || "Erreur de connexion.";
}

// ============================================================================
// PRÉREMPLISSAGE DEPUIS GOOGLE AGENDA
// ----------------------------------------------------------------------------
// Configuration : créer un client OAuth "Application Web" sur
// https://console.cloud.google.com/apis/credentials (projet asv-application),
// ajouter l'origine de l'appli (ex. https://asv-application.web.app) dans
// "Origines JavaScript autorisées", activer l'API "Google Calendar API",
// puis coller l'ID client ci-dessous (se termine par .apps.googleusercontent.com).
// Scope lecture seule uniquement — l'appli ne peut rien écrire dans l'agenda.
//
// DROITS D'ACCÈS — même mécanisme que le planning week-end : l'entrée de
// menu n'apparaît que si le document access/{uid} de l'utilisateur contient
// le champ "agenda" à true (booléen, à poser depuis la console Firebase).
// Les Security Rules existantes suffisent (lecture de ses propres droits).
// ============================================================================
const GCAL_CLIENT_ID = "905624924923-nblr5fvfve1gltraq7oqlmldgmcpbftj.apps.googleusercontent.com";
const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GP_SHIFT_RE = /^\s*(\d{1,2})\s*[hH]\s*(\d{2})?\s*-\s*(\d{1,2})\s*[hH]\s*(\d{2})?\s*$/;

const gp = {
  step: 1, token: null, tokenClient: null, email: null,
  calendars: [], calId: localStorage.getItem("gp_calId") || null,
  from: null, to: null, overwrite: false, preset: "cur",
  plan: null, busy: false, dp: null,
};

function gpISO(d) { return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); }
function gpFmtH(h) { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return mm ? `${hh}h${String(mm).padStart(2,"0")}` : `${hh}h`; }
function gpEsc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
function gpFmtDate(iso) { const [y, m, d] = String(iso).split("-"); return `${d}/${m}/${y}`; }
function gpDayBefore(iso) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() - 1); return gpISO(d); }

// ---- Calendrier personnalisé (repris du sélecteur de Patrimoine) ----
function gpDpHtml() {
  const { which, y, m } = gp.dp;
  const sel = gp[which];
  const jsFirst = new Date(y, m, 1).getDay();            // 0 = dimanche
  const off = jsFirst === 0 ? 6 : jsFirst - 1;           // grille lundi → dimanche
  const nd = new Date(y, m + 1, 0).getDate();
  const prevMax = new Date(y, m, 0).getDate();
  const total = Math.ceil((off + nd) / 7) * 7;
  const today = gpISO(new Date());
  let cells = "";
  for (let i = 0; i < total; i++) {
    let d, mm = m, yy = y, out = false;
    if (i < off) { d = prevMax - off + i + 1; mm = m === 0 ? 11 : m - 1; yy = m === 0 ? y - 1 : y; out = true; }
    else if (i < off + nd) { d = i - off + 1; }
    else { d = i - off - nd + 1; mm = m === 11 ? 0 : m + 1; yy = m === 11 ? y + 1 : y; out = true; }
    const iso = `${yy}-${String(mm + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const cls = `gp-dp-cell${out ? " outside" : ""}${iso === sel ? " selected" : ""}${iso === today ? " today" : ""}`;
    cells += `<button type="button" class="${cls}" data-gp="dppick" data-iso="${iso}">${d}</button>`;
  }
  return `<div class="gp-dp${which === "to" ? " right" : ""}">
    <div class="gp-dp-nav">
      <button type="button" class="gp-dp-btn" data-gp="dpprev" aria-label="Mois précédent">‹</button>
      <div class="gp-dp-label">${MONTHS_ALL[m]} ${y}</div>
      <button type="button" class="gp-dp-btn" data-gp="dpnext" aria-label="Mois suivant">›</button>
    </div>
    <div class="gp-dp-head"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div>
    <div class="gp-dp-grid">${cells}</div>
    <div class="gp-dp-foot"><button type="button" class="btn" style="font-size:12px;padding:6px 14px" data-gp="dptoday">Aujourd'hui</button></div>
  </div>`;
}

// Mémorise l'état de la case "écraser" avant un re-rendu de l'étape 2
function gpSyncStep2() {
  const ow = document.getElementById("gpOverwrite");
  if (ow) gp.overwrite = ow.checked;
}

// ---- Droits d'accès (champ "agenda" dans access/{uid}, comme le droit "weekend") ----
let gpAllowed = false;
async function gpCheckAccess(user) {
  const btn = document.getElementById("btnGPrefill");
  gpAllowed = false;
  try {
    const snap = await db.collection("access").doc(user.uid).get();
    gpAllowed = !!(snap.exists && snap.data().agenda === true);
  } catch (e) {
    console.warn("Préremplissage : lecture de access/{uid} impossible", e);
  }
  if (btn) btn.hidden = !gpAllowed;
}

function gpOpen() {
  if (!gpAllowed) { toast("Fonction non activée pour ce compte"); return; }
  gp.step = 1; gp.plan = null; gp.busy = false;
  if (!gp.from) {
    const now = new Date();
    gp.from = gpISO(new Date(now.getFullYear(), now.getMonth(), 1));
    gp.to = gpISO(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  }
  document.getElementById("gpOverlay").classList.add("show");
  document.body.classList.add("gp-open");
  gpRender();
}
function gpClose() {
  document.getElementById("gpOverlay").classList.remove("show");
  document.body.classList.remove("gp-open");
}
// Fermeture demandée par l'utilisateur : confirmer si un paramétrage est en cours
function gpRequestClose() {
  if (gp.step >= 2 && !confirm("Fermer la fenêtre ?\nLe paramétrage en cours (période, analyse) sera perdu.")) return;
  gpClose();
}

// ---- Google Identity Services (chargé à la demande) ----
function gpLoadGis() {
  return new Promise((resolve, reject) => {
    if (window.google && google.accounts && google.accounts.oauth2) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Impossible de charger Google Identity Services"));
    document.head.appendChild(s);
  });
}

async function gpConnect() {
  try {
    gp.busy = true; gpRender();
    await gpLoadGis();
    gp.tokenClient = gp.tokenClient || google.accounts.oauth2.initTokenClient({
      client_id: GCAL_CLIENT_ID,
      scope: GCAL_SCOPE,
      callback: async (resp) => {
        if (resp.error) { gp.busy = false; gpRender(); toast("Connexion Google refusée"); return; }
        gp.token = resp.access_token;
        try {
          await gpFetchCalendars();
        } catch (e) {
          console.error(e); toast("Erreur de lecture des calendriers");
        }
        gp.busy = false; gpRender();
      },
    });
    gp.tokenClient.requestAccessToken();
  } catch (e) {
    gp.busy = false; gpRender();
    console.error(e); toast(e.message || "Erreur de connexion Google");
  }
}

async function gpApi(path, params) {
  const url = new URL("https://www.googleapis.com/calendar/v3/" + path);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url, { headers: { Authorization: "Bearer " + gp.token } });
  if (!r.ok) throw new Error("API Google Calendar : erreur " + r.status);
  return r.json();
}

async function gpFetchCalendars() {
  const j = await gpApi("users/me/calendarList", { minAccessRole: "reader" });
  gp.calendars = (j.items || []).map(c => ({
    id: c.id, name: c.summaryOverride || c.summary || c.id,
    color: c.backgroundColor || "#7986cb", primary: !!c.primary,
  })).sort((a, b) => (b.primary - a.primary) || a.name.localeCompare(b.name, "fr"));
  if (!gp.calendars.some(c => c.id === gp.calId)) gp.calId = null;
  if (!gp.calId && gp.calendars.length) gp.calId = gp.calendars[0].id;
}

async function gpFetchEvents() {
  // On remonte un jour avant la plage : un poste de la veille peut déborder après minuit
  const timeMin = new Date(gpDayBefore(gp.from) + "T00:00:00").toISOString();
  const end = new Date(gp.to + "T00:00:00"); end.setDate(end.getDate() + 1);
  const timeMax = end.toISOString();
  let items = [], pageToken = null;
  do {
    const p = { singleEvents: "true", orderBy: "startTime", timeMin, timeMax, maxResults: "2500", timeZone: "Europe/Paris" };
    if (pageToken) p.pageToken = pageToken;
    const j = await gpApi("calendars/" + encodeURIComponent(gp.calId) + "/events", p);
    items = items.concat(j.items || []);
    pageToken = j.nextPageToken || null;
  } while (pageToken);
  return items;
}

// ---- Analyse des événements → postes / admin / ignorés ----
function gpParseEvents(items) {
  const shifts = new Map(), admins = new Map(), ignored = [];
  for (const ev of items) {
    if (ev.status === "cancelled") continue;
    const sum = (ev.summary || "").trim();
    if (ev.start && ev.start.date) {
      // Événement "journée entière" → poste si le titre est une plage horaire
      const m = sum.match(GP_SHIFT_RE);
      const key = ev.start.date;
      if (m) {
        // La veille du début est acceptée : son débordement après minuit sera géré au plan
        if (key < gpDayBefore(gp.from) || key > gp.to) continue;
        if (shifts.has(key)) { ignored.push({ date: key, sum, why: "2ᵉ poste le même jour" }); continue; }
        shifts.set(key, { deb: +m[1] + (+(m[2] || 0)) / 60, fin: +m[3] + (+(m[4] || 0)) / 60, sum });
      } else {
        if (key < gp.from || key > gp.to) continue;
        ignored.push({ date: key, sum: sum || "(sans titre)", why: "titre non reconnu" });
      }
    } else if (ev.start && ev.start.dateTime) {
      const t1 = new Date(ev.start.dateTime), t2 = new Date(ev.end.dateTime);
      const key = gpISO(t1);
      if (key < gp.from || key > gp.to) continue;
      if (/^administratif/i.test(sum)) {
        const dur = Math.round(((t2 - t1) / 3600000) * 100) / 100;
        const deb = t1.getHours() + t1.getMinutes() / 60;
        const fin = t2.getHours() + t2.getMinutes() / 60;
        if (admins.has(key)) {
          const a = admins.get(key);
          a.dur = Math.round((a.dur + dur) * 100) / 100;
          a.deb = Math.min(a.deb, deb); a.fin = Math.max(a.fin, fin);
        } else {
          admins.set(key, { deb, fin, dur, sum });
        }
      } else {
        ignored.push({ date: key, sum: sum || "(sans titre)", why: "pas un poste" });
      }
    }
  }
  return { shifts, admins, ignored };
}

// ---- Aides sur les mois / lignes existants ----
function gpMonthKeyFor(year, monthIdx) {
  return Object.keys(state.data).find(k => MONTHS_ALL.indexOf(realMonthName(k)) === monthIdx && yearOf(k) === year) || null;
}
function gpRowFor(monthKey, dayNum, wantTail) {
  if (!monthKey) return null;
  const rows = state.data[monthKey] || [];
  const prevSet = detectPrevMonthIndices(rows);
  for (let i = 0; i < rows.length; i++) {
    if (String(baseDayNumber(rows[i].day)) === String(dayNum) && prevSet.has(i) === !!wantTail) return rows[i];
  }
  return null;
}
function gpRowFilled(r) { return !!r && (r.debut != null || r.fin != null || (r.admin || 0) > 0); }

// ---- Essai à blanc : construit le plan sans rien écrire ----
function gpBuildPlan(parsed) {
  const plan = { writes: [], skips: [], monthsToCreate: [], ignored: parsed.ignored, warns: 0, adminCount: 0 };
  const needMonth = (y, mIdx) => {
    if (!gpMonthKeyFor(y, mIdx) && !plan.monthsToCreate.some(mc => mc.y === y && mc.mIdx === mIdx)) {
      plan.monthsToCreate.push({ y, mIdx });
    }
  };
  const dates = [...new Set([...parsed.shifts.keys(), ...parsed.admins.keys()])].sort();
  for (const dk of dates) {
    const [Y, M, D] = dk.split("-").map(Number);
    const d = new Date(Y, M - 1, D);
    const shift = parsed.shifts.get(dk) || null;
    const admin = parsed.admins.get(dk) || null;
    // Veille de la plage : ne retenir que le débordement du poste après minuit
    if (dk < gp.from) {
      if (!shift) continue;
      const crossesB = shift.fin !== 0 && shift.fin <= shift.deb;
      if (!crossesB) continue;
      const next = new Date(Y, M - 1, D + 1); // = 1er jour de la plage
      if (next.getMonth() !== d.getMonth()) {
        // Changement de mois → seule la ligne d'appoint est concernée
        const tEntry = { y: next.getFullYear(), mIdx: next.getMonth(), day: D, tail: true, deb: 24, fin: shift.fin,
          admin: 0, date: d, label: "appoint 0h → " + gpFmtH(shift.fin) + " (poste de la veille)", warn: null, splitNote: null };
        const tRow = gpRowFor(gpMonthKeyFor(tEntry.y, tEntry.mIdx), D, true);
        if (gpRowFilled(tRow) && !gp.overwrite) plan.skips.push(tEntry);
        else { needMonth(tEntry.y, tEntry.mIdx); plan.writes.push(tEntry); }
      } else {
        // Même mois : les heures d'après minuit vivent sur la ligne de la veille
        const e2 = { y: Y, mIdx: M - 1, day: D, tail: false, deb: shift.deb, fin: shift.fin, admin: 0, date: d,
          label: gpFmtH(shift.deb) + " → " + gpFmtH(shift.fin),
          warn: null, splitNote: "poste de la veille inclus : il déborde après minuit sur la plage" };
        const row2 = gpRowFor(gpMonthKeyFor(Y, M - 1), D, false);
        if (gpRowFilled(row2) && !gp.overwrite) plan.skips.push(e2);
        else { needMonth(Y, M - 1); plan.writes.push(e2); }
      }
      continue;
    }
    let deb, fin, warn = null, splitNote = null, tailWrite = null;
    let label;
    if (shift) {
      deb = shift.deb; fin = shift.fin;
      label = gpFmtH(shift.deb) + " → " + gpFmtH(shift.fin || 24);
      const crosses = fin !== 0 && fin <= deb;
      if (admin) {
        // Contigu (ou chevauchant) le début du poste → inclus dans Début/Fin, sinon signalé
        const effDeb = Math.min(deb, crosses ? deb : deb);
        if (admin.fin >= effDeb - 0.26) {
          deb = Math.min(deb, admin.deb);
          label = gpFmtH(deb) + " → " + gpFmtH(shift.fin || 24) + " (poste + admin " + gpFmtH(admin.dur).replace("h", "h ").trim() + ")";
        } else {
          warn = "Admin " + gpFmtH(admin.deb) + "–" + gpFmtH(admin.fin) + " non contigu au poste : heures admin hors Début/Fin";
        }
      }
      if (fin === 0) fin = 24;
      if (crosses) {
        const next = new Date(Y, M - 1, D + 1);
        if (next.getMonth() !== d.getMonth()) {
          // Poste à cheval sur deux mois → ligne principale jusqu'à minuit + ligne d'appoint
          splitNote = "coupé : jusqu'à minuit ici + ligne d'appoint (0h → " + gpFmtH(shift.fin) + ") dans le mois suivant";
          tailWrite = { y: next.getFullYear(), mIdx: next.getMonth(), day: D, deb: 24, fin: shift.fin };
          fin = 24;
        }
      }
    } else {
      deb = admin.deb; fin = admin.fin;
      label = gpFmtH(deb) + " → " + gpFmtH(fin) + " (admin seul)";
    }
    const adminVal = admin ? admin.dur : 0;
    if (admin) plan.adminCount++;
    if (warn) plan.warns++;

    const mIdx = M - 1;
    const existingKey = gpMonthKeyFor(Y, mIdx);
    const row = gpRowFor(existingKey, D, false);
    const entry = { y: Y, mIdx, day: D, tail: false, deb, fin, admin: adminVal, date: d, label, warn, splitNote };
    if (gpRowFilled(row) && !gp.overwrite) {
      plan.skips.push(entry);
    } else {
      needMonth(Y, mIdx);
      plan.writes.push(entry);
    }
    // La ligne d'appoint est évaluée INDÉPENDAMMENT de la ligne principale :
    // le 31 peut être déjà saisi alors que l'appoint du mois suivant manque encore.
    if (tailWrite) {
      const tKey = gpMonthKeyFor(tailWrite.y, tailWrite.mIdx);
      const tRow = gpRowFor(tKey, tailWrite.day, true);
      const tEntry = { ...tailWrite, tail: true, admin: 0, date: d, label: "appoint 0h → " + gpFmtH(tailWrite.fin), warn: null, splitNote: null };
      if (gpRowFilled(tRow) && !gp.overwrite) plan.skips.push(tEntry);
      else { needMonth(tailWrite.y, tailWrite.mIdx); plan.writes.push(tEntry); }
    }
  }
  return plan;
}

// ---- Application du plan ----
function gpApply() {
  const plan = gp.plan;
  if (!plan || !plan.writes.length) { gpClose(); return; }
  for (const mc of plan.monthsToCreate) {
    const name = MONTHS_ALL[mc.mIdx];
    let key = name;
    if (state.data[key] != null) key = `${name} ${mc.y}`;
    state.data[key] = emptyMonthForYear(name, mc.y);
    state.years[key] = mc.y;
    state.order.push(key);
  }
  const monthsCreated = plan.monthsToCreate.length;
  for (const w of plan.writes) {
    const key = gpMonthKeyFor(w.y, w.mIdx);
    if (!key) continue;
    let row = gpRowFor(key, w.day, w.tail);
    if (!row && w.tail) {
      // Créer la ligne d'appoint en tête de mois (après d'éventuelles lignes du mois précédent)
      row = emptyDay(w.day);
      const rows = state.data[key];
      const prevSet = detectPrevMonthIndices(rows);
      let at = 0;
      for (let i = 0; i < rows.length; i++) {
        if (prevSet.has(i) && baseDayNumber(rows[i].day) <= w.day) at = i + 1; else break;
      }
      rows.splice(at, 0, row);
    }
    if (!row) continue;
    if (gpRowFilled(row) && !gp.overwrite) continue;
    row.debut = w.deb;
    row.fin = w.fin;
    if (w.admin) row.admin = w.admin;
  }
  recomputeAllAutoColumns();
  // Basculer sur l'année/le mois du début de plage
  const [fy, fm] = gp.from.split("-").map(Number);
  const firstKey = gpMonthKeyFor(fy, fm - 1);
  if (firstKey) { state.activeYear = fy; state.active = firstKey; }
  renderAll();
  saveToStorage();
  gpClose();
  toast(`✓ ${plan.writes.length} ligne(s) préremplie(s)` + (monthsCreated ? ` · ${monthsCreated} mois créé(s)` : ""));
}

// ---- Rendu de la modale ----
function gpRenderSteps() {
  const dots = document.querySelectorAll("#gpSteps span");
  dots.forEach((s, i) => s.classList.toggle("done", i < gp.step));
}

function gpRender() {
  gpRenderSteps();
  const body = document.getElementById("gpBody");
  const actions = document.getElementById("gpActions");
  const title = document.getElementById("gpTitle");
  // Agrandir la fenêtre quand le calendrier de dates est ouvert (sinon il serait coupé)
  const modalEl = document.querySelector("#gpOverlay .gp-modal");
  if (modalEl) modalEl.classList.toggle("dp-open", !!gp.dp);

  if (!GCAL_CLIENT_ID) {
    title.textContent = "Préremplir via Google Agenda";
    body.innerHTML = `<div class="gp-setup"><b>Configuration requise (une seule fois)&nbsp;:</b>
      <ol>
        <li>Ouvre <code>console.cloud.google.com/apis/credentials</code> (projet <code>asv-application</code>)</li>
        <li>Active l'API <b>Google Calendar API</b> (menu "API et services activés")</li>
        <li>Crée un <b>ID client OAuth</b> de type "Application Web" et ajoute l'origine de l'appli dans "Origines JavaScript autorisées"</li>
        <li>Colle l'ID client dans la constante <code>GCAL_CLIENT_ID</code> du fichier <code>index.html</code></li>
      </ol></div>`;
    actions.innerHTML = `<button class="btn" data-gp="close">Fermer</button>`;
    return;
  }

  if (gp.busy) {
    body.innerHTML = `<div class="gp-loading">Un instant…</div>`;
    actions.innerHTML = "";
    return;
  }

  if (gp.step === 1) {
    title.textContent = "Préremplir via Google Agenda";
    if (!gp.token) {
      body.innerHTML = `
        <button class="gp-gbtn" data-gp="connect" type="button">
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Se connecter avec Google
        </button>
        <div class="gp-hint">Accès en <b>lecture seule</b> — l'appli ne peut rien modifier dans ton agenda. Ton choix de calendrier sera mémorisé.</div>`;
      actions.innerHTML = `<button class="btn" data-gp="close">Annuler</button>`;
    } else {
      body.innerHTML = `
        <div class="gp-connected"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>Connecté à Google</div>
        <div class="gp-cal-list">${gp.calendars.map(c => `
          <button type="button" class="gp-cal-item ${c.id === gp.calId ? "selected" : ""}" data-gp="cal" data-cal="${gpEsc(c.id)}">
            <span class="gp-cal-dot" style="background:${gpEsc(c.color)}"></span>${gpEsc(c.name)}
          </button>`).join("")}</div>
        <div class="gp-hint">Choisis le calendrier où tu notes tes heures.</div>`;
      actions.innerHTML = `<button class="btn" data-gp="close">Annuler</button>
        <button class="btn primary" data-gp="step2" ${gp.calId ? "" : "disabled"}>Continuer →</button>`;
    }
  } else if (gp.step === 2) {
    title.textContent = "Quelle période préremplir ?";
    body.innerHTML = `
      <div class="gp-chips">
        <button type="button" class="gp-chip ${gp.preset === "cur" ? "active" : ""}" data-gp="preset" data-preset="cur">Mois en cours</button>
        <button type="button" class="gp-chip ${gp.preset === "next" ? "active" : ""}" data-gp="preset" data-preset="next">Mois prochain</button>
        <button type="button" class="gp-chip ${gp.preset === "custom" ? "active" : ""}" data-gp="preset" data-preset="custom">Personnalisée</button>
      </div>
      <div class="gp-fields">
        <div class="gp-field gp-dpwrap"><label>Du</label>
          <button type="button" class="gp-datebtn" data-gp="dpopen" data-which="from">${gpFmtDate(gp.from)}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </button>
          ${gp.dp && gp.dp.which === "from" ? gpDpHtml() : ""}
        </div>
        <div class="gp-field gp-dpwrap"><label>Au</label>
          <button type="button" class="gp-datebtn" data-gp="dpopen" data-which="to">${gpFmtDate(gp.to)}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </button>
          ${gp.dp && gp.dp.which === "to" ? gpDpHtml() : ""}
        </div>
      </div>
      <div class="gp-rules"><b>Ce qui sera reconnu :</b><br>
        • Postes : titre <code>20h-8h</code>, <code>18h-1h</code>, <code>17h30-00h30</code>… → Début / Fin<br>
        • <code>Administratif…</code> (avec horaires) → colonne Admin<br>
        • Ignorés : réunions, formations, congés, team building<br>
        • La veille du début est vérifiée (poste finissant après minuit)</div>
      <label class="gp-check"><input type="checkbox" id="gpOverwrite" ${gp.overwrite ? "checked" : ""}>
        <span>Écraser les jours déjà remplis <span style="color:var(--color-text-mute)">(sinon ta saisie existante est toujours conservée)</span></span></label>`;
    actions.innerHTML = `<button class="btn" data-gp="step1">← Retour</button>
      <button class="btn primary" data-gp="analyze">Analyser →</button>`;
  } else if (gp.step === 3) {
    title.textContent = "Aperçu — rien n'est encore écrit";
    const plan = gp.plan;
    const rowsHtml = [...plan.writes, ...plan.skips]
      .sort((a, b) => a.date - b.date || a.tail - b.tail)
      .map(e => {
        const isSkip = plan.skips.includes(e);
        const wd = WEEKDAYS_SHORT[e.date.getDay()];
        const dLabel = `${wd} ${String(e.day).padStart(2, "0")}/${String(e.date.getMonth() + 1).padStart(2, "0")}`;
        let badge, cls = "";
        if (isSkip) { badge = `<span class="gp-badge skip">déjà rempli</span>`; cls = "skipped"; }
        else if (e.warn) badge = `<span class="gp-badge warn">à vérifier</span>`;
        else if (e.tail || e.splitNote) badge = `<span class="gp-badge split">${e.tail ? "appoint" : "coupé fin de mois"}</span>`;
        else badge = `<span class="gp-badge new">nouveau</span>`;
        const note = e.warn || e.splitNote;
        return `<tr class="${cls}"><td class="d">${dLabel}</td>
          <td class="p">${gpEsc(e.label)}${note ? `<div class="gp-subnote">${gpEsc(note)}</div>` : ""}</td>
          <td>${badge}</td></tr>`;
      }).join("");
    const monthsNote = plan.monthsToCreate.length
      ? `<div class="gp-hint">Mois à créer : ${plan.monthsToCreate.map(mc => `<b>${MONTHS_ALL[mc.mIdx]} ${mc.y}</b>`).join(", ")}</div>` : "";
    const ignoredHtml = plan.ignored.length
      ? `<div class="gp-fold"><b>${plan.ignored.length} événement(s) ignoré(s)</b><ul>${plan.ignored.slice(0, 12).map(i =>
          `<li>${gpEsc(i.date.slice(8, 10))}/${gpEsc(i.date.slice(5, 7))} · "${gpEsc(i.sum)}"</li>`).join("")}${plan.ignored.length > 12 ? "<li>…</li>" : ""}</ul></div>` : "";
    body.innerHTML = `
      <div class="gp-stats">
        <div class="gp-stat ok"><div class="v">${plan.writes.length}</div><div class="l">à écrire</div></div>
        <div class="gp-stat"><div class="v">${plan.adminCount}</div><div class="l">admin</div></div>
        <div class="gp-stat conflict"><div class="v">${plan.skips.length}</div><div class="l">conservés</div></div>
        <div class="gp-stat warn"><div class="v">${plan.ignored.length}</div><div class="l">ignorés</div></div>
      </div>
      ${monthsNote}
      <table class="gp-table"><tr><th>Date</th><th>Poste</th><th></th></tr>${rowsHtml || `<tr><td colspan="3" style="text-align:center;color:var(--color-text-mute)">Aucun poste reconnu sur cette plage</td></tr>`}</table>
      ${ignoredHtml}`;
    actions.innerHTML = `<button class="btn" data-gp="step2back">← Retour</button>
      <button class="btn primary" data-gp="apply" ${plan.writes.length ? "" : "disabled"}>Préremplir ${plan.writes.length} ligne(s)</button>`;
  }
}

async function gpAnalyze() {
  gpSyncStep2();
  gp.dp = null;
  if (!gp.from || !gp.to || gp.from > gp.to) { toast("Plage de dates invalide"); return; }
  try {
    gp.busy = true; gpRender();
    const items = await gpFetchEvents();
    const parsed = gpParseEvents(items);
    gp.plan = gpBuildPlan(parsed);
    gp.step = 3;
  } catch (e) {
    console.error(e);
    toast(e.message || "Erreur pendant l'analyse");
    if (String(e.message).includes("401")) gp.token = null, gp.step = 1;
  }
  gp.busy = false; gpRender();
}

function gpSetPreset(p) {
  gpSyncStep2();
  gp.dp = null;
  gp.preset = p;
  const now = new Date();
  if (p === "cur") {
    gp.from = gpISO(new Date(now.getFullYear(), now.getMonth(), 1));
    gp.to = gpISO(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  } else if (p === "next") {
    gp.from = gpISO(new Date(now.getFullYear(), now.getMonth() + 1, 1));
    gp.to = gpISO(new Date(now.getFullYear(), now.getMonth() + 2, 0));
  }
  gpRender();
}

// ---- Wiring ----
(function gpInit() {
  auth.onAuthStateChanged((u) => {
    if (u) gpCheckAccess(u);
    else { gpAllowed = false; const b = document.getElementById("btnGPrefill"); if (b) b.hidden = true; }
  });
  const btn = document.getElementById("btnGPrefill");
  if (btn) btn.addEventListener("click", () => {
    const menu = document.getElementById("actionsMenu");
    if (menu) menu.hidden = true;
    const mb = document.getElementById("actionsMenuBtn");
    if (mb) mb.setAttribute("aria-expanded", "false");
    gpOpen();
  });
  const closeBtn = document.getElementById("gpCloseBtn");
  if (closeBtn) closeBtn.addEventListener("click", gpRequestClose);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !modal || !modal.classList.contains("show")) return;
    if (gp.dp) { gpSyncStep2(); gp.dp = null; gpRender(); }
    else gpRequestClose();
  });
  const modal = document.getElementById("gpOverlay");
  if (modal) modal.addEventListener("click", (e) => {
    // Clic sur le fond grisé → fermer (le calendrier d'abord, sinon la fenêtre)
    if (e.target === modal) {
      if (gp.dp) { gpSyncStep2(); gp.dp = null; gpRender(); }
      else gpRequestClose();
      return;
    }
    const t = e.target.closest("[data-gp]");
    const a = t ? t.dataset.gp : null;
    // Fermer le calendrier si clic en dehors de celui-ci
    if (gp.dp && a !== "dpopen" && !e.target.closest(".gp-dp")) {
      gpSyncStep2(); gp.dp = null; gpRender();
    }
    if (!t) return;
    if (a === "close") gpRequestClose();
    else if (a === "connect") gpConnect();
    else if (a === "cal") { gp.calId = t.dataset.cal; localStorage.setItem("gp_calId", gp.calId); gpRender(); }
    else if (a === "step1") { gp.step = 1; gpRender(); }
    else if (a === "step2") { gp.step = 2; gpRender(); }
    else if (a === "step2back") { gp.step = 2; gpRender(); }
    else if (a === "preset") gpSetPreset(t.dataset.preset);
    else if (a === "analyze") gpAnalyze();
    else if (a === "apply") gpApply();
    else if (a === "dpopen") {
      gpSyncStep2();
      const which = t.dataset.which;
      if (gp.dp && gp.dp.which === which) { gp.dp = null; }
      else {
        const [y, m] = String(gp[which]).split("-").map(Number);
        gp.dp = { which, y, m: m - 1 };
      }
      gpRender();
    }
    else if (a === "dpprev" || a === "dpnext") {
      gpSyncStep2();
      const dir = a === "dpnext" ? 1 : -1;
      const d = new Date(gp.dp.y, gp.dp.m + dir, 1);
      gp.dp.y = d.getFullYear(); gp.dp.m = d.getMonth();
      gpRender();
    }
    else if (a === "dppick" || a === "dptoday") {
      gpSyncStep2();
      const iso = a === "dptoday" ? gpISO(new Date()) : t.dataset.iso;
      gp[gp.dp.which] = iso;
      // garder une plage cohérente
      if (gp.from > gp.to) { if (gp.dp.which === "from") gp.to = gp.from; else gp.from = gp.to; }
      gp.preset = "custom";
      gp.dp = null;
      gpRender();
    }
  });
})();
