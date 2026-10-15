#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { closeSync, constants, fchmodSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

const keys = ["TC_BIN", "TC_OWNER_DID", "TC_OWNER_EMAIL"];
const valid = (key, value) => {
  if (!value || /[$`\r\n]/.test(value)) return false;
  switch (key) {
    case "TC_BIN": return isAbsolute(value) && !/[\u0000-\u001f]/.test(value);
    case "TC_OWNER_DID": return /^did:pkh:eip155:\d+:0x[a-fA-F0-9]{40}$/.test(value);
    case "TC_OWNER_EMAIL": return /^[^\s@=]+@[^\s@=.]+(?:\.[^\s@=.]+)+$/.test(value);
    default: return false;
  }
};
const file = process.env.TC_AGENT_ENV || join(process.env.HOME, ".config/tinycloud/agent.env");
const parts = file.split("/").filter(Boolean);
if (!isAbsolute(file) || parts.some((part) => part === "." || part === "..") || parts.length === 0) {
  console.error("AGENT_ENV_UNSAFE_PATH");
  process.exit(2);
}
const filename = parts.pop();
const { O_RDONLY, O_WRONLY, O_CREAT, O_EXCL, O_NOFOLLOW } = constants;
// cwd pins the selected directory across rename and cleanup on macOS and Linux.
// A same-UID actor can race the initial check/chdir; it already controls this
// user's home. Once chdir succeeds, later pathname swaps cannot redirect writes.
function parent(create) {
  let path = "/";
  for (const part of parts) {
    path = join(path, part);
    if (create) {
      try { mkdirSync(path, { mode: 0o700 }); }
      catch (error) { if (error.code !== "EEXIST") throw error; }
    }
    let stat;
    try { stat = lstatSync(path); }
    catch (error) { if (!create && error.code === "ENOENT") return false; throw error; }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("AGENT_ENV_UNSAFE_DIR");
  }
  const before = lstatSync(path);
  process.chdir(path);
  const after = lstatSync(path);
  const opened = statSync(".");
  if (after.isSymbolicLink() || after.dev !== before.dev || after.ino !== before.ino ||
    opened.dev !== before.dev || opened.ino !== before.ino) throw new Error("AGENT_ENV_UNSAFE_DIR");
  if (create && (opened.uid !== process.getuid() || (opened.mode & 0o777) !== 0o700)) {
    throw new Error("AGENT_ENV_UNSAFE_DIR");
  }
  return true;
}
function current(found) {
  if (!found) return { text: "", stat: null };
  let opened;
  try {
    opened = openSync(filename, O_RDONLY | O_NOFOLLOW);
  } catch (error) {
    if (error.code === "ENOENT") return { text: "", stat: null };
    throw error;
  }
  try {
    const stat = fstatSync(opened);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600) throw new Error("AGENT_ENV_UNSAFE_FILE");
    return { text: readFileSync(opened, "utf8"), stat };
  } finally {
    closeSync(opened);
  }
}
function save(values, previous) {
  const destination = filename;
  const temp = `.agent-env.${randomBytes(12).toString("hex")}.tmp`;
  try {
    const opened = openSync(temp, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600);
    try {
      fchmodSync(opened, 0o600);
      writeFileSync(opened, keys.filter((name) => values[name]).map((name) => `${name}=${values[name]}\n`).join(""));
    } finally {
      closeSync(opened);
    }
    let now = null;
    try { now = lstatSync(destination); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (now?.isSymbolicLink() || Boolean(now) !== Boolean(previous) ||
      (now && (now.ino !== previous.ino || now.dev !== previous.dev))) throw new Error("AGENT_ENV_FILE_CONFLICT");
    renameSync(temp, destination);
  } finally {
    try { unlinkSync(temp); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

const [action, key, value] = process.argv.slice(2);
if (!keys.includes(key)) {
  console.error("AGENT_ENV_INVALID_KEY");
  process.exit(2);
}
try {
  const found = parent(action === "set");
  const { text, stat } = current(found);
  const values = {};
  for (const [index, line] of text.split("\n").entries()) {
    if (!line || line.startsWith("#")) continue;
    const equal = line.indexOf("=");
    const key = line.slice(0, equal);
    const value = line.slice(equal + 1);
    if (equal < 0) console.error(`AGENT_ENV_IGNORED line=${index + 1} INVALID_LINE`);
    else if (!keys.includes(key)) console.error(`AGENT_ENV_IGNORED line=${index + 1} INVALID_KEY`);
    else if (!valid(key, value)) console.error(`AGENT_ENV_IGNORED line=${index + 1} INVALID_VALUE`);
    else values[key] = value;
  }
  if (action === "get") {
    const selected = process.env[key] || values[key];
    if (!selected) process.exitCode = 1;
    else if (!valid(key, selected)) {
      console.error(`AGENT_ENV_INVALID ${key}`);
      process.exitCode = 2;
    } else console.log(selected);
  } else if (action === "set" && valid(key, value)) {
    values[key] = value;
    save(values, stat);
  } else {
    console.error("AGENT_ENV_INVALID_VALUE");
    process.exitCode = 2;
  }
} catch {
  // Invalid links, modes, and I/O conflicts must not look like an absent value:
  // callers use exit 1 only to fall back to a CLI when no selection was saved.
  console.error("AGENT_ENV_UNSAFE_PATH");
  process.exitCode = 2;
}
