# Arquitetura NARO

A aplicação web consome o pacote compartilhado `@naro/protocol`. O pacote encapsula WebSocket, eventos Nostr e publicação. Cada relay é independente. Eventos recebidos são validados criptograficamente antes de aparecer no feed. A identidade e a assinatura são delegadas a carteiras NIP-07.
