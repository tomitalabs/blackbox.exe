# Sprint Masterplan - blackbox.exe

## Visao geral

Este plano cobre o produto inteiro em modo performatico:
- Motor em tempo real (CLI)
- Integracao com LLM local (Ollama primeiro, vLLM opcional)
- Frontend de palco (Web)
- Garantias de baixa latencia
- Caminho de migracao para sidecar em Rust

Objetivo final: manter a experiencia de performance fluida mesmo com IA ativa.

## Decisoes de arquitetura

1. Controle principal: CLI continua como instrumento de entrada.
2. Visual principal: Web em paralelo (palco/projecao), sem substituir CLI.
3. Provedor LLM: interface unica com implementacoes pluggaveis.
4. Ordem de provedores: Ollama (MVP) -> vLLM (escala).
5. Latencia: toda chamada LLM tem deadline curto e fallback imediato.
6. Rust: entra como sidecar para scheduler/event-loop quando necessario.

## Metas de latencia (SLO)

- Entrada CLI -> estado aplicado: <= 5 ms (p95)
- Estado -> frame visual: <= 16.7 ms (p95, 60 FPS)
- Tick do runtime: 100 ms estavel (sem bloquear)
- Chamada LLM (deadline hard): 250 ms max
- Chamada LLM (alvo): 120-180 ms p95
- Timeout/erro LLM -> fallback: <= 1 tick

## Entregaveis finais

1. Provider layer para IA local com deadline e fallback.
2. Gateway de eventos em tempo real para web.
3. Frontend Svelte + p5 consumindo eventos ao vivo.
4. Modo degradado robusto (sem IA, com IA lenta, sem web).
5. Suite de testes e benchmarks de latencia.
6. Opcional: sidecar Rust para agendamento de alta precisao.

---

## Sprint 1 - Base de IA local (5 dias)

### Meta
Trocar interferencia puramente aleatoria por IA local controlada, sem quebrar o loop de performance.

### Escopo
1. Criar interface de provedor IA:
   - requestInterference(context) -> { delta, confidence, reason }
2. Implementar OllamaProvider com HTTP local.
3. Adicionar timeout com AbortController.
4. Implementar fallback para algoritmo atual (aleatorio) em timeout/erro.
5. Configuracao por variaveis de ambiente:
   - AI_PROVIDER=ollama|none
   - AI_MODEL=...
   - AI_TIMEOUT_MS=...

### Criterios de aceite
1. Sistema funciona com e sem Ollama ativo.
2. Nenhuma chamada IA bloqueia o input da CLI.
3. Em timeout, performance continua sem stutter.
4. Logs mostram origem do evento: llm|fallback.

### Testes
1. Unitario: parser de resposta do provider.
2. Unitario: timeout e cancelamento.
3. Integracao: provedor fora do ar.
4. Regressao: comandos atuais continuam iguais.

---

## Sprint 2 - Gateway real-time + protocolo de evento (5 dias)

### Meta
Publicar o estado performatico para consumidores externos (web) com latencia baixa.

### Escopo
1. Criar EventBus interno tipado.
2. Criar WebSocket server local.
3. Definir schema de evento:
   - tick
   - channel_update
   - ai_injection
   - system_status
4. Incluir timestamp e sequence id para diagnostico.
5. Buffer circular curto (reconnect sem perder contexto imediato).

### Criterios de aceite
1. Web recebe eventos em tempo real com jitter baixo.
2. Queda de conexao web nao afeta CLI.
3. Taxa de eventos configuravel.
4. Eventos invalidos sao descartados com log seguro.

### Testes
1. Integracao websocket com reconnect.
2. Carga: 1k eventos/s sem travar runtime.
3. Medicao de lag fim-a-fim.

---

## Sprint 3 - Frontend de palco (Svelte + p5) (5 dias)

### Meta
Construir visual performatico sincronizado com o runtime.

### Escopo
1. App Svelte para controle de cena.
2. Engine visual p5 para render em canvas.
3. Camadas visuais:
   - Energia por canal
   - Glitch field
   - Interferencia IA
4. HUD minimal:
   - canais ativos
   - BPM visual/taxa
   - status da IA
5. Presets de cena (A/B/C) para live set.

### Criterios de aceite
1. 60 FPS em maquina alvo (p95).
2. Perda de websocket nao congela render.
3. Visual reage a canais e eventos IA em < 1 frame medio.
4. Fullscreen estavel para projetor.

### Testes
1. Smoke test de boot da web.
2. Teste de consumo continuo por 30 min.
3. Perfil de frame time e uso de memoria.

---

## Sprint 4 - Hardening de latencia + caminho Rust (5 dias)

### Meta
Blindar estabilidade de performance e preparar upgrade de runtime.

### Escopo
1. Instrumentacao completa (p50/p95/p99).
2. Adaptive load shedding:
   - reduzir taxa de IA sob carga
   - simplificar render sob queda de FPS
3. Pre-warm de modelo na inicializacao.
4. Prototipo sidecar Rust:
   - scheduler de eventos
   - fila lock-free para mensagens
5. Comparativo Node-only vs Node+Rust.

### Criterios de aceite
1. Sem quedas de audio/controle por 30 min.
2. p95 de input continua dentro da meta.
3. Modo degradado funciona automatico.
4. Relatorio objetivo de ganho/perda com Rust.

### Testes
1. Stress test com IA ativa + visual ativo.
2. Fault injection (timeout, disconnect, bursts).
3. Benchmark repetivel com script unico.

---

## Backlog priorizado (ordem)

1. Provider interface e fallback
2. Ollama provider
3. Timeout hard e cancelamento
4. EventBus interno
5. WebSocket gateway
6. App Svelte + p5 base
7. Presets de cena
8. Instrumentacao e metricas
9. Adaptive shedding
10. Sidecar Rust POC
11. vLLM provider
12. Testes de longa duracao

## Definicao de pronto (DoD)

1. Feature com teste unitario/integracao.
2. Sem bloquear loop principal.
3. Log observavel para diagnostico.
4. Documentacao de uso atualizada.
5. Medicao de latencia registrada.

## Riscos e mitigacao

1. Modelo local lento
   - Mitigacao: modelo menor quantizado + timeout + fallback.
2. Jitter de render web
   - Mitigacao: desacoplar ingestao e render, usar buffer curto.
3. Complexidade excessiva cedo
   - Mitigacao: Ollama primeiro, vLLM/Rust como upgrades.
4. Acoplamento entre CLI e web
   - Mitigacao: protocolo de eventos independente.

## Plano de execucao recomendado

1. Semana 1: Sprint 1 completo.
2. Semana 2: Sprint 2 completo.
3. Semana 3: Sprint 3 completo.
4. Semana 4: Sprint 4 + decisao sobre Rust/vLLM.

## Resultado esperado ao fim

- Performance ao vivo com controle confiavel via CLI.
- IA local integrada sem travamento perceptivel.
- Palco web sincronizado e expressivo.
- Base tecnica pronta para escalar (vLLM) ou reduzir jitter (Rust sidecar).
