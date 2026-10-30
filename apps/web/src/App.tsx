import { useEffect, useState } from "react";
import {
  DEFAULT_RELAYS,
  NaroRelay,
  publishToRelays,
  type NaroEvent,
  type RelayStatus,
} from "@naro/protocol";

export default function App() {
  const [posts, setPosts] = useState<NaroEvent[]>([]);
  const [key, setKey] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Record<string, RelayStatus>>({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const clients = DEFAULT_RELAYS.map(
      (url) =>
        new NaroRelay(
          url,
          (event) => {
            if (event.kind !== 1) return;
            setPosts((current) =>
              current.some((post) => post.id === event.id)
                ? current
                : [event, ...current]
                    .sort((a, b) => b.created_at - a.created_at)
                    .slice(0, 150),
            );
          },
          (nextStatus) => setStatus((current) => ({ ...current, [url]: nextStatus })),
        ),
    );

    clients.forEach((client) => void client.connect().catch(() => undefined));
    return () => clients.forEach((client) => client.close());
  }, []);

  async function login() {
    try {
      if (!window.nostr) {
        throw new Error("Instale uma carteira Nostr compatível com NIP-07.");
      }
      setKey(await window.nostr.getPublicKey());
      setNotice("Identidade conectada.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falha ao conectar.");
    }
  }

  async function publish() {
    if (!window.nostr || !key || !text.trim() || busy) return;

    setBusy(true);
    try {
      const event = await window.nostr.signEvent({
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: text.trim(),
      });
      if (event.pubkey !== key || event.kind !== 1 || event.content !== text.trim()) {
        throw new Error("A carteira retornou um evento diferente do conteúdo assinado.");
      }
      const result = await publishToRelays(event);
      setText("");
      setNotice(
        `Publicado em ${result.accepted} de ${result.total} relays.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falha ao publicar.");
    } finally {
      setBusy(false);
    }
  }

  const online = Object.values(status).filter((value) => value === "connected").length;

  return (
    <main>
      <header>
        <div>
          <h1>NARO</h1>
          <p>Uma rede. Milhares de servidores. Nenhum proprietário central.</p>
        </div>
        <button onClick={login}>
          {key ? "Identidade conectada" : "Conectar Nostr"}
        </button>
      </header>

      <p className="network">
        {online}/{DEFAULT_RELAYS.length} relays conectados
      </p>

      <section className="panel">
        <h2>O que está acontecendo?</h2>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={5000}
          placeholder="Compartilhe suas ideias..."
        />
        <div className="actions">
          <small>{text.length}/5000</small>
          <button
            disabled={!key || !text.trim() || busy}
            onClick={publish}
          >
            {busy ? "Publicando..." : "Publicar"}
          </button>
        </div>
        <small>Chaves privadas permanecem na carteira NIP-07.</small>
      </section>

      {notice && <p role="status">{notice}</p>}

      <h2>Feed da rede</h2>
      {posts.map((post) => (
        <article className="panel" key={post.id}>
          <small>{post.pubkey.slice(0, 12)}…</small>
          <p>{post.content}</p>
          <small>{new Date(post.created_at * 1000).toLocaleString()}</small>
        </article>
      ))}
      {!posts.length && <p>Carregando publicações dos relays...</p>}
      <footer>NARO · AGPL-3.0 · Nostr</footer>
    </main>
  );
}

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: {
        kind: number;
        created_at: number;
        tags: string[][];
        content: string;
      }): Promise<NaroEvent>;
    };
  }
}
