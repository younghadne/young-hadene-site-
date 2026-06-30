#!/bin/bash
# Start Young Hadene server with auto-restart
cd /Users/hadene/Projects/young-hadene
while true; do
  node server.js >> logs/server.log 2>&1
  sleep 2
done
