# Explore source and Pinecone recovery

This repair uses existing tables and Secrets. It does not reset student records, raise production limits or create a new index. SQL owns the program cards; Pinecone stores embeddings of actual saved public program text for questions. A working search or visible card does not prove a vector was written.

## Document-index compatibility follow-up

Keep the existing `pathway-vectors` index. Pathway now inspects its schema and selects the matching API automatically:

| Index schema | How Pathway writes and searches |
|---|---|
| Classic `_values` dense vector | Existing Vectors API, with the configured external embedder |
| A single caller-named `dense_vector` field | Documents API with externally generated vectors |
| A single `string` field with dense `embed`, such as `chunk_text` | Documents API with public passage text; Pinecone embeds writes and fixed public-topic queries |

The reported schema (`title` plus `chunk_text.embed.model=text-embedding-3-small`, dimension 1536, cosine) is supported directly. No replacement index, field rename, migration or new Secret is required. Full-text-only, sparse-only, ambiguous dense fields, reserved-metadata collisions and unsupported legacy integrated `semantic_text` shapes still fail with a controlled setup message. A cosine metric is required.

For integrated text, the index's frozen model/dimension is authoritative; `EMBEDDING_MODEL`/`EMBEDDING_DIMENSION` do not override it. Runtime initialization does not require a separate external embedding credential for that mode. General AI/search credentials are still needed for their own features. Pathway makes no separate direct OpenAI passage/query embedding request in integrated mode. External-vector indexes continue to require the configured external embedder and matching dimensions.

Raw student questions, names, IDs, profiles and chat history are never sent as Pinecone text. Integrated queries are constructed solely from fixed public topics (requirements, fees/aid, dates, eligibility, location, accessibility and similar program topics), inferred locally from the question. Unrecognized questions use a generic program-overview query. This privacy boundary can make unusual questions less precise; the original wording is used only for local reranking and the existing answer workflow. Scope remains server-owned and SQL revalidates every returned chunk. Only actual saved public program passages and public program metadata are uploaded.

After publishing this follow-up, start with the existing read-only command below. Expected owner fields for this index:

```json
{
  "configurationReady": true,
  "index": "pathway-vectors",
  "indexDetails": {"api": "documents", "input": "text", "field": "chunk_text"},
  "embedding": {"provider": "pinecone-integrated", "model": "text-embedding-3-small", "dimension": 1536}
}
```

If usage remains 30/30, setup may be ready while `allowance.available` is false. The owner can choose `DISCOVERY_RECHECKS_PER_MONTH=31` in Publishing to permit one additional preparation attempt, then republish. This is a proposal for one test, not an automatic limit change. Background work may use available allowance; always check the fresh report before funding work.

Integrated embedding and writing happen in one metered Documents API request. `indexing.embeddingMode=pinecone-integrated` distinguishes this from external embedding. Attempts are recorded before the request; embedding success is recorded only after the complete write acknowledgement. SQL chunks are committed only when the acknowledged count matches the submitted count. Errors, partial acknowledgements and unknown outcomes are not automatically retried. All existing monthly reservations, per-run caps, worker leases and explicit owner retry bounds remain enforced.

The protocol regression test uses the actual installed Pinecone SDK with mocked HTTP responses, the owner-reported schema, SQL chunk storage, scoped question answering and document retirement. A real SDK authorization failure is also tested with no silent retry or raw error leakage. These offline tests do not establish that a live production write succeeded. Pinecone documents the API distinction in its [integrated embedding guide](https://docs.pinecone.io/guides/search/integrated-embedding).

## What changes

- Known Maps and search listings cannot become recommendations, satisfy catalog coverage or trigger source preparation. An explicit Google redirect is resolved only when it contains a real safe HTTPS target. Real Google-hosted program sites remain supported. Unknown program details remain warnings; confirmed expiration still hides a real program. PDFs remain useful links but are not automatically embedded.
- Existing listing records/history are preserved. A current-cycle successful personal search slot whose only results were listings is restored once, with an audit event. Paid shared usage is retained.
- Preparation prioritizes saved readable text. It does not refetch an old page solely to embed it, invent a SourcePage from model prose, or change its check dates. Old source-backed facts display as stale after 30 days.
- An unfunded `limited` attempt can recover when the real shared allowance becomes available. Failed/unknown paid attempts require explicit owner retry. A running lease expires after five minutes; interrupted work is not silently replayed. Owner retry is bounded to two funded knowledge runs per program per UTC day.
- Student cards distinguish preparing, monthly allowance, missing readable source and owner-retry states. Other links and saved progress remain available.
- Diagnostics distinguish embedding calls attempted/succeeded, vector records attempted/acknowledged, and SQL chunks committed. Old `embeddings` and `vectorUpserts` usage values are attempt counters, not proof of stored records.

## After merging and publishing

Sync the repair, install dependencies and publish normally. No migration or new Secret is required for this patch; earlier migrations must already be applied. Run the commands below from the Replit **workspace Shell**, where `JOBS_SECRET` must match the existing Publishing Secret. Publishing-only Secrets are not automatically copied to the Shell. Never paste the Secret into chat, a browser URL or command arguments.

First read the connection and allowance report:

```sh
npm run check:knowledge -- --url https://pathway-ai.replit.app
```

This performs database/index reads, including dimension and namespace checks. It sends **zero embedding or search requests**, changes no records and consumes no application allowance. It can make Pinecone read requests. Check:

| Report | Meaning / next step |
|---|---|
| `configurationReady: false` | Inspect `issue` and safe `failure` fields before attempting paid work. |
| `vector_dimension_mismatch` | Embedding and index dimensions differ; align them with the existing index/data plan. |
| `vector_index_type_mismatch` | No single supported dense-vector or embedded-text field could be selected safely. |
| `providerError: authorization` or `not_found` | Check the published key's project/index access and index name. |
| `knowledge_storage_unready` | Apply the already-versioned missing schema through the normal Replit flow; do not reset data. |
| `namespaceRecords` | Records visible specifically in `opportunities`, not the default namespace. |
| `allowance.used` / `limit` | Shared `DISCOVERY_RECHECKS_PER_MONTH` usage; standalone preparation shares this existing allowance. |
| `aiUsed` / `aiLimit` | Overall `AI_MONTHLY_LIMIT` reservation count. |

Choose a public program ID from `programs` with saved source pages, then inspect it:

```sh
npm run check:knowledge -- --url https://pathway-ai.replit.app --program PROGRAM_ID
```

`program.sqlReady` checks current source/model/store generations in SQL. `vectorConfirmation: confirmed` means all matching IDs were read back from the configured index. `pending_or_missing` means visibility has not been confirmed; Pinecone can be eventually consistent. `not_checked` means no matching chunks or the adapter lacks ID reads. None of these labels independently certifies that a program is currently accepting applications.

Only when the owner chooses to fund **one** preparation/retry:

```sh
npm run check:knowledge -- --url https://pathway-ai.replit.app --mode prepare --program PROGRAM_ID --allow-paid
```

This can send paid embedding requests. Existing configured caps still apply. If the shared preparation allowance is already **30/30**, this command will stop until the owner changes that limit or the UTC month resets. Increasing only the search-batch budget does not create preparation room. This patch never raises either cap or deletes usage history.

Inspect the returned report, then run the read-only program command again. Successful recovery shows current SQL chunks and matching IDs in the `opportunities` namespace; questions become available for students whose picks/Interested list includes that program. A received HTTP 200 or vector acknowledgement alone is not a final success claim. The CLI returns a failing exit code for setup failures or preparation without both ready SQL chunks and confirmed ID read-back. If visibility is pending, repeat only the read-only check after a short delay, not another paid preparation request. An adapter without ID read-back cannot receive a confirmed CLI result.

## Diagnosing a failed attempt

`recentRuns` includes knowledge and recheck jobs even when `promptVersion` is empty. Each new knowledge run records its phase before/after paid stages. Safe failure fields identify `component` and `operation`, controlled database codes/table/column, dimensions or known Pinecone error class. Raw SQL, provider bodies and credentials are excluded.

| Counters / failure | Interpretation |
|---|---|
| Embedding attempted > succeeded | Embedding provider failed or outcome was not recorded; inspect `embed`. |
| Embedding succeeded, vector attempted > acknowledged | Vector write failed/unknown; inspect `upsert`. |
| Vectors acknowledged > SQL committed | Vector service accepted work but database commit failed/unknown; inspect `chunk_commit`. |
| SQL ready, IDs pending/missing | Read again after index visibility delay; an explicit owner retry can repair missing vectors. |
| No source pages | A useful link may exist, but no actual readable text is available to embed. |

Historical rows cannot acquire exception details that were never recorded. Unknown interrupted work retains its paid reservation and requires owner action.

## Release checks

Run `npm test`, `npm run typecheck`, `npm run typecheck:evals`, `npm run eval:explore` and `npm run build`. The offline suite includes listing rejection, unfunded-marker recovery, source reuse, retained limits, safe database/provider failures, vector/SQL partial failure, stale source labels, scoped answers and an actual Pinecone SDK round trip through mocked HTTP transport. The 15-case replay adds source-quality/recovery checks to Drop A. No real Pinecone/OpenAI request is made by these tests; use the owner checks above to verify the published connection.
