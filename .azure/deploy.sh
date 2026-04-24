#!/usr/bin/env bash
# Azure App Service deployment script.
# Kudu (Azure's deployment engine) runs this after pulling the latest source.
# Environment variables are set in the Azure portal under Application Settings —
# do not hardcode any secrets here.

set -e  # exit immediately on any error

echo "[deploy] Installing dependencies..."
# Install only production dependencies to keep the deployment footprint small.
npm install --omit=dev

echo "[deploy] Starting application..."
# Azure sets the PORT environment variable automatically.
# server.js reads process.env.PORT and falls back to 3000 for local dev.
npm start
