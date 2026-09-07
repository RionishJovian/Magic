// Sandbox transport — a deterministic in-memory RouterOS stand-in.
//
// It exists so the provisioning engine (and its tests) can run the full
// discover → plan → preflight → apply → verify → rollback loop without
// touching real hardware. It satisfies the same ProvisioningTransport
// interface as the RouterOS REST / Local Connector / Magic Hub transports.

import { parseTag } from "./tags";
import { capabilitiesFor, parseOsVersion } from "./multi-wan";
import type {
  CommandResult,
  DeviceSnapshot,
  ProvisioningTransport,
  SnapshotInterface,
  SnapshotRule,
} from "./types";

export type SandboxOptions = {
  version?: string;
  identity?: string;
  boardName?: string;
  interfaces?: string[];
  managementIface?: string | null;
  publicAddress?: string | null;
  rules?: SnapshotRule[];
  /** Make the next run() fail, to exercise rollback. */
  failOnCommand?: RegExp;
};

export class SandboxTransport implements ProvisioningTransport {
  readonly name = "sandbox" as const;
  private rules: SnapshotRule[];
  private backups = new Map<string, SnapshotRule[]>();
  private opts: Required<Omit<SandboxOptions, "rules" | "failOnCommand">> &
    Pick<SandboxOptions, "failOnCommand">;

  constructor(options: SandboxOptions = {}) {
    this.rules = [...(options.rules ?? [])];
    this.opts = {
      version: options.version ?? "7.14.3",
      identity: options.identity ?? "sandbox-router",
      boardName: options.boardName ?? "RB5009 (sandbox)",
      interfaces: options.interfaces ?? ["ether1", "ether2", "ether3", "bridge-lan"],
      managementIface: options.managementIface ?? null,
      publicAddress: options.publicAddress ?? null,
      failOnCommand: options.failOnCommand,
    };
  }

  async discover(routerId: string): Promise<DeviceSnapshot> {
    const version = parseOsVersion(this.opts.version);
    const interfaces: SnapshotInterface[] = this.opts.interfaces.map((name) => ({
      name,
      type: name.startsWith("bridge") ? "bridge" : "ether",
      running: true,
    }));
    return {
      routerId,
      identity: this.opts.identity,
      boardName: this.opts.boardName,
      version,
      capabilities: capabilitiesFor(version),
      interfaces,
      addresses: [],
      routes: [],
      rules: [...this.rules],
      managementIface: this.opts.managementIface,
      publicAddress: this.opts.publicAddress,
      sandbox: true,
      takenAt: new Date(0).toISOString(),
    };
  }

  async backup(_routerId: string, label: string) {
    const id = `sandbox-${label}`;
    this.backups.set(id, [...this.rules]);
    return { id, name: `${id}.backup` };
  }

  async run(_routerId: string, commands: string[]): Promise<CommandResult[]> {
    const out: CommandResult[] = [];
    for (const command of commands) {
      if (this.opts.failOnCommand?.test(command)) {
        out.push({ ok: false, command, error: "sandbox: simulated failure" });
        return out;
      }
      const tag = parseTag(command);
      const section = sectionOf(command);
      if (/\bremove\b/.test(command)) {
        this.rules = this.rules.filter((r) => !(tag && parseTag(r.comment)?.hash === tag.hash));
      } else if (tag) {
        this.rules = this.rules.filter(
          (r) => !(r.section === section && parseTag(r.comment)?.hash === tag.hash),
        );
        this.rules.push({ section, comment: `mmagic:${tag.intent}:${tag.hash}`, detail: command });
      }
      out.push({ ok: true, command, output: "" });
    }
    return out;
  }

  async verify(_routerId: string, _expectedTags: string[]) {
    const presentTags = this.rules
      .map((r) => parseTag(r.comment))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => `mmagic:${t.intent}:${t.hash}`);
    return { presentTags };
  }

  async restore(_routerId: string, backupId: string) {
    const snap = this.backups.get(backupId);
    if (!snap) return { ok: false, error: `unknown backup ${backupId}` };
    this.rules = [...snap];
    return { ok: true };
  }
}

function sectionOf(command: string): string {
  if (/\/routing table add/.test(command)) return "/routing/table";
  const m = /^\/((?:[a-z0-9-]+\s+)*[a-z0-9-]+)\s+(?:add|set|remove)/.exec(command.trim());
  return m ? `/${m[1]!.trim().split(/\s+/).join("/")}` : "/unknown";
}
