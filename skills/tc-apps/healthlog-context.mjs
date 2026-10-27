// Health Log's account and clock guard. It never asks the owner anything: the expected owner address is the one saved
// in the app state at setup (owner-did.txt), and the timezone is the owner's own, saved by the Health Log page.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ACCOUNT = "Health Log is set up for a different TinyCloud account than the one that approved this agent; run the owner step again with the right account.";
const NO_CLOCK = "Health Log has no timezone for this owner yet; run the owner step again.";
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

/** The first valid IANA timezone among the candidates (page value, then the setup fallback), else null. */
export function pickTimeZone(...candidates) {
  return candidates.map((c) => (typeof c === "string" ? c.trim() : c)).find((c) => formatterFor(c)) ?? null;
}

/** Pure validation and clock conversion; CLI callers cannot inject a clock. */
export function validateContext({ ownerDid, timeZone, savedSpace, context, now }) {
  const formatter = formatterFor(timeZone);
  const expected = typeof ownerDid === "string" && DID.exec(ownerDid);
  if (!expected) throw new Error(ACCOUNT);
  const saved = typeof savedSpace === "string" && SPACE.exec(savedSpace);
  const active = typeof context?.spaceId === "string" && SPACE.exec(context.spaceId);
  if (!saved || !active || [saved, active].some((s) =>
    s[1] !== expected[1] || s[2].toLowerCase() !== expected[2].toLowerCase())) {
    throw new Error(ACCOUNT);
  }
  if (!formatter) throw new Error(NO_CLOCK); // the account is checked first: a wrong account never hears about the clock
  const parts = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const offset = parts.timeZoneName === "GMT" ? "+00:00" : parts.timeZoneName.replace(/^GMT/, "");
  const utc = now.toISOString();
  return { spaceId: savedSpace, day,
    now: `${day}T${parts.hour}:${parts.minute}:${parts.second}.${String(now.getUTCMilliseconds()).padStart(3, "0")}${offset}`,
    utc, timeZone };
}

function readCli(cli, args) {
  const r = spawnSync(cli, args, { encoding: "utf8", timeout: 30_000, maxBuffer: 64 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  return r.error || r.status !== 0 ? null : r.stdout;
}

function main() {
  try {
    const [cli, state, ...extra] = process.argv.slice(2);
    if (!cli || !state || extra.length || !isAbsolute(cli) || !isAbsolute(state)) throw new Error(ACCOUNT);
    const file = join(state, "meal-space.txt");
    const savedSpace = readFileSync(file, "utf8").trim();
    const ownerDid = readFileSync(join(state, "owner-did.txt"), "utf8").trim();
    const contextText = readCli(cli, ["--profile", "agent-meal", "context", "--json"]);
    if (contextText === null || readFileSync(file, "utf8").trim() !== savedSpace) throw new Error(ACCOUNT);
    const context = JSON.parse(contextText);
    // The page writes the owner's timezone on open; the setup fallback covers a page that has not been opened yet.
    const page = readCli(cli, ["--profile", "agent-meal", "kv", "get", TIMEZONE_KEY, "--space", savedSpace, "--raw"]);
    let fallback = null;
    try { fallback = readFileSync(join(state, "owner-timezone.txt"), "utf8"); } catch {}
    const timeZone = pickTimeZone(page, fallback);
    const output = validateContext({ ownerDid, timeZone, savedSpace, context, now: new Date() });
    process.stdout.write(JSON.stringify(output) + "\n");
  } catch (error) {
    process.stderr.write((error.message === NO_CLOCK ? NO_CLOCK : ACCOUNT) + "\n");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
