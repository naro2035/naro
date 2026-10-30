# NARO

Rede social descentralizada baseada no protocolo Nostr.

## Versão 0.2

Fundação web com React + TypeScript, integração de identidade por carteira NIP-07, feed de eventos Nostr, múltiplos relays independentes e validação criptográfica de eventos recebidos.

## Instalação

Requisitos: Node.js 20+ e npm 10+.

```bash
npm install
npm run dev
```

Verificações: `npm test` e `npm run build`.

## Segurança

A aplicação não recebe nem armazena chaves privadas. A assinatura é delegada à carteira NIP-07. Relays são serviços independentes; disponibilidade e retenção variam.

## Licença

AGPL-3.0-only.