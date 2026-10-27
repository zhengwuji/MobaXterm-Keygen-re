#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MobaXterm Keygen — Python port of inused.github.io/pages/file/tool/js/mobaXtermGenerater.js
Outputs a Custom.mxtpro (a zip containing Pro.key).

Usage:
    python keygen.py                          # default: Professional / defaultUser / 1 / 21.0
    python keygen.py -t 1 -u alice -n 5 -M 25 -m 2 -o Custom.mxtpro
    python keygen.py --print                  # only print the license string

License plaintext template (from the JS source):
    '%d#%s|%d%d#%d#%d3%d6%d#%d#%d#%d#' % (Type, UserName, Major, Minor, Count,
                                          Major, Minor, Minor, 0, 0, 0)
Then: bytes -> XOR stream (key 0x787, key = (prev_plain & key) | 0x482D)
      -> variant base64 (little-endian 24-bit blocks, low 6 bits first)
"""
import argparse
import sys
import zipfile

VARIANT_TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="

LICENSE_TYPES = {"Professional": 1, "Educational": 3, "Personal": 4, "Persional": 4}


def variant_base64_encode(bs: bytes) -> str:
    out = []
    blocks = len(bs) // 3
    left = len(bs) % 3
    for i in range(blocks):
        coding = bs[3 * i] | (bs[3 * i + 1] << 8) | (bs[3 * i + 2] << 16)
        out.append(VARIANT_TABLE[coding & 0x3F])
        out.append(VARIANT_TABLE[(coding >> 6) & 0x3F])
        out.append(VARIANT_TABLE[(coding >> 12) & 0x3F])
        out.append(VARIANT_TABLE[(coding >> 18) & 0x3F])
    if left == 0:
        return "".join(out)
    coding = 0
    for j in range(left):
        coding |= bs[3 * blocks + j] << (8 * j)
    out.append(VARIANT_TABLE[coding & 0x3F])
    out.append(VARIANT_TABLE[(coding >> 6) & 0x3F])
    if left == 2:
        out.append(VARIANT_TABLE[(coding >> 12) & 0x3F])
    return "".join(out)


def encrypt_bytes(key: int, data: bytes) -> bytes:
    res = bytearray()
    for val in data:
        res.append(val ^ ((key >> 8) & 0xFF))
        key = (res[-1] & key) | 0x482D
    return bytes(res)


def decrypt_bytes(key: int, data: bytes) -> bytes:
    """Inverse of encrypt_bytes; used to self-verify the output."""
    res = bytearray()
    for val in data:
        res.append(val ^ ((key >> 8) & 0xFF))
        key = (val & key) | 0x482D
    return bytes(res)


def variant_base64_decode(s: str) -> bytes:
    idx = {c: i for i, c in enumerate(VARIANT_TABLE)}
    codes = [idx[c] for c in s]
    out = bytearray()
    i = 0
    while i + 3 < len(codes) or (i < len(codes) and i + 3 > len(codes)):
        chunk = codes[i:i + 4]
        if len(chunk) < 2:
            break
        coding = chunk[0] | (chunk[1] << 6)
        if len(chunk) >= 3:
            coding |= chunk[2] << 12
        if len(chunk) >= 4:
            coding |= chunk[3] << 18
        out.extend(coding.to_bytes(3, "little")[:len(chunk) - 1])
        i += 4
        if len(chunk) < 4:
            break
    return bytes(out)


def generate_license(ltype: int, user: str, count: int, major: int, minor: int) -> str:
    src = "%d#%s|%d%d#%d#%d3%d6%d#%d#%d#%d#" % (
        ltype, user, major, minor, count, major, minor, minor, 0, 0, 0
    )
    return variant_base64_encode(encrypt_bytes(0x787, src.encode("utf-8")))


def parse_license(lic: str) -> dict:
    plain = decrypt_bytes(0x787, variant_base64_decode(lic.strip())).decode("utf-8", "replace")
    parts = plain.split("#")
    ltype = int(parts[0]) if len(parts) > 0 and parts[0].isdigit() else 1
    type_name = {1: "Professional", 3: "Educational", 4: "Personal"}.get(ltype, f"Unknown({ltype})")
    user_ver = parts[1] if len(parts) > 1 else ""
    user, ver_raw = user_ver.split("|", 1) if "|" in user_ver else (user_ver, "")
    ver_fmt = ver_raw
    if len(ver_raw) >= 2:
        ver_fmt = f"{ver_raw[:-1]}.{ver_raw[-1]}"
    count = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 1
    return {
        "type": ltype,
        "type_name": type_name,
        "user": user,
        "version": ver_fmt,
        "version_raw": ver_raw,
        "count": count,
        "plain": plain,
    }


def merge_into_zip(pro_key_str: str, custom_file_path: str, output_path: str):
    with zipfile.ZipFile(custom_file_path, "r") as cz:
        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as oz:
            oz.writestr("Pro.key", pro_key_str)
            for item in cz.infolist():
                if item.filename == "Pro.key" or item.is_dir():
                    continue
                oz.writestr(item, cz.read(item.filename))


def main() -> int:
    p = argparse.ArgumentParser(description="MobaXterm license generator & customizer merger")
    p.add_argument("-t", "--type", default="1",
                   help="1=Professional 3=Educational 4=Personal (default 1)")
    p.add_argument("-u", "--user", default="defaultUser")
    p.add_argument("-n", "--count", type=int, default=1)
    p.add_argument("-M", "--major", type=int, default=21)
    p.add_argument("-m", "--minor", type=int, default=0)
    p.add_argument("-o", "--output", default="Custom.mxtpro")
    p.add_argument("--merge", dest="merge_custom", default="",
                   help="Merge with .custom settings file into the output .mxtpro")
    p.add_argument("--inspect", dest="inspect_target", default="",
                   help="Inspect and decode an existing .mxtpro file or license string")
    p.add_argument("--print", dest="only_print", action="store_true")
    a = p.parse_args()

    if a.inspect_target:
        target = a.inspect_target
        lic = target
        if target.endswith(".mxtpro") or target.endswith(".zip"):
            with zipfile.ZipFile(target, "r") as z:
                lic = z.read("Pro.key").decode("utf-8").strip()
        info = parse_license(lic)
        print("=== License Inspection ===")
        print("Type       :", f"{info['type_name']} ({info['type']})")
        print("User       :", info["user"])
        print("Version    :", info["version"])
        print("Count      :", info["count"])
        print("Plaintext  :", info["plain"])
        print("Raw License:", lic)
        return 0

    lic = generate_license(int(a.type), a.user, a.count, a.major, a.minor)

    # self-verify round trip
    plain = decrypt_bytes(0x787, variant_base64_decode(lic)).decode("utf-8", "replace")
    assert plain.startswith(f"{a.type}#{a.user}|"), f"roundtrip mismatch: {plain}"

    print("LicenseString:", lic)
    print("Plaintext    :", plain)

    if not a.only_print:
        if a.merge_custom:
            merge_into_zip(lic, a.merge_custom, a.output)
            print("Merged with  :", a.merge_custom)
            print("Written      :", a.output)
        else:
            with zipfile.ZipFile(a.output, "w", zipfile.ZIP_DEFLATED) as z:
                z.writestr("Pro.key", lic)
            print("Written      :", a.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
