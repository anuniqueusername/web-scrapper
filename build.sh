#!/bin/bash
set -e

echo "Installing chromium-browser..."
apt-get update
apt-get install -y chromium-browser

echo "Installing npm dependencies..."
npm ci

echo "Building Next.js app..."
npm run build

echo "Build complete!"
