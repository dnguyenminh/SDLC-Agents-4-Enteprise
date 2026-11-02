# SA4E backend — multi-stage image
# Targets:
#   build      — full deps + TypeScript build output in dist/
#   test       — build + dev/test tooling (tests/, .env.test) for image-based runs
#   mcp-python — builds the two stdio MCP child servers into isolated /opt venvs
#   production — runtime only: package.json + trimmed node_modules + dist
#                + python3 runtime + the two stdio MCP child servers
#
# Base = node:22-slim (Debian/glibc), NOT alpine/musl, because:
#   - native node modules (bcrypt, sqlite3) compile against the base libc, so the
#     build and runtime stages MUST share one libc (musl build + glibc runtime
#     would fail to load the .node binaries).
#   - the markitdown[all] MCP child pulls onnxruntime/magika, which publish only
#     manylinux (glibc) wheels — there is no musllinux build (old AD-1 decision).

# ---------- Stage: build ----------
FROM node:22-slim AS build
WORKDIR /usr/src/app

# Toolchain for native modules (bcrypt, sqlite3) — build-time only, never copied
# into the runtime image. Single layer with cleanup to keep it lean.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# Install ALL dependencies — dev deps (tsc) are required to compile.
COPY package*.json ./
RUN npm install

# Copy sources (config first to leverage layer caching).
COPY tsconfig*.json ./
COPY src ./src
COPY scripts ./scripts

RUN npm run build

# Trim devDependencies so downstream stages ship a small runtime graph.
RUN npm prune --omit=dev

# ---------- Stage: test ----------
FROM build AS test
# .dockerignore re-includes tests/ and .env.test for this stage (SA4E-335 DEF-001).
WORKDIR /usr/src/app
COPY tests ./tests
COPY .env.test ./
CMD ["npm", "run", "check:ci"]

# ---------- Stage: mcp-python ----------
# Builds the two stdio MCP child servers into isolated /opt venvs using `uv`
# (Debian/glibc). The orchestration module (McpClientManager -> TransportFactory)
# spawns stdio children by bare `command` name resolved on the PATH inherited by
# the backend process (documents/MCP-DB-CONFIG-REQUEST.md §9), so each server
# ships as a venv console script that `production` puts on PATH:
#   /opt/markitdown-venv/bin/markitdown-mcp                (Microsoft MarkItDown)
#   /opt/markdown-exporter-venv/bin/markdown-exporter-mcp-local
# markdown-exporter-mcp-local has NO PyPI release (GitHub source only), so it is
# installed from a pinned upstream commit for a hermetic build. Building the
# venvs at image-build time (instead of `uvx` at runtime) avoids a runtime
# network dependency and gives fast, offline-capable child-server spawns.
FROM node:22-slim AS mcp-python
# `uv` — extremely fast Python installer/resolver. `git` fetches the exporter
# source. The interpreter is provided by uv (uv python install), kept on a fixed
# path so the venvs stay valid when copied into the runtime image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Pinned interpreter: 3.12 is the newest line with onnxruntime/magika wheels
# (the verified Debian build used 3.11; 3.13/3.14 have no compatible onnxruntime
# wheel). The uv-managed CPython is copied into the runtime image.
ARG PYTHON_VERSION=3.12
ARG MARKITDOWN_MCP_VERSION=0.0.1a7
# markdown-exporter-mcp-local has no PyPI release — pin the exact upstream commit
# (main @ 2026-04-07) for a hermetic build (git-source analogue of SEC-02).
ARG MARKDOWN_EXPORTER_MCP_REF=1429b6a94767a709f7f5119219ca5951042d9d3c

ENV UV_PYTHON_INSTALL_DIR=/opt/uv-python
RUN uv python install "${PYTHON_VERSION}"

# markitdown-mcp venv. `--prerelease=allow`: markitdown[all] pulls a transitive
# dep (azure-ai-contentunderstanding) whose only satisfying release is a
# pre-release; pip (used by the old build) allowed this implicitly, uv is strict
# by default. Probe the console script + import so the build fails on drift.
RUN uv venv --python "${PYTHON_VERSION}" /opt/markitdown-venv \
 && VIRTUAL_ENV=/opt/markitdown-venv uv pip install --no-cache --prerelease=allow \
      "markitdown-mcp==${MARKITDOWN_MCP_VERSION}" \
 && test -x /opt/markitdown-venv/bin/markitdown-mcp \
 && /opt/markitdown-venv/bin/python -c "import markitdown_mcp"

# markdown-exporter-mcp-local venv. `mcp<2` constraint: upstream declares
# `mcp>=1.27.0` (unbounded) but imports `mcp.server.fastmcp` — an API removed in
# mcp 2.x. The import probe below fails the build on exactly this class of drift.
#
# SEC-04 Trivy gate: this venv's transitive deps resolve pillow to 12.1.1, which
# carries 40 HIGH/CRITICAL CVEs (RCE/DoS via crafted images), all fixed in 13.0.0
# — the latest release. Force-upgrade pillow AFTER install (same force-upgrade
# pattern as the prior builds for pillow/certifi/pypdf). A PEP-440 conflict
# warning is EXPECTED and harmless; the version probe fails the build on drift.
# (markitdown-venv already resolves pillow 13.0.0, so it needs no override.)
ARG PILLOW_VERSION=13.0.0
RUN uv venv --python "${PYTHON_VERSION}" /opt/markdown-exporter-venv \
 && VIRTUAL_ENV=/opt/markdown-exporter-venv uv pip install --no-cache \
      "markdown-exporter-mcp-local @ git+https://github.com/Zac-Chen-2001/markdown-exporter-mcp-local@${MARKDOWN_EXPORTER_MCP_REF}" \
      "mcp>=1.27.0,<2.0.0" \
 && VIRTUAL_ENV=/opt/markdown-exporter-venv uv pip install --no-cache \
      "pillow==${PILLOW_VERSION}" \
 && test -x /opt/markdown-exporter-venv/bin/markdown-exporter-mcp-local \
 && /opt/markdown-exporter-venv/bin/python -c "import markdown_exporter_mcp.server, md_exporter" \
 && /opt/markdown-exporter-venv/bin/python -c "import PIL, sys; assert PIL.__version__ == '${PILLOW_VERSION}', 'pillow drift: '+PIL.__version__"

# SEC-04 Trivy gate: the uv-managed standalone CPython ships a bundled `pip`
# whose vendored `msgpack` (1.1.2) carries 5 HIGH CVEs (DoS). The runtime never
# uses pip — the venvs are prebuilt — so strip pip/setuptools wheel tooling from
# the interpreter. This removes the vendored msgpack from the image (and the
# Trivy scan) without touching the two venvs, which have their own site-packages.
RUN rm -rf /opt/uv-python/*/lib/python*/site-packages/pip \
           /opt/uv-python/*/lib/python*/site-packages/pip-*.dist-info \
           /opt/uv-python/*/lib/python*/site-packages/setuptools \
           /opt/uv-python/*/lib/python*/site-packages/setuptools-*.dist-info \
           /opt/uv-python/*/lib/python*/site-packages/pkg_resources \
 && /opt/markitdown-venv/bin/python -c "import markitdown_mcp" \
 && /opt/markdown-exporter-venv/bin/python -c "import markdown_exporter_mcp.server"

# ---------- Stage: production ----------
FROM node:22-slim AS production
WORKDIR /usr/src/app
ENV NODE_ENV=production

# SEC-04 supply-chain hardening: strip yarn (never used at runtime) and patch the
# global npm's bundled undici (HIGH CVEs). In-tree `npm install` fails on npm's
# own unpublished @npmcli/docs dep, so replace the package folder directly.
RUN npm install -g npm@latest \
 && cd /tmp \
 && npm pack undici@6.29.1 \
 && rm -rf /usr/local/lib/node_modules/npm/node_modules/undici \
 && mkdir -p /usr/local/lib/node_modules/npm/node_modules/undici \
 && tar -xzf undici-6.29.1.tgz -C /usr/local/lib/node_modules/npm/node_modules/undici --strip-components=1 \
 && rm -f /tmp/undici-6.29.1.tgz \
 && rm -rf /opt/yarn*

COPY --from=build /usr/src/app/package*.json ./
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist

# --- Stdio MCP child servers (spawned by orchestration via bare command) ----
# The venv trees built in `mcp-python`, plus the uv-managed CPython they point
# at, are copied in on the SAME paths used at build time (the venvs reference the
# interpreter under /opt/uv-python). Their console scripts resolve on the PATH
# inherited by the backend process and its stdio children, so in-container
# `mcp_servers` DB rows can use bare commands:
#   { "command": "markitdown-mcp", "args": [] }
#   { "command": "markdown-exporter-mcp-local", "args": [] }
COPY --from=mcp-python /opt/uv-python /opt/uv-python
COPY --from=mcp-python /opt/markitdown-venv /opt/markitdown-venv
COPY --from=mcp-python /opt/markdown-exporter-venv /opt/markdown-exporter-venv
# PYTHONUNBUFFERED keeps child-server stderr logs streaming (no MCP breakage).
ENV PATH="/opt/markitdown-venv/bin:/opt/markdown-exporter-venv/bin:${PATH}"
ENV PYTHONUNBUFFERED=1

EXPOSE 48721
CMD ["npm", "start"]
