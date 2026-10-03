export interface SkillTemplate {
  name: string;
  description: string;
  content: string;
  category: string;
}

export interface RuleTemplate {
  title: string;
  content: string;
  priority: string;
}

export const SKILL_TEMPLATES: SkillTemplate[] = [
  {
    name: "Code Review",
    description: "Checklist for reviewing pull requests.",
    category: "engineering",
    content: `# Code Review\n\n1. Does the change match the stated intent?\n2. Are edge cases and errors handled?\n3. Is there a test covering the new behavior?\n4. No dead code, no commented-out blocks.\n5. Naming reveals intent; no abbreviations.`,
  },
  {
    name: "Commit Messages",
    description: "Conventional commits, one idea per commit.",
    category: "engineering",
    content: `# Commit Messages\n\nFormat: \`type(scope): subject\` (feat, fix, docs, refactor, test, chore).\nSubject in imperative mood, max 72 chars. Body explains WHY, not what.\nOne logical change per commit.`,
  },
  {
    name: "API Design",
    description: "Rules for stable, boring APIs.",
    category: "engineering",
    content: `# API Design\n\n- Nouns for resources, verbs for actions; no leaking internals.\n- Errors carry machine-readable codes + human messages.\n- Pagination, filtering and limits on every list endpoint.\n- Version explicitly; never break a published contract silently.`,
  },
];

export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    title: "Always use TypeScript strict mode",
    content: "All frontend code must compile under strict TypeScript. No implicit any, no unchecked indexing.",
    priority: "critical",
  },
  {
    title: "Search uses the index, never full scans",
    content: "All retrieval queries must use the SQLite FTS5 index or capped queries. Never load whole tables into RAM.",
    priority: "high",
  },
  {
    title: "Conventional commits",
    content: "Use conventional commit messages for every change: type(scope): subject.",
    priority: "low",
  },
];
