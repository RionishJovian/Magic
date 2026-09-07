export type MagicDudeMood =
  "thinking" | "joy" | "sad" | "no-idea" | "curious" | "scared" | "happy" | "afraid" | "emotional";

export type MagicDudeTopic = "guests" | "voucher" | "router";

const TOPIC_LINE: Record<MagicDudeTopic, { mood: MagicDudeMood; line: string }> = {
  guests: {
    mood: "curious",
    line: "Excellent. If you would just name the router, I shall lift the smallest corner of the veil.",
  },
  voucher: {
    mood: "happy",
    line: "A voucher is never merely a code, if you would allow the observation. Let us trace its little history.",
  },
  router: {
    mood: "afraid",
    line: "We shall consult the board—slowly, precisely, and without disturbing a single setting.",
  },
};

export function magicDudeIntro(topic: MagicDudeTopic): { mood: MagicDudeMood; line: string } {
  return TOPIC_LINE[topic];
}

export function magicDudeWorking(): { mood: MagicDudeMood; line: string } {
  return {
    mood: "thinking" as const,
    line: "One measured beat for the router. A second for the Hotspot. A final beat for the ledger. Now… we observe.",
  };
}

export function magicDudeResult(input: {
  topic: MagicDudeTopic;
  level: "ok" | "warn" | "block";
  title: string;
}): { mood: MagicDudeMood; line: string } {
  if (input.title === "No app-tracked vouchers found") {
    return {
      mood: "no-idea" as const,
      line: "I confess a small uncertainty: the app has no ledger trail for these vouchers. The audited import shall reveal what the router remembers.",
    };
  }
  if (input.level === "block") {
    const mood = input.topic === "router" ? "afraid" : input.topic === "guests" ? "scared" : "sad";
    return {
      mood,
      line: "A troublesome turn in the tale. Kindly follow the evidence below; we shall change nothing until the proper stage is reached.",
    };
  }
  if (input.level === "warn") {
    return {
      mood: "curious" as const,
      line: "Curious indeed. The evidence is not yet a catastrophe, but it asks for your attention before the next act.",
    };
  }
  return {
    mood: "joy" as const,
    line: "Excellent. The board has answered with grace. Let us take the next step only if you wish it.",
  };
}
