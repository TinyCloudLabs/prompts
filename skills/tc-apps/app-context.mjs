#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const AUTH_ERRORS = new Set(["PROFILE_NOT_FOUND", "AUTH_REQUIRED", "AUTH_EXPIRED"]);
const canonicalOwner = (value) => /^did:pkh:eip155:\d+:0x[\da-f]{40}$/i.test(value || "") ? value.toLowerCase() : value;
const canonicalSpace = (value) => typeof value === "string" ? value.replace(/^(tinycloud:pkh:eip155:\d+:)(0x[\da-f]{40})(:)/i, (_, prefix, address, suffix) => prefix + address.toLowerCase() + suffix) : value;
const applicationsOwner = (space) => {
  const match = /^tinycloud:(pkh:eip155:[1-9]\d*:0x[\da-f]{40}):applications$/i.exec(space || "");
  return match ? `did:${match[1]}` : null;
};

export function cliInvocation(cli, args, platform = process.platform) {
  if (platform !== "win32") return { file: cli, args };
  // Match the shared installer's owned launchers and npm entry points without
  // invoking cmd.exe: JSON, SQL and record text must stay literal arguments.
  const visited = new Set();
  while (/\.(cmd|ps1|bat)$/i.test(cli)) {
    if (visited.has(cli)) throw new Error("APP_CLI_UNSUPPORTED: cyclic TinyCloud launcher.");
    visited.add(cli);
    const text = readFileSync(cli, "utf8");
    const marker = ":: TinyCloud CLI launcher ";
    const line = text.split(/\r?\n/).find((value) => value.startsWith(marker));
    if (line) {
      const target = JSON.parse(Buffer.from(line.slice(marker.length), "base64").toString("utf8"));
      if (typeof target !== "string") throw new Error("APP_CLI_UNSUPPORTED: invalid TinyCloud launcher.");
      cli = target;
      continue;
    }
    if (/[@]tinycloud[\\/]cli[\\/]/.test(text)) {
      for (const manifest of [join(dirname(cli), "../@tinycloud/cli/package.json"), join(dirname(cli), "node_modules/@tinycloud/cli/package.json")]) {
        if (!existsSync(manifest)) continue;
        const pkg = JSON.parse(readFileSync(manifest, "utf8"));
        const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.tinycloud || pkg.bin?.tc;
        if (pkg.name === "@tinycloud/cli" && typeof bin === "string") return { file: process.execPath, args: [resolve(dirname(manifest), bin), ...args] };
      }
    }
    throw new Error("APP_CLI_UNSUPPORTED: select the TinyCloud npm CLI, not an unrelated command script.");
  }
  return /\.(?:mjs|cjs|js)$/i.test(cli) ? { file: process.execPath, args: [cli, ...args] } : { file: cli, args };
}

export function appPermissions(app, { write = false, remove = false, sql = false, schema = false, catalog = false, removeEntry = false } = {}) {
  if (catalog) return [
    { service: "tinycloud.kv", path: "", actions: ["get", "list", ...(write ? ["put"] : [])] },
    { service: "tinycloud.sql", path: "", actions: ["read", ...(write || remove ? ["write"] : [])] },
  ];
  if (sql) return [{ service: "tinycloud.sql", path: `xyz.tinycloud.tinyapps.${app}/index`, actions: ["read", ...(write ? ["write"] : []), ...(schema ? ["schema"] : [])] }];
  const actions = ["get", "list", ...(write ? ["put"] : []), ...(remove ? ["del"] : [])];
  return [
    { service: "tinycloud.kv", path: `xyz.tinycloud.tinyapps.${app}/`, actions },
    ...(write ? [{ service: "tinycloud.kv", path: "xyz.tinycloud.tinyapps.catalog/", actions: ["get", "list"] }] : []),
    ...(write ? [{ service: "tinycloud.kv", path: `xyz.tinycloud.tinyapps.catalog/${app}/`, actions: ["put"] }] : []),
    // Going back from a move (SKILL.md §9) deletes this app's discovery entry, and nothing else in the catalog.
    ...(removeEntry ? [{ service: "tinycloud.kv", path: `xyz.tinycloud.tinyapps.catalog/${app}/`, actions: ["del"] }] : []),
  ];
}

export function missingPermissions(profile, space, required, now = Date.now()) {
  const live = (entry) => entry?.expiresAt && Number.isFinite(Date.parse(entry.expiresAt)) && Date.parse(entry.expiresAt) > now;
  const permissions = [
    ...(profile.session?.present && profile.session.expired === false && live(profile.session) ? profile.session.permissions || [] : []),
    ...(profile.delegations || []).filter((entry) => entry.active && entry.expired === false && live(entry)).flatMap((entry) => entry.permissions || []),
  ];
  return required.flatMap((request) => {
    const actions = request.actions.filter((action) => !permissions.some((permission) =>
      canonicalSpace(permission.space) === canonicalSpace(space) && permission.service === request.service &&
      typeof permission.path === "string" && request.path.startsWith(permission.path) &&
      (permission.actions || []).some((granted) => granted === `${request.service}/${action}` || granted === `${request.service}/*`),
    ));
    return actions.length ? [{ ...request, space, actions }] : [];
  });
}

export function appContext(cli, app, { write = false, remove = false, sql = false, schema = false, catalog = false, removeEntry = false, env = process.env, run = spawnSync } = {}) {
  if (!/^[a-z][a-z0-9-]*$/.test(app) || (catalog ? !["healthlog", "recipes"].includes(app) : ["catalog", "index-stale", "healthlog", "recipes"].includes(app))) {
    throw new Error("APP_NAME_INVALID: select a generic app or a known catalog app with --catalog.");
  }
  const call = (args) => {
    const invocation = cliInvocation(cli, args);
    const result = run(invocation.file, invocation.args, { env, encoding: "utf8", input: "", timeout: 30000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    if (result.error) throw new Error(`APP_CONTEXT_FAILED: ${result.error.code || "CLI_FAILED"}`);
    const text = result.status === 0 ? result.stdout : result.stderr;
    let value;
    try { value = JSON.parse(text); }
    catch { throw new Error(`APP_CONTEXT_FAILED: CLI returned invalid JSON (exit ${result.status}).`); }
    if (result.status !== 0) {
      const code = value?.error?.code || "CLI_FAILED";
      const error = new Error(`APP_CONTEXT_FAILED: ${code}`);
      error.code = code;
      throw error;
    }
    return value;
  };
  const selectedArgs = env.TC_PROFILE ? ["--profile", env.TC_PROFILE] : [];
  const summary = call([...selectedArgs, "status", "--json"]);
  const active = summary.profiles.find((profile) => profile.name === summary.activeProfile);
  const dedicatedName = `tinyapp-${app}${sql ? "-sql" : ""}`;
  const dedicated = catalog ? undefined : summary.profiles.find((profile) => profile.name === dedicatedName);
  // An explicit profile is a boundary, not a hint to switch accounts.
  const candidates = env.TC_PROFILE ? [active] : [active, dedicated].filter((profile, index, all) => profile && all.indexOf(profile) === index);
  const required = appPermissions(app, { write, remove, sql, schema, catalog, removeEntry });
  // No profile with an owner or a session: onboarding sets one up for every app. The scoped
  // sign-in flows (profile/missing below) are only for an agent that cannot run onboarding.
  // The SQL index check stays informational.
  if (!sql && !candidates.some((profile) => profile && (profile.authenticated || profile.ownerDid || applicationsOwner(profile.spaceId)))) {
    return catalog ? { status: "onboard-first" } : { status: "onboard-first", profile: candidates.find(Boolean)?.name || env.TC_PROFILE || dedicatedName, missing: required };
  }
  let selectedOwner = active?.ownerDid || applicationsOwner(active?.spaceId);
  let selectedHost = env.TC_HOST || active?.host || null;
  let fallback;
  for (const profile of candidates) {
    if (!profile) continue;
    const args = ["--profile", profile.name, ...(env.TC_HOST ? ["--host", env.TC_HOST] : [])];
    let context;
    const knownOwner = profile.ownerDid || applicationsOwner(profile.spaceId);
    if (!profile.authenticated && !knownOwner) {
      fallback ||= { status: "sign-in-required", profile: profile.name, missing: required };
      continue;
    }
    const applicationsSpace = knownOwner ? `tinycloud:${knownOwner.slice(4)}:applications` : "applications";
    try { context = call([...args, "context", "--space", applicationsSpace, "--json"]); }
    catch (error) { if (AUTH_ERRORS.has(error.code)) continue; throw error; }
    const ownerDid = context.ownerDid || applicationsOwner(context.spaceId);
    if (!ownerDid?.startsWith("did:") || !context.host || canonicalSpace(context.spaceId) !== canonicalSpace(`tinycloud:${ownerDid.slice(4)}:applications`)) continue;
    if (selectedOwner && canonicalOwner(ownerDid) !== canonicalOwner(selectedOwner)) {
      throw new Error("APP_OWNER_MISMATCH: the existing app profile belongs to a different owner; no account was switched.");
    }
    if (selectedHost && context.host.replace(/\/$/, "") !== selectedHost.replace(/\/$/, "")) {
      throw new Error("APP_HOST_MISMATCH: the existing app profile uses a different host; no host was switched.");
    }
    selectedOwner ||= ownerDid;
    selectedHost ||= context.host;
    const selected = { profile: profile.name, ownerDid, host: context.host, spaceId: context.spaceId };
    const missing = missingPermissions(profile, context.spaceId, required);
    if (!fallback?.ownerDid) fallback = { status: profile.authenticated && context.session?.state === "present" ? "grant-required" : "sign-in-required", ...selected, missing };
    if (!profile.authenticated || context.session?.state !== "present" || missing.length) continue;
    // Metadata is not proof of access. A failed read is not a reason to create
    // another profile or ask for a broader approval.
    if (sql) {
      const tables = call(["--profile", profile.name, "--host", context.host, "sql", "query", "SELECT name FROM sqlite_master WHERE type = ? AND name = ?", "--params", '["table","records"]', "--space", context.spaceId, "--db", `xyz.tinycloud.tinyapps.${app}/index`, "--json"]);
      if (!Array.isArray(tables.rows)) throw new Error("APP_CONTEXT_FAILED: invalid index metadata.");
      return { status: "ready", ...selected, indexPresent: tables.rows.some((row) => (Array.isArray(row) ? row[0] : row?.name) === "records") };
    }
    const prefix = catalog ? `xyz.tinycloud.sample.${app}/knowledge/` : `xyz.tinycloud.tinyapps.${app}/catalog/`;
    const listing = call(["--profile", profile.name, "--host", context.host, "kv", "list", "--prefix", prefix, "--space", context.spaceId, "--all", "--json"]);
    if (!Array.isArray(listing.keys) || listing.truncated || listing.nextCursor) throw new Error("APP_CONTEXT_FAILED: incomplete app catalog listing.");
    return { status: "ready", ...selected, catalogKeys: listing.keys };
  }
  // Only reuse onboarding's existing broad access here; never request it to
  // replace the catalog guide's narrower per-app flow.
  if (catalog) return { status: "use-scoped-catalog-flow" };
  return fallback || { status: "sign-in-required", profile: env.TC_PROFILE || dedicated?.name || dedicatedName, missing: required };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [cli, app, ...options] = process.argv.slice(2);
  if (!cli || !app || options.some((option) => !["--write", "--delete", "--remove-entry", "--sql", "--schema", "--catalog"].includes(option)) || options.includes("--schema") && !options.includes("--sql") || options.includes("--catalog") && options.includes("--sql") || options.includes("--remove-entry") && (options.includes("--sql") || options.includes("--catalog"))) {
    console.error("usage: node app-context.mjs <CLI> <app> [--write] [--delete] [--remove-entry] [--sql [--schema] | --catalog]");
    process.exitCode = 2;
  } else {
    try {
      console.log(JSON.stringify(appContext(cli, app, { write: options.includes("--write"), remove: options.includes("--delete"), removeEntry: options.includes("--remove-entry"), sql: options.includes("--sql"), schema: options.includes("--schema"), catalog: options.includes("--catalog") }), null, 2));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
