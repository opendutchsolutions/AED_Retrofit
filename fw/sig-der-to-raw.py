#!/usr/bin/env python3
"""Convert a DER-encoded ECDSA signature to raw r||s (64 bytes for P-256).
Usage: sig-der-to-raw.py <in.sig> <out.sig>"""
import sys

def der_int(data, i):
    assert data[i] == 0x02, "expected INTEGER tag"
    ln = data[i + 1]
    # handle long-form lengths (rare for P-256 but be safe)
    if ln & 0x80:
        n = ln & 0x7f
        ln = int.from_bytes(data[i + 2:i + 2 + n], 'big')
        i += 2 + n
    else:
        i += 2
    return data[i:i + ln], i + ln

def main():
    der = open(sys.argv[1], 'rb').read()
    i = 0
    assert der[i] == 0x30, "expected SEQUENCE"
    i += 1
    ln = der[i]
    if ln & 0x80:
        n = ln & 0x7f
        i += 1 + n
    else:
        i += 1
    r, i = der_int(der, i)
    s, i = der_int(der, i)
    # strip leading zeros, left-pad to 32 bytes
    r = r.lstrip(b'\x00').rjust(32, b'\x00')
    s = s.lstrip(b'\x00').rjust(32, b'\x00')
    assert len(r) == 32 and len(s) == 32
    open(sys.argv[2], 'wb').write(r + s)
    print(f"converted {len(der)}-byte DER sig to 64-byte raw r||s")

if __name__ == '__main__':
    main()
