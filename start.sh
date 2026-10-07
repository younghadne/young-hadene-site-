#!/bin/bash
# Start Young Hadene server with auto-restart
cd "$(dirname "$0")"
while true; do
  node server.js >> logs/server.log 2>&1
  sleep 2
done
