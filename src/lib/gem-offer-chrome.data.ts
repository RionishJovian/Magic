export type GemChrome = {
  gem: string;
  cadence: string;
  gradient: [string, string];
  glow: string;
  featured?: boolean;
};

export const GEM_CHROME = {
  emerald: {
    gem: "Emerald",
    cadence: "Monthly",
    gradient: ["#34d399", "#059669"] as [string, string],
    glow: "16,185,129",
  },
  sapphire: {
    gem: "Sapphire",
    cadence: "Annually",
    gradient: ["#60a5fa", "#4f46e5"] as [string, string],
    glow: "96,165,250",
    featured: true,
  },
  amethyst: {
    gem: "Amethyst",
    cadence: "Revenue share",
    gradient: ["#c084fc", "#7c3aed"] as [string, string],
    glow: "168,85,247",
  },
} as const satisfies Record<string, GemChrome>;

export function chromeForServiceKey(key: "monthly" | "annual"): GemChrome {
  if (key === "monthly") return { ...GEM_CHROME.emerald };
  if (key === "annual") return { ...GEM_CHROME.sapphire };
  return { ...GEM_CHROME.sapphire };
}
