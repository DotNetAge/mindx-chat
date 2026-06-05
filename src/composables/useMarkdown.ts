import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/core'
import mermaid from 'mermaid'

// ===== 按需注册 highlight.js 语言模块 =====
// 覆盖两个视图里所有用到的 lang（与 ToolExecView 的 EXT_TO_LANG 表保持同步）
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import scss from 'highlight.js/lib/languages/scss'
import less from 'highlight.js/lib/languages/less'
import json from 'highlight.js/lib/languages/json'
import yaml from 'highlight.js/lib/languages/yaml'
import ini from 'highlight.js/lib/languages/ini'
import bash from 'highlight.js/lib/languages/bash'
import powershell from 'highlight.js/lib/languages/powershell'
import go from 'highlight.js/lib/languages/go'
import python from 'highlight.js/lib/languages/python'
import java from 'highlight.js/lib/languages/java'
import kotlin from 'highlight.js/lib/languages/kotlin'
import scala from 'highlight.js/lib/languages/scala'
import clojure from 'highlight.js/lib/languages/clojure'
import csharp from 'highlight.js/lib/languages/csharp'
import ruby from 'highlight.js/lib/languages/ruby'
import php from 'highlight.js/lib/languages/php'
import rust from 'highlight.js/lib/languages/rust'
import swift from 'highlight.js/lib/languages/swift'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import objectivec from 'highlight.js/lib/languages/objectivec'
import sql from 'highlight.js/lib/languages/sql'
import haskell from 'highlight.js/lib/languages/haskell'
import ocaml from 'highlight.js/lib/languages/ocaml'
import elixir from 'highlight.js/lib/languages/elixir'
import erlang from 'highlight.js/lib/languages/erlang'
import lua from 'highlight.js/lib/languages/lua'
import perl from 'highlight.js/lib/languages/perl'
import r from 'highlight.js/lib/languages/r'
import dart from 'highlight.js/lib/languages/dart'
import groovy from 'highlight.js/lib/languages/groovy'
import vim from 'highlight.js/lib/languages/vim'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import makefile from 'highlight.js/lib/languages/makefile'
import protobuf from 'highlight.js/lib/languages/protobuf'
import graphql from 'highlight.js/lib/languages/graphql'
import markdown from 'highlight.js/lib/languages/markdown'

// 暗色主题：atom-one-dark（背景 #0d1117 与 mindx-chat UI 协调）
import 'highlight.js/styles/atom-one-dark.css'

const HLJS_LANGS: Record<string, any> = {
  javascript, typescript, xml, css, scss, less, json, yaml, ini, bash,
  powershell, go, python, java, kotlin, scala, clojure, csharp, ruby, php,
  rust, swift, c, cpp, objectivec, sql, haskell, ocaml, elixir, erlang,
  lua, perl, r, dart, groovy, vim, dockerfile, makefile, protobuf,
  graphql, markdown,
}
for (const [name, mod] of Object.entries(HLJS_LANGS)) {
  hljs.registerLanguage(name, mod)
}

// mermaid 初始化是幂等的（多处调用 useMarkdown 也只 init 一次）
let mermaidInited = false
function ensureMermaidInit() {
  if (mermaidInited) return
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
    fontFamily: 'inherit',
    themeVariables: {
      background: '#161b22',
      primaryColor: '#1e293b',
      primaryTextColor: '#e2e8f0',
      primaryBorderColor: '#06b6d4',
      lineColor: '#64748b',
      secondaryColor: '#0f172a',
      tertiaryColor: '#0d1117',
    }
  })
  mermaidInited = true
}

/**
 * useMarkdown —— 共享的 markdown-it + hljs + mermaid 配置
 *
 * 用法：
 *   const { md, renderMermaidInRoot } = useMarkdown()
 *   const html = md.render(content)
 *   // v-html 后，调用 renderMermaidInRoot(rootEl) 渲染 mermaid
 *
 * 内部说明：
 *   - hljs 在模块加载时一次性注册全部语言（实例共享，不重复注册）
 *   - mermaid 初始化也是模块级一次性
 *   - fence 规则重写：```mermaid 输出 <div class="mermaid">，跳过 hljs
 */
export function useMarkdown() {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    // highlight 钩子：已注册的语言走 hljs，未注册或抛错时降级 escape
    highlight: function (str: string, lang: string) {
      const safeLang = (lang || '').trim()
      if (safeLang && hljs.getLanguage(safeLang)) {
        try {
          const out = hljs.highlight(str, { language: safeLang, ignoreIllegals: true })
          return `<pre class="code-block"><code class="hljs language-${safeLang}">${out.value}</code></pre>`
        } catch {
          // 降级
        }
      }
      return `<pre class="code-block"><code class="language-${safeLang || 'text'}">${md.utils.escapeHtml(str)}</code></pre>`
    }
  })

  // fence 重写：```mermaid 走自定义 div，由 mermaid.run() 渲染
  const defaultFence = md.renderer.rules.fence
  md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
    const token = tokens[idx]
    const info = (token.info || '').trim().split(/\s+/)[0]
    if (info === 'mermaid') {
      return `<div class="mermaid" data-mermaid-source>${md.utils.escapeHtml(token.content)}</div>\n`
    }
    return defaultFence
      ? defaultFence(tokens, idx, options, env, slf)
      : slf.renderToken(tokens, idx, options)
  }

  // 扫描 root 容器内的 .mermaid 节点并渲染（已渲染的跳过）
  async function renderMermaidInRoot(root: HTMLElement | null | undefined): Promise<void> {
    if (!root) return
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('.mermaid'))
    const pending = nodes.filter(n => !n.querySelector('svg') && !n.dataset.rendered)
    if (pending.length === 0) return
    try {
      ensureMermaidInit()
      await mermaid.run({ nodes: pending })
      pending.forEach(n => { n.dataset.rendered = '1' })
    } catch (e) {
      console.warn('[useMarkdown] mermaid render failed:', e)
    }
  }

  return { md, renderMermaidInRoot }
}
