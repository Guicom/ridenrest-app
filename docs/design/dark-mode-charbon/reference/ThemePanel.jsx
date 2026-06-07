/* ThemePanel — full dark-mode design-system documentation for one theme.
   Receives a `t` (theme tokens) object. Exports ThemePanel + THEMES to window. */

const THEMES = {
  foret: {
    key: "foret", name: "Forêt Nuit", desc: "Fond vert-noir · vert forêt rehaussé",
    bg: "#0E1411", surface: "#16201A", raised: "#1E2C24", border: "#2A3B32", borderStrong: "#3A4F44",
    textPrimary: "#E8F0EB", textSecondary: "#A9C2B4", textMuted: "#6E8579",
    primary: "#40916C", primaryHover: "#52B788", primaryFg: "#06140D", primaryDim: "rgba(64,145,108,0.16)",
    yellow: "#F4C542", high: "#4ADE80", medium: "#FBBF24", low: "#F87171",
  },
  charbon: {
    key: "charbon", name: "Charbon", desc: "Fond charbon neutre · accent sauge clair",
    bg: "#14181C", surface: "#1B2025", raised: "#242B31", border: "#333B42", borderStrong: "#434D55",
    textPrimary: "#ECEFF1", textSecondary: "#AEB8BF", textMuted: "#727C83",
    primary: "#74C69D", primaryHover: "#95D5B2", primaryFg: "#0A1711", primaryDim: "rgba(116,198,157,0.15)",
    yellow: "#F4C542", high: "#4ADE80", medium: "#FBBF24", low: "#F87171",
  },
  minuit: {
    key: "minuit", name: "Minuit", desc: "Fond quasi-noir · vert menthe lumineux",
    bg: "#0B0C0B", surface: "#131614", raised: "#1C211D", border: "#272D28", borderStrong: "#39423A",
    textPrimary: "#F0F2EF", textSecondary: "#A7B0A8", textMuted: "#6B736C",
    primary: "#5BC990", primaryHover: "#74E0A8", primaryFg: "#04130B", primaryDim: "rgba(91,201,144,0.14)",
    yellow: "#F4C542", high: "#4ADE80", medium: "#FBBF24", low: "#F87171",
  },
};
window.THEMES = THEMES;

/* ── primitives ─────────────────────────────────────────────── */
function Eyebrow({ t, children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, textTransform: "uppercase",
      letterSpacing: "0.2em", color: t.textMuted, marginBottom: 14,
    }}>{children}</div>
  );
}

function Swatch({ t, color, name, hex, big }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
      <div style={{
        height: big ? 56 : 44, borderRadius: 10, background: color,
        border: "1px solid " + t.borderStrong,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: t.textSecondary }}>{name}</span>
        <span style={{ fontSize: 11, color: t.textMuted, fontVariantNumeric: "tabular-nums", fontFamily: "ui-monospace, monospace" }}>{hex}</span>
      </div>
    </div>
  );
}

function SwatchGrid({ children, cols = 4 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14 }}>{children}</div>
  );
}

function Btn({ t, variant, children }) {
  const [h, setH] = React.useState(false);
  const base = {
    padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
    border: "1px solid transparent", cursor: "pointer", fontFamily: "inherit",
    transition: "all .12s ease", whiteSpace: "nowrap",
  };
  const map = {
    primary: { background: h ? t.primaryHover : t.primary, color: t.primaryFg },
    solid:   { background: t.textPrimary, color: t.bg, opacity: h ? 0.88 : 1 },
    outline: { background: h ? t.raised : "transparent", color: t.textPrimary, border: "1px solid " + t.borderStrong },
    ghost:   { background: h ? t.borderStrong : t.raised, color: t.textPrimary },
    danger:  { background: h ? t.primaryDim : "transparent", color: t.low, border: "1px solid " + t.border },
  };
  return (
    <button onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ ...base, ...map[variant] }}>{children}</button>
  );
}

function Pill({ t, color, label, pulse }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: t.primaryDim ? color + "26" : color, color,
      fontSize: 11.5, fontWeight: 600, padding: "3px 10px 3px 8px", borderRadius: 9999,
      animation: pulse ? "rnr-pulse 2s ease-in-out infinite" : "none",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 9999, background: color }}></span>
      {label}
    </span>
  );
}

function StravaMark() {
  const [svg, setSvg] = React.useState(window.__strava || "");
  React.useEffect(() => {
    if (window.__strava) { setSvg(window.__strava); return; }
    fetch("assets/powered-by-strava-white.svg").then(r => r.text()).then(s => { window.__strava = s; setSvg(s); });
  }, []);
  return <span className="strava-mark" style={{ display: "inline-block", height: 15, marginTop: 3, opacity: 0.9 }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/* ── card recreations ───────────────────────────────────────── */
function AdvCard({ t, adv, selected }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? t.raised : t.surface, borderRadius: 14,
        border: "1px solid " + t.border, padding: 16,
        boxShadow: selected ? "0 0 0 2px " + t.primary + " inset" : "none",
        cursor: "pointer", transition: "all .12s",
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ color: t.textPrimary, fontWeight: 600, fontSize: 15 }}>{adv.name}</span>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
          <span style={{ color: t.textSecondary, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            {adv.distance ? adv.distance.toFixed(1) + " km" : "—"}
          </span>
          {adv.elevGain && (
            <span style={{ color: t.textSecondary, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
              ↑ {adv.elevGain.toLocaleString("fr-FR")} m · ↓ {adv.elevLoss.toLocaleString("fr-FR")} m
            </span>
          )}
          {adv.strava && <StravaMark />}
        </div>
      </div>
      <div style={{ color: t.textMuted, fontSize: 13, marginTop: 4 }}>{adv.dateRange}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Btn t={t} variant="primary">Planning</Btn>
        <Btn t={t} variant="outline">Modifier</Btn>
        <Btn t={t} variant="ghost">Live</Btn>
      </div>
    </div>
  );
}

function SegCard({ t, seg }) {
  const status = {
    done: { c: t.high, label: "Prêt", pulse: false },
    pending: { c: t.medium, label: "En cours…", pulse: true },
    error: { c: t.low, label: "Erreur", pulse: false },
  }[seg.status];
  return (
    <div style={{
      borderRadius: 10, border: "1px solid " + t.border, padding: 14,
      display: "flex", alignItems: "center", gap: 12, background: t.surface,
    }}>
      <span style={{ color: t.textMuted, fontSize: 15, cursor: "grab", lineHeight: 1, userSelect: "none" }}>⠿</span>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <p style={{ fontWeight: 500, fontSize: 14, margin: 0, color: t.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{seg.name}</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <Pill t={t} color={status.c} label={status.label} pulse={status.pulse} />
            <button style={{ border: "none", background: "transparent", cursor: "pointer", color: t.textMuted, padding: "2px 4px", fontSize: 17, lineHeight: 1 }}>⋯</button>
          </div>
        </div>
        {seg.status === "done" && (
          <div style={{ display: "flex", gap: 16, color: t.textMuted, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
            <span>{seg.distance.toFixed(1)} km</span>
            <span>↑ {seg.gain} m · ↓ {seg.loss} m</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── the panel ──────────────────────────────────────────────── */
function ThemePanel({ t }) {
  const block = { marginBottom: 30 };
  const rule = { height: 1, background: t.border, border: "none", margin: "0 0 30px" };
  return (
    <div style={{
      background: t.bg, color: t.textPrimary, fontFamily: "var(--font-sans)",
      padding: 30, width: "100%", boxSizing: "border-box",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <h2 style={{
            fontSize: 30, fontWeight: 300, textTransform: "uppercase",
            letterSpacing: "-0.02em", margin: 0, color: t.textPrimary, lineHeight: 1.05,
          }}>{t.name}</h2>
          <p style={{ fontSize: 13, color: t.textSecondary, margin: "8px 0 0", fontWeight: 300 }}>{t.desc}</p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[t.primary, t.surface, t.bg].map((c, i) => (
            <span key={i} style={{ width: 18, height: 18, borderRadius: 9999, background: c, border: "1px solid " + t.borderStrong }}></span>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0 30px" }}>
        <img src="assets/logo.svg" alt="" style={{ height: 18, opacity: 0.55, filter: "brightness(0) invert(1)" }} />
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: t.textMuted }}>Ride'n'Rest · Webapp</span>
      </div>

      {/* surfaces */}
      <div style={block}>
        <Eyebrow t={t}>Surfaces &amp; bordures</Eyebrow>
        <SwatchGrid cols={4}>
          <Swatch t={t} color={t.bg} name="Background" hex={t.bg} />
          <Swatch t={t} color={t.surface} name="Surface" hex={t.surface} />
          <Swatch t={t} color={t.raised} name="Raised" hex={t.raised} />
          <Swatch t={t} color={t.border} name="Border" hex={t.border} />
        </SwatchGrid>
      </div>

      {/* text */}
      <div style={block}>
        <Eyebrow t={t}>Texte</Eyebrow>
        <SwatchGrid cols={4}>
          <Swatch t={t} color={t.textPrimary} name="Primary" hex={t.textPrimary} />
          <Swatch t={t} color={t.textSecondary} name="Secondary" hex={t.textSecondary} />
          <Swatch t={t} color={t.textMuted} name="Muted" hex={t.textMuted} />
          <Swatch t={t} color={t.yellow} name="Eyebrow / jaune" hex={t.yellow} />
        </SwatchGrid>
      </div>

      <hr style={rule} />

      {/* brand green */}
      <div style={block}>
        <Eyebrow t={t}>Vert de marque — action / CTA</Eyebrow>
        <SwatchGrid cols={4}>
          <Swatch t={t} color={t.primary} name="Primary" hex={t.primary} big />
          <Swatch t={t} color={t.primaryHover} name="Hover" hex={t.primaryHover} big />
          <Swatch t={t} color={t.primaryDim} name="Dim / 16%" hex="alpha" big />
          <Swatch t={t} color={t.primaryFg} name="On-primary" hex={t.primaryFg} big />
        </SwatchGrid>
      </div>

      {/* density */}
      <div style={block}>
        <Eyebrow t={t}>Densité / statut — couverture carte (éclaircies)</Eyebrow>
        <SwatchGrid cols={3}>
          <Swatch t={t} color={t.high} name="High · Prêt" hex={t.high} />
          <Swatch t={t} color={t.medium} name="Medium · En cours" hex={t.medium} />
          <Swatch t={t} color={t.low} name="Low · Erreur" hex={t.low} />
        </SwatchGrid>
      </div>

      <hr style={rule} />

      {/* typography */}
      <div style={block}>
        <Eyebrow t={t}>Typographie — Montserrat</Eyebrow>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 300, textTransform: "uppercase", letterSpacing: "-0.02em", color: t.textPrimary, lineHeight: 1.1 }}>Trouves où dormir</div>
            <span style={{ fontSize: 10.5, color: t.textMuted, fontFamily: "ui-monospace, monospace" }}>H1 · 300 · uppercase · -0.02em</span>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: t.textPrimary }}>Mes aventures</div>
            <span style={{ fontSize: 10.5, color: t.textMuted, fontFamily: "ui-monospace, monospace" }}>H3 · 700 · sentence case</span>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4em", color: t.yellow }}>Étape 01</div>
            <span style={{ fontSize: 10.5, color: t.textMuted, fontFamily: "ui-monospace, monospace" }}>Eyebrow · 600 · 0.4em · jaune</span>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 300, color: t.textSecondary, lineHeight: 1.6 }}>Planifie tes nuits sans quitter ton itinéraire, l'esprit serein.</div>
            <span style={{ fontSize: 10.5, color: t.textMuted, fontFamily: "ui-monospace, monospace" }}>Body · 300 · text-secondary</span>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: t.textPrimary, fontVariantNumeric: "tabular-nums" }}>412.4 km · ↑ 6 320 m · ↓ 6 280 m</div>
            <span style={{ fontSize: 10.5, color: t.textMuted, fontFamily: "ui-monospace, monospace" }}>Numeric · tabular-nums</span>
          </div>
        </div>
      </div>

      <hr style={rule} />

      {/* buttons */}
      <div style={block}>
        <Eyebrow t={t}>Boutons</Eyebrow>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <Btn t={t} variant="primary">Démarrer en Live</Btn>
          <Btn t={t} variant="solid">Planning</Btn>
          <Btn t={t} variant="outline">Modifier</Btn>
          <Btn t={t} variant="ghost">Live</Btn>
          <Btn t={t} variant="danger">Supprimer</Btn>
        </div>
        <p style={{ fontSize: 11, color: t.textMuted, margin: "12px 0 0" }}>Survole pour voir l'état hover · press : <code style={{ color: t.textSecondary }}>scale(0.97)</code></p>
      </div>

      {/* pills */}
      <div style={block}>
        <Eyebrow t={t}>Pastilles de statut</Eyebrow>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Pill t={t} color={t.high} label="Prêt" />
          <Pill t={t} color={t.medium} label="En cours…" pulse />
          <Pill t={t} color={t.low} label="Erreur" />
          <Pill t={t} color={t.primary} label="Planning" />
        </div>
      </div>

      <hr style={rule} />

      {/* adventure card */}
      <div style={block}>
        <Eyebrow t={t}>Carte aventure</Eyebrow>
        <AdvCard t={t} selected adv={{ name: "Desertus Bikus 2026", distance: 412.4, elevGain: 6320, elevLoss: 6280, dateRange: "12 — 18 mars 2026", strava: true }} />
      </div>

      {/* segment cards */}
      <div style={{ marginBottom: 0 }}>
        <Eyebrow t={t}>Cartes segment</Eyebrow>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <SegCard t={t} seg={{ name: "J1 — Avignon → Sault", distance: 78.2, gain: 1240, loss: 820, status: "done" }} />
          <SegCard t={t} seg={{ name: "J3 — Sisteron → Digne", status: "pending" }} />
          <SegCard t={t} seg={{ name: "J4 — Digne → Castellane", status: "error" }} />
        </div>
      </div>
    </div>
  );
}
window.ThemePanel = ThemePanel;