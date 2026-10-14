#!/usr/bin/env python3
"""Extract the raw firmware image from a UF2 file, byte-identical to the
web app's parseUf2() so the deployed signature covers exactly the bytes
the device stages and verifies.

Usage: uf2_to_image.py <input.uf2> <output.bin>
"""
import struct
import sys


def main():
    if len(sys.argv) != 3:
        sys.exit("usage: uf2_to_image.py <input.uf2> <output.bin>")
    data = open(sys.argv[1], "rb").read()
    if len(data) == 0 or len(data) % 512 != 0:
        sys.exit("not a valid UF2 file")
    chunks = []
    for off in range(0, len(data), 512):
        b = data[off:off + 512]
        magic, magic2, flags, addr = struct.unpack_from("<4I", b)
        if magic != 0x0A324655 or magic2 != 0x9E5D5157:
            sys.exit("not a valid UF2 file")
        if flags & 0x8000:
            continue  # file-container block, no payload
        size = struct.unpack_from("<I", b, 16)[0]
        if size == 0 or size > 476:
            sys.exit("invalid UF2 block")
        chunks.append((addr, size, b[32:32 + size]))
    if not chunks:
        sys.exit("empty UF2 file")
    chunks.sort(key=lambda c: c[0])
    base = chunks[0][0]
    end = chunks[-1][0] + chunks[-1][1]
    img = bytearray(end - base)
    for addr, size, payload in chunks:
        img[addr - base:addr - base + size] = payload
    with open(sys.argv[2], "wb") as f:
        f.write(bytes(img))
    print(f"image: {len(img)} bytes from %08x" % base)


if __name__ == "__main__":
    main()
