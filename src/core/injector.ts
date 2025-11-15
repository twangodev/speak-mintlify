/**
 * MDX Component Injector
 * Injects audio player components into MDX files using AST manipulation
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { visit, SKIP } from 'unist-util-visit';
import type { Root, Node } from 'mdast';
import type { Voice } from '../types/index.js';

/**
 * Parse MDX content into AST
 */
async function parseMDX(content: string): Promise<Root> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm) // Parse GFM features
    .use(remarkMdx)
    .use(remarkFrontmatter);

  return processor.parse(content) as Root;
}

/**
 * Extract existing audio component data from MDX using AST
 * Returns { hash, voiceIds } if component exists, null otherwise
 */
export async function extractExistingAudioData(
  content: string,
  componentName: string
): Promise<{ hash: string | null; voiceIds: string[]; voices: Voice[] } | null> {
  const ast = await parseMDX(content);

  let foundHash: string | null = null;
  let foundVoices: Voice[] = [];

  function walkTree(node: any) {
    // Look for MDX comments with hash {/* speak-mintlify-hash: abc123 */}
    if (node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression') {
      const value = node.value || '';
      const hashMatch = value.match(/\/\*\s*speak-mintlify-hash:\s*([a-f0-9]+)\s*\*\//);
      if (hashMatch) {
        foundHash = hashMatch[1]!;
      }
    }

    // Look for MDX JSX elements (AudioTranscript component)
    if (
      (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') &&
      node.name === componentName
    ) {
      // Find voices attribute
      const voicesAttr = node.attributes?.find((attr: any) => attr.name === 'voices');

      if (voicesAttr && voicesAttr.value) {
        try {
          // The value is an expression - extract the JSON
          let jsonStr = '';
          if (typeof voicesAttr.value === 'string') {
            jsonStr = voicesAttr.value;
          } else if (voicesAttr.value.type === 'mdxJsxAttributeValueExpression') {
            jsonStr = voicesAttr.value.value;
          }

          // Parse the voices array
          const voices = JSON.parse(jsonStr);
          foundVoices = voices;
        } catch (error) {
          // Failed to parse, ignore
        }
      }
    }

    // Recursively visit children
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        walkTree(child);
      }
    }
  }

  walkTree(ast);

  if (foundVoices.length > 0) {
    return {
      hash: foundHash,
      voiceIds: foundVoices.map(v => v.id),
      voices: foundVoices,
    };
  }

  return null;
}

/**
 * Check if MDX content already has the audio component
 */
export function hasAudioComponent(
  content: string,
  componentName: string
): boolean {
  const componentRegex = new RegExp(`<${componentName}[^>]*`, 'g');
  return componentRegex.test(content);
}

/**
 * Find the position to insert import and component using AST
 * Returns { importPos, componentPos } - line numbers where to insert
 */
async function findInsertionPoints(content: string): Promise<{ importPos: number; componentPos: number }> {
  const ast = await parseMDX(content);

  let frontmatterEndLine = 0;
  let lastImportEndLine = 0;
  let firstContentLine = 0;

  function walkTree(node: any) {
    // Find frontmatter end
    if (node.type === 'yaml' || node.type === 'toml') {
      if (node.position?.end?.line) {
        frontmatterEndLine = node.position.end.line;
      }
    }

    // Find import/export statements (mdxjsEsm nodes)
    if (node.type === 'mdxjsEsm') {
      if (node.position?.end?.line) {
        lastImportEndLine = Math.max(lastImportEndLine, node.position.end.line);
      }
    }

    // Find first actual content node (heading, paragraph, or MDX component)
    if (
      !firstContentLine &&
      (node.type === 'heading' || node.type === 'paragraph' || node.type === 'mdxJsxFlowElement') &&
      node.position?.start?.line
    ) {
      firstContentLine = node.position.start.line;
    }

    // Recursively visit children
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        walkTree(child);
      }
    }
  }

  walkTree(ast);

  // Import position: after last import, or after frontmatter
  const importPos = lastImportEndLine > 0 ? lastImportEndLine : frontmatterEndLine;

  // Component position: after all imports, before first content
  const componentPos = firstContentLine > 0 ? firstContentLine - 1 : importPos;

  return { importPos, componentPos };
}

/**
 * Inject audio component into MDX content
 */
export async function injectAudioComponent(
  mdxContent: string,
  voices: Voice[],
  hash: string,
  options: {
    componentImport?: string;
    componentName?: string;
  } = {}
): Promise<string> {
  const {
    componentImport = '/snippets/audio-transcript.jsx',
    componentName = 'AudioTranscript',
  } = options;

  const lines = mdxContent.split('\n');

  // Check if import already exists
  const importStatement = `import { ${componentName} } from '${componentImport}';`;
  const hasImport = lines.some(line => line.includes(`import { ${componentName} }`));

  // Check if component already exists
  if (hasAudioComponent(mdxContent, componentName)) {
    // Check if component is correctly placed (not nested in another component)
    // by looking for it at the top level after imports
    const lines = mdxContent.split('\n');
    let inOtherComponent = false;
    let componentStart = -1;
    let componentEnd = -1;
    let hashLine = -1;
    let lastImportLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim();

      // Track imports
      if (line.startsWith('import ')) {
        lastImportLine = i;
      }

      // Track if we're inside another component
      if (line.match(/^<[A-Z]\w+/) && !line.includes(`<${componentName}`)) {
        inOtherComponent = true;
      }
      if (inOtherComponent && line.match(/^<\/[A-Z]\w+/)) {
        inOtherComponent = false;
      }

      // Find hash comment
      if (line.includes('speak-mintlify-hash:')) {
        hashLine = i;
      }

      // Find component start
      if (lines[i]!.includes(`<${componentName}`)) {
        componentStart = i;
      }

      // Find component end
      if (componentStart >= 0 && lines[i]!.includes('/>')) {
        componentEnd = i;
        break;
      }
    }

    // If component is nested, remove it and re-insert at correct position
    if (componentStart >= 0 && componentEnd >= 0) {
      // Remove old hash and component
      if (hashLine >= 0 && hashLine < componentStart) {
        lines.splice(hashLine, componentEnd - hashLine + 1);
      } else {
        lines.splice(componentStart, componentEnd - componentStart + 1);
      }

      // Re-insert at correct position (after imports)
      const insertPos = lastImportLine + 1;
      const voicesFormatted = JSON.stringify(voices, null, 2)
        .split('\n')
        .map((line, idx) => (idx === 0 ? line : '  ' + line))
        .join('\n');

      const newHashComment = `{/* speak-mintlify-hash: ${hash} */}`;
      const newComponent = `<${componentName} voices={${voicesFormatted}} />`;

      lines.splice(insertPos, 0, '', newHashComment, newComponent);

      return lines.join('\n');
    }
  }

  // Find insertion points using AST
  const { importPos, componentPos } = await findInsertionPoints(mdxContent);

  // Format voices with proper indentation
  const voicesFormatted = JSON.stringify(voices, null, 2)
    .split('\n')
    .map((line, idx) => (idx === 0 ? line : '  ' + line))
    .join('\n');

  const hashComment = `{/* speak-mintlify-hash: ${hash} */}`;
  const componentCode = `<${componentName} voices={${voicesFormatted}} />`;

  // Insert import if not exists
  if (!hasImport) {
    lines.splice(importPos, 0, importStatement);
  }

  // Insert component (adjust position if we added import)
  const adjustedComponentPos = hasImport ? componentPos : componentPos + 1;

  // Add blank line before component if needed
  if (lines[adjustedComponentPos - 1]?.trim() !== '') {
    lines.splice(adjustedComponentPos, 0, '');
  }

  // Insert hash comment and component
  lines.splice(adjustedComponentPos, 0, hashComment);
  lines.splice(adjustedComponentPos + 1, 0, componentCode);

  // Add blank line after component if needed
  if (lines[adjustedComponentPos + 2]?.trim() !== '') {
    lines.splice(adjustedComponentPos + 2, 0, '');
  }

  return lines.join('\n');
}

/**
 * Remove audio component from MDX content
 * @param mdxContent - MDX content
 * @param componentName - Name of the component to remove
 * @returns MDX content without audio component
 */
export function removeAudioComponent(
  mdxContent: string,
  componentName: string = 'AudioTranscript'
): string {
  // Remove import statement
  const importRegex = new RegExp(
    `import\\s+\\{\\s*${componentName}\\s*\\}\\s+from\\s+['"][^'"]+['"];?\\s*`,
    'g'
  );
  let cleaned = mdxContent.replace(importRegex, '');

  // Remove component usage
  const componentRegex = new RegExp(
    `<${componentName}\\s+voices=\\{[^}]+\\}\\s*\\/>\\s*`,
    'g'
  );
  cleaned = cleaned.replace(componentRegex, '');

  return cleaned;
}
