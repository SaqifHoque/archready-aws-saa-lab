import { mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
const out='demo-dist';
rmSync(out,{recursive:true,force:true}); mkdirSync(`${out}/data`,{recursive:true});
for(const name of ['app.js','styles.css','services.js','learning.js','cloud-config.js','cloud-sync.js']) copyFileSync(name,`${out}/${name}`);
copyFileSync('data/demo-questions.js',`${out}/data/questions.js`);
const notice='<aside role="status" style="padding:14px 24px;background:#e9f1e8;color:#183720;text-align:center">Public showcase · 12 original practice questions, not real exam questions. Progress stays in this browser; cloud accounts are disabled. Exam readiness scores from this small sample are illustrative only. <a href="https://github.com/SaqifHoque/archready-aws-saa-lab">Source and setup</a></aside>';
writeFileSync(`${out}/index.html`,readFileSync('index.html','utf8').replace('<body>','<body>'+notice));
writeFileSync(`${out}/vercel.json`,JSON.stringify({framework:null,buildCommand:'',outputDirectory:'.'}));
