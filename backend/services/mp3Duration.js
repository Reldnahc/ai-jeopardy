// Minimal MP3 frame header parsing to estimate duration from:
// durationMs ~= (audioBytes * 8 * 1000) / bitratebps
// Works well for constant bitrate MP3 (Polly is typically CBR in practice).

function readSynchsafeInt(b0, b1, b2, b3) {
    // ID3 uses 7 bits per byte
    return ((b0 & 0x7f) << 21) | ((b1 & 0x7f) << 14) | ((b2 & 0x7f) << 7) | (b3 & 0x7f);
}

function skipId3(buf) {
    if (buf.length < 10) return 0;
    if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return 0; // "ID3"
    const size = readSynchsafeInt(buf[6], buf[7], buf[8], buf[9]);
    return 10 + size;
}

function findFirstFrameHeader(buf, start) {
    for (let i = start; i + 4 <= buf.length; i++) {
        // sync: 11 bits set => 0xFF followed by 0xE0 mask
        if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) return i;
    }
    return -1;
}

// Tables from MPEG spec
const BITRATE_KBPS = {
    // key: `${version}:${layer}` where version: 1 | 2 (covers 2 and 2.5), layer: 3|2|1
    "1:3": [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0],   // MPEG1 Layer III
    "1:2": [0,32,48,56,64,80,96,112,128,160,192,224,256,320,384,0],  // MPEG1 Layer II
    "1:1": [0,32,64,96,128,160,192,224,256,288,320,352,384,416,448,0],// MPEG1 Layer I
    "2:3": [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0],       // MPEG2/2.5 Layer III
    "2:2": [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0],       // MPEG2/2.5 Layer II
    "2:1": [0,32,48,56,64,80,96,112,128,144,160,176,192,224,256,0],  // MPEG2/2.5 Layer I
};

export function estimateMp3DurationMsFromHeaderBytes( headerBytes, totalBytes ) {
    if (!headerBytes || headerBytes.length < 16 || !Number.isFinite(totalBytes) || totalBytes <= 0) return null;

    const id3Skip = skipId3(headerBytes);
    const hdrPos = findFirstFrameHeader(headerBytes, id3Skip);
    if (hdrPos < 0) return null;

    const b1 = headerBytes[hdrPos + 1];
    const b2 = headerBytes[hdrPos + 2];

    // Version ID (2 bits)
    // 00 = MPEG 2.5, 01 = reserved, 10 = MPEG2, 11 = MPEG1
    const versionId = (b1 >> 3) & 0x03;
    const version = (versionId === 0x03) ? 1 : 2; // treat 2 and 2.5 as "2" for bitrate table

    // Layer (2 bits): 01=Layer III, 10=Layer II, 11=Layer I
    const layerId = (b1 >> 1) & 0x03;
    let layer;
    if (layerId === 0x01) layer = 3;
    else if (layerId === 0x02) layer = 2;
    else if (layerId === 0x03) layer = 1;
    else return null;

    const bitrateIndex = (b2 >> 4) & 0x0f;
    const table = BITRATE_KBPS[`${version}:${layer}`];
    if (!table) return null;

    const kbps = table[bitrateIndex] || 0;
    if (!kbps) return null;

    const bitrateBps = kbps * 1000;
    const durationMs = Math.round((totalBytes * 8 * 1000) / bitrateBps);

    // clamp to sane bounds so we never deadlock on garbage
    if (!Number.isFinite(durationMs) || durationMs < 0) return null;
    return Math.min(durationMs, 60_000); // no clue narration should be > 60s
}
