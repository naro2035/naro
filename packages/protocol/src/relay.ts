import { getEventHash, verifyEvent } from "nostr-tools";

export interface NaroEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export type RelayStatus = "connecting" | "connected" | "disconnected" | "error";

export const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
] as const;

type Handler = (event: NaroEvent) => void;
const SUBSCRIPTION_ID = "naro-feed";
const CONNECTION_TIMEOUT_MS = 10_000;
const PUBLISH_TIMEOUT_MS = 10_000;

export function isValidEvent(value: unknown): value is NaroEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const event = value as Partial<NaroEvent>;
  if (
    typeof event.id !== "string" ||
    !/^[0-9a-f]{64}$/i.test(event.id) ||
    typeof event.pubkey !== "string" ||
    !/^[0-9a-f]{64}$/i.test(event.pubkey) ||
    typeof event.sig !== "string" ||
    !/^[0-9a-f]{128}$/i.test(event.sig) ||
    typeof event.content !== "string" ||
    !Number.isSafeInteger(event.created_at) ||
    (event.created_at as number) < 0 ||
    !Number.isSafeInteger(event.kind) ||
    (event.kind as number) < 0 ||
    !Array.isArray(event.tags) ||
    !event.tags.every(
      (tag) => Array.isArray(tag) && tag.every((item) => typeof item === "string"),
    )
  ) {
    return false;
  }

  try {
    return getEventHash(event as NaroEvent) === event.id && verifyEvent(event as NaroEvent);
  } catch {
    return false;
  }
}

export class NaroRelay {
  private socket?: WebSocket;
  private stopped = false;
  private retry = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  constructor(
    public readonly url: string,
    private readonly onEvent: Handler,
    private readonly onStatus?: (status: RelayStatus) => void,
  ) {}

  connect(): Promise<void> {
    this.stopped = false;

    return new Promise((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout>;

      const settle = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve();
      };

      let socket: WebSocket;
      try {
        socket = new WebSocket(this.url);
      } catch (error) {
        this.onStatus?.("error");
        reject(error instanceof Error ? error : new Error("Falha ao criar conexão"));
        return;
      }

      this.socket = socket;
      this.onStatus?.("connecting");

      timeout = setTimeout(() => {
        settle(new Error("Tempo esgotado ao conectar ao relay"));
        socket.close();
      }, CONNECTION_TIMEOUT_MS);

      socket.onopen = () => {
        try {
          socket.send(JSON.stringify(["REQ", SUBSCRIPTION_ID, { kinds: [1], limit: 50 }]));
          this.retry = 0;
          this.onStatus?.("connected");
          settle();
        } catch {
          this.onStatus?.("error");
          settle(new Error("Falha ao iniciar assinatura no relay"));
          socket.close();
        }
      };

      socket.onmessage = (message) => {
        try {
          const data = JSON.parse(String(message.data));
          if (
            Array.isArray(data) &&
            data[0] === "EVENT" &&
            data[1] === SUBSCRIPTION_ID &&
            isValidEvent(data[2]) &&
            data[2].kind === 1
          ) {
            this.onEvent(data[2]);
          }
        } catch {
          // Frames inválidos são ignorados.
        }
      };

      socket.onerror = () => {
        this.onStatus?.("error");
        settle(new Error("Falha de conexão com relay"));
      };

      socket.onclose = () => {
        this.onStatus?.("disconnected");
        settle(new Error("Conexão com relay encerrada antes de completar"));
        if (!this.stopped) this.scheduleReconnect();
      };
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.stopped) return;

    const delay = Math.min(30_000, 1_000 * 2 ** this.retry++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (!this.stopped) void this.connect().catch(() => undefined);
    }, delay);
  }

  close() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;

    const socket = this.socket;
    this.socket = undefined;
    if (!socket) return;

    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(["CLOSE", SUBSCRIPTION_ID]));
      } catch {
        // O socket pode ter fechado entre a checagem e o envio.
      }
    }
    socket.close();
  }
}

export async function publishEvent(url: string, event: unknown): Promise<void> {
  if (!isValidEvent(event)) {
    throw new Error("Evento Nostr inválido ou assinatura não confere");
  }

  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(url);
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
      if (error) reject(error);
      else resolve();
    };

    const timeout = setTimeout(
      () => finish(new Error("Tempo esgotado ao publicar")),
      PUBLISH_TIMEOUT_MS,
    );

    socket.onopen = () => {
      try {
        socket.send(JSON.stringify(["EVENT", event]));
      } catch {
        finish(new Error("Falha ao enviar evento ao relay"));
      }
    };

    socket.onmessage = (message) => {
      try {
        const data = JSON.parse(String(message.data));
        if (Array.isArray(data) && data[0] === "OK" && data[1] === event.id) {
          if (data[2] === true) finish();
          else finish(new Error(String(data[3] ?? "Relay rejeitou o evento")));
        }
      } catch {
        // Aguarda uma resposta OK válida.
      }
    };

    socket.onerror = () => finish(new Error("Erro de rede ao publicar"));
    socket.onclose = () => finish(new Error("Conexão encerrada antes da confirmação"));
  });
}

export async function publishToRelays(
  event: unknown,
  urls: readonly string[] = DEFAULT_RELAYS,
) {
  if (!isValidEvent(event)) {
    throw new Error("Evento Nostr inválido ou assinatura não confere");
  }
  if (urls.length === 0) throw new Error("Nenhum relay configurado");

  const results = await Promise.allSettled(urls.map((url) => publishEvent(url, event)));
  const accepted = results.filter((result) => result.status === "fulfilled").length;

  if (!accepted) throw new Error("Nenhum relay aceitou a publicação");
  return { accepted, total: urls.length };
}
