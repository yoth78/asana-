import fs from 'fs';

const f = 'src/pages/AdminPage.tsx';
let s = fs.readFileSync(f, 'utf8');
// Unwrap AnimatePresence (with optional mode prop)
s = s.replace(/<AnimatePresence(?:\s+mode="wait")?>\s*/g, '');
s = s.replace(/\s*<\/AnimatePresence>/g, '');
s = s.replace(/import\s*\{\s*AnimatePresence\s*\}\s*from\s*['"]framer-motion['"];\s*\n?/g, '');
fs.writeFileSync(f, s);
console.log('Admin AnimatePresence removed');
