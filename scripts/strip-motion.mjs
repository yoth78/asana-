import fs from 'fs';

const files = [
  'src/pages/DashboardPage.tsx',
  'src/components/projects/ProjectCard.tsx',
  'src/components/common/EmptyState.tsx',
  'src/components/layout/Sidebar.tsx',
  'src/components/tasks/TaskCard.tsx'
];

function stripMotion(s) {
  s = s.replace(/<motion\.(div|aside|form|button|li|span|tr|ul)/g, '<$1');
  s = s.replace(/<\/motion\.(div|aside|form|button|li|span|tr|ul)>/g, '</$1>');
  s = s.replace(/\s+initial=\{\{[^}]+\}\}/g, '');
  s = s.replace(/\s+animate=\{\{[^}]+\}\}/g, '');
  s = s.replace(/\s+exit=\{\{[^}]+\}\}/g, '');
  s = s.replace(/\s+variants=\{[a-zA-Z0-9_]+\}/g, '');
  s = s.replace(/\s+whileHover=\{\{[^}]+\}\}/g, '');
  s = s.replace(/\s+whileTap=\{\{[^}]+\}\}/g, '');
  s = s.replace(/\s+layout(?:=\{[^}]+\})?/g, '');
  s = s.replace(/\s+transition=\{\{[^}]+\}\}/g, '');
  return s;
}

for (const f of files) {
  if (!fs.existsSync(f)) {
    console.log('skip', f);
    continue;
  }
  let s = fs.readFileSync(f, 'utf8');
  s = stripMotion(s);
  if (!s.includes('motion.') && !s.includes('AnimatePresence') && !s.includes('<motion')) {
    s = s.replace(/import\s*\{[^}]*\}\s*from\s*['"]framer-motion['"];\s*\n?/g, '');
  }
  if (f.includes('DashboardPage')) {
    s = s.replace(/const containerVariants = \{[\s\S]*?\};\s*/m, '');
    s = s.replace(/const itemVariants = \{[\s\S]*?\};\s*/m, '');
  }
  // ProjectCard purple leftovers
  s = s.replace(/rgba\(108,\s*92,\s*231,\s*0\.1\)/g, 'var(--primary-alpha)');
  s = s.replace(/var\(--color-primary\)/g, 'var(--primary)');
  s = s.replace(/var\(--color-success\)/g, 'var(--success)');
  // EmptyState circular icon
  s = s.replace(/borderRadius:\s*['"]50%['"]/g, "borderRadius: 'var(--radius-md)'");
  fs.writeFileSync(f, s);
  console.log('updated', f);
}
