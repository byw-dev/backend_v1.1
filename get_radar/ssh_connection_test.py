import time
import queue
import threading
import posixpath
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

import paramiko


HOST = "47.100.254.100"
USERNAME = "ecs-user"

DATA_STR = "20260504"

SCAN_STRATEGIES = ["PPICMA", "RPICMA", "RHICMA"]

LOCAL_BASE_DIR = Path(r"D:\Program Files\Cdyw\RadarKA\PT\data")

REMOTE_BASE_DIR = "/var/www/html/files/fb/user1/radar_leizhou/data"

POLL_INTERVAL = 2
STABLE_SECONDS = 2


def setup_logger():
    log_dir = Path("./logs")
    log_dir.mkdir(exist_ok=True)

    log_file = log_dir / "radar_upload.log"

    logger = logging.getLogger("radar_uploader")
    logger.setLevel(logging.INFO)

    # 防止重复添加 handler
    if logger.handlers:
        return logger

    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    # 写入文件，单个日志文件最大 10MB，最多保留 5 个
    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8"
    )
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logging.INFO)

    # 同时输出到控制台
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.setLevel(logging.INFO)

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    return logger

def get_local_dir(strategy):
    return LOCAL_BASE_DIR / DATA_STR / strategy


def get_remote_dir(strategy):
    return posixpath.join(REMOTE_BASE_DIR, DATA_STR, strategy)


def ensure_remote_dir(sftp, remote_dir):
    parts = remote_dir.strip("/").split("/")
    current = ""

    for part in parts:
        current += "/" + part
        try:
            sftp.stat(current)
        except OSError:
            sftp.mkdir(current)


def upload_progress(strategy, filename):
    start_time = time.time()

    def callback(transferred, total):
        elapsed = time.time() - start_time

        percent = transferred / total * 100 if total else 0
        speed = transferred / elapsed if elapsed > 0 else 0
        speed_mb = speed / 1024 / 1024

        transferred_mb = transferred / 1024 / 1024
        total_mb = total / 1024 / 1024

        print(
            f"\r上传中 [{strategy}] {filename}: "
            f"{percent:.1f}% "
            f"({transferred_mb:.2f}/{total_mb:.2f} MB) "
            f"{speed_mb:.2f} MB/s",
            end="",
            flush=True
        )

    return callback


class MultiStrategyUploader:
    def __init__(self, sftp, logger):
        self.sftp = sftp
        self.logger = logger
        # 每个策略对应一个远程已有文件集合
        # 例如：
        # {
        #   "CMAPPI": {"xxx.zip", "yyy.zip"},
        #   "CMARPI": {"aaa.zip"},
        #   "CMARHI": set()
        # }
        self.remote_zip_names = {}

        # 上传任务队列
        # 队列元素格式：
        # (strategy, filename, local_path, remote_path)
        self.pending_queue = queue.Queue()

        # 防止重复加入队列
        # key = (strategy, filename)
        self.queued_keys = set()

        # 当前待上传差异文件目录
        # key = (strategy, filename)
        # value = 本地路径
        self.pending_upload_paths = {}

        # 本地文件稳定性记录
        # key = (strategy, filename)
        self.local_file_state = {}

        self.lock = threading.Lock()
        self.stop_event = threading.Event()

    def load_remote_once(self):
        """
        每个扫描策略的远程目录只查询一次。
        """
        for strategy in SCAN_STRATEGIES:
            remote_dir = get_remote_dir(strategy)

            ensure_remote_dir(self.sftp, remote_dir)

            try:
                names = self.sftp.listdir(remote_dir)
            except OSError as e:
                print(f"[{strategy}] 远程目录读取失败: {remote_dir}, 原因: {e}")
                names = []

            zip_names = {
                name
                for name in names
                if name.lower().endswith(".zip")
            }

            self.remote_zip_names[strategy] = zip_names

            # print(f"[{strategy}] 远程已有 zip 文件数量: {len(zip_names)}")
            self.logger.info(f"[{strategy}] 远程已有 zip 文件数量: {len(zip_names)}")
    def scan_one_strategy(self, strategy):
        """
        扫描某一个策略目录，例如 PPI / RPI / RHI。
        """
        now = time.time()

        local_dir = get_local_dir(strategy)
        remote_dir = get_remote_dir(strategy)

        if not local_dir.exists():
            print(f"\n[{strategy}] 本地目录不存在，跳过: {local_dir}")
            self.logger.warning(f"[{strategy}] 本地目录不存在，跳过: {local_dir}")
            return

        local_zip_files = {
            path.name: path
            for path in local_dir.glob("*.zip")
            if path.is_file()
        }

        # 清理已经不存在的文件状态
        for key in list(self.local_file_state.keys()):
            key_strategy, key_filename = key

            if key_strategy != strategy:
                continue

            if key_filename not in local_zip_files:
                self.local_file_state.pop(key, None)

        for filename, local_path in sorted(local_zip_files.items()):
            key = (strategy, filename)

            with self.lock:
                already_remote = filename in self.remote_zip_names.get(strategy, set())
                already_queued = key in self.queued_keys

            if already_remote or already_queued:
                continue

            try:
                stat = local_path.stat()
            except OSError:
                continue

            signature = (stat.st_size, stat.st_mtime_ns)

            old_state = self.local_file_state.get(key)

            # 第一次发现，或者文件仍在变化，只记录状态，不马上上传
            if old_state is None or old_state["signature"] != signature:
                self.local_file_state[key] = {
                    "signature": signature,
                    "stable_since": now,
                    "path": local_path,
                }
                continue

            # 文件稳定时间不足，继续等
            stable_time = now - old_state["stable_since"]

            if stable_time < STABLE_SECONDS:
                continue

            # 文件已经稳定，可以加入上传队列
            with self.lock:
                if filename in self.remote_zip_names.get(strategy, set()):
                    continue

                if key in self.queued_keys:
                    continue

                remote_path = posixpath.join(remote_dir, filename)

                self.queued_keys.add(key)
                self.pending_upload_paths[key] = str(local_path)

                self.pending_queue.put(
                    (strategy, filename, local_path, remote_path)
                )

                # print(f"\n发现待上传文件: [{strategy}] {filename}")
                self.logger.info(f"发现待上传文件: [{strategy}] {filename}")
    def scan_local_once(self):
        """
        每次轮询时，依次扫描 PPI / RPI / RHI。
        """
        for strategy in SCAN_STRATEGIES:
            self.scan_one_strategy(strategy)

    def local_poll_loop(self):
        """
        本地轮询线程。
        上传时仍然会每 2 秒扫描一次 PPI / RPI / RHI。
        """
        while not self.stop_event.is_set():
            try:
                self.scan_local_once()
            except Exception as e:
                print(f"\n本地扫描异常: {e}")

            time.sleep(POLL_INTERVAL)

    def upload_loop(self):
        """
        单线程上传。
        避免多个线程同时操作同一个 sftp 连接。
        """
        while not self.stop_event.is_set():
            try:
                strategy, filename, local_path, remote_path = self.pending_queue.get(timeout=1)
            except queue.Empty:
                continue

            key = (strategy, filename)

            try:
                if not local_path.exists():
                    self.logger.warning(f"[{strategy}] 文件已不存在，跳过: {local_path}")

                    with self.lock:
                        self.queued_keys.discard(key)
                        self.pending_upload_paths.pop(key, None)

                    continue

                print(f"\n准备上传: [{strategy}] {filename}")
                print(f"本地: {local_path}")
                print(f"远程: {remote_path}")
                self.logger.info(f"准备上传: [{strategy}] {filename}")
                self.logger.info(f"本地路径: {local_path}")
                self.logger.info(f"远程路径: {remote_path}")
                tmp_remote_path = remote_path + ".uploading"

                self.sftp.put(
                    str(local_path),
                    tmp_remote_path,
                    callback=upload_progress(strategy, filename)
                )

                self.sftp.rename(tmp_remote_path, remote_path)

                # print(f"\n上传完成: [{strategy}] {filename}")
                self.logger.info(f"上传完成: [{strategy}] {filename}")
                with self.lock:
                    self.remote_zip_names.setdefault(strategy, set()).add(filename)
                    self.queued_keys.discard(key)
                    self.pending_upload_paths.pop(key, None)

            except Exception as e:
                # print(f"\n上传失败: [{strategy}] {filename}, 原因: {e}")
                self.logger.exception(f"上传失败: [{strategy}] {filename}")
                # 上传失败后允许下次重新加入队列
                with self.lock:
                    self.queued_keys.discard(key)
                    self.pending_upload_paths.pop(key, None)

            finally:
                self.pending_queue.task_done()

    def print_pending_list(self):
        with self.lock:
            if not self.pending_upload_paths:
                print("\n当前没有待上传文件。")
                return

            print("\n当前待上传文件列表:")

            for (strategy, filename), local_path in self.pending_upload_paths.items():
                print(f"[{strategy}] {filename} -> {local_path}")

    def start(self):
        self.load_remote_once()

        poll_thread = threading.Thread(
            target=self.local_poll_loop,
            daemon=True
        )
        poll_thread.start()

        print("开始轮询本地 PPI / RPI / RHI 文件夹并上传新增 zip 文件。按 Ctrl+C 停止。")

        try:
            self.upload_loop()
        except KeyboardInterrupt:
            print("\n收到停止信号，准备退出...")
            self.stop_event.set()


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    logger = setup_logger()
    try:
        ssh.connect(
            hostname=HOST,
            username=USERNAME,
            port=22,
            look_for_keys=True,
            allow_agent=True,
            timeout=20
        )

        sftp = ssh.open_sftp()

        uploader = MultiStrategyUploader(sftp, logger)
        uploader.start()

        sftp.close()

    finally:
        ssh.close()


if __name__ == "__main__":
    main()