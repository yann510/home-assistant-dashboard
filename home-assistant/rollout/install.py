#!/usr/bin/env python3
"""Stage a reviewable mood install; never restart HA or exercise devices.

Run on a private local copy/mount of the HA config directory. Default is dry-run.
PyYAML (bundled with Home Assistant) is needed only to stage scripts.yaml.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone

REPO=Path(__file__).resolve().parents[2]
PATHS=['configuration.yaml','scripts.yaml','custom_components/lepro_led','custom_components/house_moods','www/dashboard']

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def fingerprint(root,paths):
    result={}
    for relative in paths:
        path=root/relative
        if path.is_symlink():raise ValueError(f'Refusing symlink: {relative}')
        if not path.exists():result[relative]=None;continue
        files=sorted(path.rglob('*')) if path.is_dir() else [path]
        for file in files:
            if file.is_symlink():raise ValueError(f'Refusing symlink: {file.relative_to(root)}')
            if file.is_file() and '__pycache__' not in file.parts:result[str(file.relative_to(root))]=digest(file)
        if path.is_dir():result[relative+'/']='<directory>'
    return result

def check_fingerprint(root,expected):
    # Re-inventory complete roots, including additions/deletions since staging.
    current=fingerprint(root,PATHS) if any(p in expected or p+'/' in expected for p in PATHS[2:]) else fingerprint(root,list(expected))
    if current!=expected:raise ValueError('Deployment files changed after staging. Prepare and review a fresh bundle.')

def normalized_script(value):
    if isinstance(value,list):return [normalized_script(v) for v in value]
    if isinstance(value,dict):return {('action' if k=='service' else k):normalized_script(v) for k,v in value.items()}
    return value

def verify_script(actual,expected):
    if normalized_script(actual)!=normalized_script(expected):raise ValueError('Follow-me script drifted; merge its mood join hook manually before rollout.')

def enable_configuration(text):
    lines=text.splitlines()
    if any(re.match(r'^house_moods\s*:',line) for line in lines):
        if sum(bool(re.match(r'^house_moods\s*:\s*\{\}\s*(#.*)?$',line)) for line in lines)==1:return text
        raise ValueError('Existing house_moods configuration needs manual review.')
    return text.rstrip()+'\n\nhouse_moods: {}\n'

def atomic_copy(source,destination):
    destination.parent.mkdir(parents=True,exist_ok=True)
    handle,name=tempfile.mkstemp(prefix='.mood-',dir=destination.parent)
    os.close(handle)
    try:
        shutil.copy2(source,name)
        os.replace(name,destination)
    finally:
        if os.path.exists(name):os.unlink(name)

def publish_dashboard(source,destination):
    if not (source/'index.html').is_file():raise ValueError('Staged dashboard has no index.html.')
    files=[p for p in source.rglob('*') if p.is_file() and p.relative_to(source)!=Path('index.html')]
    # Content-hashed assets can coexist with old assets. Never overwrite a
    # same-name asset with different content while the previous entry serves it.
    for file in files:
        target=destination/file.relative_to(source)
        if target.exists() and digest(file)!=digest(target):raise ValueError(f'Dashboard asset collision: {file.relative_to(source)}')
    for file in files:atomic_copy(file,destination/file.relative_to(source))
    atomic_copy(source/'index.html',destination/'index.html')

def stage(config_root,bundle,dist):
    import yaml
    config_root=config_root.resolve();bundle=bundle.resolve();dist=dist.resolve()
    if bundle==config_root or config_root in bundle.parents:raise ValueError('Keep the private bundle outside the serving config directory.')
    if bundle.exists():raise ValueError('Bundle directory already exists; choose a fresh path.')
    for file in ('configuration.yaml','scripts.yaml'):
        if not (config_root/file).is_file():raise ValueError(f'Missing {file}; this installer expects the verified YAML layout.')
    if not (dist/'index.html').is_file():raise ValueError('Build the dashboard before staging.')
    hashes=json.loads((REPO/'home-assistant/lepro-extension/baseline-sha256.json').read_text())
    lepro=config_root/'custom_components/lepro_led'
    for name,expected in hashes.items():
        if not (lepro/name).is_file() or digest(lepro/name)!=expected:raise ValueError(f'Installed Lepro source drifted: {name}')
    if (config_root/'custom_components/house_moods').exists():raise ValueError('House Moods is already installed; review an upgrade instead of a first-install overwrite.')
    config=(config_root/'configuration.yaml').read_text()
    if not re.search(r'^script:\s*!include\s+scripts\.yaml\s*(#.*)?$',config,re.M):raise ValueError('Expected script: !include scripts.yaml; merge other layouts manually.')
    scripts=yaml.safe_load((config_root/'scripts.yaml').read_text())
    if not isinstance(scripts,dict):raise ValueError('scripts.yaml must be a mapping.')
    baseline=json.loads((REPO/'home-assistant/rollout/speaker-follow-baseline.json').read_text())['script']['config']
    verify_script(scripts.get('speaker_follow_motion'),baseline)
    before=fingerprint(config_root,PATHS)
    bundle.mkdir(mode=0o700,parents=True)
    staged=bundle/'staged';staged.mkdir(mode=0o700)
    extension=staged/'custom_components/lepro_led'
    shutil.copytree(lepro,extension,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
    patch=REPO/'home-assistant/lepro-extension/integration.patch'
    for dry in (True,False):
        command=['patch','--batch','-p1','-d',str(extension),'-i',str(patch)]
        if dry:command.append('--dry-run')
        subprocess.run(command,check=True,capture_output=True,text=True)
    for name in ('native_state.py','native_services.py'):shutil.copy2(patch.parent/name,extension/name)
    component=REPO/'home-assistant/custom_components/house_moods'
    if not (component/'manifest.json').is_file():raise ValueError('House Moods integration is incomplete.')
    shutil.copytree(component,staged/'custom_components/house_moods',ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
    (staged/'configuration.yaml').write_text(enable_configuration(config))
    scripts['speaker_follow_motion']=json.loads((REPO/'home-assistant/speaker-follow.json').read_text())['script']['config']
    (staged/'scripts.yaml').write_text(yaml.safe_dump(scripts,sort_keys=False,allow_unicode=True))
    shutil.copytree(dist,staged/'www/dashboard')
    manifest={'version':1,'created_at':datetime.now(timezone.utc).isoformat(),'config_root':str(config_root),'before':before,'staged':fingerprint(staged,PATHS),'status':'staged'}
    (bundle/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    for file in bundle.rglob('*'):
        if file.is_file():file.chmod(0o600)
        elif file.is_dir():file.chmod(0o700)
    return manifest

def apply(bundle):
    bundle=bundle.resolve();manifest=json.loads((bundle/'manifest.json').read_text())
    if manifest.get('version')!=1 or manifest.get('status')!='staged':raise ValueError('Expected a fresh, staged bundle.')
    root=Path(manifest['config_root']);staged=bundle/'staged'
    check_fingerprint(root,manifest['before'])
    if fingerprint(staged,PATHS)!=manifest['staged']:raise ValueError('Staged files changed after review; prepare a fresh bundle.')
    # Validate frontend collisions before making any configuration changes.
    for source in (staged/'www/dashboard').rglob('*'):
        if source.is_file() and source.name!='index.html':
            target=root/'www/dashboard'/source.relative_to(staged/'www/dashboard')
            if target.exists() and digest(target)!=digest(source):raise ValueError('A dashboard asset collision requires a rebuilt asset name.')
    backup=bundle/'backup';backup.mkdir(mode=0o700)
    for relative in PATHS:
        source=root/relative;destination=backup/relative
        if source.is_dir():shutil.copytree(source,destination,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
        elif source.is_file():destination.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,destination)
    # Backups and snapshots may include local secrets; never put bundle under www.
    for path in backup.rglob('*'):path.chmod(0o700 if path.is_dir() else 0o600)
    manifest['status']='applying';(bundle/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    try:
        for relative in PATHS[:4]:
            source=staged/relative
            if source.is_dir():
                for file in source.rglob('*'):
                    if file.is_file():atomic_copy(file,root/relative/file.relative_to(source))
            else:atomic_copy(source,root/relative)
        publish_dashboard(staged/'www/dashboard',root/'www/dashboard')
    except Exception:
        manifest['status']='partial';(bundle/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
        raise
    manifest['status']='installed';(bundle/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    return manifest

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config-root',type=Path,help='Local copy/mount of the verified HA config directory')
    parser.add_argument('--bundle',type=Path,required=True,help='Private directory outside config/www')
    parser.add_argument('--dist',type=Path,default=REPO/'dist')
    parser.add_argument('--apply',action='store_true',help='Install an already staged/reviewed bundle, with backup; does not restart HA')
    args=parser.parse_args()
    try:
        if args.apply:apply(args.bundle);print('Files installed with backup. HA has NOT been restarted; validate configuration before a coordinated restart.')
        else:
            if args.config_root is None:parser.error('--config-root is required for staging')
            stage(args.config_root,args.bundle,args.dist);print('Dry-run complete: private bundle staged; deployed files unchanged. Review staged config/script diffs before --apply.')
    except Exception as err:
        parser.exit(1,f'Rollout stopped: {err}\n')

if __name__=='__main__':main()
