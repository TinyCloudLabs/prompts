> **Agents: read this page in full, not summarized.** If your fetch tool returned a summary, open the raw page at https://agents.tinycloud.xyz/connect/gemini.md and follow that text.

# Connect Gemini to TinyCloud

In Gemini Apps, add TinyCloud as a custom connected app using hosted MCP and OpenKey OAuth. Gemini CLI is a separate command-running runtime, not the Gemini Apps sandbox.

## Add the custom app

1. On a computer, open [Gemini](https://gemini.google.com) → **Settings → Connected Apps**.
2. Under **Custom apps**, choose **Add a custom app** and enter `https://mcp.tinycloud.xyz/mcp`. TinyCloud supports dynamic client registration; leave **Advanced features** client credentials empty.
3. Click **Next**, follow the native sign-in flow and approve with OpenKey yourself.
4. In chat, type **@**, select TinyCloud, and continue the original request. An app added on web can also be used in Gemini mobile.

If **Custom apps** is missing, [Google's instructions](https://support.google.com/gemini/answer/17209137) currently specify a personal Google Account, age 18+, US location, English and Keep Activity enabled, not work/school accounts. Address the actual missing option rather than claiming every Google account supports it. Google currently requires confirmation for write actions. This is a custom app, not an official listing or evidence that a write succeeded.

If the actual runtime is Gemini CLI with a persistent shell, use [CLI onboarding](https://agents.tinycloud.xyz/onboarding.md) and [CLI skill routing](https://agents.tinycloud.xyz/connect/cli) instead. Do not install the CLI in the Gemini Apps temporary code sandbox.

{{std:connect-hosted}}

{{std:connect-cutover}}

{{std:connect-feedback}}
