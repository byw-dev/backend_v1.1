import importlib.util
import os
import sys
import threading
import time
import webbrowser
from pathlib import Path


def runtime_dir() -> Path:
    if getattr(sys, 'frozen', False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


class TeeStream:
    def __init__(self, *streams):
        self.streams = streams

    def write(self, data):
        for stream in self.streams:
            stream.write(data)
            stream.flush()

    def flush(self):
        for stream in self.streams:
            stream.flush()

    def isatty(self):
        return any(getattr(stream, 'isatty', lambda: False)() for stream in self.streams)


def setup_runtime(base_dir: Path):
    os.chdir(base_dir)
    os.environ['BY_WEATHER_BASE_DIR'] = str(base_dir)
    if str(base_dir) not in sys.path:
        sys.path.insert(0, str(base_dir))


def setup_logs(base_dir: Path):
    logs_dir = base_dir / 'logs'
    logs_dir.mkdir(exist_ok=True)
    log_file = logs_dir / time.strftime('by_weather_%Y%m%d.log')
    handle = log_file.open('a', encoding='utf-8', buffering=1)
    sys.stdout = TeeStream(sys.__stdout__, handle)
    sys.stderr = TeeStream(sys.__stderr__, handle)
    print(f'[launcher] log file: {log_file}')


def load_external_config(base_dir: Path):
    config_path = base_dir / 'config.py'
    if not config_path.exists():
        print('[launcher] external config.py not found, using bundled/default import.')
        return None

    spec = importlib.util.spec_from_file_location('config', config_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f'cannot load config.py from {config_path}')

    module = importlib.util.module_from_spec(spec)
    sys.modules['config'] = module
    spec.loader.exec_module(module)
    print(f'[launcher] loaded config: {config_path}')
    return module


def open_browser_later(url: str, delay_sec: float = 1.0):
    def _open():
        time.sleep(delay_sec)
        webbrowser.open(url)

    thread = threading.Thread(target=_open, daemon=True)
    thread.start()


def main():
    base_dir = runtime_dir()
    setup_runtime(base_dir)
    setup_logs(base_dir)
    config = load_external_config(base_dir)

    import app as app_module
    import uvicorn

    host = getattr(config or app_module, 'HOST', app_module.HOST)
    port = int(getattr(config or app_module, 'PORT', app_module.PORT))
    auto_open = bool(getattr(config or app_module, 'AUTO_OPEN_BROWSER', True))
    url = f'http://{host}:{port}'

    print(f'[launcher] runtime dir: {base_dir}')
    print(f'[launcher] starting server: {url}')
    if auto_open:
        open_browser_later(url)

    uvicorn.run(app_module.app, host=host, port=port, reload=False)


if __name__ == '__main__':
    main()
