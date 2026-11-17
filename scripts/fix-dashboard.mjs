import fs from 'fs';

const f = 'src/pages/DashboardPage.tsx';
let s = fs.readFileSync(f, 'utf8');
s = s.replace(/data=\{taskDistribution\}="vertical"/g, 'data={taskDistribution} layout="vertical"');
s = s.replace(/\s+initial="hidden"/g, '');
s = s.replace(/\s+animate="visible"/g, '');
fs.writeFileSync(f, s);
console.log('ok', (s.match(/layout="vertical"/g) || []).length);
console.log('bad', (s.match(/\}="vertical"/g) || []).length);
