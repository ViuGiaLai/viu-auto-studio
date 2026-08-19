"""Script processing service: splitting full script into scene sentences."""

from __future__ import annotations

import re
from typing import List


def split_into_sentences(text: str, max_chars: int = 200) -> List[str]:
    """Split the approved full script into scene-ready sentences/paragraphs.

    Splits on sentence-ending punctuation and blank lines, enforcing a
    maximum character length by breaking long sentences at word boundaries.
    """
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []

    # Paragraphs (separated by blank lines) first
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    raw_sentences: List[str] = []
    for para in paragraphs:
        # Split paragraph on sentence boundaries
        parts = re.split(r"(?<=[.?!])\s+", para)
        for part in parts:
            part = part.strip()
            if part:
                raw_sentences.append(part)

    sentences: List[str] = []
    for raw in raw_sentences:
        if len(raw) <= max_chars:
            sentences.append(raw)
            continue
        # Break long sentences at spaces, respecting max_chars
        words = raw.split()
        current = ""
        for word in words:
            candidate = (current + " " + word).strip()
            if len(candidate) > max_chars and current:
                sentences.append(current)
                current = word
            else:
                current = candidate
        if current:
            sentences.append(current)
    return sentences
