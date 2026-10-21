#!/bin/zsh
# Save (or replace) ANTHROPIC_API_KEY in .env without echoing it or leaving it in shell history.
cd "${0:A:h}/.."
read -rs "key?Paste your Anthropic API key, then press Enter: "
echo
if [[ "$key" != sk-ant-* ]]; then echo "That doesn't look like an Anthropic key (should start with sk-ant-). Nothing saved."; exit 1; fi
touch .env && chmod 600 .env
grep -v '^ANTHROPIC_API_KEY=' .env > .env.tmp; mv .env.tmp .env; chmod 600 .env
print -r -- "ANTHROPIC_API_KEY=$key" >> .env
unset key
echo "Saved to .env. You can close this tab."
