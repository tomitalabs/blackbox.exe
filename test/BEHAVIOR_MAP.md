# Black-Box Behavior Map

This map links each observable system behavior to at least one black-box test.

## CLI Contract

| Behavior ID | Observable Behavior | Test Case |
|---|---|---|
| CLI-01 | App boots and can halt cleanly with :quit | boot and quit path stays healthy |
| CLI-02 | Help command lists public commands | help command exposes public contract |
| CLI-03 | Invalid language line returns parse error | invalid language input returns parse error |
| CLI-04 | Valid language line is accepted and rendered | valid language input is accepted and rendered |
| CLI-05 | LLM status shows explicit disabled state | LLM status command reports disabled provider explicitly |
| CLI-06 | Chat command degrades gracefully without LLM | chat command degrades gracefully when LLM is disabled |

## LLM Provider Contract (Ollama-compatible)

| Behavior ID | Observable Behavior | Test Case |
|---|---|---|
| LLM-01 | chat(message) returns model text | ollama provider returns chat text through stable API |
| LLM-02 | suggestDelta enforces uncertainty envelope | ollama provider clamps delta to uncertainty envelope |
| LLM-03 | suggestDelta fails fast when deadline expires | ollama provider fails fast on timeout |

## Integration Bridge Contract (HTTP/WS)

| Behavior ID | Observable Behavior | Test Case |
|---|---|---|
| BRIDGE-01 | Health endpoint reports service availability | health endpoint is reachable |
| BRIDGE-02 | Status endpoint exposes shared LLM status contract | status exposes llm disabled contract |
| BRIDGE-03 | Command endpoint applies official language lines | command endpoint applies official language line |
| BRIDGE-04 | Command endpoint rejects invalid syntax with 400 | command endpoint rejects invalid syntax |
| BRIDGE-05 | Command endpoint supports :chat via shared API | command endpoint supports :chat via shared llm contract |
| BRIDGE-06 | WS stream emits channel updates after commands | ws stream emits state and channel updates |

## Coverage Notes

- This map focuses on public, observable behavior (CLI output and provider API contract).
- Unit tests in test/test.js continue to validate parser/channels/render invariants.
- Black-box suite in test/blackbox.test.js validates behavior through external interfaces only.
- Black-box suite in test/bridge.blackbox.test.js validates integration contract over HTTP/WS.
