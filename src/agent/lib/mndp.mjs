/**
 * MikroTik Neighbor Discovery Protocol (MNDP) — UDP 5678 broadcast parser.
 *
 * Packets are a 4-byte header followed by TLVs: u16 type, u16 length, value.
 * Everything here is defensive: a malformed or hostile packet must never throw
 * and must never produce fields longer than the caps below.
 */

const MAX_STRING = 128;
const TLV = {
  MAC: 1,
  IDENTITY: 5,
  VERSION: 7,
  PLATFORM: 8,
  UPTIME: 10,
  SOFTWARE_ID: 11,
  BOARD: 12,
  UNPACK: 14,
  IPV6: 15,
  INTERFACE: 16,
  IPV4: 17,
};

function str(buf) {
  return buf
    .toString("utf8")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, MAX_STRING)
    .trim();
}

function macString(buf) {
  if (buf.length !== 6) return null;
  return [...buf].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(":");
}

function ipv4String(buf) {
  if (buf.length !== 4) return null;
  return `${buf[0]}.${buf[1]}.${buf[2]}.${buf[3]}`;
}

/**
 * Parse one MNDP datagram.
 * @returns {null | Record<string, string|null>}
 */
export function parseMndpPacket(buffer, remoteIp = null) {
  if (!buffer || buffer.length < 8) return null;
  const device = {
    mac: null,
    identity: null,
    version: null,
    platform: null,
    model: null,
    softwareId: null,
    ip: remoteIp ?? null,
  };

  let offset = 4;
  let seen = 0;
  while (offset + 4 <= buffer.length && seen < 32) {
    const type = buffer.readUInt16BE(offset);
    const length = buffer.readUInt16BE(offset + 2);
    offset += 4;
    if (length < 0 || offset + length > buffer.length) break;
    const value = buffer.subarray(offset, offset + length);
    offset += length;
    seen += 1;

    switch (type) {
      case TLV.MAC:
        device.mac = macString(value) ?? device.mac;
        break;
      case TLV.IDENTITY:
        device.identity = str(value) || device.identity;
        break;
      case TLV.VERSION:
        device.version = str(value) || device.version;
        break;
      case TLV.PLATFORM:
        device.platform = str(value) || device.platform;
        break;
      case TLV.SOFTWARE_ID:
        device.softwareId = str(value) || device.softwareId;
        break;
      case TLV.BOARD:
        device.model = str(value) || device.model;
        break;
      case TLV.IPV4:
        device.ip = ipv4String(value) ?? device.ip;
        break;
      default:
        break;
    }
  }

  if (!device.mac && !device.identity && !device.ip) return null;
  return device;
}

/** Stable per-owner fingerprint. Serial wins, MAC next, identity+ip last. */
export function deviceFingerprint(device) {
  if (device.serial) return `serial:${String(device.serial).toUpperCase()}`;
  if (device.mac) return `mac:${String(device.mac).toUpperCase()}`;
  if (device.identity) return `identity:${device.identity}|${device.ip ?? "unknown"}`;
  return `ip:${device.ip ?? "unknown"}`;
}

/** Merge duplicate sightings; richer data fills gaps, never overwrites. */
export function dedupeDevices(devices) {
  const byKey = new Map();
  for (const device of devices) {
    if (!device) continue;
    const key = deviceFingerprint(device);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...device });
      continue;
    }
    for (const [field, value] of Object.entries(device)) {
      if (value != null && value !== "" && (existing[field] == null || existing[field] === "")) {
        existing[field] = value;
      }
    }
  }
  return [...byKey.values()];
}

/** UI/CLI presentation: never show blanks. */
export function displayValue(value) {
  return value == null || value === "" ? "unknown" : String(value);
}

export function describeDevice(device) {
  return {
    identity: displayValue(device.identity),
    model: displayValue(device.model ?? device.platform),
    version: displayValue(device.version),
    ip: displayValue(device.ip),
    mac: displayValue(device.mac),
  };
}
