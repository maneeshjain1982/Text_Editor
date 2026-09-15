import { createLowlight } from 'lowlight'
import bash from 'highlight.js/lib/languages/bash'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

/** Shared highlighter: used by the editor and by the DOCX exporter for coloured code. */
export const lowlight = createLowlight({
  bash, cpp, csharp, css, go, java, javascript, json, kotlin, markdown, php, python, sql, typescript, xml, yaml,
})

export const CODE_LANGUAGES: { value: string; label: string }[] = [
  { value: '', label: 'Plain text' },
  { value: 'bash', label: 'Bash' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'css', label: 'CSS' },
  { value: 'go', label: 'Go' },
  { value: 'xml', label: 'HTML / XML' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'json', label: 'JSON' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'php', label: 'PHP' },
  { value: 'python', label: 'Python' },
  { value: 'sql', label: 'SQL' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'yaml', label: 'YAML' },
]

/** GitHub-light palette, shared by the editor CSS and the DOCX exporter. */
export const TOKEN_COLORS: Record<string, string> = {
  keyword: 'CF222E', 'selector-tag': 'CF222E', type: 'CF222E', 'template-tag': 'CF222E',
  string: '0A3069', regexp: '0A3069', 'selector-attr': '0A3069', 'selector-pseudo': '0A3069',
  number: '0550AE', literal: '0550AE', built_in: '0550AE', attr: '0550AE', attribute: '0550AE', variable: '953800',
  'title.function': '8250DF', title: '8250DF', 'title.class': '953800', 'selector-class': '6639BA', 'selector-id': '6639BA',
  comment: '6E7781', quote: '6E7781', meta: '6E7781', doctag: 'CF222E',
  name: '116329', 'selector-name': '116329', tag: '116329', section: '0550AE', symbol: '0550AE', bullet: '953800',
  addition: '116329', deletion: '82071E', params: '24292F', property: '0550AE',
}
