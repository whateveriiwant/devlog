from pathlib import Path
import zipfile,json
root=Path.cwd()
files=[Path(name) for name in ['.env.example','.gitignore','.node-version','README.md','astro.config.mjs','components.json','package.json','pnpm-lock.yaml','tsconfig.json']]
for folder in ['src','scripts','public','migration']:
 files.extend(p for p in Path(folder).rglob('*') if p.is_file() and p.suffix in ['.astro','.tsx','.ts','.css','.mjs','.py','.svg','.md','.json'] and '__pycache__' not in p.parts)
Path('migration/shadcn-redesign.md').write_text(Path('outputs/shadcn-redesign.md').read_text())
files.append(Path('migration/shadcn-redesign.md'))
files=sorted(set(files))
zip_path=Path('outputs/seungjun-blog-source.zip')
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in files:z.write(p,'seungjun-dev-blog/'+p.as_posix())
with zipfile.ZipFile(zip_path) as z:
 assert z.testzip() is None
 assert sum('/src/content/posts/' in n for n in z.namelist())==125
 for p in files:assert z.read('seungjun-dev-blog/'+p.as_posix())==p.read_bytes()
 print(json.dumps({'files':len(files),'bytes':zip_path.stat().st_size,'postFiles':125,'crcAndContent':'passed'}))
