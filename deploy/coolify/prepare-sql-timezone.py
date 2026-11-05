"""Preparación Linux, solo lectura Docker; no detiene/recrea servicios."""
import argparse
import json
import os
from pathlib import Path
import subprocess

NAME = 'sqlserver-cu25-alignment'
IMAGE = 'sha256:e07b9699a2b749969f19d86563ceeea22bd3a69f7f1db85a8d1ac4bdaf0c6f56'


def validate(info, image_labels=None):
    host = info['HostConfig']
    config = info['Config']
    mounts = info['Mounts']
    assert info['Image'] == IMAGE, 'Imagen distinta; refrescar plan'
    assert config['Hostname'] == 'dd7842d7ba7e', 'Hostname cambió'
    assert config['User'] == 'mssql', 'Usuario cambió'
    assert config['Entrypoint'] == ['/opt/mssql/bin/launch_sqlservr.sh']
    assert config['Cmd'] == ['/opt/mssql/bin/sqlservr']
    assert not any(config.get(key) for key in ['WorkingDir', 'Healthcheck', 'StopSignal', 'Domainname', 'Tty', 'OpenStdin'])
    assert (config.get('Labels') or {}) == (image_labels or {}), 'Etiquetas adicionales; conservar en plan específico'
    assert len(mounts) == 1 and mounts[0]['Name'] == 'sqlserver_cu25_alignment_data'
    assert mounts[0]['Destination'] == '/var/opt/mssql' and mounts[0]['RW']
    assert host['PortBindings'] == {'1433/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '1434'}]}
    assert host['RestartPolicy']['Name'] == 'unless-stopped'
    assert host['NetworkMode'] == 'bridge'
    assert host['ShmSize'] == 67108864
    assert not any(host.get(key) for key in ['Memory', 'NanoCpus', 'CpuShares', 'CpusetCpus',
        'Ulimits', 'CapAdd', 'CapDrop', 'SecurityOpt', 'Privileged', 'ReadonlyRootfs',
        'PidsLimit', 'Tmpfs', 'Devices', 'Init'])
    assert not any(host.get(key) for key in ['Dns', 'DnsOptions', 'DnsSearch', 'ExtraHosts', 'GroupAdd', 'Links', 'VolumesFrom'])
    assert host['LogConfig'] == {'Type': 'json-file', 'Config': {}}
    assert set(info['NetworkSettings']['Networks']) == {'bridge', 'ioe_ha'}
    assert info['NetworkSettings']['Networks']['ioe_ha']['Aliases'] == ['ioe-sql-standby']


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True, help='Directorio privado absoluto fuera de repositorios')
    args = parser.parse_args()
    target = Path(args.output)
    if os.name != 'posix' or not target.is_absolute() or '.git' in target.parts:
        raise SystemExit('Ejecutar en CT Linux con destino privado absoluto')
    # Nunca capturar secretos dentro de un checkout.
    for parent in [target, *target.parents]:
        if (parent / '.git').exists():
            raise SystemExit('Destino está dentro de Git')
    info = json.loads(subprocess.check_output(['docker', 'inspect', NAME]))[0]
    image = json.loads(subprocess.check_output(['docker', 'image', 'inspect', IMAGE]))[0]
    validate(info, image['Config'].get('Labels'))
    target.mkdir(parents=True, mode=0o700, exist_ok=True)
    os.chmod(target, 0o700)
    for name in ['sql.original.env', 'sql.original.inspect.json']:
        if (target / name).exists():
            raise SystemExit('Respaldo privado ya existe; no sobrescribir')
    environment = info['Config']['Env']
    if any('\n' in item or '\r' in item for item in environment):
        raise SystemExit('Entorno multilinea; requiere exportación específica')
    for name, content in [
        ('sql.original.env', '\n'.join(environment) + '\n'),
        ('sql.original.inspect.json', json.dumps(info, indent=2)),
    ]:
        fd = os.open(target / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            handle.write(content)
    print(f'Preparado: {target}. Contenedor intacto; entorno privado sin imprimir.')


if __name__ == '__main__':
    main()
