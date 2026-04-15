
```
	 _                _    _            _           
	| |__  _ __ _   _| | _| |__   ___  | |__  _   _ 
	| '_ \| '__| | | | |/ / '_ \ / _ \ | '_ \| | | |
	| |_) | |  | |_| |   <| | | |  __/ | |_) | |_| |
	|_.__/|_|   \__,_|_|\_\_| |_|\___| |_.__/ \__, |
																						|___/ 
```

# Guia Visual e Didático da Linguagem

> _"O tempo nunca para. O erro é material. A IA é ruído fértil."_

---

## O que é?

**blackbox.exe** é um sistema de live coding performático, onde você manipula canais de sinais em tempo real usando uma linguagem minimalista baseada em símbolos. Cada comando é um gesto, cada canal é um fluxo, cada erro é parte da estética.

---

## Como rodar

1. Instale Node.js (v14+).
2. No terminal, execute:
	 ```sh
	 npm run dev
	 # ou
	 npm start
	 # ou
	 node index.js
	 ```

---

## MVP com LLM Local (Ollama)

Para usar conversa local + interferencia por LLM em baixa latencia:

1. Instale Ollama: https://ollama.com
2. Baixe um modelo pequeno e quantizado (recomendado):
	 ```sh
	 ollama pull qwen2.5:0.5b
	 ```
3. Inicie o servidor Ollama (normalmente em http://127.0.0.1:11434).
4. Rode o projeto:
	 ```sh
	 npm run dev
	 ```

Configuracoes opcionais por ambiente:

```sh
AI_PROVIDER=ollama
OLLAMA_MODEL=qwen2.5:0.5b
OLLAMA_BASE_URL=http://127.0.0.1:11434
AI_TIMEOUT_MS=220
```

Se o LLM demorar ou falhar, o sistema cai automaticamente para fallback aleatorio sem travar a performance.

---

## Docker: varios modelos prontos para teste

O projeto inclui multiplas configuracoes Docker para testar modelos locais sem setup manual de Ollama no host.

Perfis disponiveis:

1. qwen05b (mais leve): qwen2.5:0.5b
2. qwen15b (equilibrado): qwen2.5:1.5b
3. llama1b (alternativo): llama3.2:1b

Rodando com scripts npm:

```sh
npm run docker:qwen05b
# ou
npm run docker:qwen15b
# ou
npm run docker:llama1b
```

Rodando com docker compose direto:

```sh
docker compose --profile qwen05b up --build
docker compose --profile qwen15b up --build
docker compose --profile llama1b up --build
```

Portas no host:

- qwen05b -> 11434
- qwen15b -> 11435
- llama1b -> 11436

Observacao: o primeiro build baixa pesos do modelo e pode demorar.

---

## Anatomia de um Comando

```
	 •N ~F >S !G ?U
	 │  │  │  │  │
	 │  │  │  │  └─ Incerteza IA (0–1)
	 │  │  │  └──── Glitch (0–1)
	 │  │  └─────── Velocidade
	 │  └────────── Frequência (Hz)
	 └───────────── Canal N
```

### Exemplo visual

```
	•1 ~220 >2 !0.3 ?0.5
	•2 ~440 ?0.2
```

---

## Tabela de Símbolos

| Símbolo | Nome        | Função                                 |
|---------|-------------|----------------------------------------|
|   •N    | Canal N     | Seleciona canal                        |
|   ~F    | Frequência  | Define frequência (Hz)                 |
|   >S    | Velocidade  | Define velocidade temporal             |
|   !G    | Glitch      | Probabilidade de erro/ruído (0–1)      |
|   ?U    | Incerteza   | Grau de interferência da IA (0–1)      |

---

## Comandos Especiais

```
	:reset   # limpa todos os canais
	:llm     # mostra status do LLM local
	:chat X  # conversa com o LLM local (X = mensagem)
	:help    # mostra ajuda
	:quit    # encerra o sistema
```

---

## Exemplos Didáticos

### 1. Senoide básica
```
	•1 ~440
```
_Canal 1 com frequência de 440Hz._

### 2. Dois canais simultâneos
```
	•1 ~220 >2 !0.1
	•2 ~330 >1.5 ?0.3
```
_Canal 1: 220Hz, velocidade 2, glitch 0.1_
_Canal 2: 330Hz, velocidade 1.5, IA 0.3_

### 3. Explorando o erro
```
	•3 ~100 !1
```
_Canal 3 com máximo de glitch: comportamento caótico._

### 4. IA como ruído fértil
```
	•4 ~200 ?1
```
_Canal 4 com máxima incerteza: AI interfere constantemente._

---

## Visualização do Estado (exemplo de saída)

```
	•1  ∿ 440.0Hz  ▷ 1.0  ⚡ 0.00  ◇ 0.00
	•2  ∿ 330.0Hz  ▷ 1.5  ⚡ 0.00  ◇ 0.30  [ai:+12.3]
	[ai] •2 freq +12.3
```

---

## Dicas Práticas

* Cada linha digitada altera imediatamente o estado dos canais.
* Use `:reset` para limpar tudo e recomeçar.
* Frequências, velocidades e incertezas podem ser alteradas a qualquer momento.
* O erro (glitch) é proposital: experimente valores extremos!
* A IA interfere apenas se ?U > 0.
* Use `:help` a qualquer momento para relembrar a sintaxe.

---

## Arte ASCII: O Ciclo do Canal

```
				┌─────────────┐
				│  Comando    │
				└─────┬───────┘
							│
							▼
				┌─────────────┐
				│  Parser     │
				└─────┬───────┘
							│
							▼
				┌─────────────┐
				│  Canal N    │
				└─────┬───────┘
							│
							▼
				┌─────────────┐
				│  Render     │
				└─────┬───────┘
							│
							▼
				┌─────────────┐
				│  Saída      │
				└─────────────┘
```

---

## Resumo Visual da Sintaxe

```
	┌─────────────┬────────────┬────────────┬────────────┬────────────┐
	│   •N        │   ~F       │   >S       │   !G       │   ?U       │
	├─────────────┼────────────┼────────────┼────────────┼────────────┤
	│ Canal       │ Frequência │ Velocidade │ Glitch     │ Incerteza  │
	└─────────────┴────────────┴────────────┴────────────┴────────────┘
```

---

## Para ir além

Explore, erre, combine canais, abuse da IA. O sistema é seu laboratório performático.

---

_Para detalhes técnicos, consulte o código-fonte ou rode `:help` no terminal._
