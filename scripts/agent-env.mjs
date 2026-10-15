#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { closeSync, constants, fchmodSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
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
const { O_RDONLY, O_WRONLY, O_CREAT, O_EXCL, O_DIRECTORY, O_NOFOLLOW } = constants;
// /dev/fd paths keep each child lookup, mkdir, and rename anchored to an open
// directory, even if its original pathname is renamed during the operation.
const child = (fd, name) => `/dev/fd/${fd}/${name}`;
function parent(create) {
  let fd = openSync("/", O_RDONLY | O_DIRECTORY | O_NOFOLLOW);
  try {
    for (const part of parts) {
      const path = child(fd, part);
      if (create) {
        try { mkdirSync(path, { mode: 0o700 }); }
        catch (error) { if (error.code !== "EEXIST") throw error; }
      }
      const next = openSync(path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW);
      closeSync(fd);
      fd = next;
    }
    if (create) {
      const stat = fstatSync(fd);
      if (stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) throw new Error("AGENT_ENV_UNSAFE_DIR");
    }
    return fd;
  } catch (error) {
    closeSync(fd);
    if (!create && error.code === "ENOENT") return null;
    throw error;
  }
}
function current(fd) {
  if (fd === null) return { text: "", stat: null };
  let opened;
  try {
    opened = openSync(child(fd, filename), O_RDONLY | O_NOFOLLOW);
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
function save(fd, values, previous) {
  const destination = child(fd, filename);
  const temp = child(fd, `.agent-env.${randomBytes(12).toString("hex")}.tmp`);
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
let fd = null;
try {
  fd = parent(action === "set");
  const { text, stat } = current(fd);
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
    save(fd, values, stat);
  } else {
    console.error("AGENT_ENV_INVALID_VALUE");
    process.exitCode = 2;
  }
} catch {
  // Invalid links, modes, and I/O conflicts must not look like an absent value:
  // callers use exit 1 only to fall back to a CLI when no selection was saved.
  console.error("AGENT_ENV_UNSAFE_PATH");
  process.exitCode = 2;
} finally {
  if (fd !== null) closeSync(fd);
}
