FROM node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git procps \
    && rm -rf /var/lib/apt/lists/*

# Client pins match the native clients inspected for this evaluation campaign.
RUN npm install --global --no-audit --no-fund bun@1.4.2 \
    && npm install --global --no-audit --no-fund \
       @openai/codex@0.160.0 \
       @anthropic-ai/claude-code@2.1.304 \
       opencode-ai@1.18.31 \
       @oh-my-pi/pi-coding-agent@18.4.8

COPY . /opt/connect-evals/
RUN mkdir -p /work && chown node:node /work

ENV HOME=/home/node \
    DISABLE_AUTOUPDATER=1 \
    OPENCODE_DISABLE_AUTOUPDATE=1 \
    OPENCODE_DISABLE_SHARE=1 \
    OPENCODE_DISABLE_LSP_DOWNLOAD=1

USER node
WORKDIR /work
CMD ["sleep", "infinity"]
