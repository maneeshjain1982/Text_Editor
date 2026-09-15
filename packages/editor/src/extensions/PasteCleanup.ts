import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * Strips Office / Google Docs noise from pasted HTML before ProseMirror parses it.
 * The schema already drops unknown tags; this removes things it would otherwise
 * keep as text (conditional comments, <o:p>, style blocks) or misinterpret.
 */
export function cleanPastedHTML(html: string): string {
  return html
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<meta[^>]*>/gi, '')
    .replace(/<link[^>]*>/gi, '')
    .replace(/<\/?o:p[^>]*>/gi, '')
    .replace(/<\/?(w|m|v):[^>]*>/gi, '')
    .replace(/\sclass="?Mso[\w-]*"?/gi, '')
    .replace(/mso-[\w-]+:[^;"']+;?/gi, '')
}

export const PasteCleanup = Extension.create({
  name: 'pasteCleanup',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('pasteCleanup'),
        props: {
          transformPastedHTML: cleanPastedHTML,
        },
      }),
    ]
  },
})
