#!/usr/bin/env node
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

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
const values = {};
if (existsSync(file)) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const equal = line.indexOf("=");
    const key = equal < 0 ? line : line.slice(0, equal);
    const value = equal < 0 ? "" : line.slice(equal + 1);
    if (keys.includes(key) && valid(key, value)) values[key] = value;
    else console.error(`AGENT_ENV_IGNORED ${/^[A-Z][A-Z0-9_]*$/.test(key) ? key : "INVALID_KEY"}`);
  }
}
const [action, key, value] = process.argv.slice(2);
if (!keys.includes(key)) {
  console.error("AGENT_ENV_INVALID_KEY");
  process.exit(2);
}
if (action === "get") {
  const selected = process.env[key] || values[key];
  if (!selected) process.exit(1);
  if (!valid(key, selected)) {
    console.error(`AGENT_ENV_INVALID ${key}`);
    process.exit(2);
  }
  console.log(selected);
} else if (action === "set" && valid(key, value)) {
  values[key] = value;
  const dir = dirname(file);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const temp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(temp, keys.filter((name) => values[name]).map((name) => `${name}=${values[name]}\n`).join(""), { flag: "wx", mode: 0o600 });
    renameSync(temp, file);
  } catch (error) {
    if (existsSync(temp)) unlinkSync(temp);
    throw error;
  }
} else {
  console.error("AGENT_ENV_INVALID_VALUE");
  process.exit(2);
}
