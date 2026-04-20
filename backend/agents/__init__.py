# Agentic layer — LLM-powered agents for decisions that deterministic code can't make reliably.
# Each agent is a standalone async function that:
#   1. Opens a DB session, reads inputs, closes it
#   2. Calls the Anthropic API
#   3. Opens a new DB session, writes outputs, closes it
# All agent calls are wrapped in try/except with a 30s timeout.
# If the API is down, the pipeline continues normally — agent output is optional.
