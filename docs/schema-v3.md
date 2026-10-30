# Schema v3 — mapped show timing

Schema v3 adds the required root `tempoMap` to the v2 picture/move wire model. It changes count/time semantics, so it uses a new root version instead of optional v2 metadata: older readers must reject it rather than discard timing. See the public [JSON Schema](../format/squid-v3.schema.json), [example](../format/examples/tempo-v3.squid) and [tempo semantics](tempo-map.md).

```json
{
  "schemaVersion": 3,
  "tempoMap": {
    "version": 1,
    "regions": [{"startCount": 0, "endCount": 16, "startTempo": 120, "endTempo": 180}],
    "holds": [{"count": 8, "seconds": 2}]
  }
}
```

The snippet shows the added capability; all other required v2 production fields remain required. Each list has at most 256 events. Counts are whole, BPM is finite 20–400, and holds are finite 0.001–600 seconds. Regions must have positive length, fit the show and not overlap. Holds must use distinct counts from zero through one count before the end. The structural schema bounds values; the canonical codec additionally validates show length, ordering, overlap and uniqueness. Arrays canonicalize in count order; unknown informational properties are discarded.

V1 and v2 retain their existing migration and fixed-tempo durations. `parseProjectV2` remains the shared codec entry point and now accepts wire versions 1, 2 and 3; all produce canonical internal picture/move snapshots with `schemaVersion: 2`. The tempo map is retained in that internal model. `serializeProjectV2` emits wire version 3 for a nonempty map, and strips an empty map while emitting version 2 otherwise. Internal validation accepts the canonical model; raw v1/v2 files containing a tempo map are rejected with an instruction to use v3. Version 4 or later still requires an updated app.

The internal legacy oracle rejects mapped projects instead of pretending their time conversion survives a downgrade. Recovery serializes and reopens v3 through the same codec. Native file dialogs and `.squidpack` use that codec as well; the package container remains version 1 while carrying a v3 production. The project UTF-8 size limit remains 10 MiB.

`pnpm format:generate` writes all three schemas and the fixed-tempo/score/tempo examples. `pnpm format:check` verifies regeneration and independent schema/codec compatibility. `pnpm format:validate format/examples/tempo-v3.squid` validates a mapped production through both layers.
