import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey } from "nostr-tools";
import { isValidEvent, NaroRelay, publishEvent } from "../packages/protocol/src/relay";

function signedEvent(kind = 1) {
  return finalizeEvent(
    { kind, created_at: 1_700_000_000, tags: [], content: "Teste NARO" },
    generateSecretKey(),
  );
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) { this.sent.push(data); }
  close() {
    this.readyState = 3;
    this.onclose?.({} as CloseEvent);
  }
  open() {
    this.readyState = 1;
    this.onopen?.({} as Event);
  }
  message(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

describe("NARO event validation", () => {
  it("rejects null, arrays and malformed events", () => {
    expect(isValidEvent(null)).toBe(false);
    expect(isValidEvent([])).toBe(false);
    expect(isValidEvent({ id: "x" })).toBe(false);
  });

  it("rejects malformed tags and invalid hex fields", () => {
    expect(isValidEvent({
      id: "a".repeat(64), pubkey: "b".repeat(64), sig: "c".repeat(128),
      created_at: 1, kind: 1, tags: [["e", 3]], content: "x",
    })).toBe(false);
  });

  it("accepts a correctly signed Nostr event", () => {
    expect(isValidEvent(signedEvent())).toBe(true);
  });

  it("rejects an event whose content was changed after signing", () => {
    const event = signedEvent();
    expect(isValidEvent({ ...event, content: "Conteúdo adulterado" })).toBe(false);
  });

  it("rejects negative timestamps and event kinds", () => {
    const event = signedEvent();
    expect(isValidEvent({ ...event, created_at: -1 })).toBe(false);
    expect(isValidEvent({ ...event, kind: -1 })).toBe(false);
  });
});

describe("NARO relay behavior", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("subscribes only to text notes (kind 1)", async () => {
    const relay = new NaroRelay("wss://relay.example", () => {});
    const connected = relay.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await connected;
    const request = JSON.parse(socket.sent[0]);
    expect(request[0]).toBe("REQ");
    expect(request[2].kinds).toEqual([1]);
    relay.close();
  });

  it("does not deliver profile or contact-list events to the feed", async () => {
    const received: unknown[] = [];
    const relay = new NaroRelay("wss://relay.example", (event) => received.push(event));
    const connected = relay.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await connected;
    socket.message(["EVENT", "naro-feed", signedEvent(0)]);
    socket.message(["EVENT", "naro-feed", signedEvent(3)]);
    socket.message(["EVENT", "naro-feed", signedEvent(1)]);
    expect(received).toHaveLength(1);
    expect((received[0] as { kind: number }).kind).toBe(1);
    relay.close();
  });

  it("rejects a connection closed before opening", async () => {
    const relay = new NaroRelay("wss://relay.example", () => {});
    const connected = relay.connect();
    FakeWebSocket.instances[0].close();
    await expect(connected).rejects.toThrow("encerrada");
    relay.close();
  });

  it("refuses to publish an invalid or tampered event", async () => {
    const event = signedEvent();
    await expect(publishEvent("wss://relay.example", { ...event, content: "alterado" }))
      .rejects.toThrow("inválido");
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("resolves publication only after a matching relay OK", async () => {
    const event = signedEvent();
    const published = publishEvent("wss://relay.example", event);
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.message(["OK", event.id, true, ""]);
    await expect(published).resolves.toBeUndefined();
  });

  it("rejects a relay publication refusal", async () => {
    const event = signedEvent();
    const published = publishEvent("wss://relay.example", event);
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.message(["OK", event.id, false, "blocked"]);
    await expect(published).rejects.toThrow("blocked");
  });
});
