/**
 * 把 CSS 里的 @import 抽出来单独返回。
 *
 * @import 不能留在会话 <style> 里：iOS WebKit 在 @import 仍在加载/重试期间
 * 会把整张样式表的所有规则都挂起。用户常引 Google Fonts，在无法直连的网络
 * 下该请求反复失败重试，整张自定义 CSS 就会在"生效↔失效"之间来回翻转——
 * 表现为剧情页拉到顶/底时页面在有 CSS 和无 CSS 之间闪烁。抽成独立的
 * <link rel="stylesheet"> 后字体加载失败只影响字体本身，其余规则始终生效。
 */
export function extractCssImports(raw: string): { imports: string[]; css: string } {
  const imports: string[] = [];
  if (!raw || !raw.includes("@import")) return { imports, css: raw };
  const css = raw.replace(
    /@import\s+(?:url\(\s*(['"]?)([^'")]+)\1\s*\)|(['"])([^'"]+)\3)[^;]*;/gi,
    (_match, _q1, urlInParens: string | undefined, _q2, bareUrl: string | undefined) => {
      const url = (urlInParens || bareUrl || "").trim();
      if (url) imports.push(url);
      return "";
    }
  );
  return { imports, css };
}

/**
 * Scope raw CSS so every rule selector is prefixed with a scope selector.
 * - `body` / `html` / `:root` selectors are replaced with the scope selector.
 * - `@keyframes` and `@font-face` names are isolated per scope.
 * - Animation and font-family references are rewritten to match those names.
 * - Media/container queries are handled recursively.
 */
export function scopeSessionCSS(raw: string, scopeSelector: string): string {
  if (!raw.trim()) return "";

  // Keyframes and @font-face are document-global CSS primitives. Give them a
  // deterministic per-scope name and rewrite references in declarations below.
  const suffix = scopeSelector.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/^_+|_+$/g, "") || "session";
  const keyframes = new Map<string, string>();
  const fontFamilies = new Map<string, string>();

  raw.replace(/@(?:-webkit-)?keyframes\s+([\w-]+)/gi, (_match, name: string) => {
    if (!keyframes.has(name)) keyframes.set(name, `float_${suffix}_${name}`);
    return _match;
  });
  raw.replace(/@font-face\s*\{([^}]*)\}/gi, (_match, declarations: string) => {
    const family = declarations.match(/font-family\s*:\s*(['"]?)([^;'"]+)\1\s*;?/i)?.[2]?.trim();
    if (family && !fontFamilies.has(family)) fontFamilies.set(family, `float_${suffix}_${family.replace(/[^a-zA-Z0-9_-]/g, "_")}`);
    return _match;
  });

  return scopeSessionCSSInternal(raw, scopeSelector, keyframes, fontFamilies);
}

function scopeSessionCSSInternal(
  raw: string,
  scopeSelector: string,
  keyframes: Map<string, string>,
  fontFamilies: Map<string, string>,
): string {
  const result: string[] = [];
  let i = 0;

  while (i < raw.length) {
    while (i < raw.length && /\s/.test(raw[i])) { result.push(raw[i]); i++; }
    if (i >= raw.length) break;

    if (raw[i] === "/" && raw[i + 1] === "*") {
      const end = raw.indexOf("*/", i + 2);
      if (end === -1) { result.push(raw.slice(i)); break; }
      result.push(raw.slice(i, end + 2)); i = end + 2; continue;
    }

    if (raw[i] === "@") {
      const atRuleMatch = raw.slice(i).match(/^@([\w-]+)\s*/);
      if (atRuleMatch) {
        const atName = atRuleMatch[1].toLowerCase();

        if (atName === "import") {
          const semiEnd = raw.indexOf(";", i);
          if (semiEnd === -1) { result.push(raw.slice(i)); break; }
          result.push(raw.slice(i, semiEnd + 1)); i = semiEnd + 1; continue;
        }

        if (atName.endsWith("keyframes")) {
          const braceStart = raw.indexOf("{", i);
          if (braceStart === -1) { result.push(raw.slice(i)); break; }
          const blockEnd = findMatchingBrace(raw, braceStart);
          const prelude = raw.slice(i, braceStart).replace(
            /(@(?:-webkit-)?keyframes\s+)([\w-]+)/i,
            (_m, prefix, name) => prefix + (keyframes.get(name) || name),
          );
          result.push(prelude + raw.slice(braceStart, blockEnd + 1));
          i = blockEnd + 1; continue;
        }

        if (atName === "font-face") {
          const braceStart = raw.indexOf("{", i);
          if (braceStart === -1) { result.push(raw.slice(i)); break; }
          const blockEnd = findMatchingBrace(raw, braceStart);
          const block = raw.slice(braceStart, blockEnd + 1);
          result.push(rewriteCssDeclarations(block, keyframes, fontFamilies));
          i = blockEnd + 1; continue;
        }

        if (atName === "media" || atName === "supports" || atName === "layer" || atName === "container") {
          const braceStart = raw.indexOf("{", i);
          const semiEnd = atName === "layer" ? raw.indexOf(";", i) : -1;
          if (semiEnd !== -1 && (braceStart === -1 || semiEnd < braceStart)) {
            result.push(raw.slice(i, semiEnd + 1)); i = semiEnd + 1; continue;
          }
          if (braceStart === -1) { result.push(raw.slice(i)); break; }
          const blockEnd = findMatchingBrace(raw, braceStart);
          result.push(raw.slice(i, braceStart + 1));
          result.push(scopeSessionCSSInternal(raw.slice(braceStart + 1, blockEnd), scopeSelector, keyframes, fontFamilies));
          result.push("}"); i = blockEnd + 1; continue;
        }
      }
    }

    const braceStart = raw.indexOf("{", i);
    if (braceStart === -1) { result.push(raw.slice(i)); break; }
    const selectorText = raw.slice(i, braceStart).trim();
    const blockEnd = findMatchingBrace(raw, braceStart);
    const body = rewriteCssDeclarations(raw.slice(braceStart, blockEnd + 1), keyframes, fontFamilies);
    const scopedSelector = splitSelectorList(selectorText)
      .map((sel) => scopeSingleSelector(sel.trim(), scopeSelector))
      .join(", ");
    result.push(scopedSelector + " " + body);
    i = blockEnd + 1;
  }
  return result.join("");
}

function rewriteCssDeclarations(
  block: string,
  keyframes: Map<string, string>,
  fontFamilies: Map<string, string>,
): string {
  return block.replace(
    /(^|[;{]\s*)((?:-webkit-)?animation(?:-name)?|font-family)\s*:\s*([^;{}]*)(?=;|[{}])/gi,
    (_match, prefix: string, property: string, rawValue: string) => {
      let value = rawValue;
      if (property.toLowerCase() === "font-family") {
        value = value.replace(/(["'])(.*?)\1|([^,]+)/g, (part: string, quote: string | undefined, quoted: string | undefined, plain: string | undefined) => {
          const family = (quoted ?? plain ?? "").trim();
          const renamed = fontFamilies.get(family);
          if (!renamed) return part;
          return quote ? `${quote}${renamed}${quote}` : part.replace(family, renamed);
        });
      } else {
        for (const [name, renamed] of keyframes) {
          value = value.replace(new RegExp(`(^|[^\\w-])${escapeRegExp(name)}(?=$|[^\\w-])`, "g"), (_m, before) => before + renamed);
        }
      }
      return `${prefix}${property}: ${value}`;
    },
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Commas inside :is(), :has(), attribute selectors or quoted strings are not list separators. */
function splitSelectorList(value: string): string[] {
  const parts: string[] = [];
  let start = 0, depth = 0, quote = "";
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === "\\") { i++; continue; }
    if (quote) { if (char === quote) quote = ""; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth--;
    else if (char === "," && depth === 0) { parts.push(value.slice(start, i)); start = i + 1; }
  }
  parts.push(value.slice(start));
  return parts;
}

function scopeSingleSelector(sel: string, scope: string): string {
  if (!sel) return sel;
  const lower = sel.toLowerCase();
  // Replace body/html/:root with the scope selector
  if (lower === "body" || lower === "html" || lower === ":root") {
    return scope;
  }
  // Selectors starting with body/html/:root — replace the element part
  if (/^(body|html|:root)\s/i.test(sel)) {
    return scope + " " + sel.replace(/^(body|html|:root)\s*/i, "");
  }
  if (/^(body|html|:root)(?=[.#[:>+~])/i.test(sel)) {
    return scope + sel.replace(/^(body|html|:root)/i, "");
  }
  // 选择器就是 scope 本身（如用户写 .chat-app { --var: ... }）：直接返回 scope，
  // 否则会被错误地变成 ".chat-app .chat-app"，导致变量没法挂到 scope 元素上
  if (sel === scope) {
    return scope;
  }
  // 选择器以 scope 开头并跟着空格/伪类/属性（如 .chat-app .foo / .chat-app:hover / .chat-app[data-x]）：
  // 已经包含 scope 了，不要重复前缀，否则也会失效
  if (sel.startsWith(scope + " ") || sel.startsWith(scope + ":") || sel.startsWith(scope + "[") || sel.startsWith(scope + ".") || sel.startsWith(scope + ">")) {
    return sel;
  }
  // Normal selector — prefix with scope
  return scope + " " + sel;
}

function findMatchingBrace(text: string, openPos: number): number {
  let depth = 0;
  for (let i = openPos; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return text.length - 1;
}
