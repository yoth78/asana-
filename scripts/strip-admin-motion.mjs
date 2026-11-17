import fs from 'fs';

const f = 'src/pages/AdminPage.tsx';
let s = fs.readFileSync(f, 'utf8');
s = s.replace(/<motion\.(div|form)/g, '<$1');
s = s.replace(/<\/motion\.(div|form)>/g, '</$1>');
s = s.replace(/\s+initial=\{\{[^}]+\}\}/g, '');
s = s.replace(/\s+animate=\{\{[^}]+\}\}/g, '');
s = s.replace(/\s+exit=\{\{[^}]+\}\}/g, '');
s = s.replace(/\s+transition=\{\{[^}]+\}\}/g, '');
if (!s.includes('motion.') && !s.includes('AnimatePresence')) {
  s = s.replace(/import\s*\{[^}]*\}\s*from\s*['"]framer-motion['"];\s*\n?/g, '');
} else if (!s.includes('motion.') && s.includes('AnimatePresence')) {
  s = s.replace(/import\s*\{\s*motion,\s*AnimatePresence\s*\}\s*from\s*['"]framer-motion['"]/, "import { AnimatePresence } from 'framer-motion'");
} else if (s.includes('motion.') && !s.includes('AnimatePresence')) {
  s = s.replace(/import\s*\{\s*motion,\s*AnimatePresence\s*\}\s*from\s*['"]framer-motion['"]/, "import { motion } from 'framer-motion'");
}
fs.writeFileSync(f, s);
console.log('AdminPage cleaned');
