import { htmlOrMarkdown } from "../scripts/page-negotiation.mjs";

export const onRequest = htmlOrMarkdown("/connect");
