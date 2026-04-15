# Integracao Unica - blackbox.exe + frontend

## 1) Diagnostico rapido

Temos hoje dois produtos validos, mas paralelos:

1. Core atual (raiz do repo):
- Linguagem performativa simbolica (canal, freq, speed, glitch, uncertainty)
- Runtime continuo nao bloqueante
- IA local com Ollama + timeout + fallback
- Testes unitarios e black-box
- Docker com multiplos modelos quantizados

2. Frontend XR (frontend):
- Interface React com terminal visual
- Cena 3D/AR/VR (three + react-three/xr)
- Audio engine local (Tone)
- Body tracking (MediaPipe)
- Comandos proprios no formato funcao(args)

Problema de integracao:
- Sintaxe de comando diferente entre as versoes
- Frontend XR nao usa o core da linguagem atual
- Core atual nao expoe API/eventos para frontend

## 2) Objetivo de unificacao

Criar uma versao unica funcional onde:

1. A linguagem oficial e a do core atual.
2. O frontend XR vira camada de visualizacao/controle.
3. IA local (Ollama) continua sendo o backend de inferencia.
4. CLI e XR compartilham o mesmo estado de canais.

## 3) Arquitetura alvo (MVP unificado)

1. Engine (source of truth)
- Reusar modulos atuais: parser, channels, ai, runtime.
- Extrair loop para um servico reutilizavel (nao so CLI).

2. Bridge server (Node)
- API HTTP para enviar comandos da linguagem.
- WebSocket para publicar estado em tempo real.
- Endpoint de chat local com o mesmo provider de IA.

3. Cliente XR (frontend)
- Mantem 3D/audio/body tracking.
- Terminal envia linhas para a API do engine.
- UI recebe eventos por WebSocket e atualiza cena.

## 4) Contrato de eventos sugerido

WebSocket message types:

1. state_snapshot
- canais ativos com freq/speed/glitch/uncertainty/aiBuf

2. channel_update
- update por canal apos comando ou tick

3. ai_injection
- canal, delta, source (llm ou fallback)

4. system_status
- provider de IA, timeout, modelo

## 5) Mapeamento de comandos (compatibilidade)

Padrao oficial (core):
- line: "•1 ~220 >2 !0.3 ?0.5"
- especiais: :help :reset :llm :chat :quit

Compatibilidade no frontend XR:

1. Opcao A (recomendada)
- terminal XR adota diretamente a sintaxe oficial.

2. Opcao B (transicao)
- manter comandos play(), color(), etc.
- converter internamente para comandos oficiais quando aplicavel.
- exemplos:
  - glitch(7) -> !0.7 no canal ativo
  - rotate(2) -> >2 no canal ativo
  - comandos sem equivalente (ex: wireframe) ficam locais de UI.

## 6) Plano de migracao em 4 etapas

Etapa 1 - Servidor de integracao
1. Criar um servidor Node (src/server.js) com:
- POST /command (linha da linguagem)
- POST /chat (mensagem)
- GET /status
- WS /events
2. Reusar parser/channels/ai do core.

Etapa 2 - Publicacao de estado
1. Adicionar emissao de eventos no runtime/channels.
2. Broadcast por WebSocket em tick e ai_injection.

Etapa 3 - Adaptacao do XR
1. No App.tsx, trocar executor local por chamada HTTP /command.
2. Consumir WS /events para atualizar:
- glitch shader
- rotacao
- escala/energia visual
- logs
3. Manter Tone e body tracking como camada artistica local.

Etapa 4 - Qualidade unificada
1. Manter suites atuais (unit + black-box).
2. Adicionar black-box de integracao API+WS.
3. Cobrir falhas de rede e timeout de LLM.

## 7) Limpeza de dependencias

No pacote frontend, revisar e remover se nao usados:
- @google/genai
- express
- dotenv

Observacao:
- hoje o frontend ja funciona sem usar Gemini de fato.

## 8) Criterios de pronto da versao unica

1. Um unico comando de start em desenvolvimento para engine+XR.
2. CLI e XR alteram o mesmo estado de canais.
3. IA local unica (Ollama) para todos os clientes.
4. Fallback de IA preservado em todos os modos.
5. Testes black-box cobrindo contrato CLI, API e WS.

## 9) Decisao recomendada

Implementar primeiro um MVP unificado com:
- sintaxe oficial unica
- bridge HTTP/WS
- frontend XR como cliente do engine

Depois adicionar camada de compatibilidade para os comandos antigos do XR, se ainda for desejado por performance/uso ao vivo.
