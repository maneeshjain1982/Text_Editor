/**
 * .docx → HTML using mammoth (loaded on demand). The HTML is then parsed by the
 * editor schema. Formatting mammoth can't express as semantic HTML (fonts,
 * colours) is intentionally dropped; structure, lists, tables, images, links,
 * bold/italic/underline/strike/sup/sub are preserved.
 */
export async function importDocx(file: Blob): Promise<string> {
  const mod: any = await import('mammoth')
  const mammoth = mod.default ?? mod
  const arrayBuffer = await file.arrayBuffer()
  // mammoth's browser build reads `arrayBuffer`, its Node build reads `buffer`.
  const NodeBuffer = (globalThis as any).Buffer
  const input = NodeBuffer ? { arrayBuffer, buffer: NodeBuffer.from(arrayBuffer) } : { arrayBuffer }

  const result = await mammoth.convertToHtml(
    input,
    {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='Quote'] => blockquote > p:fresh",
        "p[style-name='Intense Quote'] => blockquote > p:fresh",
        "r[style-name='Code'] => code",
        "p[style-name='Code'] => pre:separator('\\n')",
        'u => u',
        'strike => s',
        'highlight => mark',
      ],
      convertImage: mammoth.images.imgElement(async (image: any) => ({
        src: `data:${image.contentType};base64,${await image.read('base64')}`,
      })),
    },
  )
  return result.value as string
}
