import pathlib,time,subprocess,os
root=pathlib.Path(__file__).resolve().parents[1]
for _ in range(1800):
 if (root/'src-tauri/Cargo.lock').is_file():break
 time.sleep(1)
else:raise SystemExit('Cargo.lock was not ready')
print('Dependency lockfile ready; building native preview',flush=True)
env={**os.environ,'CARGO_HTTP_MULTIPLEXING':'false','CARGO_HTTP_TIMEOUT':'90','CARGO_NET_RETRY':'2','CARGO_BUILD_JOBS':'4'}
raise SystemExit(subprocess.call(['npm','exec','tauri','--','build','--debug','--bundles','app'],cwd=root,env=env))
