/**
 * MDX Content Extractor
 * Extracts clean, TTS-friendly text from MDX files
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import stripMarkdown from 'strip-markdown';
import remarkStringify from 'remark-stringify';
import remarkMdxRemoveEsm from 'remark-mdx-remove-esm';
import remarkUnlink from 'remark-unlink';
import { visit, SKIP } from 'unist-util-visit';
import type { Node } from 'unist';
import matter from 'gray-matter';

/**
 * Custom remark plugin to remove MDX JSX components
 */
function remarkRemoveJSX() {
  return (tree: Node) => {
    visit(tree, (node, index, parent) => {
      // Remove MDX JSX elements
      if (
        node.type === 'mdxJsxFlowElement' ||
        node.type === 'mdxJsxTextElement' ||
        node.type === 'mdxFlowExpression' ||
        node.type === 'mdxTextExpression'
      ) {
        if (parent && typeof index === 'number' && 'children' in parent) {
          (parent as any).children.splice(index, 1);
          return [SKIP, index];
        }
      }
    });
  };
}

/**
 * Extract clean text from MDX file for TTS
 * @param mdxContent - Raw MDX file content
 * @returns Cleaned text suitable for TTS
 */
export async function extractCleanText(mdxContent: string): Promise<string> {
  // Remove frontmatter using gray-matter
  const { content } = matter(mdxContent);

  // Process with remark pipeline
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm) // Parse GFM (tables, footnotes, etc.)
    .use(remarkMdx) // Parse MDX (JSX, imports, etc.)
    .use(remarkFrontmatter)
    .use(remarkMdxRemoveEsm) // Remove import/export statements
    .use(remarkRemoveJSX) // Remove JSX components
    .use(remarkUnlink) // Remove links/images (keeps text)
    .use(stripMarkdown) // Convert to plain text
    .use(remarkStringify);

  const result = await processor.process(content);
  let cleanedText = String(result);

  // Remove markdown escape characters
  cleanedText = cleanedText.replace(/\\([*_`~\[\](){}#+\-.!|])/g, '$1');

  // Clean up orphaned punctuation
  cleanedText = cleanedText.replace(/[:,]\s*,/g, ',');
  cleanedText = cleanedText.replace(/,(\s*,)+/g, ',');
  cleanedText = cleanedText.replace(/:\s*,+\s*/g, ': ');
  cleanedText = cleanedText.replace(/:\s*\./g, '.');
  cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n');

  return cleanedText.trim();
}

/**
 * Find the end position of frontmatter in MDX content
 * @param content - MDX file content
 * @returns Position where frontmatter ends (0 if no frontmatter)
 */
export function findFrontmatterEnd(content: string): number {
  const match = content.match(/^---\n[\s\S]*?\n---\n/);
  return match ? match[0].length : 0;
}

/**
 * Extract frontmatter from MDX content
 * @param content - MDX file content
 * @returns Parsed frontmatter object
 */
export function extractFrontmatter(content: string): Record<string, any> {
  const { data } = matter(content);
  return data;
}
