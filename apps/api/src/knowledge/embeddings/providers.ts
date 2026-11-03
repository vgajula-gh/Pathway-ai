import {openaiEmbeddingClient} from '../../agent/llm/embedding-openai.js';
import { pineconeClient } from '../adapters/pinecone-client.js';
import { Embedder } from '../contracts.js';
import { setting } from '../../discovery/config.js';
export function getEmbedder(): Embedder | null {
  const provider = process.env.EMBEDDING_PROVIDER || 'none',
    model = process.env.EMBEDDING_MODEL;
  if (provider === 'openai' && process.env.OPENAI_API_KEY) {
    const c = openaiEmbeddingClient({apiKey:process.env.OPENAI_API_KEY!,timeout:20000});
    return {
      provider,
      model: model || 'text-embedding-3-small',
      dimension: setting('EMBEDDING_DIMENSION', 1536, 4096),
      async embed(input) {
        const r = await c.embeddings.create({ model: this.model, input, dimensions: this.dimension });
        return r.data.sort((a, b) => a.index - b.index).map((r) => r.embedding);
      },
    };
  }
  if (provider === 'pinecone' && process.env.PINECONE_API_KEY) {
    const pc = pineconeClient();
    return {
      provider,
      model: model || 'multilingual-e5-large',
      dimension: setting('EMBEDDING_DIMENSION', 1024, 4096),
      async embed(inputs, type) {
        const r = await pc.inference.embed({
          model: this.model,
          inputs,
          parameters: { inputType: type, truncate: 'END' },
        });
        return r.data.map((v) => (v.vectorType === 'dense' ? v.values : []));
      },
    };
  }
  if (provider === 'voyage' && process.env.VOYAGE_API_KEY)
    return {
      provider,
      model: model || 'voyage-3-lite',
      dimension: setting('EMBEDDING_DIMENSION', 512, 4096),
      async embed(input, type) {
        const r = await fetch('https://api.voyageai.com/v1/embeddings', {
          method: 'POST',
          signal: AbortSignal.timeout(20000),
          headers: {
            authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            input,
            input_type: type === 'passage' ? 'document' : 'query',
          }),
        });
        if (!r.ok) throw new Error('Embedding provider unavailable');
        const data = (await r.json()) as { data: { index: number; embedding: number[] }[] };
        return data.data.sort((a, b) => a.index - b.index).map((v) => v.embedding);
      },
    };
  if (provider === 'ollama') {
    const c=openaiEmbeddingClient({apiKey:'ollama',baseURL:process.env.OLLAMA_BASE_URL||'http://localhost:11434/v1',timeout:60000,local:true});
    return {
      provider,
      model: model || 'nomic-embed-text',
      dimension: setting('EMBEDDING_DIMENSION', 768, 4096),
      async embed(input) {
        const r = await c.embeddings.create({ model: this.model, input });
        return r.data.sort((a, b) => a.index - b.index).map((v) => v.embedding);
      },
    };
  }
  return null;
}
