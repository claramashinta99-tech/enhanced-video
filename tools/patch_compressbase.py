#!/usr/bin/env python3
"""
CompressBase Exact MP4 Patcher for TikTok HD
(c) 2026 Enhanced Video / RVL Media

Usage:
  python patch_compressbase.py input.mp4 [output.mp4]
"""

import os
import struct
import sys
from pathlib import Path

# Exact CompressBase Track 1 UDTA Box (171 bytes)
CB_UDTA = bytes.fromhex(
    "000000ab75647461000000a36d657461000000000000002168646c720000000000000000"
    "6d6469720000000000000000000000000000000076696c73740000003aa9746f6f000000"
    "32646174610000000100000000436f6d707265737362617365205175616c697479204d65"
    "74686f64202b204670730000000034a9636d740000002c64617461000000010000000050"
    "61746368656420627920436f6d7072657373626173652e636f6d00"
)

CONTAINERS = {b"moov", b"trak", b"mdia", b"minf", b"stbl", b"dinf", b"edts", b"udta", b"meta", b"ilst"}

def u32(b, o=0):
    return struct.unpack(">I", b[o:o+4])[0]

def set_u32(b, o, val):
    struct.pack_into(">I", b, o, val & 0xffffffff)

def u64(b, o=0):
    return struct.unpack(">Q", b[o:o+8])[0]

def set_u64(b, o, val):
    struct.pack_into(">Q", b, o, val)

def parse_boxes(data, offset=0, end=None):
    if end is None: end = len(data)
    boxes = []
    curr = offset
    while curr + 8 <= end:
        sz = u32(data, curr)
        btype = bytes(data[curr+4:curr+8])
        hlen = 8
        if sz == 1:
            sz = u64(data, curr+8)
            hlen = 16
        elif sz == 0:
            sz = end - curr
        if sz < hlen: break
        cstart = curr + (12 if btype == b"meta" else hlen)
        boxes.append({"type": btype, "p": curr, "size": sz, "cstart": cstart, "cend": curr + sz})
        curr += sz
    return boxes

def find_box(data, path, offset=0, end=None):
    if not path: return None
    for b in parse_boxes(data, offset, end):
        if b["type"] == path[0]:
            if len(path) == 1: return b
            res = find_box(data, path[1:], b["cstart"], b["cend"])
            if res: return res
    return None

def find_nodes(data, btype, offset=0, end=None, res=None):
    if res is None: res = []
    for b in parse_boxes(data, offset, end):
        if b["type"] == btype: res.append(b)
        if b["type"] in CONTAINERS:
            find_nodes(data, btype, b["cstart"], b["cend"], res)
    return res

def shift_chunk_offsets(data, delta):
    for box in find_nodes(data, b"stco") + find_nodes(data, b"co64"):
        is64 = box["type"] == b"co64"
        entry_sz = 8 if is64 else 4
        cnt = u32(data, box["cstart"] + 4)
        for i in range(cnt):
            pos = box["cstart"] + 8 + i * entry_sz
            if is64:
                set_u64(data, pos, u64(data, pos) + delta)
            else:
                set_u32(data, pos, u32(data, pos) + delta)

def apply_compressbase_patch(raw_bytes: bytes, factor=10) -> bytes:
    p = bytearray(raw_bytes)

    # 1. Remove free/skip boxes
    mdat = find_box(p, [b"mdat"])
    mdat_pos = mdat["p"] if mdat else len(p)
    boxes = parse_boxes(p)
    for b in reversed(boxes):
        if b["type"] in (b"free", b"skip"):
            is_before = b["p"] < mdat_pos
            del p[b["p"]:b["cend"]]
            if is_before:
                shift_chunk_offsets(p, -b["size"])

    # 2. Inject UDTA into Track 1 (Video)
    traks = find_nodes(p, b"trak")
    vid_track = None
    for t in traks:
        hdlr = find_box(p, [b"mdia", b"hdlr"], t["cstart"], t["cend"])
        if hdlr and bytes(p[hdlr["cstart"]+8:hdlr["cstart"]+12]) == b"vide":
            vid_track = t
            break
    if not vid_track and traks:
        vid_track = traks[0]

    if vid_track:
        old_udta = find_box(p, [b"udta"], vid_track["cstart"], vid_track["cend"])
        if old_udta:
            del p[old_udta["p"]:old_udta["cend"]]
            set_u32(p, vid_track["p"], vid_track["size"] - old_udta["size"])
            moov = find_box(p, [b"moov"])
            set_u32(p, moov["p"], moov["size"] - old_udta["size"])
            shift_chunk_offsets(p, -old_udta["size"])

        # Re-fetch vid_track
        traks = find_nodes(p, b"trak")
        vid_track = next((t for t in traks if find_box(p, [b"mdia", b"hdlr"], t["cstart"], t["cend"]) and bytes(p[find_box(p, [b"mdia", b"hdlr"], t["cstart"], t["cend"])["cstart"]+8:find_box(p, [b"mdia", b"hdlr"], t["cstart"], t["cend"])["cstart"]+12]) == b"vide"), traks[0])

        p[vid_track["cend"]:vid_track["cend"]] = CB_UDTA
        set_u32(p, vid_track["p"], vid_track["size"] + len(CB_UDTA))
        moov = find_box(p, [b"moov"])
        set_u32(p, moov["p"], moov["size"] + len(CB_UDTA))
        shift_chunk_offsets(p, len(CB_UDTA))

    # 3. Strip udta under moov root
    moov_udta = find_box(p, [b"moov", b"udta"])
    if moov_udta:
        del p[moov_udta["p"]:moov_udta["cend"]]
        moov = find_box(p, [b"moov"])
        set_u32(p, moov["p"], moov["size"] - moov_udta["size"])
        shift_chunk_offsets(p, -moov_udta["size"])

    # 4. Clone Audio Track as Track 3 (Keeping edts on Track 1 & Track 2)
    traks = find_nodes(p, b"trak")
    audio_track = None
    for t in traks:
        hdlr = find_box(p, [b"mdia", b"hdlr"], t["cstart"], t["cend"])
        if hdlr and bytes(p[hdlr["cstart"]+8:hdlr["cstart"]+12]) == b"soun":
            audio_track = t
            break
    if not audio_track:
        raise ValueError("Audio track not found in video")

    max_trak_id = max(u32(p, find_box(p, [b"tkhd"], t["cstart"], t["cend"])["cstart"] + 12) for t in traks if find_box(p, [b"tkhd"], t["cstart"], t["cend"]))
    new_trak_id = max_trak_id + 1

    t3_bytes = bytearray(p[audio_track["p"]:audio_track["cend"]])
    # Strip edts and udta from Track 3
    t3_edts = find_box(t3_bytes, [b"edts"], 8, len(t3_bytes))
    if t3_edts:
        del t3_bytes[t3_edts["p"]:t3_edts["cend"]]
        set_u32(t3_bytes, 0, len(t3_bytes))
    t3_udta = find_box(t3_bytes, [b"udta"], 8, len(t3_bytes))
    if t3_udta:
        del t3_bytes[t3_udta["p"]:t3_udta["cend"]]
        set_u32(t3_bytes, 0, len(t3_bytes))

    # Update Track 3 tkhd track_id
    t3_tkhd = find_box(t3_bytes, [b"tkhd"], 8, len(t3_bytes))
    set_u32(t3_bytes, t3_tkhd["cstart"] + 12, new_trak_id)

    # Insert Track 3 at moov.cend
    moov = find_box(p, [b"moov"])
    p[moov["cend"]:moov["cend"]] = t3_bytes
    set_u32(p, moov["p"], moov["size"] + len(t3_bytes))
    shift_chunk_offsets(p, len(t3_bytes))

    # 5. Track 3 Factor 10 sample table patch
    traks = find_nodes(p, b"trak")
    t3 = traks[-1]
    stsz = find_box(p, [b"mdia", b"minf", b"stbl", b"stsz"], t3["cstart"], t3["cend"])
    stsc = find_box(p, [b"mdia", b"minf", b"stbl", b"stsc"], t3["cstart"], t3["cend"])
    stco = find_box(p, [b"mdia", b"minf", b"stbl", b"stco"], t3["cstart"], t3["cend"]) or find_box(p, [b"mdia", b"minf", b"stbl", b"co64"], t3["cstart"], t3["cend"])

    sample_cnt = u32(p, stsz["cstart"] + 8)
    extra_samples = sample_cnt * (factor - 1)
    is64 = stco["type"] == b"co64"
    entry_sz = 8 if is64 else 4
    orig_chunks = u32(p, stco["cstart"] + 4)
    stsc_entries = u32(p, stsc["cstart"] + 4)

    # Expand stsz
    new_stsz_entries = bytearray(4 * extra_samples)
    for i in range(extra_samples):
        set_u32(new_stsz_entries, i * 4, 8) # sample size 8
    p[stsz["cend"]:stsz["cend"]] = new_stsz_entries
    set_u32(p, stsz["cstart"] + 8, sample_cnt + extra_samples)
    set_u32(p, stsz["p"], stsz["size"] + len(new_stsz_entries))

    # Expand stco (1 extra chunk pointing to EOF)
    t3 = find_nodes(p, b"trak")[-1]
    stco = find_box(p, [b"mdia", b"minf", b"stbl", b"stco"], t3["cstart"], t3["cend"]) or find_box(p, [b"mdia", b"minf", b"stbl", b"co64"], t3["cstart"], t3["cend"])
    p[stco["cend"]:stco["cend"]] = bytearray(entry_sz)
    set_u32(p, stco["cstart"] + 4, orig_chunks + 1)
    set_u32(p, stco["p"], stco["size"] + entry_sz)

    # Expand stsc (1 extra entry: 12 bytes)
    t3 = find_nodes(p, b"trak")[-1]
    stsc = find_box(p, [b"mdia", b"minf", b"stbl", b"stsc"], t3["cstart"], t3["cend"])
    extra_stsc = bytearray(12)
    set_u32(extra_stsc, 0, orig_chunks + 1)
    set_u32(extra_stsc, 4, extra_samples)
    set_u32(extra_stsc, 8, 1)
    p[stsc["cend"]:stsc["cend"]] = extra_stsc
    set_u32(p, stsc["cstart"] + 4, stsc_entries + 1)
    set_u32(p, stsc["p"], stsc["size"] + 12)

    # Expand stts (1 extra entry: 8 bytes)
    t3 = find_nodes(p, b"trak")[-1]
    stts = find_box(p, [b"mdia", b"minf", b"stbl", b"stts"], t3["cstart"], t3["cend"])
    stts_cnt = u32(p, stts["cstart"] + 4)
    extra_stts = bytearray(8)
    set_u32(extra_stts, 0, extra_samples)
    set_u32(extra_stts, 4, 1)
    p[stts["cend"]:stts["cend"]] = extra_stts
    set_u32(p, stts["cstart"] + 4, stts_cnt + 1)
    set_u32(p, stts["p"], stts["size"] + 8)

    # Update parent container sizes for Track 3
    stbl_growth = len(new_stsz_entries) + entry_sz + 12 + 8
    t3 = find_nodes(p, b"trak")[-1]
    stbl = find_box(p, [b"mdia", b"minf", b"stbl"], t3["cstart"], t3["cend"])
    minf = find_box(p, [b"mdia", b"minf"], t3["cstart"], t3["cend"])
    mdia = find_box(p, [b"mdia"], t3["cstart"], t3["cend"])
    set_u32(p, stbl["p"], stbl["size"] + stbl_growth)
    set_u32(p, minf["p"], minf["size"] + stbl_growth)
    set_u32(p, mdia["p"], mdia["size"] + stbl_growth)
    set_u32(p, t3["p"], t3["size"] + stbl_growth)
    moov = find_box(p, [b"moov"])
    set_u32(p, moov["p"], moov["size"] + stbl_growth)
    shift_chunk_offsets(p, stbl_growth)

    # 6. Update mvhd to Version 1 64-bit with duration = 0xFFFFFFFFFFFFFFFF
    mvhd = find_box(p, [b"moov", b"mvhd"])
    new_mvhd = bytearray(120)
    set_u32(new_mvhd, 0, 120)
    new_mvhd[4:8] = b"mvhd"
    new_mvhd[8] = 1 # version 1
    set_u32(new_mvhd, 28, 1000) # timescale = 1000
    set_u64(new_mvhd, 32, 0xffffffffffffffff) # duration = UINT64_MAX
    set_u32(new_mvhd, 40, 0x00010000) # rate 1.0
    struct.pack_into(">H", new_mvhd, 44, 0x0100) # volume 1.0
    new_mvhd[56:56+36] = bytes.fromhex("000100000000000000000000000000000001000000000000000000000000000040000000")
    set_u32(new_mvhd, 116, 4) # next_track_id = 4

    mvhd_delta = len(new_mvhd) - mvhd["size"]
    p[mvhd["p"]:mvhd["cend"]] = new_mvhd
    moov = find_box(p, [b"moov"])
    set_u32(p, moov["p"], moov["size"] + mvhd_delta)
    shift_chunk_offsets(p, mvhd_delta)

    # 7. Point the last chunk of Track 3 to mdat.cend
    t3 = find_nodes(p, b"trak")[-1]
    stco = find_box(p, [b"mdia", b"minf", b"stbl", b"stco"], t3["cstart"], t3["cend"]) or find_box(p, [b"mdia", b"minf", b"stbl", b"co64"], t3["cstart"], t3["cend"])
    mdat = find_box(p, [b"mdat"])
    last_chunk_pos = stco["cstart"] + 8 + orig_chunks * entry_sz
    if is64:
        set_u64(p, last_chunk_pos, mdat["cend"])
    else:
        set_u32(p, last_chunk_pos, mdat["cend"])

    # 8. Append crash pattern (00 00 00 04 00 00 00 00) ending with 8-byte free box
    crash_bytes = extra_samples * 8
    crash_buf = bytearray(crash_bytes + 8)
    for i in range(extra_samples):
        set_u32(crash_buf, i * 8, 4)
        set_u32(crash_buf, i * 8 + 4, 0)
    set_u32(crash_buf, crash_bytes, 8)
    crash_buf[crash_bytes+4:crash_bytes+8] = b"free"

    p[mdat["cend"]:mdat["cend"]] = crash_buf
    return bytes(p)

def main():
    if len(sys.argv) < 2:
        print("Usage: python patch_compressbase.py input.mp4 [output.mp4]")
        sys.exit(1)
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_name(f"{src.stem}-compressbase-hd.mp4")
    print(f"Reading {src}...")
    raw = src.read_bytes()
    print("Applying CompressBase patch...")
    patched = apply_compressbase_patch(raw)
    dst.write_bytes(patched)
    print(f"Patched video saved to: {dst} ({len(patched)} bytes)")

if __name__ == '__main__':
    main()
