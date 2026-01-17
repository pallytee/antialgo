/* Anti-Algo — updated core
   Modes:
   - human: readable, light substitutions
   - glitch: denser, more aggressive substitutions
   - patterned: Tatreez-inspired border logic (edge-weighted + mirrored)
     + Arabic-inflected glyph bias (curves, vertical strokes, dotting)
   Features:
   - Lock output (seeded determinism)
   - Normalize back
   - Exclusions: URLs, emails, @handles, #hashtags, numbers
   - Copy + Copy-for-text-replacement
*/

const unicodeMap = {
    a: { safe: ["ɑ", "а", "α", "𝖆"], glitch: ["𝒶", "𝓪", "𝕒", "𝗮"] },
    b: { safe: ["Ь", "Ꮟ", "𝖇"], glitch: ["𝒷", "𝓫", "𝕓", "𝗯"] },
    c: { safe: ["ϲ", "с", "𝖈"], glitch: ["𝒸", "𝓬", "𝕔", "𝗰"] },
    d: { safe: ["ԁ", "𝖉"], glitch: ["𝒹", "𝓭", "𝕕", "𝗱"] },
    e: { safe: ["е", "є", "℮", "𝖊"], glitch: ["𝑒", "𝓮", "𝕖", "𝗲"] },
    f: { safe: ["ғ", "𝖋"], glitch: ["𝒻", "𝓯", "𝕗", "𝗳"] },
    g: { safe: ["ɡ", "𝗀", "𝖌"], glitch: ["𝑔", "𝓰", "𝕘", "𝗴"] },
    h: { safe: ["һ", "𝖍"], glitch: ["𝒽", "𝓱", "𝕙", "𝗵"] },
    i: { safe: ["і", "𝖎", "ⅰ", "ı"], glitch: ["𝒾", "𝓲", "𝕚", "𝗶", "ɪ"] },
    j: { safe: ["ј", "𝖏"], glitch: ["𝒿", "𝓳", "𝕛", "𝗷"] },
    k: { safe: ["κ", "к", "𝖐"], glitch: ["𝓀", "𝓴", "𝕜", "𝗸"] },
    l: { safe: ["ⅼ", "𝖑", "ӏ"], glitch: ["𝓁", "𝓵", "𝕝", "𝗹"] },
    m: { safe: ["ｍ", "𝖒"], glitch: ["𝓂", "𝓶", "𝕞", "𝗺"] },
    n: { safe: ["ո", "𝗇", "𝖓"], glitch: ["𝓃", "𝓷", "𝕟", "𝗻"] },
    o: { safe: ["о", "ο", "σ", "օ", "𝖔", "ɔ"], glitch: ["𝑜", "𝓸", "𝕠", "𝗼"] },
    p: { safe: ["р", "ρ", "𝖕"], glitch: ["𝓅", "𝓹", "𝕡", "𝗽"] },
    q: { safe: ["ԛ", "𝖖"], glitch: ["𝓆", "𝓺", "𝕢", "𝗾"] },
    r: { safe: ["г", "𝖗"], glitch: ["𝓇", "𝓻", "𝕣", "𝗿"] },
    s: { safe: ["ѕ", "ꜱ", "𝖘"], glitch: ["𝓈", "𝓼", "𝕤", "𝗌"] },
    t: { safe: ["т", "τ", "𝖙"], glitch: ["𝓉", "𝓽", "𝕥", "𝗍"] },
    u: { safe: ["υ", "ս", "𝖚"], glitch: ["𝓊", "𝓾", "𝕦", "𝗎"] },
    v: { safe: ["ѵ", "𝖛"], glitch: ["𝓋", "𝓿", "𝕧", "𝗏"] },
    w: { safe: ["ѡ", "ԝ", "𝖜"], glitch: ["𝓌", "𝔀", "𝕨", "𝗐"] },
    x: { safe: ["х", "χ", "𝖝"], glitch: ["𝓍", "𝔁", "𝕩", "𝗑"] },
    y: { safe: ["у", "γ", "𝖞"], glitch: ["𝓎", "𝔂", "𝕪", "𝗒"] },
    z: { safe: ["ᴢ", "𝖟"], glitch: ["𝓏", "𝔃", "𝕫", "𝗓"] },
  };
  
  // Arabic-inflected + “stitched” feel for patterned mode: prefer these families
  const patternedPreferred = new Set([
    "ɑ", "α", "є", "ο", "σ", "ɔ", "і", "ⅰ", "ı", "ⅼ", "ӏ", "∣", "⟂", "ѕ", "т", "р", "ρ", "υ", "ս"
  ]);
  
  // Optional diacritic noise (use sparingly; can feel “stressed / surveilled”)
  // Keep rare so readability survives.
  const diacritics = ["\u0307", "\u0323", "\u02D9"]; //  ̇   ̣   ˙
  
  // Build reverse map for Normalize Back
  function buildReverseMap(map) {
    const reverse = new Map();
    for (const [base, tiers] of Object.entries(map)) {
      const variants = [...(tiers.safe || []), ...(tiers.glitch || [])];
      for (const v of variants) {
        reverse.set(v, base);
        reverse.set(v.toUpperCase(), base.toUpperCase());
      }
    }
    return reverse;
  }
  const reverseMap = buildReverseMap(unicodeMap);
  
  // --------- Seeded RNG (determinism) ----------
  function hashStringToUint32(str) {
    // FNV-1a
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  
  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  
  // --------- Exclusion detection ----------
  const urlRegex = /\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+|\b[a-z0-9.-]+\.(com|org|net|edu|gov|io|co|ca|uk)\b/gi;
  const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const handleHashtagRegex = /[@#][\p{L}\p{N}_]+/giu;
  const numberRegex = /\b\d+([\.,]\d+)*\b/g;
  
  // Tokenize into words/space/punct while keeping delimiters
  function tokenize(input) {
    // Split into: URLs/emails/handles/hashtags/numbers first, then everything else into word-ish chunks
    // We'll do a single pass “protected ranges” approach:
    const protectedRanges = [];
  
    function markAll(regex) {
      regex.lastIndex = 0;
      let m;
      while ((m = regex.exec(input)) !== null) {
        protectedRanges.push({ start: m.index, end: m.index + m[0].length });
      }
    }
  
    markAll(new RegExp(urlRegex.source, urlRegex.flags));
    markAll(new RegExp(emailRegex.source, emailRegex.flags));
    markAll(new RegExp(handleHashtagRegex.source, handleHashtagRegex.flags));
    markAll(new RegExp(numberRegex.source, numberRegex.flags));
  
    // Merge overlapping ranges
    protectedRanges.sort((a, b) => a.start - b.start);
    const merged = [];
    for (const r of protectedRanges) {
      const last = merged[merged.length - 1];
      if (!last || r.start > last.end) merged.push({ ...r });
      else last.end = Math.max(last.end, r.end);
    }
  
    const tokens = [];
    let i = 0;
    for (const r of merged) {
      if (i < r.start) tokens.push({ type: "free", text: input.slice(i, r.start) });
      tokens.push({ type: "protected", text: input.slice(r.start, r.end) });
      i = r.end;
    }
    if (i < input.length) tokens.push({ type: "free", text: input.slice(i) });
  
    // Further split free chunks into word / whitespace / punctuation tokens
    const finalTokens = [];
    for (const t of tokens) {
      if (t.type === "protected") {
        finalTokens.push(t);
        continue;
      }
      const parts = t.text.split(/(\s+)/);
      for (const part of parts) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          finalTokens.push({ type: "space", text: part });
        } else {
          // Split into “wordish” and punctuation, keeping punctuation
          const segs = part.split(/([^\p{L}\p{N}]+)/giu).filter(Boolean);
          for (const seg of segs) {
            if (/^[\p{L}\p{N}]+$/iu.test(seg)) finalTokens.push({ type: "word", text: seg });
            else finalTokens.push({ type: "punct", text: seg });
          }
        }
      }
    }
    return finalTokens;
  }
  
  // --------- Character utilities ----------
  function isMappableChar(ch) {
    const lower = ch.toLowerCase();
    return Object.prototype.hasOwnProperty.call(unicodeMap, lower);
  }
  
  function preserveCase(original, replacement) {
    // If original is uppercase, try uppercase replacement; else return as-is
    if (original === original.toUpperCase() && original !== original.toLowerCase()) {
      return replacement.toUpperCase();
    }
    return replacement;
  }
  
  function pickFrom(arr, rng) {
    if (!arr.length) return null;
    const idx = Math.floor(rng() * arr.length);
    return arr[idx];
  }
  
  // Choose variant according to mode & preferences
  function chooseVariant(baseChar, mode, positionIndex, rng) {
    const lower = baseChar.toLowerCase();
    const tiers = unicodeMap[lower];
    if (!tiers) return baseChar;
  
    // build candidate list
    let candidates = [];
  
    if (mode === "human") {
      candidates = tiers.safe || [];
      // human can very lightly dip into glitch at high intensity via caller probability, not here
    } else if (mode === "glitch") {
      candidates = [...(tiers.safe || []), ...(tiers.glitch || [])];
    } else if (mode === "patterned") {
      // patterned strongly prefers “stitched / arabic-inflected” candidates
      const safe = tiers.safe || [];
      const preferred = safe.filter((v) => patternedPreferred.has(v));
      candidates = preferred.length ? preferred : safe;
    }
  
    if (!candidates.length) return baseChar;
  
    // Patterned mode should feel structured: cycle by positionIndex when unlocked.
    if (mode === "patterned") {
      const idx = Math.abs(positionIndex) % candidates.length;
      return candidates[idx];
    }
  
    // Other modes: random
    return pickFrom(candidates, rng) ?? baseChar;
  }
  
  function maybeAddDiacritic(str, rng, intensity, mode) {
    // Only for glitch + patterned, and rarely.
    if (!(mode === "glitch" || mode === "patterned")) return str;
    const chance = mode === "glitch" ? 0.10 * intensity : 0.06 * intensity; // keep subtle
    if (rng() < chance) {
      const d = pickFrom(diacritics, rng);
      return str + d;
    }
    return str;
  }
  
  // --------- Perturbation implementations ----------
  function perturbHuman(word, intensity, rng, lockKey) {
    let out = "";
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      if (!isMappableChar(ch)) {
        out += ch;
        continue;
      }
      // Light probability based on intensity
      const p = 0.18 + 0.42 * intensity; // 0.18..0.60
      if (rng() < p) {
        const v = chooseVariant(ch, "human", i, rng);
        const rep = preserveCase(ch, v);
        out += rep;
      } else {
        out += ch;
      }
    }
    return out;
  }
  
  function perturbGlitch(word, intensity, rng) {
    let out = "";
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      if (!isMappableChar(ch)) {
        out += ch;
        continue;
      }
      // Dense probability
      const p = 0.45 + 0.45 * intensity; // 0.45..0.90
      if (rng() < p) {
        const v = chooseVariant(ch, "glitch", i, rng);
        let rep = preserveCase(ch, v);
        rep = maybeAddDiacritic(rep, rng, intensity, "glitch");
        out += rep;
      } else {
        out += ch;
      }
    }
    return out;
  }
  
  function perturbPatternedTatreez(word, intensity, rng, locked) {
    // Border depth: 1..5, clamped to half length
    const len = word.length;
    const D = Math.max(1, Math.round(1 + intensity * 4)); // 1..5
    const maxDepth = Math.max(1, Math.floor(len / 2));
    const depth = Math.min(D, maxDepth);
  
    const chars = word.split("");
    const mutated = new Array(len).fill(false);
  
    // helper to find next eligible index inward from a start point within depth window
    function findEligibleFromLeft(start, limit) {
      for (let i = start; i < Math.min(limit, len); i++) {
        if (isMappableChar(chars[i])) return i;
      }
      return null;
    }
    function findEligibleFromRight(start, limit) {
      for (let i = start; i >= Math.max(limit, 0); i--) {
        if (isMappableChar(chars[i])) return i;
      }
      return null;
    }
  
    // left window [0, depth)
    // right window (len-depth, len-1]
    const leftLimit = depth;
    const rightLimit = len - depth;
  
    // mutate up to `depth` eligible positions on each side, mirrored where possible
    let leftCursor = 0;
    let rightCursor = len - 1;
  
    let steps = 0;
    while (steps < depth) {
      const li = findEligibleFromLeft(leftCursor, leftLimit);
      const ri = findEligibleFromRight(rightCursor, rightLimit);
  
      if (li === null && ri === null) break;
  
      // Mutate left
      if (li !== null && !mutated[li]) {
        const v = chooseVariant(chars[li], "patterned", li, rng);
        let rep = preserveCase(chars[li], v);
  
        // “Arabic-inflected glitchify”: small, controlled diacritic noise, edge-biased
        rep = maybeAddDiacritic(rep, rng, intensity, "patterned");
  
        chars[li] = rep;
        mutated[li] = true;
  
        // Mirror: try corresponding position from right edge
        const mirror = len - 1 - li;
        if (mirror >= 0 && mirror < len && !mutated[mirror] && isMappableChar(word[mirror])) {
          const mv = chooseVariant(word[mirror], "patterned", mirror, rng);
          let mrep = preserveCase(word[mirror], mv);
          mrep = maybeAddDiacritic(mrep, rng, intensity, "patterned");
          chars[mirror] = mrep;
          mutated[mirror] = true;
        }
        leftCursor = li + 1;
      } else {
        leftCursor++;
      }
  
      // Mutate right
      if (ri !== null && !mutated[ri]) {
        const v = chooseVariant(chars[ri], "patterned", ri, rng);
        let rep = preserveCase(chars[ri], v);
        rep = maybeAddDiacritic(rep, rng, intensity, "patterned");
        chars[ri] = rep;
        mutated[ri] = true;
  
        // Mirror: try corresponding position from left edge
        const mirror = len - 1 - ri;
        if (mirror >= 0 && mirror < len && !mutated[mirror] && isMappableChar(word[mirror])) {
          const mv = chooseVariant(word[mirror], "patterned", mirror, rng);
          let mrep = preserveCase(word[mirror], mv);
          mrep = maybeAddDiacritic(mrep, rng, intensity, "patterned");
          chars[mirror] = mrep;
          mutated[mirror] = true;
        }
        rightCursor = ri - 1;
      } else {
        rightCursor--;
      }
  
      steps++;
    }
  
    // Optional: a tiny interior “stitch” at very high intensity (still patterned)
    if (intensity > 0.75 && len >= 8) {
      const mid = Math.floor(len / 2);
      for (let k = -1; k <= 1; k++) {
        const idx = mid + k;
        if (idx >= 0 && idx < len && isMappableChar(word[idx]) && !mutated[idx] && rng() < 0.25) {
          const v = chooseVariant(word[idx], "patterned", idx, rng);
          let rep = preserveCase(word[idx], v);
          rep = maybeAddDiacritic(rep, rng, intensity, "patterned");
          chars[idx] = rep;
          mutated[idx] = true;
        }
      }
    }
  
    return chars.join("");
  }
  
  function perturbText(input, mode, intensity, locked) {
    const lockKey = `${input}::${mode}::${intensity}`;
    const seed = hashStringToUint32(lockKey);
    const rng = locked ? mulberry32(seed) : Math.random;
  
    const tokens = tokenize(input);
    let out = "";
  
    for (const t of tokens) {
      if (t.type === "protected" || t.type === "space" || t.type === "punct") {
        out += t.text;
        continue;
      }
      if (t.type === "word") {
        if (mode === "human") out += perturbHuman(t.text, intensity, rng, lockKey);
        else if (mode === "glitch") out += perturbGlitch(t.text, intensity, rng);
        else out += perturbPatternedTatreez(t.text, intensity, rng, locked);
        continue;
      }
      // fallback
      out += t.text;
    }
  
    return out;
  }
  
  function normalizeBack(input) {
    // Convert known homoglyphs back to ASCII base letters; strip our chosen diacritics too.
    // Remove combining diacritics (keep minimal; only those we add)
    const stripped = input.replace(/[\u0307\u0323\u02D9]/g, "");
    let out = "";
    for (const ch of stripped) {
      out += reverseMap.get(ch) ?? ch;
    }
    return out;
  }
  
  // --------- Clipboard ----------
  async function copyToClipboard(text) {
    // Primary
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      // Fallback
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "true");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch (_) {
        return false;
      }
    }
  }
  
  // --------- UI wiring ----------
  const els = {
    input: document.getElementById("input-text"),
    output: document.getElementById("output-text"),
    perturb: document.getElementById("perturb-btn"),
    clear: document.getElementById("clear-btn"),
    copy: document.getElementById("copy-btn"),
    copyTR: document.getElementById("copy-tr-btn"),
    normalize: document.getElementById("normalize-btn"),
    status: document.getElementById("copied-status"),
    intensity: document.getElementById("intensity"),
    intensityValue: document.getElementById("intensity-value"),
    lock: document.getElementById("lock-toggle"),
    modeBtns: document.querySelectorAll(".mode-btn"),
  };
  
  let currentMode = "human";
  
  function setStatus(msg, isError = false) {
    if (!els.status) return;
    els.status.textContent = msg;
    els.status.style.opacity = "1";
    els.status.style.color = isError ? "rgba(255,170,170,0.9)" : "rgba(190,255,220,0.9)";
    window.clearTimeout(setStatus._t);
    setStatus._t = window.setTimeout(() => {
      els.status.style.opacity = "0";
    }, 1600);
  }
  
  function getIntensity() {
    const v = parseFloat(els.intensity?.value ?? "0.6");
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.6;
  }
  
  function isLocked() {
    return !!els.lock?.checked;
  }
  
  function handleConvert() {
    const input = els.input.value || "";
    const intensity = getIntensity();
    const locked = isLocked();
    const output = perturbText(input, currentMode, intensity, locked);
    els.output.value = output;
  }
  
  function handleClear() {
    els.input.value = "";
    els.output.value = "";
    setStatus("");
  }
  
  async function handleCopy() {
    const text = (els.output.value || "").trim();
    if (!text) return setStatus("Nothing to copy.", true);
    const ok = await copyToClipboard(text);
    setStatus(ok ? "Copied." : "Copy failed.", !ok);
  }
  
  async function handleCopyTextReplacement() {
    // Text Replacement fields work best with single-line text
    const text = (els.output.value || "").replace(/\s+/g, " ").trim();
    if (!text) return setStatus("Nothing to copy.", true);
    const ok = await copyToClipboard(text);
    setStatus(ok ? "Copied for Text Replacement." : "Copy failed.", !ok);
  }
  
  function handleNormalize() {
    const source = (els.output.value || els.input.value || "").trim();
    if (!source) return setStatus("Nothing to normalize.", true);
    els.output.value = normalizeBack(source);
    setStatus("Normalized.");
  }
  
  function setMode(mode) {
    currentMode = mode;
    els.modeBtns.forEach((b) => {
      b.classList.toggle("active", b.dataset.mode === mode);
    });
  }
  
  // Events
  els.modeBtns.forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });
  
  els.intensity?.addEventListener("input", () => {
    const v = getIntensity();
    if (els.intensityValue) els.intensityValue.textContent = v.toFixed(1);
  });
  
  els.perturb?.addEventListener("click", handleConvert);
  els.clear?.addEventListener("click", handleClear);
  els.copy?.addEventListener("click", handleCopy);
  els.copyTR?.addEventListener("click", handleCopyTextReplacement);
  els.normalize?.addEventListener("click", handleNormalize);
  
  // Keyboard: Cmd/Ctrl+Enter to perturb
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleConvert();
    }
  });
  