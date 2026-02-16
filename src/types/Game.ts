export interface BuzzPayload {
    type: "buzz";
    gameId: string;
    clientBuzzPerfMs: number;
    clientSeq: number;
    syncAgeMs: number;
    estimatedServerBuzzAtMs?: number;
}