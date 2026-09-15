export const defaultMessages = {
  toolbar: 'Formatting',
  editorLabel: 'Rich text editor',
  undo: 'Undo',
  redo: 'Redo',
  heading: 'Text style',
  paragraph: 'Normal text',
  headingLevel: 'Heading {level}',
  fontFamily: 'Font',
  defaultFont: 'Default font',
  fontSize: 'Font size',
  defaultSize: 'Default',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  strike: 'Strikethrough',
  code: 'Inline code',
  superscript: 'Superscript',
  subscript: 'Subscript',
  color: 'Text color',
  highlight: 'Highlight color',
  noColor: 'None',
  customColor: 'Custom…',
  clearFormatting: 'Clear formatting',
  align: 'Alignment',
  alignLeft: 'Align left',
  alignCenter: 'Align center',
  alignRight: 'Align right',
  alignJustify: 'Justify',
  lineHeight: 'Line spacing',
  indent: 'Increase indent',
  outdent: 'Decrease indent',
  bulletList: 'Bulleted list',
  orderedList: 'Numbered list',
  taskList: 'Checklist',
  blockquote: 'Quote',
  codeBlock: 'Code block',
  horizontalRule: 'Horizontal line',
  link: 'Link',
  image: 'Image',
  table: 'Table',
  specialChars: 'Special characters',
  findReplace: 'Find and replace',
  pastePlain: 'Paste as plain text',
  file: 'File',
  print: 'Print',
  fullscreen: 'Full screen',
  exitFullscreen: 'Exit full screen',
  more: 'More',

  // file menu
  newDocument: 'New document',
  open: 'Open…',
  openHint: 'Word, HTML, Markdown, Text, JSON',
  downloadAs: 'Download as',
  formatDocx: 'Word document (.docx)',
  formatHtml: 'Web page (.html)',
  formatMarkdown: 'Markdown (.md)',
  formatText: 'Plain text (.txt)',
  formatJson: 'JSON (.json)',
  confirmNew: 'Discard the current document?',

  // link
  linkUrl: 'URL',
  linkText: 'Text',
  openInNewTab: 'Open in new tab',
  apply: 'Apply',
  cancel: 'Cancel',
  remove: 'Remove',
  edit: 'Edit',
  openLink: 'Open link',
  copyLink: 'Copy link',

  // image
  insertImage: 'Insert image',
  upload: 'Upload',
  byUrl: 'By URL',
  dropImage: 'Drop an image here or click to browse',
  imageTypes: 'PNG, JPG, GIF, WebP, SVG up to {size}',
  imageUrl: 'Image URL',
  altText: 'Alt text',
  altTextHint: 'Describe the image for screen readers',
  caption: 'Caption',
  addCaption: 'Add a caption…',
  insert: 'Insert',
  replaceImage: 'Replace image',
  imageAlignLeft: 'Align left',
  imageAlignCenter: 'Align center',
  imageAlignRight: 'Align right',
  imageWrapLeft: 'Wrap text, image left',
  imageWrapRight: 'Wrap text, image right',
  resetSize: 'Original size',
  deleteImage: 'Delete image',
  uploading: 'Uploading…',
  errorImageType: 'Unsupported image type.',
  errorImageSize: 'Image is larger than {size}.',
  errorImageUpload: 'Image upload failed.',

  // table
  insertTable: 'Insert table',
  tableSize: '{rows} × {cols}',
  addRowBefore: 'Insert row above',
  addRowAfter: 'Insert row below',
  deleteRow: 'Delete row',
  addColumnBefore: 'Insert column left',
  addColumnAfter: 'Insert column right',
  deleteColumn: 'Delete column',
  mergeCells: 'Merge cells',
  splitCell: 'Split cell',
  toggleHeaderRow: 'Header row',
  toggleHeaderColumn: 'Header column',
  cellBackground: 'Cell color',
  deleteTable: 'Delete table',
  rows: 'Rows',
  columns: 'Columns',

  // find & replace
  find: 'Find',
  replaceWith: 'Replace with',
  replace: 'Replace',
  replaceAll: 'Replace all',
  matchCase: 'Match case',
  previous: 'Previous',
  next: 'Next',
  close: 'Close',
  matchCount: '{current} of {total}',
  noResults: 'No results',

  // status bar
  words: '{count} words',
  characters: '{count} characters',
  saved: 'Saved',

  // special characters
  symbols: 'Symbols',
  arrows: 'Arrows',
  math: 'Math',
  currency: 'Currency',
  emoji: 'Emoji',

  // errors
  errorImport: 'Could not open this file.',
  errorExport: 'Export failed.',
  errorClipboard: 'Clipboard access was denied. Use Ctrl+Shift+V instead.',
}

export type Messages = typeof defaultMessages
export type MessageKey = keyof Messages

export function createTranslator(overrides: Partial<Messages> = {}) {
  const messages = { ...defaultMessages, ...overrides }
  return (key: MessageKey, params?: Record<string, string | number>) => {
    let text = messages[key] ?? key
    if (params) for (const [k, v] of Object.entries(params)) text = text.replace(`{${k}}`, String(v))
    return text
  }
}

export type Translate = ReturnType<typeof createTranslator>
