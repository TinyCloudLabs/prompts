// Health Log's account and clock guard. It never asks the owner anything. The expected owner address is saved in the
// app state (owner-did.txt) the first time, from the onboarded profile's owner, and never changed to match a grant.
// The timezone is the one the Health Log page saves, else the saved host zone, else this host's IANA zone, else UTC.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ACCOUNT = "Health Log is set up for a different TinyCloud account than the one this computer is signed in with; sign in with the right account at https://agents.tinycloud.xyz/onboarding.";
const TIMEZONE_KEY = "xyz.tinycloud.sample.healthlog/settings/timezone";
const DID = /^did:pkh:eip155:([1-9][0-9]*):(0x[0-9a-fA-F]{40})$/;
const SPACE = /^tinycloud:pkh:eip155:([1-9][0-9]*):(0x[0-9a-fA-F]{40}):applications$/;

function formatterFor(timeZone) {
  if (typeof timeZone !== "string" || !/^[A-Za-z_][A-Za-z0-9_+/-]*$/.test(timeZone)) return null;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone, calendar: "iso8601", numberingSystem: "latn", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "longOffset",
    });
  } catch {
    return null;
  }
}

/** The first valid IANA timezone among the candidates, else null. UTC and Etc/* are valid. */
export function pickTimeZone(...candidates) {
  return candidates.map((c) => (typeof c === "string" ? c.trim() : c)).find((c) => formatterFor(c)) ?? null;
}

/** Pure validation and clock conversion; CLI callers cannot inject a clock. */
export function validateContext({ ownerDid, timeZone, context, now }) {
  timeZone = pickTimeZone(timeZone, Intl.DateTimeFormat().resolvedOptions().timeZone, "UTC");
  const formatter = formatterFor(timeZone);
  const expected = typeof ownerDid === "string" && DID.exec(ownerDid);
  if (!expected) throw new Error(ACCOUNT);
  const active = typeof context?.spaceId === "string" && SPACE.exec(context.spaceId);
  if (!active || active[1] !== expected[1] || active[2].toLowerCase() !== expected[2].toLowerCase()) {
    throw new Error(ACCOUNT);
  }
  const parts = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const offset = parts.timeZoneName === "GMT" ? "+00:00" : parts.timeZoneName.replace(/^GMT/, "");
  const utc = now.toISOString();
  return { spaceId: context.spaceId, day,
    now: `${day}T${parts.hour}:${parts.minute}:${parts.second}.${String(now.getUTCMilliseconds()).padStart(3, "0")}${offset}`,
    utc, timeZone };
}

function readCli(cli, args) {
  const r = spawnSync(cli, args, { encoding: "utf8", timeout: 30_000, maxBuffer: 64 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  return r.error || r.status !== 0 ? null : r.stdout;
}

function readText(file) {
  try { return readFileSync(file, "utf8").trim(); } catch { return null; }
}

function main() {
  try {
    const [cli, state, ...extra] = process.argv.slice(2);
    if (!cli || !state || extra.length || !isAbsolute(cli) || !isAbsolute(state)) throw new Error(ACCOUNT);
    // The onboarded profile: the CLI's default, or TC_PROFILE from the environment.
    const contextText = readCli(cli, ["context", "--space", "applications", "--json"]);
    if (contextText === null) throw new Error(ACCOUNT);
    const context = JSON.parse(contextText);
    const ownerFile = join(state, "owner-did.txt");
    let ownerDid = readText(ownerFile);
    if (ownerDid === null) {
      // First use on this computer: bind the onboarded profile's owner, and the host zone as the timezone fallback.
      if (typeof context?.ownerDid !== "string" || !DID.test(context.ownerDid)) throw new Error(ACCOUNT);
      ownerDid = context.ownerDid;
      writeFileSync(ownerFile, ownerDid + "\n", { mode: 0o600, flag: "wx" });
      const hostZone = pickTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone, "UTC");
      if (readText(join(state, "owner-timezone.txt")) === null) writeFileSync(join(state, "owner-timezone.txt"), hostZone + "\n", { mode: 0o600 });
    }
    const spaceId = typeof context?.spaceId === "string" && SPACE.test(context.spaceId) ? context.spaceId : null;
    const page = spaceId === null ? null : readCli(cli, ["kv", "get", TIMEZONE_KEY, "--space", spaceId, "--raw"]);
    const timeZone = pickTimeZone(page, readText(join(state, "owner-timezone.txt")), Intl.DateTimeFormat().resolvedOptions().timeZone, "UTC");
    const output = validateContext({ ownerDid, timeZone, context, now: new Date() });
    process.stdout.write(JSON.stringify(output) + "\n");
  } catch {
    process.stderr.write(ACCOUNT + "\n");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
