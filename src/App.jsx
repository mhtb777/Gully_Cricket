import React, { useState, useEffect, useCallback } from "react";

/* ---------------------------------------------------------
   GULLY SCORES — a pocket scoreboard for street cricket
   Design tokens:
   - bg charcoal #1C2023, panel #262B2F, panel-light #2F3539
   - text chalk #F1EDE3, muted #9AA0A6, border #3A4046
   - tape-ball red #C4432B (primary), turf green #4C8C5B (positive),
     mustard #E3A93E (highlight/target)
   - Display font: Teko (scoreboard numerals), Body: Karla
   - Layout: phone-frame, single column, bottom tab bar
--------------------------------------------------------- */

// ============================================================
// 01. THEME CONFIGURATION
// ============================================================

const THEMES = {
  dark: {
    bg: "#1C2023",
    panel: "#262B2F",
    panelLight: "#2F3539",
    panelLighter: "#363C41",
    text: "#F1EDE3",
    muted: "#9AA0A6",
    border: "#3A4046",
    red: "#C4432B",
    redDark: "#9E3423",
    green: "#4C8C5B",
    greenDark: "#3B6E48",
    mustard: "#E3A93E",
  },

  light: {
    bg: "#F7F7F5",
    panel: "#FFFFFF",
    panelLight: "#F0F1F2",
    panelLighter: "#E6E7E8",
    text: "#1C2023",
    muted: "#6B7280",
    border: "#D5D7DA",
    red: "#C4432B",
    redDark: "#9E3423",
    green: "#3F7D4A",
    greenDark: "#32643B",
    mustard: "#D99522",
  },
};

// Current theme — initially Dark
let C = THEMES.dark;

// ============================================================
// 02. GENERIC HELPERS
// ============================================================

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function formatOvers(legalBalls) {
  const o = Math.floor(legalBalls / 6);
  const b = legalBalls % 6;
  return `${o}.${b}`;
}

// ------------------------------------------------------------
// Match innings data structure
// ------------------------------------------------------------
function emptyInnings(battingTeam, bowlingTeam, oversLimit, target) {
  return {
    battingTeam,
    bowlingTeam,
    oversLimit,
    target: target || null,
    totalRuns: 0,
    totalWickets: 0,
    extras: 0,
  extrasBreakdown: {
  wides: 0,
  noBalls: 0,
  byes: 0,
  legByes: 0,
},
    legalBalls: 0,
    battingOrder: [],
    currentBowlerId: null,
    lastOverBowlerId: null,
    strikerId: null,
    nonStrikerId: null,
    batsmen: {},
    bowlers: {},
    overHistory: [[]],
    fallOfWickets: [],
    partnerships: [],
    currentPartnership: null,
    complete: false,
  };
}

// ------------------------------------------------------------
// Match object creation
// ------------------------------------------------------------
function newMatchObj({
  teamAName,
  teamBName,
  teamAPlayers,
  teamBPlayers,
  overs,
  tossWinner,
  tossDecision,
  teamACaptain,
  teamAViceCaptain,
  teamBCaptain,
  teamBViceCaptain,
  scheduledMatchToStart,
}) {
  const battingFirst =
    (tossWinner === "A" && tossDecision === "bat") || (tossWinner === "B" && tossDecision === "bowl") ? "A" : "B";
  const bowlingFirst = battingFirst === "A" ? "B" : "A";
  return {
    id: uid(),
    date: new Date().toISOString(),
    teamAName,
    teamBName,
    teamAPlayers,
teamBPlayers,
overs,
tossWinner,
tossDecision,
teamACaptain,
teamAViceCaptain,
teamBCaptain,
teamBViceCaptain,
tournamentId: scheduledMatchToStart?.tournamentId || null,
scheduledMatchId: scheduledMatchToStart?.id || null,
status: "live",
    currentInningsIdx: 0,
    innings: [emptyInnings(battingFirst, bowlingFirst, overs, null)],
    result: null,
  };
}

// ------------------------------------------------------------
// Team / player helpers
// ------------------------------------------------------------
function teamPlayersFor(match, teamKey) {
  return teamKey === "A" ? match.teamAPlayers : match.teamBPlayers;
}

// ============================================================
// 03. CAREER STATISTICS
// ============================================================

/* Compute career stats for every player from completed matches */
function computeCareerStats(players, matches) {
  const stats = {};
  players.forEach((p) => {
    stats[p.id] = {
      id: p.id,
      name: p.name,
      matches: 0,
      innings: 0,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      notOuts: 0,
      highScore: 0,
      dismissals: 0,
      wickets: 0,
      ballsBowled: 0,
      runsConceded: 0,
      bestBowling: null,
    };
  });
  matches
    .filter((m) => m.status === "completed")
    .forEach((m) => {
      const playedIds = new Set([...m.teamAPlayers, ...m.teamBPlayers]);
      playedIds.forEach((pid) => {
        if (stats[pid]) stats[pid].matches += 1;
      });
      m.innings.forEach((inn) => {
        Object.entries(inn.batsmen).forEach(([pid, b]) => {
          if (!stats[pid]) return;
          stats[pid].innings += 1;
          stats[pid].runs += b.runs;
          stats[pid].balls += b.balls;
          stats[pid].fours += b.fours;
          stats[pid].sixes += b.sixes;
          if (!b.out) stats[pid].notOuts += 1;
          else stats[pid].dismissals += 1;
          if (b.runs > stats[pid].highScore) stats[pid].highScore = b.runs;
        });
        Object.entries(inn.bowlers).forEach(([pid, bw]) => {
          if (!stats[pid]) return;
          stats[pid].wickets += bw.wickets;
          stats[pid].ballsBowled += bw.legalBalls;
          stats[pid].runsConceded += bw.runs;
          const fig = { wickets: bw.wickets, runs: bw.runs };
          const cur = stats[pid].bestBowling;
          if (
            !cur ||
            fig.wickets > cur.wickets ||
            (fig.wickets === cur.wickets && fig.runs < cur.runs)
          ) {
            if (bw.legalBalls > 0 || bw.wickets > 0) stats[pid].bestBowling = fig;
          }
        });
      });
    });
  return stats;
}

// ============================================================
// 04. REUSABLE UI COMPONENTS
// ============================================================

/* ---------------- Small UI primitives ---------------- */

function Panel({ children, style, ...rest }) {
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: 14,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

function Button({ children, onClick, variant = "default", disabled, style, full }) {
  const base = {
    fontFamily: "'Karla', sans-serif",
    fontWeight: 600,
    fontSize: 14,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid transparent",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    width: full ? "100%" : "auto",
    transition: "transform 0.06s ease",
  };
  const variants = {
    default: { background: C.panelLighter, color: C.text, borderColor: C.border },
    primary: { background: C.red, color: "#fff" },
    green: { background: C.green, color: "#fff" },
    ghost: { background: "transparent", color: C.muted, borderColor: C.border },
    mustard: { background: C.mustard, color: "#211a08" },
  };
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = "scale(0.97)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  background: C.panelLight,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  color: C.text,
  padding: "9px 10px",
  fontSize: 14,
  fontFamily: "'Karla', sans-serif",
};

function Chip({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: 20,
        fontSize: 13,
        fontFamily: "'Karla', sans-serif",
        fontWeight: 600,
        border: `1px solid ${active ? C.red : C.border}`,
        background: active ? "rgba(196,67,43,0.18)" : "transparent",
        color: active ? "#EFA089" : C.muted,
        cursor: "pointer",
        marginRight: 6,
        marginBottom: 6,
      }}
    >
      {children}
    </button>
  );
}

function ScoreDigits({ children, size = 44, color = C.text }) {
  return (
    <span
      style={{
        fontFamily: "'Teko', sans-serif",
        fontSize: size,
        lineHeight: 1,
        color,
        letterSpacing: 0.5,
      }}
    >
      {children}
    </span>
  );
}

// ============================================================
// 05. MAIN APP — STATE, STORAGE & MATCH LIFECYCLE
// ============================================================

/* ---------------- Main App ---------------- */

function CricketSplash() {
  const batImg = new URL("./assets/bat.png", import.meta.url).href;
  const ballImg = new URL("./assets/ball.png", import.meta.url).href;
  const bgImg = new URL("./assets/splash-bg.jpg", import.meta.url).href;
  const readyImg = new URL("./assets/ready-title.png", import.meta.url).href;

  return (
    <div className="cricket-splash">
      <div
        className="splash-stadium"
        style={{ backgroundImage: `url(${bgImg})` }}
      >
        <img
          src={batImg}
          className="splash-bat"
          alt=""
        />

        <img
          src={ballImg}
          className="splash-ball"

          
          alt=""
        />

        <img
          src={readyImg}
          className="splash-ready"
          alt="READY TO PLAY!"
        />
      </div>
    </div>
  );
}

export default function App() {
  // ----------------------------------------------------------
  // App-level state
  // ----------------------------------------------------------
  const [tab, setTab] = useState("dashboard");
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [liveMatch, setLiveMatch] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [scheduledMatchToStart, setScheduledMatchToStart] = useState(null);
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState(() => {

  return localStorage.getItem("gully-theme") || "dark";
});
  useEffect(() => {
    localStorage.setItem("gully-theme", theme);
  }, [theme]);

C = THEMES[theme];
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [completedMatch, setCompletedMatch] = useState(null);
  const [undoSnapshot, setUndoSnapshot] = useState(null);
  const [toast, setToast] = useState(null);

  const [showSplash, setShowSplash] = useState(true);

useEffect(() => {
  const timer = setTimeout(() => {
    setShowSplash(false);
  }, 1800);

  return () => clearTimeout(timer);
}, []);

  // ----------------------------------------------------------
  // Load saved data from localStorage
  // ----------------------------------------------------------
  useEffect(() => {
    (async () => {
      try {
const p = localStorage.getItem("players");
const m = localStorage.getItem("matches");
const lm = localStorage.getItem("live-match");
const t = localStorage.getItem("tournaments");

if (p) setPlayers(JSON.parse(p));
if (m) setMatches(JSON.parse(m));
if (lm) setLiveMatch(JSON.parse(lm));
if (t) setTournaments(JSON.parse(t));
      } catch (e) {
        console.error("Load error", e);
      }
      setReady(true);
    })();
  }, []);

  // ----------------------------------------------------------
  // UI feedback / toast
  // ----------------------------------------------------------
  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

 const persistPlayers = async (next) => {
  setPlayers(next);
  try {
    localStorage.setItem("players", JSON.stringify(next));
  } catch (e) {
    console.error(e);
  }
};
const persistMatches = async (next) => {
  setMatches(next);
  try {
    localStorage.setItem("matches", JSON.stringify(next));
  } catch (e) {
    console.error(e);
  }
};

const persistTournaments = async (next) => {
  setTournaments(next);
  try {
    localStorage.setItem("tournaments", JSON.stringify(next));
  } catch (e) {
    console.error(e);
  }
};

const markScheduledMatchPlayed = (match) => {
  if (!match?.tournamentId || !match?.scheduledMatchId) return;

  const updatedTournaments = tournaments.map((tournament) =>
    tournament.id === match.tournamentId
      ? {
          ...tournament,
          scheduledMatches: (tournament.scheduledMatches || []).map(
            (scheduledMatch) =>
              scheduledMatch.id === match.scheduledMatchId
                ? {
                    ...scheduledMatch,
                    status: "played",
                  }
                : scheduledMatch
          ),
        }
      : tournament
  );

  persistTournaments(updatedTournaments);
};

const persistLive = (next) => {
  setLiveMatch(next);

  try {
    if (next) {
      localStorage.setItem("live-match", JSON.stringify(next));
    } else {
      localStorage.removeItem("live-match");
    }
  } catch (e) {
    console.error(e);
  }
};

  // ----------------------------------------------------------
  // Player management
  // ----------------------------------------------------------
  const addPlayer = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = players.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing.id;
    const p = { id: uid(), name: trimmed };
    persistPlayers([...players, p]);
    return p.id;
  };

  // ----------------------------------------------------------
  // Match lifecycle controls
  // ----------------------------------------------------------
  const startMatch = (setup) => {
    const m = newMatchObj(setup);
    persistLive(m);
    setUndoSnapshot(null);
    setTab("match");
  };

  const cancelLiveMatch = () => {
    persistLive(null);
    setUndoSnapshot(null);
  };

  // ==========================================================
  // CORE CRICKET SCORING LOGIC
  // ==========================================================
  /* ---- core ball recording ---- */
  const recordBall = (opts) => {
    // opts: { runs (bat runs), extra: null|'wide'|'noball'|'bye'|'legbye', wicket: null|{type} , extraRuns (additional run beyond the 1 for wide/noball) }
    if (!liveMatch) return;
    const snapshotBefore = JSON.parse(JSON.stringify(liveMatch));
    const idx = liveMatch.currentInningsIdx;
    const inn = JSON.parse(JSON.stringify(liveMatch.innings[idx]));
    const { runs = 0, extra = null, wicket = null, extraRuns = 0 } = opts;

    const striker = inn.strikerId;
    const nonStriker = inn.nonStrikerId;
    const bowlerId = inn.currentBowlerId;

    let runsToTeam = 0;
    let runsToBatsman = 0;
    let isLegalBall = true;
    let ballLabel = "";

    if (extra === "wide") {
      runsToTeam = 1 + extraRuns;
      isLegalBall = false;
      ballLabel = extraRuns > 0 ? `Wd+${extraRuns}` : "Wd";
    } else if (extra === "noball") {
      runsToTeam = 1 + runs;
      runsToBatsman = runs;
      isLegalBall = false;
      ballLabel = runs > 0 ? `Nb+${runs}` : "Nb";
    } else if (extra === "bye") {
      runsToTeam = runs;
      isLegalBall = true;
      ballLabel = `B${runs}`;
    } else if (extra === "legbye") {
      runsToTeam = runs;
      isLegalBall = true;
      ballLabel = `Lb${runs}`;
    } else {
      runsToTeam = runs;
      runsToBatsman = runs;
      isLegalBall = true;
      ballLabel = wicket
  ? (wicket.type === "runout" && runs > 0 ? `${runs}+W` : "W")
  : String(runs);
    }

    inn.totalRuns += runsToTeam;

    if (runsToBatsman > 0 && striker) {
      const b = inn.batsmen[striker];
      b.runs += runsToBatsman;
      if (runsToBatsman === 4) b.fours += 1;
      if (runsToBatsman === 6) b.sixes += 1;
    }

    // Partnership runs
if (
  inn.currentPartnership &&
  inn.currentPartnership.batsmanAId &&
  inn.currentPartnership.batsmanBId
) {
  inn.currentPartnership.runs += runsToTeam;

  if (striker === inn.currentPartnership.batsmanAId) {
    inn.currentPartnership.batsmanARuns += runsToBatsman;
  } else if (striker === inn.currentPartnership.batsmanBId) {
    inn.currentPartnership.batsmanBRuns += runsToBatsman;
  }
}

    // ball faced count: legal balls + no-balls count as a ball faced, wides do not
    if (striker && (isLegalBall || extra === "noball")) {
      inn.batsmen[striker].balls += 1;
    }

if (bowlerId) {
  const bw = inn.bowlers[bowlerId];

  // byes/leg-byes are extras, not charged against the bowler
  if (extra !== "bye" && extra !== "legbye") {
    bw.runs += runsToTeam;
    bw.overRuns = (bw.overRuns || 0) + runsToTeam;
  }

  if (isLegalBall) bw.legalBalls += 1;
}

    if (isLegalBall) inn.legalBalls += 1;
    // Extras total + category-wise breakdown
const extraAmount = runsToTeam - runsToBatsman;

inn.extras = (inn.extras || 0) + extraAmount;

if (!inn.extrasBreakdown) {
  inn.extrasBreakdown = {
    wides: 0,
    noBalls: 0,
    byes: 0,
    legByes: 0,
  };
}

if (extra === "wide") {
  inn.extrasBreakdown.wides += extraAmount;
} else if (extra === "noball") {
  inn.extrasBreakdown.noBalls += extraAmount;
} else if (extra === "bye") {
  inn.extrasBreakdown.byes += extraAmount;
} else if (extra === "legbye") {
  inn.extrasBreakdown.legByes += extraAmount;
}

    let batsmanOutId = null;
    if (wicket) {
      batsmanOutId = wicket.batsmanOutId || striker;
      inn.totalWickets += 1;

      // Save completed partnership when wicket falls
if (inn.currentPartnership) {
  inn.partnerships = inn.partnerships || [];
  inn.partnerships.push({
    ...inn.currentPartnership,
  });
  inn.currentPartnership = null;
}

      if (!inn.fallOfWickets) {
  inn.fallOfWickets = [];
}

inn.fallOfWickets.push({
  wicketNumber: inn.totalWickets,
  batsmanId: batsmanOutId,
  bowlerId: inn.currentBowlerId,
  score: inn.totalRuns,
  legalBalls: inn.legalBalls,
});
if (inn.batsmen[batsmanOutId]) {
  inn.batsmen[batsmanOutId].out = true;
  inn.batsmen[batsmanOutId].howOut = wicket.type;
  inn.batsmen[batsmanOutId].fielderId = wicket.fielderId || null;
  inn.batsmen[batsmanOutId].bowlerId = bowlerId || null;
}
      if (bowlerId && wicket.type !== "runout") {
        inn.bowlers[bowlerId].wickets += 1;
      }
    }

    // strike rotation for completed (non-wicket) deliveries
// strike rotation
if (!wicket) {
  const rotatingRuns =
    extra === "wide"
      ? extraRuns
      : extra === "noball"
      ? runs
      : runsToTeam;

  if (rotatingRuns % 2 === 1) {
    inn.strikerId = nonStriker;
    inn.nonStrikerId = striker;
  }
} else if (wicket.type === "runout") {
  // Run-out se pehle jitne runs complete hue,
  // unke according batsmen ne ends change kiye honge.
  if (runs % 2 === 1) {
    const s = inn.strikerId;
    inn.strikerId = inn.nonStrikerId;
    inn.nonStrikerId = s;
  }
}

    inn.overHistory[inn.overHistory.length - 1].push(ballLabel);

    // end of over
    let awaitingBowler = false;
    if (isLegalBall && inn.legalBalls % 6 === 0 && inn.legalBalls > 0) {
      const overBowler = inn.bowlers[inn.currentBowlerId];

if (overBowler && (overBowler.overRuns || 0) === 0) {
  overBowler.maidens = (overBowler.maidens || 0) + 1;
}

if (overBowler) {
  overBowler.overRuns = 0;
}
      inn.lastOverBowlerId = inn.currentBowlerId;
      inn.currentBowlerId = null;
      inn.overHistory.push([]);
      // swap strike at end of over (skip if a wicket just fell and a batsman slot is empty)
      if (inn.strikerId && inn.nonStrikerId) {
        const s = inn.strikerId;
        inn.strikerId = inn.nonStrikerId;
        inn.nonStrikerId = s;
      }
      awaitingBowler = true;
    }

    // determine if we need a new batsman
    let awaitingBatsman = false;
    const battingTeamSize = teamPlayersFor(liveMatch, inn.battingTeam).length;
    const allOut = inn.totalWickets >= battingTeamSize - 1;

    if (wicket && !allOut) {
      awaitingBatsman = true;
      if (wicket.batsmanOutId === inn.nonStrikerId) {
        inn.nonStrikerId = null;
        // non striker out, striker unaffected, but we still need a replacement for nonstriker slot
      } else {
        inn.strikerId = null;
      }
    }

    const oversUp = inn.legalBalls >= inn.oversLimit * 6;
    const targetChased = inn.target != null && inn.totalRuns >= inn.target;

    let matchDone = false;
    let inningsOver = false;

    if (allOut || oversUp || targetChased) {
      inningsOver = true;
      awaitingBowler = false;
      awaitingBatsman = false;
    }

    // Save current partnership when innings ends
if (inningsOver && inn.currentPartnership) {
  inn.partnerships = inn.partnerships || [];
  inn.partnerships.push({
    ...inn.currentPartnership,
  });
  inn.currentPartnership = null;
}

    const nextMatch = JSON.parse(JSON.stringify(liveMatch));
    nextMatch.innings[idx] = inn;

    if (inningsOver) {
      if (idx === 0) {
        // set up second innings
        const battingSecond = inn.bowlingTeam;
        const bowlingSecond = inn.battingTeam;
        nextMatch.innings.push(
          emptyInnings(battingSecond, bowlingSecond, nextMatch.overs, inn.totalRuns + 1)
        );
        nextMatch.currentInningsIdx = 1;
      } else {
        // match complete
        matchDone = true;
        const inn1 = nextMatch.innings[0];
        const inn2 = nextMatch.innings[1];
        const teamAName = nextMatch.teamAName;
        const teamBName = nextMatch.teamBName;
        const scoreFor = (key) => (inn1.battingTeam === key ? inn1 : inn2);
        const aScore = scoreFor("A");
        const bScore = scoreFor("B");
        let resultText;
        if (aScore.totalRuns === bScore.totalRuns) {
          resultText = "Match tied";
        } else {
          const winner = aScore.totalRuns > bScore.totalRuns ? "A" : "B";
          const winnerName = winner === "A" ? teamAName : teamBName;
          if (inn2.battingTeam === winner) {
            const wicketsLeft = teamPlayersFor(nextMatch, winner).length - 1 - inn2.totalWickets;
            resultText = `${winnerName} won by ${wicketsLeft} wicket${wicketsLeft === 1 ? "" : "s"}`;
          } else {
            const margin = Math.abs(aScore.totalRuns - bScore.totalRuns);
            resultText = `${winnerName} won by ${margin} run${margin === 1 ? "" : "s"}`;
          }
        }
        nextMatch.status = "completed";
        nextMatch.result = resultText;
      }
    }

    setUndoSnapshot(snapshotBefore);

    if (matchDone) {
      persistMatches([nextMatch, ...matches]);
      markScheduledMatchPlayed(nextMatch);
      persistLive(null);
      setCompletedMatch(nextMatch);
      setSelectedMatchId(nextMatch.id);
      flash(nextMatch.result);
    } else {
      persistLive(nextMatch);
    }
  };

  // ----------------------------------------------------------
  // Undo last delivery
  // ----------------------------------------------------------
  const undoLastBall = () => {
    if (!undoSnapshot) return;
    persistLive(undoSnapshot);
    setUndoSnapshot(null);
  };

  // ----------------------------------------------------------
  // Innings setup / player selection
  // ----------------------------------------------------------
  const setOpeners = (strikerId, nonStrikerId, bowlerId) => {
    if (!liveMatch) return;
    const nextMatch = JSON.parse(JSON.stringify(liveMatch));
    const idx = nextMatch.currentInningsIdx;
    const inn = nextMatch.innings[idx];
    inn.strikerId = strikerId;
    inn.nonStrikerId = nonStrikerId;
    inn.currentBowlerId = bowlerId;
    inn.battingOrder = [strikerId, nonStrikerId];

    inn.currentPartnership = {
  batsmanAId: strikerId,
  batsmanBId: nonStrikerId,
  batsmanARuns: 0,
  batsmanBRuns: 0,
  runs: 0,
};

    [strikerId, nonStrikerId].forEach((pid) => {
      if (!inn.batsmen[pid]) inn.batsmen[pid] = { runs: 0, balls: 0, fours: 0, sixes: 0, out: false, howOut: null };
    });
    if (!inn.bowlers[bowlerId]) {
  inn.bowlers[bowlerId] = {
    legalBalls: 0,
    runs: 0,
    wickets: 0,
    maidens: 0
  };
}
    persistLive(nextMatch);
  };

  const setNextBowler = (bowlerId) => {
    if (!liveMatch) return;
    const nextMatch = JSON.parse(JSON.stringify(liveMatch));
    const idx = nextMatch.currentInningsIdx;
    const inn = nextMatch.innings[idx];
    inn.currentBowlerId = bowlerId;
    if (!inn.bowlers[bowlerId]) {
  inn.bowlers[bowlerId] = {
    legalBalls: 0,
    runs: 0,
    wickets: 0,
    maidens: 0
  };
}
    persistLive(nextMatch);
  };

const setNextBatsman = (batsmanId) => {
  if (!liveMatch) return;

  const nextMatch = JSON.parse(JSON.stringify(liveMatch));
  const idx = nextMatch.currentInningsIdx;
  const inn = nextMatch.innings[idx];

  if (!inn.batsmen[batsmanId]) {
    inn.batsmen[batsmanId] = {
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      out: false,
      howOut: null
    };
  }

  // Jo slot empty hai, naye batsman ko wahi bhejo
  if (!inn.strikerId) {
    inn.strikerId = batsmanId;
  } else if (!inn.nonStrikerId) {
    inn.nonStrikerId = batsmanId;
  }

  if (!inn.battingOrder.includes(batsmanId)) {
    inn.battingOrder.push(batsmanId);
  }

  // Start a new partnership when both batsmen are present
if (
  !inn.currentPartnership &&
  inn.strikerId &&
  inn.nonStrikerId
) {
  inn.currentPartnership = {
    batsmanAId: inn.strikerId,
    batsmanBId: inn.nonStrikerId,
    batsmanARuns: 0,
    batsmanBRuns: 0,
    runs: 0,
  };
}

  persistLive(nextMatch);
};

  const setBatsmenPositions = (strikerId, nonStrikerId) => {
  if (!liveMatch || strikerId === nonStrikerId) return;

  const nextMatch = JSON.parse(JSON.stringify(liveMatch));
  const idx = nextMatch.currentInningsIdx;
  const inn = nextMatch.innings[idx];

  inn.strikerId = strikerId;
  inn.nonStrikerId = nonStrikerId;

  persistLive(nextMatch);
};

  // ----------------------------------------------------------
  // Derived statistics
  // ----------------------------------------------------------
  const careerStats = computeCareerStats(players, matches);

  if (!ready) {
    return (
      <div style={{ background: C.bg, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted }}>
        Loading scoreboard…
      </div>
    );
  }

  return (
    <div
      style={{
        background: C.bg,
        minHeight: "100vh",
        fontFamily: "'Karla', sans-serif",
        color: C.text,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Teko:wght@500;600;700&family=Karla:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        html, body {
  width: 100%;
  overflow-x: hidden;
}
        body { margin:0; }
        ::-webkit-scrollbar { width: 6px; height:6px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius:4px; }

        .cricket-splash {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: #101418;
  overflow: hidden;
}

.splash-stadium {
  position: relative;
  width: 100%;
  height: 100%;
  background:
    radial-gradient(circle at 50% 55%, #31452f 0%, #101418 65%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.splash-pitch {
  position: absolute;
  width: 45%;
  height: 18%;
  background: #59634c;
  border-radius: 50%;
  opacity: 0.35;
}

.splash-bat {
  position: absolute;
  font-size: 90px;
  transform: rotate(-35deg);
  animation: batHit 0.65s ease-in-out forwards;
  z-index: 3;
}

.splash-ball {
  position: absolute;
  font-size: 35px;
  animation: ballZoom 1.15s ease-in forwards;
  z-index: 4;
}

.splash-ready {
  position: absolute;
  color: #fff;
  font-size: 34px;
  font-weight: 900;
  letter-spacing: 2px;
  text-align: center;
  opacity: 0;
  transform: scale(0.7);
  animation: readyText 0.45s ease-out 0.95s forwards;
  z-index: 5;
}

@keyframes batHit {
  0% {
    transform: translateX(-120px) rotate(-55deg);
  }

  60% {
    transform: translateX(0) rotate(-35deg);
  }

  100% {
    transform: translateX(35px) rotate(-10deg);
  }
}

@keyframes ballZoom {
  0% {
    transform: translate(-120px, -20px) scale(0.7);
  }

  35% {
    transform: translate(0, 0) scale(1);
  }

  100% {
    transform: translate(0, 0) scale(35);
  }
}

@keyframes readyText {
  0% {
    opacity: 0;
    transform: scale(0.7);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}

      `}</style>
      <div style={{ width: "100%", maxWidth: 480, minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative" }}>
        {showSplash && <CricketSplash />}
        <Header
  liveMatch={liveMatch}
  tab={tab}
  theme={theme}
  setTheme={setTheme}
/>
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 90px 14px" }}>
          {tab === "dashboard" && (
            <Dashboard
              players={players}
              matches={matches}
              liveMatch={liveMatch}
              careerStats={careerStats}
              goToMatch={() => setTab("match")}
              goToHistory={(id) => {
                setSelectedMatchId(id);
                setTab("history");
              }}
            />
          )}
          {tab === "players" && <PlayersTab players={players} careerStats={careerStats} addPlayer={addPlayer} />}
          {tab === "match" && (
            <MatchTab
              liveMatch={liveMatch}
              completedMatch={completedMatch}
              setCompletedMatch={setCompletedMatch}
              players={players}
              addPlayer={addPlayer}
              startMatch={startMatch}
              scheduledMatchToStart={scheduledMatchToStart}
              recordBall={recordBall}
              undoLastBall={undoLastBall}
              canUndo={!!undoSnapshot}
              setOpeners={setOpeners}
              setNextBowler={setNextBowler}
              setNextBatsman={setNextBatsman}
              setBatsmenPositions={setBatsmenPositions}
              cancelLiveMatch={cancelLiveMatch}
              setTab={setTab}
            />
          )}

{tab === "tournaments" && (
  <TournamentTab
    players={players}
    tournaments={tournaments}
    matches={matches}
    liveMatch={liveMatch}
    persistTournaments={persistTournaments}
    setScheduledMatchToStart={setScheduledMatchToStart}

    setTab={setTab}
  />
)}

          {tab === "history" && (
            <HistoryTab
              matches={matches}
              players={players}
              selectedMatchId={selectedMatchId}
              setSelectedMatchId={setSelectedMatchId}
            />
          )}
        </div>
        <BottomNav tab={tab} setTab={setTab} liveActive={!!liveMatch} />

<div
  style={{
    position: "absolute",
    top: 8,
    right: 10,
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: C.muted,
    opacity: 0.45,
    fontSize: 11,
    fontWeight: 600,
    pointerEvents: "none",
    zIndex: 20,
  }}
>
  <span
    style={{
      width: 20,
      height: 20,
      border: `1px solid ${C.muted}`,
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 13,
      lineHeight: 1,
    }}
  >
    C
  </span>
  <span>Made by Misbah</span>
</div>

        {toast && (
          <div
            style={{
              position: "absolute",
              bottom: 78,
              left: "50%",
              transform: "translateX(-50%)",
              background: C.mustard,
              color: "#211a08",
              padding: "8px 16px",
              borderRadius: 20,
              fontWeight: 700,
              fontSize: 13,
              boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
            }}
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 06. HEADER & BOTTOM NAVIGATION
// ============================================================

/* ---------------- Header + Nav ---------------- */

function Header({ liveMatch, tab, theme, setTheme }) {
  const titles = { dashboard: "Dashboard", players: "Players", match: "Match", history: "History" };
  return (
    <div
      style={{
        padding: "16px 16px 14px 16px",
        boxSizing: "border-box",
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 10,
        position: "sticky",
        top: 0,
        background: C.bg,
        zIndex: 5,
      }}
    >
<div
  style={{
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  }}
>
  <img
    src="/logo.png"
    alt="Gully Cricket Scorer"
    style={{
      width: 45,
      height: 45,
      objectFit: "contain",
      borderRadius: 10,
    }}
  />


<div
  style={{
    display: "flex",
    alignItems: "center",
  }}
>
  <img
    src="/wordmark.png"
    alt="Gully Cricket Scorer"
    style={{
      width: 105,
      height: 50,
      objectFit: "contain",
      display: "block",
    }}
  />
</div>



</div>
      <div
  style={{
    fontSize: 12.5,
    color: C.muted,
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    whiteSpace: "nowrap",
  }}
>
        {liveMatch && (
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: C.mustard, fontWeight: 700 }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: C.mustard, display: "inline-block" }} />
            LIVE
          </span>
        )}
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
  <span style={{ fontSize: 15 }}>⌂</span>
  {titles[tab]}
</span>

<span
  style={{
    width: 1,
    height: 24,
    background: C.border,
    marginLeft: 8,
  }}
/>
        <button
  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
  style={{
    marginLeft: 8,
    padding: "5px 9px",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: C.panel,
    color: C.text,
    fontSize: 12,
    cursor: "pointer",
    flexShrink: 0,
    whiteSpace: "nowrap",
  }}
>
  {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
</button>
      </div>
    </div>
  );
}

function BottomNav({ tab, setTab, liveActive }) {
  const items = [
    { key: "dashboard", label: "Home" },
    { key: "match", label: liveActive ? "Live" : "New match" },
    { key: "tournaments", label: "Tournament" },
    { key: "players", label: "Players" },
    { key: "history", label: "History" },
    
  ];
  return (
    <div
      style={{
        display: "flex",
        borderTop: `1px solid ${C.border}`,
        background: C.panel,
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        margin: "0 auto",
        maxWidth: 480,
        zIndex: 1000,
      }}
    >
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => setTab(it.key)}
          style={{
            flex: 1,
            padding: "12px 4px",
            background: "transparent",
            border: "none",
            color: tab === it.key ? C.red : C.muted,
            fontWeight: tab === it.key ? 700 : 500,
            fontSize: 12.5,
            fontFamily: "'Karla', sans-serif",
            cursor: "pointer",
            position: "relative",
          }}
        >
          {it.key === "match" && liveActive && (
            <span
              style={{
                position: "absolute",
                top: 6,
                right: "calc(50% - 18px)",
                width: 6,
                height: 6,
                borderRadius: 99,
                background: C.mustard,
              }}
            />
          )}
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// 07. DASHBOARD
// ============================================================

/* ---------------- Dashboard ---------------- */

function Dashboard({ players, matches, liveMatch, careerStats, goToMatch, goToHistory }) {
  const completed = matches.filter((m) => m.status === "completed");
  const statList = Object.values(careerStats);
  const topRuns = [...statList].sort((a, b) => b.runs - a.runs).filter((s) => s.runs > 0).slice(0, 3);
  const topWickets = [...statList].sort((a, b) => b.wickets - a.wickets).filter((s) => s.wickets > 0).slice(0, 3);
  const lastMatch = completed[0];

  return (
    <div>

      {!liveMatch && (
        <Panel
          style={{
            marginBottom: 14,
            padding: 20,
            cursor: "pointer",
            background: `linear-gradient(135deg, ${C.panelLight}, ${C.panel})`,
            border: `1px solid ${C.border}`,
            position: "relative",
            overflow: "hidden",
          }}
          onClick={goToMatch}
        >
          <div
            style={{
              fontSize: 11,
              color: C.mustard,
              fontWeight: 800,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            🏏 Street Cricket
          </div>

          <div
            style={{
              fontSize: 24,
              fontWeight: 900,
              color: C.text,
              lineHeight: 1.1,
            }}
          >
            Ready to Score?
          </div>

          <div
            style={{
              fontSize: 13,
              color: C.muted,
              marginTop: 6,
              marginBottom: 14,
            }}
          >
            Start a new match and keep every run, wicket and over on record.
          </div>

          <div
            style={{
              display: "inline-block",
              padding: "9px 15px",
              borderRadius: 9,
              background: C.red,
              color: "#fff",
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            Start New Match →
          </div>
        </Panel>
      )}

      {liveMatch && (
        <Panel style={{ borderColor: C.mustard, marginBottom: 14, cursor: "pointer" }} onClick={goToMatch}>
          <div style={{ fontSize: 12, color: C.mustard, fontWeight: 700, marginBottom: 6 }}>Match in progress</div>
          <div style={{ fontSize: 14 }}>
            {liveMatch.teamAName} vs {liveMatch.teamBName} — tap to continue scoring
          </div>
        </Panel>
      )}

      {matches.length === 0 && !liveMatch && (
        <Panel style={{ textAlign: "center", padding: 28 }}>
          <ScoreDigits size={40} color={C.red}>0/0</ScoreDigits>
          <div style={{ marginTop: 10, fontSize: 14, color: C.muted }}>
            No matches yet. Add your squad, then start your first match from the Match tab.
          </div>
        </Panel>
      )}

{(matches.length > 0 || liveMatch) && (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginBottom: 14,
    }}
  >
    <Panel
      style={{
        textAlign: "center",
        borderTop: `3px solid ${C.mustard}`,
        padding: 16,
      }}
    >
      <ScoreDigits size={34}>{completed.length}</ScoreDigits>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
        matches played
      </div>
    </Panel>

    <Panel
  style={{
    textAlign: "center",
    borderTop: `3px solid ${C.green}`,
    padding: 16,
  }}
>
      <ScoreDigits size={34}>{players.length}</ScoreDigits>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
        players in the squad
      </div>
    </Panel>
  </div>
)}

      {lastMatch && (
        <Panel
  style={{
    marginBottom: 14,
    cursor: "pointer",
    textAlign: "center",
    borderTop: `3px solid ${C.red}`,
    padding: 18,
  }}
  onClick={() => goToHistory(lastMatch.id)}
>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Last result</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{lastMatch.result}</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>
            {lastMatch.teamAName} vs {lastMatch.teamBName}
          </div>
        </Panel>
      )}

      {topRuns.length > 0 && (
        <Panel
  style={{
    marginBottom: 14,
    borderTop: `3px solid ${C.green}`,
    padding: 16,
  }}
>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Top run scorers</div>
         {topRuns.map((s, i) => (
  <div
    key={s.id}
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "8px 0",
      borderTop: i > 0 ? `1px solid ${C.border}` : "none",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 14 }}>
        {i === 0 ? "🥇" : `${i + 1}.`} {s.name}
      </span>
      <span style={{ fontSize: 11, color: C.muted }}>
        {s.matches} matches
      </span>
    </div>

    <span
      style={{
        fontFamily: "'Meko', sans-serif",
        fontSize: 19,
        color: C.green,
        fontWeight: 700,
      }}
    >
      {s.runs}
    </span>
  </div>
))}
        </Panel>
      )}

      {topWickets.length > 0 && (
        <Panel
  style={{
    borderTop: `3px solid ${C.red}`,
    padding: 16,
  }}
>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Top wicket takers</div>
          {topWickets.map((s, i) => (
  <div
    key={s.id}
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "8px 0",
      borderTop: i > 0 ? `1px solid ${C.border}` : "none",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 14 }}>
        {i === 0 ? "🥇" : `${i + 1}.`} {s.name}
      </span>
      <span style={{ fontSize: 11, color: C.muted }}>
        {s.matches} matches
      </span>
    </div>

    <span
      style={{
        fontFamily: "'Meko', sans-serif",
        fontSize: 19,
        color: C.red,
        fontWeight: 700,
      }}
    >
      {s.wickets}
    </span>
  </div>
))}
        </Panel>
      )}

      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 16, lineHeight: 1.5 }}>
        Everything here is shared with anyone you send this app's link to — good for one squad, so your teammates see the same roster and stats.
      </div>
    </div>
  );
}

// ============================================================
// 08. PLAYERS & CAREER STATS UI
// ============================================================

/* ---------------- Players ---------------- */

function PlayersTab({ players, careerStats, addPlayer }) {
  const [name, setName] = useState("");
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <Panel style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Add a player</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Player name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) {
                addPlayer(name);
                setName("");
              }
            }}
          />
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={() => {
              addPlayer(name);
              setName("");
            }}
          >
            Add
          </Button>
        </div>
      </Panel>

      {sorted.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 13.5, textAlign: "center", padding: 20 }}>
          No players added yet.
        </div>
      ) : (
        sorted.map((p) => {
          const s = careerStats[p.id];
          const avg = s.dismissals > 0 ? (s.runs / s.dismissals).toFixed(1) : s.runs > 0 ? "—" : "0.0";
          const econ = s.ballsBowled > 0 ? (s.runsConceded / (s.ballsBowled / 6)).toFixed(1) : null;
          return (
            <Panel key={p.id} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{p.name}</div>
                <div style={{ fontSize: 11.5, color: C.muted }}>{s.matches} match{s.matches === 1 ? "" : "es"}</div>
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <StatMini label="Runs" value={s.runs} />
                <StatMini label="Avg" value={avg} />
                <StatMini label="HS" value={s.highScore} />
                <StatMini label="4s/6s" value={`${s.fours}/${s.sixes}`} />
                <StatMini label="Wkts" value={s.wickets} />
                {econ && <StatMini label="Econ" value={econ} />}
                {s.bestBowling && (
                  <StatMini label="Best" value={`${s.bestBowling.wickets}/${s.bestBowling.runs}`} />
                )}
              </div>
            </Panel>
          );
        })
      )}
    </div>
  );
}

function StatMini({ label, value }) {
  return (
    <div>
      <div style={{ fontFamily: "'Teko', sans-serif", fontSize: 20, color: C.text }}>{value}</div>
      <div style={{ fontSize: 10.5, color: C.muted, marginTop: -2 }}>{label}</div>
    </div>
  );
}

// ============================================================
// 09. MATCH TAB & MATCH SETUP
// ============================================================

/* ---------------- Match tab ---------------- */

function TournamentTab({ players, tournaments, matches, liveMatch, persistTournaments, setScheduledMatchToStart, setTab, }) {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTournamentId, setSelectedTournamentId] = useState(null);
  const [tournamentName, setTournamentName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

const [showEdit, setShowEdit] = useState(false);
const [editTournamentName, setEditTournamentName] = useState("");
const [editStartDate, setEditStartDate] = useState("");
const [editEndDate, setEditEndDate] = useState("");

const [showSchedule, setShowSchedule] = useState(false);
const [selectedScorecardMatch, setSelectedScorecardMatch] = useState(null);
const [scheduleTeamA, setScheduleTeamA] = useState("");
const [scheduleTeamB, setScheduleTeamB] = useState("");
const [scheduleDate, setScheduleDate] = useState("");

const [teamName, setTeamName] = useState("");

  const createTournament = () => {
    if (!tournamentName.trim()) return;

    const newTournament = {
      id: uid(),
      name: tournamentName.trim(),
      startDate,
      endDate,
      matchIds: [],
      scheduledMatches: [],
      teams: [],
    };



  

    persistTournaments([newTournament, ...tournaments]);

    setTournamentName("");
    setStartDate("");
    setEndDate("");
    setShowCreate(false);
  };
  
  const addTournamentTeam = () => {
  if (!selectedTournament) return;
 
  const name = teamName.trim();
  if (!name) return;
 
  const existingTeams = selectedTournament.teams || [];
 
  if (
    existingTeams.some(
      (team) => team.name.toLowerCase() === name.toLowerCase()
    )
  ) {
    alert("Team already exists.");
    return;
  }
 
  const newTeam = {
    id: uid(),
    name,
  };
 
  const updatedTournaments = tournaments.map((tournament) =>
    tournament.id === selectedTournament.id
      ? {
          ...tournament,
          teams: [...(tournament.teams || []), newTeam],
        }
      : tournament
  );
 
  persistTournaments(updatedTournaments);
  setTeamName("");
};

const editTournamentTeam = (team) => {
  if (!selectedTournament) return;
 
  const newName = window.prompt(
    "Enter new team name:",
    team.name
  );
 
  if (newName === null) return;
 
  const trimmedName = newName.trim();
 
  if (!trimmedName) return;
 
  const duplicate = (selectedTournament.teams || []).some(
    (item) =>
      item.id !== team.id &&
      item.name.toLowerCase() === trimmedName.toLowerCase()
  );
 
  if (duplicate) {
    alert("Team already exists.");
    return;
  }
 
  const updatedTournaments = tournaments.map((tournament) =>
    tournament.id === selectedTournament.id
      ? {
          ...tournament,
          teams: (tournament.teams || []).map((item) =>
            item.id === team.id
              ? { ...item, name: trimmedName }
              : item
          ),
          scheduledMatches: (tournament.scheduledMatches || []).map(
            (match) => ({
              ...match,
              teamAName:
                match.teamAName === team.name
                  ? trimmedName
                  : match.teamAName,
              teamBName:
                match.teamBName === team.name
                  ? trimmedName
                  : match.teamBName,
            })
          ),
        }
      : tournament
  );
 
  persistTournaments(updatedTournaments);
};

const deleteTournamentTeam = (team) => {
  if (!selectedTournament) return;
 
  const usedInMatch = (selectedTournament.scheduledMatches || []).some(
    (match) =>
      match.teamAName === team.name ||
      match.teamBName === team.name
  );
 
  if (usedInMatch) {
    alert(
      `${team.name} cannot be deleted because it is already used in a scheduled or played match.`
    );
    return;
  }
 
  const confirmed = window.confirm(
    `Delete ${team.name}?`
  );
 
  if (!confirmed) return;
 
  const updatedTournaments = tournaments.map((tournament) =>
    tournament.id === selectedTournament.id
      ? {
          ...tournament,
          teams: (tournament.teams || []).filter(
            (item) => item.id !== team.id
          ),
        }
      : tournament
  );
 
  persistTournaments(updatedTournaments);
};

  const deleteTournament = (tournamentId) => {
  const confirmed = window.confirm(
    "Are you sure you want to delete this tournament?"
  );

  if (!confirmed) return;

  const updatedTournaments = tournaments.filter(
    (tournament) => tournament.id !== tournamentId
  );

  persistTournaments(updatedTournaments);

  if (selectedTournamentId === tournamentId) {
    setSelectedTournamentId(null);
  }
};

const editTournament = () => {
  if (!selectedTournament) return;
  if (!editTournamentName.trim()) return;

  const updatedTournaments = tournaments.map((tournament) =>
    tournament.id === selectedTournament.id
      ? {
          ...tournament,
          name: editTournamentName.trim(),
          startDate: editStartDate,
          endDate: editEndDate,
        }
      : tournament
  );

  persistTournaments(updatedTournaments);

  setShowEdit(false);
};

  const scheduleMatch = () => {
  if (!selectedTournament) return;
  if (!scheduleTeamA.trim() || !scheduleTeamB.trim()) return;

  const newScheduledMatch = {
    id: uid(),
    teamAName: scheduleTeamA.trim(),
    teamBName: scheduleTeamB.trim(),
    date: scheduleDate,
    status: "scheduled",
  };

  const updatedTournaments = tournaments.map((tournament) =>
    tournament.id === selectedTournament.id
      ? {
          ...tournament,
          scheduledMatches: [
            ...(tournament.scheduledMatches || []),
            newScheduledMatch,
          ],
        }
      : tournament
  );

  persistTournaments(updatedTournaments);

  setScheduleTeamA("");
  setScheduleTeamB("");
  setScheduleDate("");
  setShowSchedule(false);
};

const deleteScheduledMatch = (matchId) => {
  if (!selectedTournament) return;

  const confirmed = window.confirm(
    "Are you sure you want to delete this match?"
  );

  if (!confirmed) return;

  const updatedTournaments = tournaments.map((tournament) =>
    tournament.id === selectedTournament.id
      ? {
          ...tournament,
          scheduledMatches: (tournament.scheduledMatches || []).filter(
            (match) => match.id !== matchId
          ),
        }
      : tournament
  );

  persistTournaments(updatedTournaments);
};

  const selectedTournament = tournaments.find(
  (tournament) => tournament.id === selectedTournamentId
);

const getPlayedMatch = (scheduledMatchId) =>
  matches.find((match) => match.scheduledMatchId === scheduledMatchId);

const getTournamentStandings = (tournament) => {
  const standings = {};

  (tournament.scheduledMatches || []).forEach((scheduledMatch) => {
    const playedMatch = getPlayedMatch(scheduledMatch.id);

    if (!playedMatch || playedMatch.status !== "completed") return;

    const teams = [
      scheduledMatch.teamAName,
      scheduledMatch.teamBName,
    ];

    teams.forEach((team) => {
      if (!standings[team]) {
        standings[team] = {
          team,
          played: 0,
          won: 0,
          lost: 0,
          tied: 0,
          points: 0,
        };
      }
    });

    standings[scheduledMatch.teamAName].played += 1;
    standings[scheduledMatch.teamBName].played += 1;

    const result = (playedMatch.result || "").toLowerCase();

    if (result.includes("tied")) {
      standings[scheduledMatch.teamAName].tied += 1;
      standings[scheduledMatch.teamBName].tied += 1;

      standings[scheduledMatch.teamAName].points += 1;
      standings[scheduledMatch.teamBName].points += 1;
    } else if (result.includes(scheduledMatch.teamAName.toLowerCase())) {
      standings[scheduledMatch.teamAName].won += 1;
      standings[scheduledMatch.teamAName].points += 2;
      standings[scheduledMatch.teamBName].lost += 1;
    } else if (result.includes(scheduledMatch.teamBName.toLowerCase())) {
      standings[scheduledMatch.teamBName].won += 1;
      standings[scheduledMatch.teamBName].points += 2;
      standings[scheduledMatch.teamAName].lost += 1;
    }
  });

  return Object.values(standings).sort(
    (a, b) => b.points - a.points || b.won - a.won || a.team.localeCompare(b.team)
  );
};

const getTournamentStatus = (tournament) => {
  const today = new Date().toISOString().split("T")[0];

  const scheduledMatches = tournament.scheduledMatches || [];

  const playedMatches = scheduledMatches.filter(
    (match) => match.status === "played"
  ).length;

  if (
    tournament.endDate &&
    tournament.endDate < today
  ) {
    return {
      label: "Completed",
      icon: "🏁",
      color: C.muted,
    };
  }

  if (
    scheduledMatches.length > 0 &&
    playedMatches === scheduledMatches.length
  ) {
    return {
      label: "Completed",
      icon: "🏁",
      color: C.muted,
    };
  }

  if (
    tournament.startDate &&
    tournament.startDate > today
  ) {
    return {
      label: "Upcoming",
      icon: "🟢",
      color: C.green,
    };
  }

  return {
    label: "Ongoing",
    icon: "🔵",
    color: C.green,
  };
};

  if (selectedTournament) {
    if (selectedScorecardMatch) {
      return (
        <div>
          <Button
            variant="ghost"
            onClick={() => setSelectedScorecardMatch(null)}
            style={{ marginBottom: 12 }}
          >
            ← Back to Tournament
          </Button>
          <Scorecard
            match={selectedScorecardMatch}
            players={players}
            onBack={() => setSelectedScorecardMatch(null)}
          />
        </div>
      );
    }

  return (
    <div>
      <Button
        variant="ghost"
        onClick={() => setSelectedTournamentId(null)}
        style={{ marginBottom: 12 }}
      >
        ← Back to Tournaments
      </Button>

      <Panel
        style={{
          marginBottom: 14,
          borderTop: `3px solid ${C.mustard}`,
          padding: 16,
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: C.text,
          }}
        >
          🏆 {selectedTournament.name}
        </div>

        <div
  style={{
    display: "flex",
    gap: 8,
    justifyContent: "center",
    marginTop: 14,
  }}
>
  <Button
    variant="ghost"
    onClick={() => {
      setEditTournamentName(selectedTournament.name);
      setEditStartDate(selectedTournament.startDate || "");
      setEditEndDate(selectedTournament.endDate || "");
      setShowEdit(true);
    }}
  >
    ✏️ Edit
  </Button>

  <Button
    variant="ghost"
    onClick={() => deleteTournament(selectedTournament.id)}
    style={{
      color: C.red,
      borderColor: C.red,
    }}
  >
    🗑 Delete
  </Button>

{showEdit && (
  <div
    style={{
      marginTop: 14,
      padding: 12,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
    }}
  >
    <div
      style={{
        fontSize: 14,
        fontWeight: 800,
        marginBottom: 10,
      }}
    >
      Edit Tournament
    </div>

    <Field label="Tournament Name *">
      <input
        value={editTournamentName}
        onChange={(e) => setEditTournamentName(e.target.value)}
        style={inputStyle}
      />
    </Field>

    <Field label="Start Date">
      <input
        type="date"
        value={editStartDate}
        onChange={(e) => setEditStartDate(e.target.value)}
        style={inputStyle}
      />
    </Field>

    <Field label="End Date">
      <input
        type="date"
        value={editEndDate}
        onChange={(e) => setEditEndDate(e.target.value)}
        style={inputStyle}
      />
    </Field>

    <div style={{ display: "flex", gap: 8 }}>
      <Button
        variant="green"
        disabled={!editTournamentName.trim()}
        onClick={editTournament}
      >
        Save Changes
      </Button>

      <Button
        variant="ghost"
        onClick={() => setShowEdit(false)}
      >
        Cancel
      </Button>
    </div>
  </div>
)}

</div>

        {(selectedTournament.startDate || selectedTournament.endDate) && (
          <div
            style={{
              fontSize: 12,
              color: C.muted,
              marginTop: 6,
            }}
          >
            {selectedTournament.startDate || "Start date not set"}
            {"  →  "}
            {selectedTournament.endDate || "End date not set"}
          </div>
        )}

        {(() => {
          const tournamentMatches = selectedTournament.scheduledMatches || [];
          const played = tournamentMatches.filter(
            (match) => match.status === "played"
          ).length;
          const scheduled = tournamentMatches.filter(
            (match) => match.status !== "played"
          ).length;

          return (
            <div
              style={{
                fontSize: 13,
                color: C.muted,
                marginTop: 12,
                display: "flex",
                justifyContent: "center",
                gap: 18,
              }}
            >
              <span>{(selectedTournament.teams || []).length} Teams</span>
              <span>{played} Played</span>
              <span>{scheduled} Scheduled</span>
            </div>
          );
        })()}
        
        
        <Panel>
  <div
    style={{
      fontSize: 16,
      fontWeight: 800,
      marginBottom: 12,
    }}
  >
    👥 Teams
  </div>
 
  {(selectedTournament.teams || []).length === 0 ? (
    <div
      style={{
        color: C.muted,
        fontSize: 13,
        marginBottom: 12,
      }}
    >
      No teams added yet.
    </div>
  ) : (
    (selectedTournament.teams || []).map((team, index) => (
      <div
        key={team.id}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 0",
          borderTop:
            index === 0 ? "none" : `1px solid ${C.border}`,
        }}
      >
        <div style={{ fontWeight: 700 }}>
          {index + 1}. {team.name}
        </div>
 
<div style={{ display: "flex", gap: 6 }}>
  <Button
    variant="ghost"
    onClick={() => editTournamentTeam(team)}
  >
    ✏️
  </Button>
 
  <Button
    variant="danger"
    onClick={() => deleteTournamentTeam(team)}
  >
    🗑️
  </Button>
</div>
      </div>
    ))
  )}
 
  <div
    style={{
      display: "flex",
      gap: 8,
      marginTop: 12,
    }}
  >
    <input
      style={{
        ...inputStyle,
        flex: 1,
      }}
      value={teamName}
      onChange={(e) => setTeamName(e.target.value)}
      placeholder="e.g. Knight Riders"
    />
 
    <Button
      variant="green"
      disabled={!teamName.trim()}
      onClick={addTournamentTeam}
    >
      + Add
    </Button>
  </div>
</Panel>

        <div style={{ marginTop: 14 }}>
<Button
  variant="primary"
  onClick={() => setShowSchedule(true)}
>
  + Schedule Match
</Button>
        </div>

{showSchedule && (
  <div
    style={{
      marginTop: 16,
      paddingTop: 16,
      borderTop: `1px solid ${C.border}`,
    }}
  >
    <div
      style={{
        fontSize: 15,
        fontWeight: 800,
        marginBottom: 12,
      }}
    >
      Schedule Match
    </div>

    <Field label="Team A *">
  <select
    style={inputStyle}
    value={scheduleTeamA}
    onChange={(e) => setScheduleTeamA(e.target.value)}
  >
    <option value="">Select Team A</option>
 
    {(selectedTournament.teams || []).map((team) => (
      <option key={team.id} value={team.name}>
        {team.name}
      </option>
    ))}
  </select>
</Field>

    <Field label="Team B *">
  <select
    style={inputStyle}
    value={scheduleTeamB}
    onChange={(e) => setScheduleTeamB(e.target.value)}
  >
    <option value="">Select Team B</option>
 
    {(selectedTournament.teams || [])
      .filter((team) => team.name !== scheduleTeamA)
      .map((team) => (
        <option key={team.id} value={team.name}>
          {team.name}
        </option>
      ))}
  </select>
</Field>

    <Field label="Match Date">
      <input
        style={inputStyle}
        type="date"
        value={scheduleDate}
        onChange={(e) => setScheduleDate(e.target.value)}
      />
    </Field>

    <Button
      variant="green"
      disabled={
      !scheduleTeamA ||
      !scheduleTeamB ||
      scheduleTeamA === scheduleTeamB
      }
      onClick={scheduleMatch}
    >
      Schedule Match
    </Button>
  </div>
)}

      </Panel>

  <Panel>
  <div
    style={{
      fontSize: 16,
      fontWeight: 800,
      marginBottom: 12,
    }}
  >
    🏆 Points Table
  </div>

  {getTournamentStandings(selectedTournament).length === 0 ? (
    <div
      style={{
        color: C.muted,
        fontSize: 13,
      }}
    >
      No completed matches yet.
    </div>
  ) : (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 28px 28px 28px 28px 36px",
          gap: 4,
          fontSize: 11,
          fontWeight: 800,
          color: C.muted,
          paddingBottom: 8,
          whiteSpace: "nowrap",
        }}
      >
<div>Team</div>
<div style={{ textAlign: "center" }}>P</div>
<div style={{ textAlign: "center" }}>W</div>
<div style={{ textAlign: "center" }}>L</div>
<div style={{ textAlign: "center" }}>T</div>
<div style={{ textAlign: "center" }}>Pts</div>
      </div>

      {getTournamentStandings(selectedTournament).map((team, index) => (
        <div
          key={team.team}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 28px 28px 28px 28px 36px",
            gap: 4,
            padding: "10px 0",
            borderTop: `1px solid ${C.border}`,
            fontSize: 13,
            fontWeight: index === 0 ? 800 : 600,
          }}
        >
          <div>
<div
  style={{
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textAlign: "left",
  }}
>
  {index + 1}. {team.team}
</div>
          </div>
          <div style={{ textAlign: "center" }}>{team.played}</div>
          <div style={{ textAlign: "center" }}>{team.won}</div>
<div style={{ textAlign: "center" }}>{team.lost}</div>
<div style={{ textAlign: "center" }}>{team.tied}</div>
<div
  style={{
    textAlign: "center",
    fontWeight: 800,
  }}
>
  {team.points}
</div>
        </div>
      ))}
    </div>
  )}
</Panel>




      <Panel>
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            marginBottom: 10,
          }}
        >
          Matches
        </div>

{(!selectedTournament.scheduledMatches ||
  selectedTournament.scheduledMatches.length === 0) ? (
  <div style={{ fontSize: 13, color: C.muted }}>
    No matches scheduled yet.
  </div>
) : (
  selectedTournament.scheduledMatches.map((match, index) => (
<div
  key={match.id}
  style={{
    padding: "14px 0",
    borderTop:
      index > 0 ? `1px solid ${C.border}` : "none",
  }}
>
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) auto auto auto",
      alignItems: "center",
      columnGap: 8,
    }}
  >
<div
  style={{
    display: "grid",
    gridTemplateColumns: "24px minmax(0, 1fr)",
    alignItems: "center",
    minWidth: 0,
  }}
>
  <div
    style={{
      fontSize: 12,
      fontWeight: 800,
      color: C.text,
      whiteSpace: "nowrap",
    }}
  >
    {index + 1}.
  </div>

  <div
    style={{
      minWidth: 0,
      fontSize: 12,
      fontWeight: 800,
      color: C.text,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    }}
  >
    {match.teamAName} vs {match.teamBName}
  </div>
</div>

    <div
      style={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        background:
  match.status === "played"
    ? C.green
    : liveMatch?.scheduledMatchId === match.id
    ? C.red
    : C.mustard,
        boxShadow:
          match.status === "played"
            ? `0 0 0 3px rgba(76,140,91,0.12)`
            : `0 0 0 3px rgba(227,169,62,0.12)`,
      }}
      title={match.status === "played" ? "Played" : "Scheduled"}
    />
{match.status === "played" ? (
  <Button
    variant="green"
    onClick={() => {
      const playedMatch = getPlayedMatch(match.id);
      if (playedMatch) {
        setSelectedScorecardMatch(playedMatch);
      }
    }}
    style={{
      padding: "7px 10px",
      minWidth: 72,
      fontSize: 10,
      whiteSpace: "nowrap",
    }}
  >
    Scorecard
  </Button>
) : liveMatch?.scheduledMatchId === match.id ? (
  <Button
    variant="green"
    onClick={() => setTab("match")}
    style={{
      padding: "7px 10px",
      minWidth: 62,
      fontSize: 10,
      whiteSpace: "nowrap",
    }}
  >
    Resume
  </Button>
) : (
  <Button
    variant="green"
    onClick={() => {
      setScheduledMatchToStart({
        ...match,
        tournamentId: selectedTournament.id,
      });
      setTab("match");
    }}
    style={{
      padding: "7px 10px",
      minWidth: 55,
      fontSize: 10,
      whiteSpace: "nowrap",
    }}
  >
    Start
  </Button>
)}

    <Button
      variant="ghost"
      onClick={() => deleteScheduledMatch(match.id)}
style={{
  width: 10,
  height: 28,
  minWidth: 20,
  padding: 0,
  borderRadius: 8,
  color: C.red,
  borderColor: C.red,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 15,
}}
    >
      🗑
    </Button>
  </div>

  <div
    style={{
      lineHeight: 0.0,
      marginTop: 0,
      marginLeft: 6,
      fontSize: 12,
      color: C.muted,
      whiteSpace: "nowrap",
      textAlign: "left",
    }}
  >
    <div
  style={{
    marginTop: 0,
    marginLeft: 0,
    fontSize: 12,
    color: C.muted,
    whiteSpace: "nowrap",
    textAlign: "left",
  }}
>
  Date: {match.date || "Not decided"}
</div>
  </div>
</div>
  ))
)}
      </Panel>
    </div>
  );
}

  return (
    <div>
      <Panel
        style={{
          marginBottom: 14,
          borderTop: `3px solid ${C.mustard}`,
          padding: 16,
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: C.text,
            marginBottom: 6,
          }}
        >
          🏆 Tournaments
        </div>

        <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>
          Create and manage your gully cricket tournaments.
        </div>

        <Button
          variant="primary"
          onClick={() => setShowCreate(!showCreate)}
        >
          + Create Tournament
        </Button>

        {showCreate && (
          <div style={{ marginTop: 16 }}>
            <Field label="Tournament Name *">
              <input
                style={inputStyle}
                value={tournamentName}
                onChange={(e) => setTournamentName(e.target.value)}
                placeholder="e.g. Sunday Gully Cup"
              />
            </Field>

            <Field label="Start Date">
              <input
                style={inputStyle}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>

            <Field label="End Date">
              <input
                style={inputStyle}
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>

            <Button
              variant="green"
              disabled={!tournamentName.trim()}
              onClick={createTournament}
            >
              Create Tournament
            </Button>
          </div>
        )}
      </Panel>

      {tournaments.length > 0 && (
        <Panel>
          <div
            style={{
              fontSize: 15,
              fontWeight: 800,
              marginBottom: 10,
            }}
          >
            Your Tournaments
          </div>

   {tournaments.map((tournament) => {
  const status = getTournamentStatus(tournament);
  const tournamentMatches = tournament.scheduledMatches || [];

  const played = tournamentMatches.filter(
    (match) => match.status === "played"
  ).length;

  const scheduled = tournamentMatches.filter(
    (match) => match.status !== "played"
  ).length;

  const total = tournamentMatches.length;

  const teams = new Set();

  tournamentMatches.forEach((match) => {
    teams.add(match.teamAName);
    teams.add(match.teamBName);
  });

  const progress =
    total > 0 ? Math.round((played / total) * 100) : 0;

  return (
    <div
      key={tournament.id}
      onClick={() => setSelectedTournamentId(tournament.id)}
      style={{
        padding: "14px 0",
        borderTop: `1px solid ${C.border}`,
        cursor: "pointer",
      }}
    >
      <div
        style={{
          fontSize: 16,
          fontWeight: 800,
          color: C.text,
        }}
      >
        {tournament.name}
      </div>

      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: status.color,
          marginTop: 5,
        }}
      >
        {status.icon} {status.label}
      </div>

      {(tournament.startDate || tournament.endDate) && (
        <div
          style={{
            fontSize: 12,
            color: C.muted,
            marginTop: 4,
          }}
        >
          {tournament.startDate || "—"}
          {tournament.endDate
            ? ` → ${tournament.endDate}`
            : " → End date not set"}
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 14,
          marginTop: 10,
          fontSize: 12,
          color: C.muted,
        }}
      >
        <span>
          {(tournament.teams || []).length} Teams
        </span>

        <span>
          {played} Played
        </span>

        <span>
          {scheduled} Scheduled
        </span>
      </div>

      <div
        style={{
          marginTop: 9,
          fontSize: 12,
          color: C.muted,
        }}
      >
        {played} / {total} Matches Played
      </div>

      <div
        style={{
          height: 6,
          background: C.panelLight,
          borderRadius: 99,
          marginTop: 6,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            background: C.green,
            borderRadius: 99,
          }}
        />
      </div>
    </div>
  );
})}
        </Panel>
      )}
    </div>
  );
}

function MatchTab(props) {
  const { liveMatch, completedMatch } = props;
  const [showCompletedScorecard, setShowCompletedScorecard] = useState(false);
  if (showCompletedScorecard && completedMatch) {
  return (
    <Scorecard
      match={completedMatch}
      players={props.players}
      onBack={() => setShowCompletedScorecard(false)}
    />
  );
}

  if (!liveMatch && completedMatch) {
    return (
      <div>

        <Panel>
          <div
            style={{
              textAlign: "center",
              fontSize: 20,
              fontWeight: 800,
              marginBottom: 16,
            }}
          >
            🏆 Match Completed
          </div>

          <div
            style={{
              textAlign: "center",
              fontSize: 14,
              color: C.mustard,
              fontWeight: 700,
              marginBottom: 20,
            }}
          >
            {completedMatch.result}
          </div>

          <div style={{ marginTop: 12, textAlign: "center" }}>
  <Button
    variant="primary"
    onClick={() => setShowCompletedScorecard(true)}
  >
    View Scorecard
  </Button>
</div>

          <div style={{ marginTop: 20, textAlign: "center" }}>
  <Button
    variant="primary"
    onClick={() => props.setCompletedMatch(null)}
  >
    New Match
  </Button>
</div>

          <div
            style={{
              textAlign: "center",
              color: C.muted,
              fontSize: 13,
            }}
          >
            {completedMatch.teamAName} vs {completedMatch.teamBName}
          </div>
        </Panel>
      </div>
    );
  }

  if (!liveMatch) return <MatchSetup {...props} />;
  return <LiveScoring {...props} />;
}

// ------------------------------------------------------------
// Match setup: teams, squads, captains, vice captains & toss
// ------------------------------------------------------------
function MatchSetup({
  players,
  addPlayer,
  startMatch,
  scheduledMatchToStart,
}) {
  const [teamAName, setTeamAName] = useState("Team A");
  const [teamBName, setTeamBName] = useState("Team B");

  useEffect(() => {
  if (scheduledMatchToStart) {
    setTeamAName(scheduledMatchToStart.teamAName);
    setTeamBName(scheduledMatchToStart.teamBName);
  }
}, [scheduledMatchToStart]);

  const [teamAPlayers, setTeamAPlayers] = useState([]);
  const [teamBPlayers, setTeamBPlayers] = useState([]);
  const [overs, setOvers] = useState(6);
  const [teamACaptain, setTeamACaptain] = useState("");
  const [teamAViceCaptain, setTeamAViceCaptain] = useState("");

  const [teamBCaptain, setTeamBCaptain] = useState("");
  const [teamBViceCaptain, setTeamBViceCaptain] = useState("");
  const [tossWinner, setTossWinner] = useState("A");
  const [tossDecision, setTossDecision] = useState("bat");
  const [newPlayerName, setNewPlayerName] = useState("");

  const toggle = (setFn, list, id) => {
    setFn(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

const canStart =
  teamAName.trim() &&
  teamBName.trim() &&
  teamAPlayers.length >= 2 &&
  teamBPlayers.length >= 2 &&
  overs > 0 &&
  teamACaptain &&
  teamBCaptain;

  return (
    <div>
      <Panel style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Quick add a player</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Name"
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
          />
          <Button
            disabled={!newPlayerName.trim()}
            onClick={() => {
              addPlayer(newPlayerName);
              setNewPlayerName("");
            }}
          >
            Add
          </Button>
        </div>
      </Panel>

      <Panel style={{ marginBottom: 14 }}>
        <Field label="Team A name">
          <input style={inputStyle} value={teamAName} onChange={(e) => setTeamAName(e.target.value)} />
        </Field>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Team A players ({teamAPlayers.length})</div>
        <div style={{ marginBottom: 14 }}>
          {players.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>Add players above first.</div>}
          {players.map((p) => (
            <Chip
              key={p.id}
              active={teamAPlayers.includes(p.id)}
              onClick={() => {
                toggle(setTeamAPlayers, teamAPlayers, p.id);
                if (teamBPlayers.includes(p.id)) toggle(setTeamBPlayers, teamBPlayers, p.id);
              }}
            >
              {p.name}
            </Chip>
          ))}
        </div>

        

        <div
  style={{
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginTop: 12,
  }}
>
  <Field label="Captain *">
    <select
      style={inputStyle}
      value={teamACaptain}
      onChange={(e) => {
        setTeamACaptain(e.target.value);

        if (teamAViceCaptain === e.target.value) {
          setTeamAViceCaptain("");
        }
      }}
    >
      <option value="">Select Captain</option>

      {players
        .filter((p) => teamAPlayers.includes(p.id))
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
    </select>
  </Field>

  <Field label="Vice Captain">
    <select
      style={inputStyle}
      value={teamAViceCaptain}
      onChange={(e) => setTeamAViceCaptain(e.target.value)}
    >
      <option value="">Select VC</option>

      {players
        .filter(
          (p) =>
            teamAPlayers.includes(p.id) &&
            p.id !== teamACaptain
        )
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
    </select>
  </Field>
</div>

        <Field label="Team B name">
          <input style={inputStyle} value={teamBName} onChange={(e) => setTeamBName(e.target.value)} />
        </Field>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Team B players ({teamBPlayers.length})</div>
        <div>
          {players
            .filter((p) => !teamAPlayers.includes(p.id))
            .map((p) => (
              <Chip key={p.id} active={teamBPlayers.includes(p.id)} onClick={() => toggle(setTeamBPlayers, teamBPlayers, p.id)}>
                {p.name}
              </Chip>
            ))}
        </div>

<div
  style={{
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginTop: 12,
  }}
>
  <Field label="Captain *">
    <select
      style={inputStyle}
      value={teamBCaptain}
      onChange={(e) => {
        setTeamBCaptain(e.target.value);

        if (teamBViceCaptain === e.target.value) {
          setTeamBViceCaptain("");
        }
      }}
    >
      <option value="">Select Captain</option>

      {players
        .filter((p) => teamBPlayers.includes(p.id))
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
    </select>
  </Field>

  <Field label="Vice Captain">
    <select
      style={inputStyle}
      value={teamBViceCaptain}
      onChange={(e) => setTeamBViceCaptain(e.target.value)}
    >
      <option value="">Select VC</option>

      {players
        .filter(
          (p) =>
            teamBPlayers.includes(p.id) &&
            p.id !== teamBCaptain
        )
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
    </select>
  </Field>
</div>

      </Panel>

      <Panel style={{ marginBottom: 14 }}>
        <Field label="Overs per innings">
          <input
            type="number"
            min={1}
            style={inputStyle}
            value={overs}
            onChange={(e) => setOvers(parseInt(e.target.value) || 1)}
          />
        </Field>
        <Field label="Toss winner">
          <div>
            <Chip active={tossWinner === "A"} onClick={() => setTossWinner("A")}>{teamAName || "Team A"}</Chip>
            <Chip active={tossWinner === "B"} onClick={() => setTossWinner("B")}>{teamBName || "Team B"}</Chip>
          </div>
        </Field>
        <Field label="Chose to">
          <div>
            <Chip active={tossDecision === "bat"} onClick={() => setTossDecision("bat")}>Bat first</Chip>
            <Chip active={tossDecision === "bowl"} onClick={() => setTossDecision("bowl")}>Bowl first</Chip>
          </div>
        </Field>
      </Panel>

      <Button
        variant="primary"
        full
        disabled={!canStart}
        onClick={() =>
          startMatch({
  teamAName,
  teamBName,
  teamAPlayers,
  teamBPlayers,
  overs,
  tossWinner,
  tossDecision,
  teamACaptain,
  teamAViceCaptain,
  teamBCaptain,
  teamBViceCaptain,
  scheduledMatchToStart,
})
        }
      >
        Start match
      </Button>
      {!canStart && (
        <div style={{ fontSize: 12, color: C.muted, marginTop: 8, textAlign: "center" }}>
          Select at least 2 players per team and choose a captain for both teams.
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Player display helper
// ------------------------------------------------------------
function playerName(players, id) {
  return players.find((p) => p.id === id)?.name || "—";
}

// ============================================================
// 10. LIVE SCORING
// ============================================================

function LiveScoring({ liveMatch, players, recordBall, undoLastBall, canUndo, setOpeners, setNextBowler, setNextBatsman, setBatsmenPositions, cancelLiveMatch, setTab }) {
  const idx = liveMatch.currentInningsIdx;
  const inn = liveMatch.innings[idx];
  const battingTeamIds = teamPlayersFor(liveMatch, inn.battingTeam);
  const bowlingTeamIds = teamPlayersFor(liveMatch, inn.bowlingTeam);
  const battingTeamName = inn.battingTeam === "A" ? liveMatch.teamAName : liveMatch.teamBName;
  const bowlingTeamName = inn.bowlingTeam === "A" ? liveMatch.teamAName : liveMatch.teamBName;

const [pendingRuns, setPendingRuns] = useState(null);
const [wicketFlow, setWicketFlow] = useState(false);
const [wicketType, setWicketType] = useState("bowled");
const [wicketFielder, setWicketFielder] = useState(null);
const [runoutRuns, setRunoutRuns] = useState(0);
const [runoutBatsman, setRunoutBatsman] = useState(null);
const [confirmCancel, setConfirmCancel] = useState(false);
const [showLiveScorecard, setShowLiveScorecard] = useState(false);
const [showMatchInfo, setShowMatchInfo] = useState(false);
const [showSquads, setShowSquads] = useState(false);




  const [manualBatsmenFlow, setManualBatsmenFlow] = useState(false);
  const [manualStriker, setManualStriker] = useState(inn.strikerId);
  const [manualNonStriker, setManualNonStriker] = useState(inn.nonStrikerId);

  useEffect(() => {
  setManualStriker(inn.strikerId);
  setManualNonStriker(inn.nonStrikerId);
}, [inn.strikerId, inn.nonStrikerId]);

if (showSquads) {
  const teamAPlayers = liveMatch.teamAPlayers || [];
  const teamBPlayers = liveMatch.teamBPlayers || [];

  return (
    <div>

<Button
  variant="ghost"
  onClick={() => setTab("dashboard")}
  style={{
    marginBottom: 10,
    padding: "6px 10px",
    fontSize: 11,
  }}
>
  ← Home
</Button>

      <Button
        variant="ghost"
        onClick={() => setShowSquads(false)}
        style={{ marginBottom: 12 }}
      >
        ← Back to scoring
      </Button>

      <Panel style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            textAlign: "center",
            marginBottom: 18,
          }}
        >
          Squads
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          {/* Team A */}
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 14,
                textAlign: "center",
                color: C.mustard,
                marginBottom: 10,
              }}
            >
              {liveMatch.teamAName}
            </div>

            {teamAPlayers.map((pid, index) => (
              <div
                key={pid}
                style={{
                  padding: "8px 6px",
                  borderBottom: `1px solid ${C.border}`,
                  fontSize: 13,
                }}
              >
                {index + 1}. {playerName(players, pid)}
{pid === liveMatch.teamACaptain && (
  <span style={{ color: C.mustard }}> (c)</span>
)}
{pid === liveMatch.teamAViceCaptain && (
  <span style={{ color: C.muted }}> (vc)</span>
)}
              </div>
            ))}
          </div>

          {/* Team B */}
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 14,
                textAlign: "center",
                color: C.mustard,
                marginBottom: 10,
              }}
            >
              {liveMatch.teamBName}
            </div>

            {teamBPlayers.map((pid, index) => (
              <div
                key={pid}
                style={{
                  padding: "8px 6px",
                  borderBottom: `1px solid ${C.border}`,
                  fontSize: 13,
                }}
              >
               {index + 1}. {playerName(players, pid)}
{pid === liveMatch.teamBCaptain && (
  <span style={{ color: C.mustard }}> (c)</span>
)}
{pid === liveMatch.teamBViceCaptain && (
  <span style={{ color: C.muted }}> (vc)</span>
)}
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}

if (showMatchInfo) {
  const matchDate = new Date(liveMatch?.date);

  return (
    <div>
      <Button
        variant="ghost"
        onClick={() => setShowMatchInfo(false)}
        style={{ marginBottom: 12 }}
      >
        ← Back to scoring
      </Button>

      <Panel>
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            marginBottom: 16,
          }}
        >
          Match Info
        </div>

        <div
          style={{
            display: "grid",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: C.muted }}>
              Teams
            </div>
            <div style={{ fontWeight: 700, marginTop: 3 }}>
              {liveMatch?.teamAName} vs {liveMatch?.teamBName}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: C.muted }}>
              Date
            </div>
            <div style={{ fontWeight: 700, marginTop: 3 }}>
              {matchDate.toLocaleDateString()}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: C.muted }}>
              Start Time
            </div>
            <div style={{ fontWeight: 700, marginTop: 3 }}>
              {matchDate.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: C.muted }}>
              Venue
            </div>
            <div style={{ fontWeight: 700, marginTop: 3 }}>
              Not available
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: C.muted }}>
              Toss
            </div>
            <div style={{ fontWeight: 700, marginTop: 3 }}>
              Not available
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

if (showLiveScorecard) {
  return (
    <div>
      <Button
        variant="ghost"
        onClick={() => setShowLiveScorecard(false)}
        style={{ marginBottom: 12 }}
      >
        ← Back to scoring
      </Button>

      <Scorecard
        match={liveMatch}
        players={players}
        onBack={() => setShowLiveScorecard(false)}
      />
    </div>
  );
}

  const needsOpeners =
  inn.legalBalls === 0 &&
  (!inn.strikerId || !inn.nonStrikerId || !inn.currentBowlerId);

const needsNewBatsman =
  !needsOpeners && (!inn.strikerId || !inn.nonStrikerId);

const needsNewBowler =
  !needsOpeners && !needsNewBatsman && !inn.currentBowlerId;

 // const needsOpeners = !inn.strikerId || !inn.nonStrikerId || !inn.currentBowlerId;
 // const needsNewBatsman = !needsOpeners && (!inn.strikerId || !inn.nonStrikerId);
 // const needsNewBowler = !needsOpeners && !needsNewBatsman && !inn.currentBowlerId;



  if (needsOpeners) {
    return (
      <OpenersForm
        battingTeamIds={battingTeamIds}
        bowlingTeamIds={bowlingTeamIds}
        players={players}
        battingTeamName={battingTeamName}
        bowlingTeamName={bowlingTeamName}
        onSubmit={setOpeners}
        innNum={idx + 1}
        target={inn.target}
      />
    );
  }

  if (needsNewBatsman) {
    const remaining = battingTeamIds.filter((pid) => !inn.batsmen[pid] || !inn.batsmen[pid].out).filter((pid) => pid !== inn.strikerId && pid !== inn.nonStrikerId);
    return (
      <Panel>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Next batsman</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>
          Score: {inn.totalRuns}/{inn.totalWickets} ({formatOvers(inn.legalBalls)} ov)
        </div>
        {remaining.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 13 }}>No players left to bat.</div>
        ) : (
          remaining.map((pid) => (
            <div key={pid} style={{ marginBottom: 8 }}>
              <Button full onClick={() => setNextBatsman(pid, true)}>
                {playerName(players, pid)}
              </Button>
            </div>
          ))
        )}
      </Panel>
    );
  }

 // if (needsNewBowler) {
 //   const choices = bowlingTeamIds.filter((pid) => pid !== inn.lastOverBowlerId);
 //   return (
   //   <Panel>
     //   <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Over complete — pick next bowler</div>
       // <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>
         // Score: {inn.totalRuns}/{inn.totalWickets} ({formatOvers(inn.legalBalls)} ov)
 //       </div>
   //     {choices.map((pid) => (
     //     <div key={pid} style={{ marginBottom: 8 }}>
       //     <Button full onClick={() => setNextBowler(pid)}>
         //     {playerName(players, pid)}
           // </Button>
 //         </div>
   //     ))}
     // </Panel>
 //   );
//  }


if (needsNewBowler) {
  const choices = bowlingTeamIds.filter(
    (pid) => pid !== inn.lastOverBowlerId
  );

  const batsmen = [inn.strikerId, inn.nonStrikerId];

  return (
    <Panel>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          marginBottom: 10,
        }}
      >
        Over complete — pick next bowler
      </div>

      <div
        style={{
          fontSize: 12.5,
          color: C.muted,
          marginBottom: 12,
        }}
      >
        Score: {inn.totalRuns}/{inn.totalWickets} (
        {formatOvers(inn.legalBalls)} ov)
      </div>

      {/* Current batsmen */}
      <div
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: 10,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 11.5,
            color: C.muted,
            marginBottom: 6,
          }}
        >
          Batsmen
        </div>

        <div style={{ fontSize: 13, fontWeight: 700 }}>
          Striker: {playerName(players, inn.strikerId)} *
        </div>

        <div style={{ fontSize: 13, marginTop: 4 }}>
          Non-striker: {playerName(players, inn.nonStrikerId)}
        </div>
      </div>

      {/* Manual batsman option */}
      {!manualBatsmenFlow ? (
        <Button
          variant="ghost"
          full
          onClick={() => {
            setManualStriker(inn.strikerId);
            setManualNonStriker(inn.nonStrikerId);
            setManualBatsmenFlow(true);
          }}
        >
          Change batsmen manually
        </Button>
      ) : (
        <div
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: 10,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            Change batsmen
          </div>

          <div
            style={{
              fontSize: 11.5,
              color: C.muted,
              marginBottom: 6,
            }}
          >
            Select Striker
          </div>

          <div style={{ marginBottom: 10 }}>
            {batsmen.map((pid) => (
              <Chip
                key={`striker-${pid}`}
                active={manualStriker === pid}
onClick={() => {
  setManualStriker((currentStriker) => {
    if (pid === currentStriker) return currentStriker;

    setManualNonStriker(currentStriker);
    return pid;
  });
}}
              >
                {playerName(players, pid)}
              </Chip>
            ))}
          </div>

          <div
            style={{
              fontSize: 11.5,
              color: C.muted,
              marginBottom: 6,
            }}
          >
            Select Non-striker
          </div>

          <div style={{ marginBottom: 10 }}>
            {batsmen.map((pid) => (
              <Chip
                key={`nonstriker-${pid}`}
                active={manualNonStriker === pid}
onClick={() => {
  setManualNonStriker((currentNonStriker) => {
    if (pid === currentNonStriker) return currentNonStriker;

    setManualStriker(currentNonStriker);
    return pid;
  });
}}
              >
                {playerName(players, pid)}
              </Chip>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <Button
              variant="ghost"
              onClick={() => setManualBatsmenFlow(false)}
            >
              Cancel
            </Button>

            <Button
              variant="primary"
              full
              onClick={() => {
                setBatsmenPositions(
                  manualStriker,
                  manualNonStriker
                );
                setManualBatsmenFlow(false);
              }}
            >
              Save batsmen
            </Button>
          </div>
        </div>
      )}

      {/* Next bowler */}
      <div style={{ marginTop: 14 }}>
        <div
          style={{
            fontSize: 11.5,
            color: C.muted,
            marginBottom: 8,
          }}
        >
          Next bowler
        </div>

        {choices.map((pid) => (
          <div key={pid} style={{ marginBottom: 8 }}>
            <Button full onClick={() => setNextBowler(pid)}>
              {playerName(players, pid)}
            </Button>
          </div>
        ))}

        {choices.length === 0 && (
          <div
            style={{
              color: C.muted,
              fontSize: 13,
            }}
          >
            No eligible bowler available.
          </div>
        )}
      </div>
    </Panel>
  );
}

  const striker = inn.batsmen[inn.strikerId];
  const nonStriker = inn.batsmen[inn.nonStrikerId];
  const bowler = inn.bowlers[inn.currentBowlerId];
  const crr = inn.legalBalls > 0 ? (inn.totalRuns / (inn.legalBalls / 6)).toFixed(2) : "0.00";
  const target = inn.target;
  const ballsLeft = inn.oversLimit * 6 - inn.legalBalls;
  const runsNeeded = target != null ? target - inn.totalRuns : null;
  const reqRR = target != null && ballsLeft > 0 ? ((runsNeeded / ballsLeft) * 6).toFixed(2) : null;

  const currentOver = inn.overHistory[inn.overHistory.length - 1] || [];

const handleWicketConfirm = () => {
  const batsmanOutId =
    wicketType === "runout"
      ? runoutBatsman
      : inn.strikerId;

  const runs =
    wicketType === "runout"
      ? runoutRuns
      : 0;

recordBall({
  runs,
  wicket: {
    type: wicketType,
    batsmanOutId,
    fielderId: wicketFielder,
  },
});

  setWicketFlow(false);
  setWicketType("bowled");
  setRunoutRuns(0);
  setRunoutBatsman(null);
};

  return (
  <div>
    <Button
      variant="ghost"
      onClick={() => setTab("dashboard")}
      style={{
        marginBottom: 10,
        padding: "6px 10px",
        fontSize: 11,
      }}
    >
      ← Home
    </Button>

    {/* scoreboard hero */}
      {/* scoreboard hero */}
      <div
        style={{
          background: `linear-gradient(135deg, ${C.panel}, ${C.panelLight})`,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: "18px 16px",
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 2 }}>
          {battingTeamName} batting{target != null ? ` · chasing ${target}` : ""}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
          <ScoreDigits size={54} color={C.mustard}>
            {inn.totalRuns}/{inn.totalWickets}
          </ScoreDigits>
          <span style={{ fontSize: 13, color: C.muted, paddingBottom: 8 }}>
            ({formatOvers(inn.legalBalls)}/{inn.oversLimit} ov)
          </span>
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 6, fontSize: 12.5, color: C.muted }}>
          <span>CRR {crr}</span>
          {target != null && <span>Need {Math.max(runsNeeded, 0)} off {Math.max(ballsLeft, 0)} balls (RRR {reqRR})</span>}
        </div>
      </div>

<div
  style={{
    marginBottom: 14,
    display: "flex",
    gap: 8,
  }}
>
  <Button
    variant="ghost"
    onClick={() => setShowLiveScorecard(true)}
    style={{
      flex: 1,
      minWidth: 0,
    }}
  >
    Scorecard
  </Button>

  <Button
    variant="ghost"
    onClick={() => setShowMatchInfo(true)}
    style={{
      width: 48,
      padding: 0,
      flexShrink: 0,
    }}
  >
    ⓘ
  </Button>

  <Button
    variant="ghost"
    onClick={() => setShowSquads(true)}
    style={{
      width: 72,
      padding: 0,
      flexShrink: 0,
    }}
  >
    👥 Squad
  </Button>
</div>


      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <Panel style={{ flex: 1 }}>
          <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 6 }}>Batting</div>
          <BatsmanRow name={playerName(players, inn.strikerId)} stats={striker} onStrike />
          <BatsmanRow name={playerName(players, inn.nonStrikerId)} stats={nonStriker} />
        </Panel>
        <Panel style={{ flex: 1 }}>
          <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 6 }}>Bowling · {bowlingTeamName}</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{playerName(players, inn.currentBowlerId)}</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>
            {formatOvers(bowler.legalBalls)} ov · {bowler.runs} runs · {bowler.wickets} wkt
          </div>
        </Panel>
      </div>

      <div style={{ display: "flex", gap: 5, marginBottom: 14, flexWrap: "wrap" }}>
        {currentOver.map((b, i) => (
          <span
            key={i}
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              background: b === "W" ? C.red : b.startsWith("Wd") || b.startsWith("Nb") ? C.mustard : C.panelLighter,
              color: b === "W" ? "#fff" : b.startsWith("Wd") || b.startsWith("Nb") ? "#211a08" : C.text,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {b}
          </span>
        ))}
        {currentOver.length === 0 && <span style={{ fontSize: 12, color: C.muted }}>New over</span>}
      </div>

      {!wicketFlow && pendingRuns === null && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 }}>
            {[0, 1, 2, 3, 4, 6].map((r) => (
              <Button key={r} variant={r === 4 || r === 6 ? "green" : "default"} onClick={() => recordBall({ runs: r })}>
                {r}
              </Button>
            ))}
            <Button variant="mustard" onClick={() => setPendingRuns("wide")}>Wide</Button>
            <Button variant="mustard" onClick={() => setPendingRuns("noball")}>No ball</Button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
            <Button onClick={() => setPendingRuns("bye")}>Bye</Button>
            <Button onClick={() => setPendingRuns("legbye")}>Leg bye</Button>
            <Button variant="primary" onClick={() => setWicketFlow(true)}>Wicket</Button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" full disabled={!canUndo} onClick={undoLastBall}>Undo last ball</Button>
          </div>
        </>
      )}

      {pendingRuns && (
        <Panel>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
            {pendingRuns === "wide" && "Wide — any extra runs run?"}
            {pendingRuns === "noball" && "No ball — runs off the bat?"}
            {pendingRuns === "bye" && "Bye — how many runs?"}
            {pendingRuns === "legbye" && "Leg bye — how many runs?"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 10 }}>
            {[0, 1, 2, 3, 4].map((r) => (
              <Button
                key={r}
                onClick={() => {
                  if (pendingRuns === "wide") recordBall({ extra: "wide", extraRuns: r });
                  else if (pendingRuns === "noball") recordBall({ extra: "noball", runs: r });
                  else recordBall({ extra: pendingRuns, runs: r });
                  setPendingRuns(null);
                }}
              >
                {r}
              </Button>
            ))}
          </div>
          <Button variant="ghost" full onClick={() => setPendingRuns(null)}>Cancel</Button>
        </Panel>
      )}

      {wicketFlow && (
        <Panel>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>How was {playerName(players, inn.strikerId)} out?</div>
          <div style={{ marginBottom: 10 }}>
{["bowled", "caught", "runout", "lbw", "stumped", "hitwicket"].map((t) => (
  <Chip
    key={t}
    active={wicketType === t}
onClick={() => {
  setWicketType(t);
  setWicketFielder(null);

  if (t === "runout") {
    setRunoutRuns(0);
    setRunoutBatsman(inn.strikerId);
  } else {
    setRunoutBatsman(null);
    setRunoutRuns(0);
  }
}}
  >
    {{ 
      bowled: "Bowled",
      caught: "Caught",
      runout: "Run out",
      lbw: "LBW",
      stumped: "Stumped",
      hitwicket: "Hit wicket"
    }[t]}
  </Chip>
))}

{wicketType === "runout" && (
  <div style={{ marginTop: 12 }}>
    <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 7 }}>
      Runs completed before run out
    </div>

       

    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
      {[0, 1, 2, 3, 4].map((r) => (
        <Chip
          key={r}
          active={runoutRuns === r}
          onClick={() => setRunoutRuns(r)}
        >
          {r}
        </Chip>
      ))}
    </div>

    <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 7 }}>
      Who was run out?
    </div>

    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <Chip
        active={runoutBatsman === inn.strikerId}
        onClick={() => setRunoutBatsman(inn.strikerId)}
      >
        {playerName(players, inn.strikerId)} (Striker)
      </Chip>

      <Chip
        active={runoutBatsman === inn.nonStrikerId}
        onClick={() => setRunoutBatsman(inn.nonStrikerId)}
      >
        {playerName(players, inn.nonStrikerId)} (Non-striker)
      </Chip>
    </div>
  </div>
)}

     {["caught", "runout", "stumped"].includes(wicketType) && (
          <div style={{ marginBottom: 10 }}>
            <div
              style={{
                fontSize: 12,
                color: C.muted,
                marginBottom: 6,
              }}
            >
              {wicketType === "caught"
                ? "Caught by"
                : wicketType === "runout"
                ? "Run out by"
                : "Stumped by"}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {bowlingTeamIds
                .filter((pid) => pid !== inn.strikerId)
                .map((pid) => (
                  <Chip
                    key={pid}
                    active={wicketFielder === pid}
                    onClick={() => setWicketFielder(pid)}
                  >
                    {playerName(players, pid)}
                  </Chip>
                ))}
            </div>
          </div>
        )}

          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" onClick={() => setWicketFlow(false)}>Cancel</Button>
            <Button
  variant="primary"
  full
  disabled={
    ["caught", "runout", "stumped"].includes(wicketType) &&
    !wicketFielder
  }
  onClick={handleWicketConfirm}
>
  Confirm out
</Button>
          </div>
        </Panel>
      )}

      <div style={{ marginTop: 20, textAlign: "center" }}>
        {!confirmCancel ? (
          <button
            onClick={() => setConfirmCancel(true)}
            style={{ background: "none", border: "none", color: C.muted, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
          >
            Cancel this match
          </button>
        ) : (
          <div style={{ fontSize: 12.5, color: C.muted }}>
            Cancel and discard this match?{" "}
            <button onClick={cancelLiveMatch} style={{ background: "none", border: "none", color: C.red, fontWeight: 700, cursor: "pointer" }}>
              Yes, discard
            </button>{" "}
            <button onClick={() => setConfirmCancel(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}>
              No
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Scorecard: batting row
// ------------------------------------------------------------
function BatsmanRow({ name, stats, onStrike }) {
  if (!stats) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13.5 }}>
      <span style={{ fontWeight: onStrike ? 700 : 500 }}>
        {name}
        {onStrike ? " *" : ""}
      </span>
      <span style={{ color: C.muted }}>
        {stats.runs} ({stats.balls})
      </span>
    </div>
  );
}

// ------------------------------------------------------------
// Scorecard / innings setup: opener selection
// ------------------------------------------------------------
function OpenersForm({ battingTeamIds, bowlingTeamIds, players, battingTeamName, bowlingTeamName, onSubmit, innNum, target }) {
  const [striker, setStriker] = useState(null);
  const [nonStriker, setNonStriker] = useState(null);
  const [bowler, setBowler] = useState(null);

  return (
    <Panel>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
        Innings {innNum} — {battingTeamName} batting
      </div>
      {target != null && (
        <div style={{ fontSize: 12.5, color: C.mustard, marginBottom: 10 }}>Target: {target} runs</div>
      )}
      <Field label="Striker (on strike)">
        <div>
          {battingTeamIds.map((pid) => (
            <Chip key={pid} active={striker === pid} onClick={() => setStriker(pid)}>
              {playerName(players, pid)}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Non-striker">
        <div>
          {battingTeamIds
            .filter((pid) => pid !== striker)
            .map((pid) => (
              <Chip key={pid} active={nonStriker === pid} onClick={() => setNonStriker(pid)}>
                {playerName(players, pid)}
              </Chip>
            ))}
        </div>
      </Field>
      <Field label={`Opening bowler — ${bowlingTeamName}`}>
        <div>
          {bowlingTeamIds.map((pid) => (
            <Chip key={pid} active={bowler === pid} onClick={() => setBowler(pid)}>
              {playerName(players, pid)}
            </Chip>
          ))}
        </div>
      </Field>
      <Button variant="primary" full disabled={!striker || !nonStriker || !bowler} onClick={() => onSubmit(striker, nonStriker, bowler)}>
        Start innings
      </Button>
    </Panel>
  );
}

// ============================================================
// 11. HISTORY & COMPLETED MATCHES
// ============================================================

/* ---------------- History ---------------- */

// ------------------------------------------------------------
// Match history list and completed scorecards
// ------------------------------------------------------------
function HistoryTab({ matches, players, selectedMatchId, setSelectedMatchId }) {
  const completed = matches.filter((m) => m.status === "completed");
  const selected = completed.find((m) => m.id === selectedMatchId);

  if (selected) {
    return <Scorecard match={selected} players={players} onBack={() => setSelectedMatchId(null)} />;
  }

  if (completed.length === 0) {
    return <div style={{ color: C.muted, fontSize: 13.5, textAlign: "center", padding: 20 }}>No completed matches yet.</div>;
  }

  return (
    <div>
      {completed.map((m) => (
        <Panel key={m.id} style={{ marginBottom: 10, cursor: "pointer" }} onClick={() => setSelectedMatchId(m.id)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {m.teamAName} vs {m.teamBName}
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>{new Date(m.date).toLocaleDateString()}</div>
          </div>
          <div style={{ fontSize: 12.5, color: C.mustard, marginTop: 4 }}>{m.result}</div>
        </Panel>
      ))}
    </div>
  );
}

// ------------------------------------------------------------
// Dismissal display text
// ------------------------------------------------------------
function dismissalText(b, players) {
  const bowler = b.bowlerId
    ? playerName(players, b.bowlerId)
    : "—";

  const fielder = b.fielderId
    ? playerName(players, b.fielderId)
    : "—";

  if (b.howOut === "caught") {
    return `c ${fielder} b ${bowler}`;
  }

  if (b.howOut === "runout") {
    return `run out ${fielder}`;
  }

  if (b.howOut === "stumped") {
    return `st ${fielder} b ${bowler}`;
  }

  if (b.howOut === "bowled") {
    return `b ${bowler}`;
  }

  if (b.howOut === "lbw") {
    return `lbw b ${bowler}`;
  }

  if (b.howOut === "hitwicket") {
    return `hit wicket b ${bowler}`;
  }

  return b.howOut || "";
}

// ============================================================
// 12. SCORECARD
// ============================================================

function Scorecard({ match, players, onBack }) {
  const [selectedInnings, setSelectedInnings] = useState(0);
  return (
    <div>
      <button
        onClick={onBack}
        style={{ background: "none", border: "none", color: C.muted, fontSize: 13, marginBottom: 12, cursor: "pointer" }}
      >
        ← All matches

</button>

      <Panel style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          {match.teamAName} vs {match.teamBName}
        </div>

        <div
          style={{
            fontSize: 12,
            color: C.muted,
            marginTop: 2,
          }}
        >
          {new Date(match.date).toLocaleDateString()}
        </div>

        <div
          style={{
            marginTop: 12,
            padding: "9px 12px",
            border: `1px solid ${C.border}`,
            borderRadius: 9,
            fontSize: 12.5,
            color: C.text,
            textAlign: "center",
          }}
        >
          <span
            style={{
              color: C.mustard,
              fontWeight: 800,
            }}
          >
            Toss :
          </span>{" "}
          {match.tossWinner === "A"
            ? match.teamAName
            : match.teamBName}{" "}
          opt to {match.tossDecision}
        </div>

        <div
          style={{
            fontSize: 13.5,
            color: C.mustard,
            marginTop: 10,
            fontWeight: 700,
          }}
        >
          {match.result}
        </div>
      </Panel>

            <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginBottom: 14,
        }}
      >
        <button
          onClick={() => setSelectedInnings(0)}
          style={{
            padding: "0 8px",
height: 44,
minWidth: 0,
whiteSpace: "nowrap",
overflow: "hidden",
textOverflow: "ellipsis",
            borderRadius: 10,
            border: `1px solid ${
              selectedInnings === 0 ? C.green : C.border
            }`,
            background: selectedInnings === 0 ? C.green : C.panel,
            color: selectedInnings === 0 ? "#fff" : C.text,
            fontWeight: 800,
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          {match.teamAName} (1st Inn)
        </button>

        <button
          onClick={() => {
  if (match.innings?.[1]) {
    setSelectedInnings(1);
  }
}}
          style={{
            padding: "0 8px",
height: 44,
minWidth: 0,
whiteSpace: "nowrap",
overflow: "hidden",
textOverflow: "ellipsis",
            borderRadius: 10,
            border: `1px solid ${
              selectedInnings === 1 ? C.green : C.border
            }`,
            background: selectedInnings === 1 ? C.green : C.panel,
            color: selectedInnings === 1 ? "#fff" : C.text,
            fontWeight: 800,
            fontSize: 10,
            cursor: match.innings?.[1] ? "pointer" : "not-allowed",
              opacity: match.innings?.[1] ? 1 : 0.45,
              pointerEvents: match.innings?.[1] ? "auto" : "none",
          }}
        >
          {match.teamBName} (2nd Inn)
        </button>
      </div>


      {[match.innings[selectedInnings]].map((inn, i) => {
        const teamName = inn.battingTeam === "A" ? match.teamAName : match.teamBName;
        return (
          <Panel key={i} style={{ marginBottom: 14 }}>
<div
  style={{
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    marginBottom: 14,
  }}
>
  <div
    style={{
      fontWeight: 800,
      fontSize: 15,
      textAlign: "left",
      minWidth: 0,
    }}
  >
    {teamName}
  </div>

  <ScoreDigits size={28} color={C.mustard}>
    {inn.totalRuns}/{inn.totalWickets}
  </ScoreDigits>

  <div
    style={{
      fontSize: 12,
      color: C.muted,
      textAlign: "right",
      whiteSpace: "nowrap",
    }}
  >
    {formatOvers(inn.legalBalls)} ov
  </div>
</div>
<div
  style={{
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 38px 38px 38px 38px 52px",
    columnGap: 6,
    alignItems: "center",
    padding: "0 0 7px 0",
    borderBottom: `1px solid ${C.border}`,
    fontSize: 11,
    fontWeight: 700,
    color: C.muted,
  }}
>
  <span>Batter</span>
  <span style={{ textAlign: "right" }}>R</span>
  <span style={{ textAlign: "right" }}>B</span>
  <span style={{ textAlign: "right" }}>4s</span>
  <span style={{ textAlign: "right" }}>6s</span>
  <span style={{ textAlign: "right" }}>SR</span>
</div>
            {Object.entries(inn.batsmen).map(([pid, b]) => (
              <div
  key={pid}
  style={{
    fontSize: 13,
    display: "grid",
   gridTemplateColumns: "minmax(0, 1fr) 38px 38px 38px 38px 52px",
   columnGap: 6,
   alignItems: "start",
   padding: "7px 0",
  }}
>
<span
  style={{
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    textAlign: "left",
  }}
>
<span>
  {playerName(players, pid)}

  {(pid === match.teamACaptain || pid === match.teamBCaptain) && (
    <span style={{ color: C.mustard }}> (c)</span>
  )}

  {(pid === match.teamAViceCaptain || pid === match.teamBViceCaptain) && (
    <span style={{ color: C.muted }}> (vc)</span>
  )}

  {!b.out && pid === inn.strikerId && (
    <span style={{ color: C.green }}> *</span>
  )}
</span>

  {b.out && (
<span
  style={{
    color: C.muted,
    fontSize: 10.5,
    lineHeight: 1.2,
    marginTop: 2,
    whiteSpace: "nowrap",
    display: "block",
  }}
>
  {dismissalText(b, players)}
</span>
  )}
</span>
<span style={{ textAlign: "right" }}>{b.runs}</span>
<span style={{ textAlign: "right" }}>{b.balls}</span>
<span style={{ textAlign: "right" }}>{b.fours}</span>
<span style={{ textAlign: "right" }}>{b.sixes}</span>
<span style={{ textAlign: "right" }}>
  {b.balls > 0
    ? ((b.runs / b.balls) * 100).toFixed(2)
    : "0.00"}
</span>
              </div>
            ))}

            <div style={{ fontSize: 12, color: C.muted, padding: "6px 0", borderTop: `1px solid ${C.border}`, marginTop: 4 }}>
              <div
  style={{
    fontSize: 12,
    color: C.muted,
    padding: "8px 0",
    borderTop: `1px solid ${C.border}`,
    marginTop: 4,
  }}
>
  <div style={{ marginBottom: 5 }}>
    Extras: {inn.extras || 0}
  </div>

  {inn.extrasBreakdown && (
    <div style={{ fontSize: 11.5 }}>
      Wd: {inn.extrasBreakdown.wides || 0}
      {"  ·  "}
      Nb: {inn.extrasBreakdown.noBalls || 0}
      {"  ·  "}
      B: {inn.extrasBreakdown.byes || 0}
      {"  ·  "}
      LB: {inn.extrasBreakdown.legByes || 0}
    </div>
  )}
</div>
            </div>

<div
  style={{
    fontSize: 11,
    fontWeight: 700,
    color: C.muted,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 32px 32px 32px 32px 52px",
    columnGap: 5,
    alignItems: "center",
    paddingBottom: 7,
    borderBottom: `1px solid ${C.border}`,
  }}
>
  <span>Bowler</span>
<span style={{ textAlign: "right" }}>O</span>
<span style={{ textAlign: "right" }}>M</span>
<span style={{ textAlign: "right" }}>R</span>
<span style={{ textAlign: "right" }}>W</span>
<span style={{ textAlign: "right" }}>Econ</span>
</div>
            {Object.entries(inn.bowlers).map(([pid, bw]) => (
<div
  key={pid}
  style={{
    fontSize: 13,
    display: "grid",
gridTemplateColumns: "minmax(0, 1fr) 32px 32px 32px 32px 52px",
columnGap: 5,
alignItems: "center",
padding: "7px 0",
  }}
>
<span>


  
  {playerName(players, pid)}
  {pid === inn.currentBowlerId && (
    <span style={{ color: C.green }}> *</span>
  )}
</span>
<span>{formatOvers(bw.legalBalls)}</span>
<span>{bw.maidens || 0}</span>
<span>{bw.runs}</span>
<span>{bw.wickets}</span>
<span>
  {bw.legalBalls > 0
    ? (bw.runs / (bw.legalBalls / 6)).toFixed(2)
    : "0.00"}
</span>
</div>
            ))}

{inn.fallOfWickets && inn.fallOfWickets.length > 0 && (
  <div
    style={{
      marginTop: 14,
      paddingTop: 10,
      borderTop: `1px solid ${C.border}`,
    }}
  >
    <div
      style={{
        fontSize: 12,
        color: C.muted,
        marginBottom: 8,
      }}
    >
      Fall of Wickets
    </div>

   {inn.fallOfWickets.map((fow) => (
  <div
    key={fow.wicketNumber}
    style={{
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) auto",
      alignItems: "center",
      gap: 10,
      fontSize: 12.5,
      padding: "7px 0",
    }}
  >
    <div
  style={{
    minWidth: 0,
    textAlign: "left",
    justifySelf: "start",
  }}
>
      <span style={{ fontWeight: 700 }}>
        {fow.wicketNumber}. {playerName(players, fow.batsmanId)}
      </span>

      <span style={{ color: C.muted }}>
        {" "}({fow.bowlerId ? `b ${playerName(players, fow.bowlerId)}` : ""})
      </span>
    </div>

    <div
      style={{
        whiteSpace: "nowrap",
        textAlign: "right",
        fontWeight: 700,
      }}
    >
      {fow.wicketNumber}-{fow.score} ({formatOvers(fow.legalBalls)} ov)
    </div>
  </div>
))}
  </div>
)}


{inn.overHistory && inn.overHistory.some((over) => over.length > 0) && (
  <div
    style={{
      marginTop: 14,
      paddingTop: 10,
      borderTop: `1px solid ${C.border}`,
    }}
  >
    <div
      style={{
        fontSize: 12,
        color: C.muted,
        marginBottom: 8,
      }}
    >
      Overs
    </div>

{inn.overHistory.map((over, overIndex) => {
  if (!over.length) return null;

  const overRuns = over.reduce((total, ball) => {
    if (ball === "W") return total;

    if (ball.startsWith("Wd")) {
      if (ball === "Wd") return total + 1;
      return total + 1 + Number(ball.split("+")[1] || 0);
    }

    if (ball.startsWith("Nb")) {
      if (ball === "Nb") return total + 1;
      return total + 1 + Number(ball.split("+")[1] || 0);
    }

    if (ball.startsWith("B")) {
      return total + Number(ball.slice(1) || 0);
    }

    if (ball.startsWith("Lb")) {
      return total + Number(ball.slice(2) || 0);
    }

    if (ball.includes("+W")) {
      return total + Number(ball.split("+")[0] || 0);
    }

    return total + Number(ball || 0);
  }, 0);

  return (
    <div
      key={overIndex}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12.5,
        padding: "4px 0",
      }}
    >
      <span style={{ width: 48, color: C.muted }}>
        Over {overIndex + 1}
      </span>

      <span style={{ flex: 1 }}>
        {over.join("  ")}
      </span>

      <span
        style={{
          width: 35,
          textAlign: "right",
          fontWeight: 700,
        }}
      >
        {overRuns}
      </span>
    </div>
  );
})}
  </div>
)}
{/* Partnerships */}
{((inn.partnerships || []).length > 0 || inn.currentPartnership) && (
  <div
    style={{
      marginTop: 14,
      paddingTop: 12,
      borderTop: `1px solid ${C.border}`,
    }}
  >
    <div
      style={{
        fontSize: 13,
        fontWeight: 800,
        color: C.text,
        textAlign: "center",
        marginBottom: 10,
      }}
    >
      Partnerships
    </div>

    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 52px minmax(0, 1fr)",
        gap: 6,
        padding: "5px 0",
        fontSize: 11,
        fontWeight: 700,
        color: C.muted,
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <span style={{ textAlign: "left" }}>Batsman</span>
      <span style={{ textAlign: "center" }}>Runs</span>
      <span style={{ textAlign: "right" }}>Batsman</span>
    </div>

    {(inn.partnerships || []).map((p, index) => (
      <div
        key={index}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 52px minmax(0, 1fr)",
          gap: 6,
          alignItems: "center",
          padding: "8px 0",
          borderBottom: `1px solid ${C.border}`,
          fontSize: 12,
        }}
      >
        <span style={{ textAlign: "left", minWidth: 0 }}>
          {playerName(players, p.batsmanAId)} ({p.batsmanARuns || 0})
        </span>

        <span
          style={{
            textAlign: "center",
            fontWeight: 800,
            color: C.mustard,
          }}
        >
          {p.runs || 0}
        </span>

        <span style={{ textAlign: "right", minWidth: 0 }}>
          {playerName(players, p.batsmanBId)} ({p.batsmanBRuns || 0})
        </span>
      </div>
    ))}

    {inn.currentPartnership && (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 52px minmax(0, 1fr)",
          gap: 6,
          alignItems: "center",
          padding: "8px 0",
          fontSize: 12,
        }}
      >
        <span style={{ textAlign: "left", minWidth: 0 }}>
          {playerName(players, inn.currentPartnership.batsmanAId)} (
          {inn.currentPartnership.batsmanARuns || 0})
        </span>

        <span
          style={{
            textAlign: "center",
            fontWeight: 800,
            color: C.green,
          }}
        >
          {inn.currentPartnership.runs || 0}
        </span>

        <span style={{ textAlign: "right", minWidth: 0 }}>
          {playerName(players, inn.currentPartnership.batsmanBId)} (
          {inn.currentPartnership.batsmanBRuns || 0})
        </span>
      </div>
    )}
  </div>
)}

          </Panel>
        );
      })}
    </div>
  );
}
