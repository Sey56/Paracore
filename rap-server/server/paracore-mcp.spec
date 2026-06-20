# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['mcp\\mcp_server.py'],
    pathex=['.'],
    binaries=[],
    datas=[('C:\\Users\\seyou\\Paracore\\REPL_GUIDE.md', '.'), ('C:\\Users\\seyou\\Paracore\\EXTENSION_METHODS.md', '.')],
    hiddenimports=['mcp', 'mcp.server.fastmcp', 'grpc', 'google.protobuf', 'google.protobuf.descriptor_pool', 'google.protobuf.runtime_version', 'google.protobuf.symbol_database', 'google.protobuf.internal.builder', 'mcp_core', 'mcp_core.prompts'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['logfire'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='paracore-mcp',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
