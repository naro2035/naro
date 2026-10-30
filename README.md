# Naro

Rede social descentralizada baseada no protocolo Nostr.

## Visão do projeto

O Naro é uma aplicação independente que utiliza identidades Nostr e uma rede de relays independentes para permitir publicação e comunicação sem depender de um servidor central único.

## Arquitetura

```text
                    NARO
                      |
             Aplicativo independente
                      |
                Identidade Nostr
                      |
             Camada de comunicação
                      |
          +-----------+-----------+
          |           |           |
        Relay A     Relay B     Relay C
          |           |           |
       Região A    Região B    Região C
```

## Funcionalidades planejadas

- Criar ou importar identidade Nostr.
- Feed de publicações (eventos Nostr).
- Publicar textos e links.
- Responder, reagir e republicar.
- Conectar a múltiplos relays configuráveis.
- Interface responsiva para celular e computador.
- Controles de privacidade e segurança.

## Princípios técnicos

- Compatibilidade com os eventos e relays do protocolo Nostr.
- Identidade controlada pelo usuário.
- Nenhuma chave privada deve ser enviada ao servidor ou commitada neste repositório.
- Relays são independentes; a disponibilidade e a retenção de eventos dependem de cada relay.

## Etapas de desenvolvimento

1. Definir a estrutura da aplicação e a experiência inicial.
2. Implementar conexão Nostr e gerenciamento seguro de identidade.
3. Construir feed, publicação, respostas e reações.
4. Adicionar configuração de múltiplos relays.
5. Criar testes automatizados e documentação de implantação.

## Estado atual

Projeto iniciado. As funcionalidades acima são o escopo planejado e serão implementadas e testadas incrementalmente.
