#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Compacte un dossier en un SEUL fichier texte, avec contrôles de taille :
- Exclut 'node_modules' par défaut (+ --exclude ...)
- Arborescence en tête
- Pour chaque fichier : chemin relatif, extension, mimetype, contenu
- Binaire: configurable via --binary-mode [base64|skip|sha256]
- Filtre d’extensions via --only-ext ".js .ts .tsx .py .md ..." (garde seulement ces types)
"""

import argparse
import base64
import hashlib
import mimetypes
import os
from pathlib import Path
from typing import Iterable

DEFAULT_EXCLUDES = {"node_modules"}
TEXT_LIKE_MIMES_PREFIX = ("text/",)
TEXT_LIKE_MIMES_EXACT = {
    "application/json", "application/xml", "application/javascript",
    "application/x-sh", "application/x-yaml", "application/x-toml",
}
SEPARATOR = "=" * 80

def should_exclude_path(path_parts: tuple[str, ...], excludes: set[str]) -> bool:
    return any(seg in excludes for seg in path_parts)

def is_text_file(path: Path) -> bool:
    mt, _ = mimetypes.guess_type(str(path))
    if mt and (mt.startswith(TEXT_LIKE_MIMES_PREFIX) or mt in TEXT_LIKE_MIMES_EXACT):
        return True
    try:
        with path.open("rb") as f:
            chunk = f.read(4096)
        if b"\x00" in chunk:
            return False
        _ = chunk.decode("utf-8", errors="ignore")
        return True
    except Exception:
        return False

def file_format(path: Path) -> tuple[str, str]:
    ext = path.suffix.lower() or path.name
    mt, _ = mimetypes.guess_type(str(path))
    return ext, (mt or "application/octet-stream")

def dump_text_file(path: Path, header: list[str]) -> str:
    try:
        content = path.read_text(encoding="utf-8", errors="replace")
        header.append("CONTENT:")
        header.append("")
        return "\n".join(header) + content.rstrip() + "\n"
    except Exception:
        # fallback binaire si lecture texte échoue
        data_b64 = base64.b64encode(path.read_bytes()).decode("ascii")
        header.append("CONTENT_ENCODING: base64 (fallback from text read error)")
        header.append("CONTENT:")
        header.append("")
        return "\n".join(header) + data_b64 + "\n"

def dump_binary_file(path: Path, header: list[str], mode: str) -> str:
    if mode == "skip":
        data = path.read_bytes()
        sha = hashlib.sha256(data).hexdigest()
        header.append("BINARY: skipped")
        header.append(f"SHA256: {sha}")
        header.append("CONTENT: (omitted)")
        header.append("")
        return "\n".join(header) + "\n"
    elif mode == "sha256":
        data = path.read_bytes()
        sha = hashlib.sha256(data).hexdigest()
        header.append("CONTENT_DIGEST: sha256")
        header.append(f"SHA256: {sha}")
        header.append("CONTENT: (digest only)")
        header.append("")
        return "\n".join(header) + "\n"
    else:  # base64
        data_b64 = base64.b64encode(path.read_bytes()).decode("ascii")
        header.append("CONTENT_ENCODING: base64")
        header.append("CONTENT:")
        header.append("")
        return "\n".join(header) + data_b64 + "\n"

def make_tree(root: Path, excludes: set[str], follow_symlinks: bool) -> str:
    lines = [f"ARBORESCENCE DE: {root.resolve()}"]

    def listdir_filtered(d: Path):
        try:
            entries = [p for p in d.iterdir()]
        except PermissionError:
            return []
        filtered = []
        for p in entries:
            if should_exclude_path(p.parts, excludes):
                continue
            if p.is_dir():
                if (not follow_symlinks) and p.is_symlink():
                    filtered.append(p)  # affiché mais non parcouru
                else:
                    filtered.append(p)
            else:
                filtered.append(p)
        filtered.sort(key=lambda x: (not x.is_dir(), x.name.lower()))
        return filtered

    def walk(d: Path, prefix: str = ""):
        children = listdir_filtered(d)
        total = len(children)
        for i, p in enumerate(children):
            connector = "└── " if i == total - 1 else "├── "
            suffix = "/" if p.is_dir() else ""
            lines.append(prefix + connector + p.name + suffix)
            if p.is_dir() and ((not p.is_symlink()) or follow_symlinks):
                walk(p, prefix + ("    " if i == total - 1 else "│   "))

    walk(root)
    return "\n".join(lines)

def gather_files(root: Path, excludes: set[str], follow_symlinks: bool,
                 only_ext: set[str] | None) -> list[Path]:
    files: list[Path] = []
    normalized_exts = {e.lower() if e.startswith(".") else f".{e.lower()}" for e in (only_ext or [])}
    for dirpath, dirnames, filenames in os.walk(root, topdown=True, followlinks=follow_symlinks):
        pruned = []
        for dn in dirnames:
            full = Path(dirpath) / dn
            if should_exclude_path(full.parts, excludes):
                continue
            if (not follow_symlinks) and full.is_symlink():
                continue
            pruned.append(dn)
        dirnames[:] = pruned

        for fn in filenames:
            full = Path(dirpath) / fn
            if should_exclude_path(full.parts, excludes):
                continue
            if only_ext:
                ext = full.suffix.lower()
                if ext not in normalized_exts:
                    continue
            files.append(full)
    files.sort(key=lambda p: str(p).lower())
    return files

def dump_file(path: Path, display_path: str, binary_mode: str) -> str:
    ext, mtype = file_format(path)
    header = [
        SEPARATOR,
        f"FILE: {display_path}",
        f"EXT: {ext}",
        f"MIMETYPE: {mtype}",
    ]
    if is_text_file(path):
        return dump_text_file(path, header)
    else:
        return dump_binary_file(path, header, binary_mode)

def bundle(root: Path, excludes: set[str], follow_symlinks: bool,
           binary_mode: str, only_ext: set[str] | None) -> str:
    parts: list[str] = []
    parts.append(make_tree(root, excludes, follow_symlinks))
    parts.append(SEPARATOR)
    parts.append("FICHIERS DUMPÉS (dans l'ordre lexicographique)\n")
    files = gather_files(root, excludes, follow_symlinks, only_ext)
    root_abs = root.resolve()
    for fp in files:
        try:
            display = os.path.relpath(fp, root_abs)
        except Exception:
            display = str(fp)
        parts.append(dump_file(Path(fp), display, binary_mode))
    parts.append(SEPARATOR)
    parts.append("FIN DU DUMP")
    return "\n".join(parts)

def parse_only_ext(items: Iterable[str]) -> set[str]:
    exts: set[str] = set()
    for it in items:
        it = it.strip()
        if not it:
            continue
        if not it.startswith("."):
            it = "." + it
        exts.add(it.lower())
    return exts

def main():
    ap = argparse.ArgumentParser(description="Compacte un dossier en un seul fichier texte (avec arborescence).")
    ap.add_argument("--root", type=str, required=True, help="Dossier racine à compacter")
    ap.add_argument("--out", type=str, default="dump.txt", help="Fichier texte de sortie")
    ap.add_argument("--exclude", type=str, nargs="*", default=[], help="Dossiers additionnels à exclure (en plus de node_modules)")
    ap.add_argument("--follow-symlinks", action="store_true", help="Suivre les liens symboliques (par défaut: non)")
    ap.add_argument("--binary-mode", choices=["base64", "skip", "sha256"], default="base64",
                    help="Comment inclure les fichiers binaires (défaut: base64)")
    ap.add_argument("--only-ext", type=str, nargs="*", default=[],
                    help="Limiter aux extensions données (ex: --only-ext .js .ts .tsx .py .md .json .yml .yaml .css .html)")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    if not root.exists() or not root.is_dir():
        raise SystemExit(f"Racine introuvable: {root}")

    excludes = set(DEFAULT_EXCLUDES) | set(args.exclude or [])
    only_ext = parse_only_ext(args.only_ext) if args.only_ext else None
    content = bundle(root, excludes, args.follow_symlinks, args.binary_mode, only_ext)

    out_path = Path(args.out).resolve()
    out_path.write_text(content, encoding="utf-8")
    print(f"[✓] Écrit: {out_path}")

if __name__ == "__main__":
    main()
