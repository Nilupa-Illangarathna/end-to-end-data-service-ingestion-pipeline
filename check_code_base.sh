#!/bin/bash

echo "📦 Generating full code snapshot..."
echo

for f in $(git ls-files); do
  echo "====================== $f ======================"
  echo
  cat "$f"
  echo
done

echo "Snapshot complete."
