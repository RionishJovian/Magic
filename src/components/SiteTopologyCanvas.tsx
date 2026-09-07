import type { SiteTopologySnapshot, TopologyLinkStatus, TopologyNode } from "@/lib/topology/types";

const STATUS_COLOR: Record<TopologyLinkStatus, string> = {
  up: "#34d399",
  down: "#f87171",
  unknown: "#a1a1aa",
};

const NODE_STYLE: Record<string, { fill: string; stroke: string }> = {
  wan: { fill: "rgba(56,189,248,0.15)", stroke: "rgba(56,189,248,0.5)" },
  router: { fill: "rgba(167,139,250,0.18)", stroke: "rgba(167,139,250,0.55)" },
  port: { fill: "rgba(250,204,21,0.12)", stroke: "rgba(250,204,21,0.45)" },
  device: { fill: "rgba(52,211,153,0.12)", stroke: "rgba(52,211,153,0.45)" },
};

type NodeVisual = "wan" | "hub" | "hotspot" | "gateway" | "device";

function nodeVisual(node: TopologyNode): NodeVisual {
  const description = `${node.label} ${node.detail ?? ""}`.toLowerCase();
  if (node.kind === "wan") return "wan";
  if (description.includes("magic hub") || /\bwg\b|wireguard/.test(description)) return "hub";
  if (node.kind === "port" && description.includes("hotspot bridge")) return "hotspot";
  if (node.kind === "router") return "gateway";
  return "device";
}

function NodeIcon({ visual }: { visual: NodeVisual }) {
  const stroke = "currentColor";
  if (visual === "wan") {
    return (
      <g fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.2 8.2c4.1-2.1 8.4-1.5 11.8 1.7-1.1 3.8-4 6.2-8.5 7L4.2 8.2Z" />
        <path d="m10.4 11.2 3.5 4.9M12.9 15.4l-2.2 4.1M7.3 20h7.5" />
        <path d="M16.5 4.1c2 .5 3.4 1.8 4.2 3.8M17.4 7.1c.9.3 1.6.9 2 1.8" />
        <circle cx="13.3" cy="10.4" r="1" fill={stroke} stroke="none" />
      </g>
    );
  }
  if (visual === "hub") {
    return (
      <g fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 16.5h12.4a3.8 3.8 0 0 0 .2-7.6A5.8 5.8 0 0 0 6.5 10.5 3 3 0 0 0 5 16.5Z" />
        <path d="m6 4 .6 1.3L8 6l-1.4.6L6 8l-.6-1.4L4 6l1.4-.7L6 4Zm12 8 .5 1 .9.5-.9.4-.5 1-.4-1-.9-.4.9-.5.4-1Z" />
      </g>
    );
  }
  if (visual === "hotspot") {
    return (
      <g fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round">
        <path d="M4 9a11.5 11.5 0 0 1 16 0M7 12a7.2 7.2 0 0 1 10 0M10 15a3 3 0 0 1 4 0" />
        <circle cx="12" cy="18" r="1" fill={stroke} stroke="none" />
      </g>
    );
  }
  if (visual === "gateway") {
    return (
      <g fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="6" width="18" height="12" rx="3" />
        <path d="M6.5 14h.1M10 14h.1M17 14h.1M7 9h10" />
      </g>
    );
  }
  return (
    <g fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </g>
  );
}

function layoutTree(snapshot: SiteTopologySnapshot) {
  const byId = new Map(snapshot.nodes.map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  for (const e of snapshot.edges) {
    const list = children.get(e.from) ?? [];
    list.push(e.to);
    children.set(e.from, list);
  }

  type Placed = { id: string; x: number; y: number; w: number; h: number };
  const placed: Placed[] = [];
  const nodeW = 148;
  const nodeH = 60;
  const xGap = 24;
  const yGap = 56;

  function placeSubtree(id: string, depth: number, slot: number, span: number): number {
    const kids = children.get(id) ?? [];
    let cursor = slot;
    if (!kids.length) {
      const x = slot * (nodeW + xGap);
      const y = depth * (nodeH + yGap);
      placed.push({ id, x, y, w: nodeW, h: nodeH });
      return slot + 1;
    }
    const start = cursor;
    for (const kid of kids) {
      cursor = placeSubtree(kid, depth + 1, cursor, span);
    }
    const end = cursor - 1;
    const x = ((start + end) / 2) * (nodeW + xGap);
    const y = depth * (nodeH + yGap);
    placed.push({ id, x, y, w: nodeW, h: nodeH });
    return cursor;
  }

  placeSubtree("wan", 0, 0, 1);
  const width = Math.max(...placed.map((p) => p.x + p.w), 320) + 32;
  const height = Math.max(...placed.map((p) => p.y + p.h), 200) + 32;
  return { placed, byId, width, height, nodeW, nodeH };
}

type SiteTopologyCanvasProps = {
  snapshot: SiteTopologySnapshot;
  selectedNodeId?: string | null;
  onSelectNode?: (node: TopologyNode) => void;
};

function insightNode(snapshot: SiteTopologySnapshot) {
  return snapshot.nodes.find((node) => node.status === "down" || node.status === "unknown");
}

function insightPosition(p: { x: number; y: number; w: number; h: number }) {
  const chipWidth = 104;
  const chipHeight = 24;
  const gap = 8;

  // The tree reserves 56px between rows, enough room for the chip without
  // covering a sibling node. Root-level alerts use the empty space beside it.
  if (p.y >= chipHeight + gap) {
    return { x: p.x + (p.w - chipWidth) / 2, y: p.y - chipHeight - gap };
  }
  return { x: p.x + p.w + gap, y: p.y + (p.h - chipHeight) / 2 };
}

export function SiteTopologyCanvas({
  snapshot,
  selectedNodeId,
  onSelectNode,
}: SiteTopologyCanvasProps) {
  const { placed, byId, width, height, nodeW, nodeH } = layoutTree(snapshot);
  const pos = new Map(placed.map((p) => [p.id, p]));
  const priorityInsight = insightNode(snapshot);

  return (
    <div className="overflow-x-auto rounded-xl border border-emerald-300/20 bg-[radial-gradient(circle_at_50%_45%,rgba(79,70,229,0.12),transparent_32%),linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:auto,24px_24px,24px_24px] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mx-auto min-w-[320px] max-w-full"
        role="img"
        aria-label={`Network topology for ${snapshot.siteName}`}
      >
        <defs>
          <filter id="magic-dude-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <style>{`
          @keyframes topology-link-flow { to { stroke-dashoffset: -27; } }
          @media (prefers-reduced-motion: reduce) { .topology-link-up { animation: none !important; } }
        `}</style>
        {snapshot.edges.map((e) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + nodeW / 2;
          const y1 = a.y + nodeH;
          const x2 = b.x + nodeW / 2;
          const y2 = b.y;
          const middleY = y1 + (y2 - y1) / 2;
          return (
            <path
              key={e.id}
              d={`M ${x1} ${y1} C ${x1} ${middleY}, ${x2} ${middleY}, ${x2} ${y2}`}
              fill="none"
              stroke={STATUS_COLOR[e.status]}
              strokeWidth={2.8}
              strokeOpacity={0.95}
              strokeDasharray="2 7"
              strokeLinecap="round"
              className={e.status === "up" ? "topology-link-up" : undefined}
              style={
                e.status === "up"
                  ? { animation: "topology-link-flow 1.1s linear infinite" }
                  : undefined
              }
            />
          );
        })}
        {placed.map((p) => {
          const node = byId.get(p.id);
          if (!node) return null;
          const style = NODE_STYLE[node.kind] ?? NODE_STYLE.device;
          const visual = nodeVisual(node);
          const selected = node.id === selectedNodeId;
          const showInsight = priorityInsight?.id === node.id;
          const chipPosition = insightPosition(p);
          return (
            <g key={p.id}>
              <g
                transform={`translate(${p.x}, ${p.y})`}
                role={onSelectNode ? "button" : undefined}
                tabIndex={onSelectNode ? 0 : undefined}
                aria-label={onSelectNode ? `Inspect ${node.label}` : undefined}
                className={onSelectNode ? "cursor-pointer" : undefined}
                onClick={() => onSelectNode?.(node)}
                onKeyDown={(event) => {
                  if (onSelectNode && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    onSelectNode(node);
                  }
                }}
              >
                <rect
                  width={nodeW}
                  height={nodeH}
                  rx={10}
                  fill={style.fill}
                  stroke={selected ? "#a78bfa" : style.stroke}
                  strokeWidth={selected ? 2 : 1.5}
                  filter={selected ? "url(#magic-dude-glow)" : undefined}
                />
                <g
                  transform="translate(10, 15)"
                  className={visual === "hub" ? "animate-pulse" : undefined}
                  color={style.stroke}
                >
                  <NodeIcon visual={visual} />
                </g>
                <circle cx={39} cy={16} r={4.5} fill={STATUS_COLOR[node.status]} />
                <text x={50} y={21} fill="#f4f4f5" fontSize={11} fontWeight={600}>
                  {node.label.length > 12 ? `${node.label.slice(0, 11)}…` : node.label}
                </text>
                {node.detail && (
                  <text x={12} y={45} fill="#a1a1aa" fontSize={9}>
                    {node.detail.length > 24 ? `${node.detail.slice(0, 23)}…` : node.detail}
                  </text>
                )}
              </g>
              {showInsight && (
                <g
                  transform={`translate(${chipPosition.x}, ${chipPosition.y})`}
                  role={onSelectNode ? "button" : undefined}
                  tabIndex={onSelectNode ? 0 : undefined}
                  aria-label={`Open Magic Dude insight for ${node.label}`}
                  className={onSelectNode ? "cursor-pointer" : undefined}
                  onClick={() => onSelectNode?.(node)}
                  onKeyDown={(event) => {
                    if (onSelectNode && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      onSelectNode(node);
                    }
                  }}
                >
                  <rect
                    width="104"
                    height="24"
                    rx="12"
                    fill="rgba(76, 29, 149, 0.72)"
                    stroke="rgba(167, 139, 250, 0.8)"
                  />
                  <text x="12" y="16" fill="#ede9fe" fontSize="9" fontWeight="600">
                    ✦ Magic Dude · 1 insight
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />
          Link up
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-400" />
          Link down / router offline
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-zinc-400" />
          Unknown
        </span>
      </div>
      {!selectedNodeId && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Select a device or investigate an alert to ask Magic Dude.
        </p>
      )}
    </div>
  );
}
