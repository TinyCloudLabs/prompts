// Prints a local plugin entry module, never creates or activates one.
if (process.argv.length === 3 && process.argv[2] === "--print-module") {
  const plugin = new URL("./opencode-v1.mjs", import.meta.url);
  process.stdout.write(`export { default } from ${JSON.stringify(plugin.href)};\n`);
}
