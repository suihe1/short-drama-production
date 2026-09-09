"""Offline frontmatter validation for the eight shipped skills; development only."""
from pathlib import Path
import re
import yaml

root=Path(__file__).resolve().parents[1]
paths=[root/'SKILL.md',*sorted((root/'skills').glob('*/SKILL.md'))]
assert len(paths)==8, f'Expected 8 skills, found {len(paths)}'
names=set()
for path in paths:
    text=path.read_text(encoding='utf-8-sig')
    match=re.match(r'^---\r?\n(.*?)\r?\n---(?:\r?\n|$)',text,re.S)
    assert match, f'{path}: missing frontmatter'
    header=yaml.safe_load(match.group(1))
    assert isinstance(header,dict), f'{path}: frontmatter must be a mapping'
    assert not set(header)-{'name','description','license','allowed-tools','metadata'}, f'{path}: unsupported fields'
    name=header.get('name')
    assert isinstance(name,str) and re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',name) and len(name)<=64 and name not in names, f'{path}: invalid/duplicate name'
    names.add(name)
    description=header.get('description')
    assert isinstance(description,str) and 0<len(description.strip())<=1024 and '<' not in description and '>' not in description, f'{path}: invalid description'
    assert 'metadata' not in header or isinstance(header['metadata'],dict), f'{path}: invalid metadata'
    print(f'PASS {name}')
