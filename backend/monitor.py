"""Live job monitor — polls collection_runs and game_snapshots for real-time progress."""
import sys, time, sqlite3
from datetime import datetime, timezone

DB = "horrorindie.db"
REFRESH = 4  # seconds

ANSI_CLEAR  = "\033[H\033[J"
ANSI_BOLD   = "\033[1m"
ANSI_DIM    = "\033[2m"
ANSI_RED    = "\033[91m"
ANSI_GREEN  = "\033[92m"
ANSI_YELLOW = "\033[93m"
ANSI_CYAN   = "\033[96m"
ANSI_RESET  = "\033[0m"

BAR_WIDTH = 30

# Jobs that write to game_snapshots — query live count directly rather than
# relying on items_processed (which is only written at job completion).
SNAPSHOT_JOBS = {"reviews", "ccu", "owners"}


def bar(done, total, width=BAR_WIDTH):
    if not total:
        filled = width // 2
        pct = "??%"
    else:
        pct_val = min(done / total, 1.0)
        filled = int(pct_val * width)
        pct = f"{pct_val*100:.0f}%"
    b = "█" * filled + "░" * (width - filled)
    return b, pct


def elapsed(started_at):
    if not started_at:
        return "—"
    try:
        dt = datetime.fromisoformat(started_at)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        secs = (datetime.now(timezone.utc) - dt).total_seconds()
        m, s = divmod(int(secs), 60)
        return f"{m}m {s:02d}s"
    except Exception:
        return "—"


def eta(done, total, started_at):
    if not total or not done or not started_at:
        return ""
    try:
        dt = datetime.fromisoformat(started_at)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        elapsed_s = (datetime.now(timezone.utc) - dt).total_seconds()
        rate = done / elapsed_s if elapsed_s > 0 else 0
        remaining = (total - done) / rate if rate > 0 else 0
        m, s = divmod(int(remaining), 60)
        return f"ETA ~{m}m {s:02d}s"
    except Exception:
        return ""


def run():
    while True:
        # Reconnect each cycle so we always see the latest committed writes
        # from the collector processes running concurrently.
        con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
        con.row_factory = sqlite3.Row
        cur = con.cursor()

        total_games = cur.execute("SELECT COUNT(*) FROM games").fetchone()[0]
        today = datetime.now(timezone.utc).date().isoformat()

        # Live snapshot count per column written today (proxy for per-job progress)
        snap_reviews = cur.execute(
            "SELECT COUNT(DISTINCT appid) FROM game_snapshots "
            "WHERE snapshot_date=? AND review_count IS NOT NULL", (today,)
        ).fetchone()[0]
        snap_ccu = cur.execute(
            "SELECT COUNT(DISTINCT appid) FROM game_snapshots "
            "WHERE snapshot_date=? AND peak_ccu IS NOT NULL", (today,)
        ).fetchone()[0]
        snap_owners = cur.execute(
            "SELECT COUNT(DISTINCT appid) FROM game_snapshots "
            "WHERE snapshot_date=? AND estimated_owners_low IS NOT NULL", (today,)
        ).fetchone()[0]
        snap_ops = cur.execute(
            "SELECT COUNT(DISTINCT appid) FROM ops_scores "
            "WHERE score_date=?", (today,)
        ).fetchone()[0]

        LIVE_COUNTS = {
            "reviews": snap_reviews,
            "ccu":     snap_ccu,
            "owners":  snap_owners,
            "ops":     snap_ops,
        }

        # Latest run per job
        rows = cur.execute("""
            SELECT job_name, status, items_processed, items_failed,
                   started_at, finished_at
            FROM collection_runs
            GROUP BY job_name
            HAVING started_at = MAX(started_at)
            ORDER BY started_at DESC
        """).fetchall()

        now_str = datetime.now().strftime("%H:%M:%S")
        print(ANSI_CLEAR, end="")
        print(f"{ANSI_BOLD}{'HORROR RADAR — JOB MONITOR':^60}{ANSI_RESET}  {ANSI_DIM}{now_str}{ANSI_RESET}\n")

        running_any = False
        for r in rows:
            job  = r["job_name"]
            stat = r["status"]
            fail = r["items_failed"] or 0
            start= r["started_at"]

            # Use live DB count for snapshot jobs when running, else items_processed
            if job in LIVE_COUNTS:
                done  = LIVE_COUNTS[job]
                total = total_games
            else:
                done  = r["items_processed"] or 0
                total = None

            b, pct = bar(done, total)

            if stat == "running":
                running_any = True
                color = ANSI_YELLOW
                tag = "▶ RUNNING"
                suffix = f"  {elapsed(start)} elapsed  {eta(done, total, start)}"
            elif stat == "success":
                color = ANSI_GREEN
                tag = "✓ DONE"
                suffix = f"  {elapsed(start)}"
            elif stat == "partial":
                color = ANSI_CYAN
                tag = "~ PARTIAL"
                suffix = f"  {fail} failed"
            else:
                color = ANSI_RED
                tag = "✗ FAILED"
                suffix = ""

            print(f"  {color}{ANSI_BOLD}{job:<22}{ANSI_RESET} {color}{tag:<12}{ANSI_RESET}")
            print(f"  [{color}{b}{ANSI_RESET}] {ANSI_BOLD}{pct:>4}{ANSI_RESET}  "
                  f"{ANSI_DIM}{done}/{total if total else '?'} items{ANSI_RESET}"
                  f"{ANSI_DIM}{suffix}{ANSI_RESET}")
            print()

        if not running_any:
            print(f"  {ANSI_GREEN}All jobs idle.{ANSI_RESET}\n")

        print(f"{ANSI_DIM}  Refreshing every {REFRESH}s — Ctrl+C to exit{ANSI_RESET}")
        sys.stdout.flush()
        time.sleep(REFRESH)


if __name__ == "__main__":
    try:
        run()
    except KeyboardInterrupt:
        print("\nMonitor stopped.")
