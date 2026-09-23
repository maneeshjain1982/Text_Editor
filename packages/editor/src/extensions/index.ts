import type { Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { CharacterCount, Placeholder } from '@tiptap/extensions'
import { TextStyle, Color, FontFamily, FontSize } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Table, TableRow } from '@tiptap/extension-table'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { BlockAttributes } from './BlockAttributes'
import { SearchReplace } from './SearchReplace'
import { Image, type ImageOptions } from './Image'
import { ColoredTableCell, ColoredTableHeader } from './Table'
import { PasteCleanup } from './PasteCleanup'
import { PageBreak } from './PageBreak'
import { AutoPagination } from './AutoPagination'
import { lowlight } from './lowlight'
import { AiSuggestionExtension, type AiSuggestionOptions } from './AiSuggestion'
import type { EditorFeatures } from '../types'

export interface BuildExtensionsOptions {
  placeholder: () => string
  features: Required<EditorFeatures>
  image: ImageOptions
  /** AI suggestion callbacks. The extension is always registered (it is inert without suggestions). */
  ai?: Partial<AiSuggestionOptions>
  /** Label shown on page-break lines. */
  pageBreakLabel?: string
  /** Show where pages end while typing (page layout only). `label` may contain `{page}`. */
  autoPagination?: { enabled: boolean; label?: string }
  extra?: Extensions
}

export function buildExtensions({ placeholder, features, image, ai, pageBreakLabel, autoPagination, extra = [] }: BuildExtensionsOptions): Extensions {
  const extensions: Extensions = [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: null },
      },
      codeBlock: features.codeHighlight ? false : {},
    }),
    Placeholder.configure({ placeholder }),
    CharacterCount,
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Subscript,
    Superscript,
    BlockAttributes,
    SearchReplace,
    PasteCleanup,
    PageBreak.configure(pageBreakLabel ? { label: pageBreakLabel } : {}),
    AutoPagination.configure({
      enabled: autoPagination?.enabled ?? false,
      ...(autoPagination?.label ? { label: autoPagination.label } : {}),
    }),
    AiSuggestionExtension.configure(ai ?? {}),
  ]

  if (features.codeHighlight) extensions.push(CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }))
  if (features.taskList) extensions.push(TaskList, TaskItem.configure({ nested: true }))
  if (features.tables) {
    extensions.push(
      Table.configure({ resizable: true, cellMinWidth: 48, allowTableNodeSelection: true }),
      TableRow,
      ColoredTableHeader,
      ColoredTableCell,
    )
  }
  if (features.images) extensions.push(Image.configure(image))

  return [...extensions, ...extra]
}

export { findMatches } from './SearchReplace'
export { cleanPastedHTML } from './PasteCleanup'
export { PageBreak, PAGE_BREAK_HTML, PAGE_BREAK_MARKER } from './PageBreak'
export { AutoPagination, autoPaginationKey } from './AutoPagination'
export { AiSuggestionExtension, getAiSuggestionState, aiSuggestionKey, type AiSuggestion } from './AiSuggestion'
