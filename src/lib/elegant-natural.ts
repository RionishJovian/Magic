/** Matte Candy Light Blue — Day theme (Night stays Elegant Natural) */
export const ELEGANT_NATURAL_DAY = {
  name: "Matte Candy Light Blue",
  pureLight: "#F5FBFE",
  lightStone: "#D4EAF7",
  sage: "#7EC8E3",
  navyAccent: "#2A4F6E",
} as const;

/** Elegant Natural Night — RouterBoard dashboard dark theme */
export const ELEGANT_NATURAL_NIGHT = {
  name: "Elegant Natural Night",
  ink: "#051F20",
  deepPine: "#0B2B26",
  forestSlate: "#163832",
  elegantNavy: "#235347",
  sage: "#8EB69B",
  mistSage: "#DAF1DE",
} as const;

export const THEME_COLOR_LIGHT = ELEGANT_NATURAL_DAY.lightStone;
export const THEME_COLOR_DARK = ELEGANT_NATURAL_NIGHT.ink;
