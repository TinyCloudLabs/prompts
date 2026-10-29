// Health Log's account and clock guard. No owner profile or record access.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CONFIG = "Ask the owner for their TinyCloud address and timezone.";
const ACCOUNT = "Ask the owner to confirm their TinyCloud address and approve Health Log for that account.";
const DID = /^did:pkh:eip155:([1-9][0-9]*):(0x[0-9a-fA-F]{40})$/;
const SPACE = /^tinycloud:pkh:eip155:([1-9][0-9]*):(0x[0-9a-fA-F]{40}):applications$/;

function configuration(ownerDid, timeZone) {
  if (typeof ownerDid !== "string" || !DID.test(ownerDid) ||
      typeof timeZone !== "string" || !/^[A-Za-z_][A-Za-z0-9_+/-]*$/.test(timeZone)) {
    throw new Error(CONFIG);
  }
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone, calendar: "iso8601", numberingSystem: "latn", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "longOffset",
    });
  } catch {
    throw new Error(CONFIG);
  }
}

/** Pure validation and clock conversion; CLI callers cannot inject a clock. */
export function validateContext({ ownerDid, timeZone, savedSpace, context, now }) {
  const formatter = configuration(ownerDid, timeZone);
  const expected = DID.exec(ownerDid);
  const saved = typeof savedSpace === "string" && SPACE.exec(savedSpace);
  const active = typeof context?.spaceId === "string" && SPACE.exec(context.spaceId);
  if (!saved || !active || [saved, active].some((s) =>
    s[1] !== expected[1] || s[2].toLowerCase() !== expected[2].toLowerCase())) {
    throw new Error(ACCOUNT);
  }
  const parts = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const offset = parts.timeZoneName === "GMT" ? "+00:00" : parts.timeZoneName.replace(/^GMT/, "");
  const utc = now.toISOString();
  return { spaceId: savedSpace, day,
    now: `${day}T${parts.hour}:${parts.minute}:${parts.second}.${String(now.getUTCMilliseconds()).padStart(3, "0")}${offset}`,
    utc, timeZone };
}

function main() {
  try {
    const ownerDid = process.env.TC_APPS_OWNER_DID;
    const timeZone = process.env.TC_APPS_TIMEZONE;
    configuration(ownerDid, timeZone); // Missing independent configuration must not probe a session.
    const [cli, state, ...extra] = process.argv.slice(2);
    if (!cli || !state || extra.length || !isAbsolute(cli) || !isAbsolute(state)) throw new Error(CONFIG);
    const file = join(state, "meal-space.txt");
    const savedSpace = readFileSync(file, "utf8").trim();
    const result = spawnSync(cli, ["--profile", "agent-meal", "context", "--json"], {
      encoding: "utf8", timeout: 30_000, maxBuffer: 64 * 1024, stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.error || result.status !== 0 || readFileSync(file, "utf8").trim() !== savedSpace) {
      throw new Error(ACCOUNT);
    }
    const context = JSON.parse(result.stdout);
    const output = validateContext({ ownerDid, timeZone, savedSpace, context, now: new Date() });
    process.stdout.write(JSON.stringify(output) + "\n");
  } catch (error) {
    process.stderr.write((error.message === CONFIG ? CONFIG : ACCOUNT) + "\n");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
